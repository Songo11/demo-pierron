import { BN } from "@coral-xyz/anchor";
import type DLMM from "@meteora-ag/dlmm";
import {
  StrategyType,
  binIdToBinArrayIndex,
  deriveBinArrayBitmapExtension,
  getBinArrayAccountMetasCoverage,
  getBinArrayIndexesCoverage,
  getOrCreateATAInstruction,
  isOverflowDefaultBinArrayBitmap,
  MAX_ACTIVE_BIN_SLIPPAGE,
  MEMO_PROGRAM_ID,
  toStrategyParameters,
  unwrapSOLInstruction,
  wrapSOLInstruction,
} from "@meteora-ag/dlmm";
import {
  getAssociatedTokenAddressSync,
  getTransferHook,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { resolveTransferHookMetasForTransfer } from "../pierron/resolveTransferHookAccounts.ts";
import { getPierronProgramId } from "../core/programIds.ts";

export type PierronDlmmAddLiquidityParams = {
  position: Keypair;
  /** Skip `initializePosition` when adding to an existing DLMM position. */
  skipPositionInit?: boolean;
  totalXAmount: BN;
  totalYAmount: BN;
  strategy: {
    minBinId: number;
    maxBinId: number;
    strategyType: typeof StrategyType.Spot;
    singleSidedX?: boolean;
  };
  user: PublicKey;
  slippage?: number;
  cluster?: SupportedCluster;
};

export type PierronDlmmAddLiquidityPlan = {
  position: Keypair;
  /** ATA, bin arrays, init position, wrap SOL. */
  setupTransaction: Transaction;
  /** addLiquidityByStrategy2 (+ optional unwrap WSOL). */
  liquidityTransaction: Transaction;
};

type PreparedAddLiquidity = {
  preInstructions: TransactionInstruction[];
  postInstructions: TransactionInstruction[];
  addLiquidityIx: TransactionInstruction;
  position: Keypair;
};

async function preparePierronDlmmAddLiquidity(
  dlmmPool: InstanceType<typeof DLMM>,
  params: PierronDlmmAddLiquidityParams
): Promise<PreparedAddLiquidity> {
  const { minBinId, maxBinId } = params.strategy;
  const slippage = params.slippage ?? 1;
  const maxActiveBinSlippage = Math.ceil(
    slippage / (dlmmPool.lbPair.binStep / 100)
  ) || MAX_ACTIVE_BIN_SLIPPAGE;

  const pierronProgramId = getPierronProgramId(params.cluster);
  const pierronIsX =
    getTransferHook(dlmmPool.tokenX.mint)?.programId.equals(pierronProgramId) ??
    false;
  const pierronIsY =
    getTransferHook(dlmmPool.tokenY.mint)?.programId.equals(pierronProgramId) ??
    false;
  const pierronMint = pierronIsX
    ? dlmmPool.tokenX.publicKey
    : pierronIsY
      ? dlmmPool.tokenY.publicKey
      : dlmmPool.tokenX.publicKey;

  const userAtaPierron = getAssociatedTokenAddressSync(
    pierronMint,
    params.user,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const pierronReserve = pierronIsX
    ? dlmmPool.lbPair.reserveX
    : dlmmPool.lbPair.reserveY;

  let hookPierron: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] =
    [];
  const conn = dlmmPool.program.provider.connection;
  hookPierron = await resolveTransferHookMetasForTransfer({
    connection: conn,
    mint: pierronMint,
    source: userAtaPierron,
    destination: pierronReserve,
    owner: params.user,
    cluster: params.cluster,
  });

  const transferHookXLen = pierronIsX ? hookPierron.length : 0;
  const transferHookYLen = pierronIsY ? hookPierron.length : 0;
  const slices = [
    { accountsType: { transferHookX: {} }, length: transferHookXLen },
    { accountsType: { transferHookY: {} }, length: transferHookYLen },
  ];

  const preInstructions: TransactionInstruction[] = [];
  const postInstructions: TransactionInstruction[] = [];

  preInstructions.push(
    ...(params.skipPositionInit
      ? []
      : [
          await dlmmPool.program.methods
            .initializePosition(minBinId, maxBinId - minBinId + 1)
            .accountsPartial({
              payer: params.user,
              position: params.position.publicKey,
              lbPair: dlmmPool.pubkey,
              owner: params.user,
              rent: SYSVAR_RENT_PUBKEY,
            })
            .instruction(),
        ])
  );

  const binArrayIndexes = getBinArrayIndexesCoverage(
    new BN(minBinId),
    new BN(maxBinId)
  );
  const binArrayAccountMetas = getBinArrayAccountMetasCoverage(
    new BN(minBinId),
    new BN(maxBinId),
    dlmmPool.pubkey,
    dlmmPool.program.programId
  );
  const createBinArrayIxs = await dlmmPool.createBinArraysIfNeeded(
    binArrayIndexes,
    params.user
  );
  preInstructions.push(...createBinArrayIxs);

  const [{ ataPubKey: userTokenX, ix: createX }, { ataPubKey: userTokenY, ix: createY }] =
    await Promise.all([
      getOrCreateATAInstruction(
        dlmmPool.program.provider.connection,
        dlmmPool.tokenX.publicKey,
        params.user,
        dlmmPool.tokenX.owner
      ),
      getOrCreateATAInstruction(
        dlmmPool.program.provider.connection,
        dlmmPool.tokenY.publicKey,
        params.user,
        dlmmPool.tokenY.owner
      ),
    ]);
  if (createX) preInstructions.push(createX);
  if (createY) preInstructions.push(createY);

  if (
    dlmmPool.tokenX.publicKey.equals(NATIVE_MINT) &&
    !params.totalXAmount.isZero()
  ) {
    preInstructions.push(
      ...wrapSOLInstruction(
        params.user,
        userTokenX,
        BigInt(params.totalXAmount.toString())
      )
    );
  }
  if (
    dlmmPool.tokenY.publicKey.equals(NATIVE_MINT) &&
    !params.totalYAmount.isZero()
  ) {
    preInstructions.push(
      ...wrapSOLInstruction(
        params.user,
        userTokenY,
        BigInt(params.totalYAmount.toString())
      )
    );
  }

  if (
    [dlmmPool.tokenX.publicKey.toBase58(), dlmmPool.tokenY.publicKey.toBase58()].includes(
      NATIVE_MINT.toBase58()
    )
  ) {
    const closeIx = await unwrapSOLInstruction(params.user);
    if (closeIx) postInstructions.push(closeIx);
  }

  const minBinArrayIndex = binIdToBinArrayIndex(new BN(minBinId));
  const maxBinArrayIndex = binIdToBinArrayIndex(new BN(maxBinId));
  const useExtension =
    isOverflowDefaultBinArrayBitmap(minBinArrayIndex) ||
    isOverflowDefaultBinArrayBitmap(maxBinArrayIndex);
  const binArrayBitmapExtension = useExtension
    ? deriveBinArrayBitmapExtension(dlmmPool.pubkey, dlmmPool.program.programId)[0]
    : null;

  const liquidityParams = {
    amountX: params.totalXAmount,
    amountY: params.totalYAmount,
    activeId: dlmmPool.lbPair.activeId,
    maxActiveBinSlippage,
    strategyParameters: toStrategyParameters(params.strategy),
  };

  const { accounts: transferHookAccounts } = { accounts: hookPierron };

  const addLiquidityIx = await dlmmPool.program.methods
    .addLiquidityByStrategy2(liquidityParams, { slices })
    .accounts({
      position: params.position.publicKey,
      lbPair: dlmmPool.pubkey,
      userTokenX,
      userTokenY,
      reserveX: dlmmPool.lbPair.reserveX,
      reserveY: dlmmPool.lbPair.reserveY,
      tokenXMint: dlmmPool.lbPair.tokenXMint,
      tokenYMint: dlmmPool.lbPair.tokenYMint,
      binArrayBitmapExtension,
      sender: params.user,
      tokenXProgram: dlmmPool.tokenX.owner,
      tokenYProgram: dlmmPool.tokenY.owner,
      memoProgram: MEMO_PROGRAM_ID,
    })
    .remainingAccounts(transferHookAccounts)
    .remainingAccounts(binArrayAccountMetas)
    .instruction();

  return {
    preInstructions,
    postInstructions,
    addLiquidityIx,
    position: params.position,
  };
}

function legacyTxSerializedSize(tx: Transaction): number {
  try {
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
  } catch {
    return 9999;
  }
}

async function assembleTransaction(
  connection: Connection,
  feePayer: PublicKey,
  instructions: TransactionInstruction[]
): Promise<Transaction> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    blockhash,
    lastValidBlockHeight,
    feePayer,
  });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...instructions);
  return tx;
}

