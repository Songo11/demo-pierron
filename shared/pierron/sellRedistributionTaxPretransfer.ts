/**
 * Client-side 1% PIERRON tax (pre sell / post buy) — required because hook CPI tax hits
 * Token-2022 ReentrancyNotAllowed during Meteora swap transfers.
 * Price floor is funded separately via SOL fee → Meteora wSOL reserve (`priceFloorSolFee.ts`).
 */
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronProgramId } from "../core/programIds.ts";
import {
  normalizePierronHookMetasFromTlv,
  prependExtraAccountMetaForMeteoraSwap,
  trimPierronHookMetasToExecuteCount,
} from "../meteora/pierronDlmmTransferHook.ts";
import { resolvePierronTransferHookAccounts } from "../mobile-stealth-v1/pierronTransferHookAccounts.ts";
import { createTransferCheckedInstructionBrowserSafe } from "../solana/browserSafeTransferChecked.ts";
import { resolveTransferHookMetasForTransfer } from "./resolveTransferHookAccounts.ts";
import { calculateTradeTax } from "./tradeTax.ts";
import { deriveTradeConfigPda } from "./initUserTradeAccounts.ts";
import { buildPriceFloorSolFeeIxs } from "./priceFloorSolFee.ts";

const DEVNET_REDISTRIBUTION_VAULT = new PublicKey(
  "D1ajrrwmWqtKA65aTkYcZicd6ncAhtPWQDWRTYfURzhx"
);

const PIERRON_DECIMALS = 6;

/** Tax base units for sell: gross − net (Meteora leg uses net). */
export function sellRedistributionTaxBaseUnits(
  grossBaseUnits: bigint,
  netBaseUnits: bigint
): bigint {
  const tax = grossBaseUnits - netBaseUnits;
  if (tax <= 0n) {
    throw new Error("sell tax must be positive");
  }
  return tax;
}

/** Tax base units for buy: 1% of gross PIERRON received from pool. */
export function buyRedistributionTaxBaseUnits(grossBaseUnits: bigint): bigint {
  const { tax } = calculateTradeTax(grossBaseUnits);
  if (tax <= 0n) {
    throw new Error("buy tax must be positive");
  }
  return tax;
}

export async function resolveRedistributionVault(params: {
  connection: Connection;
  cluster?: SupportedCluster;
  redistributionVault?: PublicKey;
}): Promise<PublicKey> {
  if (params.redistributionVault) {
    return params.redistributionVault;
  }
  if (params.cluster === "devnet" || params.cluster === undefined) {
    return DEVNET_REDISTRIBUTION_VAULT;
  }
  const programId = getPierronProgramId(params.cluster);
  const tradeConfig = deriveTradeConfigPda(programId);
  const acc = await params.connection.getAccountInfo(tradeConfig);
  if (!acc?.data || acc.data.length < 8 + 32 * 3) {
    throw new Error("trade_config not found for redistribution vault");
  }
  const vault = new PublicKey(
    acc.data.subarray(8 + 1 + 32 + 32, 8 + 1 + 32 + 32 + 32)
  );
  return vault;
}

/** User-signed 1% redistribution tax (pre sell / post buy). */
export function buildSellRedistributionTaxTransferIx(params: {
  userTokenAccount: PublicKey;
  mint: PublicKey;
  redistributionVault: PublicKey;
  owner: PublicKey;
  taxBaseUnits: bigint;
  tokenProgramId?: PublicKey;
}): TransactionInstruction {
  const tokenProgram = params.tokenProgramId ?? TOKEN_2022_PROGRAM_ID;
  return createTransferCheckedInstructionBrowserSafe(
    params.userTokenAccount,
    params.mint,
    params.redistributionVault,
    params.owner,
    params.taxBaseUnits,
    PIERRON_DECIMALS,
    [],
    tokenProgram
  );
}

/** User-signed protocol tax leg with Token-2022 hook extra accounts. */
export async function buildProtocolTaxTransferIxWithHook(params: {
  connection: Connection;
  userTokenAccount: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
  owner: PublicKey;
  taxBaseUnits: bigint;
  tokenProgramId?: PublicKey;
  cluster?: SupportedCluster;
  transferHookMetas?: Array<{
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
  }>;
}): Promise<TransactionInstruction> {
  const tokenProgram = params.tokenProgramId ?? TOKEN_2022_PROGRAM_ID;
  const ix = createTransferCheckedInstructionBrowserSafe(
    params.userTokenAccount,
    params.mint,
    params.destination,
    params.owner,
    params.taxBaseUnits,
    PIERRON_DECIMALS,
    [],
    tokenProgram
  );
  const hookAcc = resolvePierronTransferHookAccounts({
    mint: params.mint,
    userTokenAccount: params.userTokenAccount,
    cluster: params.cluster,
  });
  let hookMetas =
    params.transferHookMetas && params.transferHookMetas.length > 0
      ? params.transferHookMetas
      : await resolveTransferHookMetasForTransfer({
          connection: params.connection,
          mint: params.mint,
          source: params.userTokenAccount,
          destination: params.destination,
          owner: params.owner,
          amount: params.taxBaseUnits,
          cluster: params.cluster,
        });
  hookMetas = normalizePierronHookMetasFromTlv(
    hookMetas,
    hookAcc.extraAccountMetaState,
    params.cluster
  );
  hookMetas = prependExtraAccountMetaForMeteoraSwap(
    hookMetas,
    hookAcc.extraAccountMetaState
  );
  hookMetas = trimPierronHookMetasToExecuteCount(hookMetas);
  ix.keys.push(
    ...hookMetas.map((m) => ({
      pubkey: m.pubkey,
      isSigner: m.isSigner,
      isWritable: m.isWritable,
    }))
  );
  return ix;
}

export async function buildSellRedistributionTaxTransferIxWithHook(params: {
  connection: Connection;
  userTokenAccount: PublicKey;
  mint: PublicKey;
  redistributionVault: PublicKey;
  owner: PublicKey;
  taxBaseUnits: bigint;
  tokenProgramId?: PublicKey;
  cluster?: SupportedCluster;
}): Promise<TransactionInstruction> {
  return buildProtocolTaxTransferIxWithHook({
    connection: params.connection,
    userTokenAccount: params.userTokenAccount,
    mint: params.mint,
    destination: params.redistributionVault,
    owner: params.owner,
    taxBaseUnits: params.taxBaseUnits,
    tokenProgramId: params.tokenProgramId,
    cluster: params.cluster,
  });
}

/** 1% PIERRON → redistribution vault + optional proportional SOL → Meteora SOL reserve (direct). */
export async function buildProtocolTaxAndPriceFloorIxs(params: {
  connection: Connection;
  userTokenAccount: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  grossBaseUnits: bigint;
  taxRemainder?: bigint;
  redistributionVault?: PublicKey;
  tokenProgramId?: PublicKey;
  cluster?: SupportedCluster;
  meteoraPool?: PublicKey;
  pierronTokenVault?: PublicKey;
  solReserve?: PublicKey;
  /** SOL transaction value for 0.5% price-floor fee (swap leg or Pierron Pay quote). */
  transactionValueLamports?: bigint;
  /**
   * When false, only the 1% token tax is built.
   * Use for sells: SOL fee must live in the same tx as the transfer_hook ledger
   * (`require_price_floor_sol_fee` inspects the current transaction).
   */
  includeSolFee?: boolean;
  transferHookMetas?: Array<{
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
  }>;
}): Promise<TransactionInstruction[]> {
  const { tax } = calculateTradeTax(
    params.grossBaseUnits,
    params.taxRemainder ?? 0n
  );
  if (tax <= 0n) {
    throw new Error("protocol tax must be positive");
  }
  const redistributionVault = await resolveRedistributionVault({
    connection: params.connection,
    cluster: params.cluster,
    redistributionVault: params.redistributionVault,
  });
  const includeSolFee = params.includeSolFee !== false;
  const ixs: TransactionInstruction[] = [];
  if (includeSolFee) {
    if (!params.meteoraPool || !params.pierronTokenVault) {
      throw new Error(
        "price floor SOL fee requires meteoraPool + pierronTokenVault"
      );
    }
    if (
      params.transactionValueLamports == null ||
      params.transactionValueLamports <= 0n
    ) {
      throw new Error(
        "price floor SOL fee requires transactionValueLamports > 0"
      );
    }
    ixs.push(
      ...(await buildPriceFloorSolFeeIxs({
        connection: params.connection,
        payer: params.owner,
        transactionValueLamports: params.transactionValueLamports,
        meteoraPool: params.meteoraPool,
        pierronTokenVault: params.pierronTokenVault,
        cluster: params.cluster,
        solReserve: params.solReserve,
      }))
    );
  }
  ixs.push(
    await buildProtocolTaxTransferIxWithHook({
      connection: params.connection,
      userTokenAccount: params.userTokenAccount,
      mint: params.mint,
      destination: redistributionVault,
      owner: params.owner,
      taxBaseUnits: tax,
      tokenProgramId: params.tokenProgramId,
      cluster: params.cluster,
      transferHookMetas: params.transferHookMetas,
    })
  );
  return ixs;
}

/** @deprecated Use {@link buildProtocolTaxAndPriceFloorIxs}. */
export async function buildRedistributionTaxCollectIx(params: {
  connection: Connection;
  userTokenAccount: PublicKey;
  mint: PublicKey;
  redistributionVault: PublicKey;
  owner: PublicKey;
  taxBaseUnits: bigint;
  grossBaseUnits?: bigint;
  tokenProgramId?: PublicKey;
  cluster?: SupportedCluster;
}): Promise<TransactionInstruction[]> {
  const gross =
    params.grossBaseUnits ??
    params.taxBaseUnits + (params.taxBaseUnits * 99n) / 1n;
  return buildProtocolTaxAndPriceFloorIxs({
    connection: params.connection,
    userTokenAccount: params.userTokenAccount,
    mint: params.mint,
    owner: params.owner,
    grossBaseUnits: gross,
    redistributionVault: params.redistributionVault,
    tokenProgramId: params.tokenProgramId,
    cluster: params.cluster,
  });
}