/** Dwie tx — legacy limit 1232 B z kontami transfer hook PIERRON. */
export async function buildPierronDlmmAddLiquidityPlan(
  dlmmPool: InstanceType<typeof DLMM>,
  params: PierronDlmmAddLiquidityParams
): Promise<PierronDlmmAddLiquidityPlan> {
  const prepared = await preparePierronDlmmAddLiquidity(dlmmPool, params);
  const connection = dlmmPool.program.provider.connection;

  const setupTransaction = await assembleTransaction(
    connection,
    params.user,
    prepared.preInstructions
  );
  const liquidityTransaction = await assembleTransaction(connection, params.user, [
    prepared.addLiquidityIx,
    ...prepared.postInstructions,
  ]);

  return {
    position: prepared.position,
    setupTransaction,
    liquidityTransaction,
  };
}

/** Buduje AddLiquidity bez symulacji CU Meteory (pada na transfer hook). */
export async function buildPierronDlmmAddLiquidityTx(
  dlmmPool: InstanceType<typeof DLMM>,
  params: PierronDlmmAddLiquidityParams
): Promise<Transaction> {
  const prepared = await preparePierronDlmmAddLiquidity(dlmmPool, params);
  const connection = dlmmPool.program.provider.connection;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction({
    blockhash,
    lastValidBlockHeight,
    feePayer: params.user,
  });
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...prepared.preInstructions,
    prepared.addLiquidityIx,
    ...prepared.postInstructions
  );

  if (legacyTxSerializedSize(tx) > 1232) {
    const plan = await buildPierronDlmmAddLiquidityPlan(dlmmPool, params);
    throw new Error(
      `PIERRON_DLMM_ADD_LIQUIDITY_SPLIT:${legacyTxSerializedSize(plan.setupTransaction)}:${legacyTxSerializedSize(plan.liquidityTransaction)}`
    );
  }

  return tx;
}
