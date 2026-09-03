import { BN } from "@coral-xyz/anchor";
import type DLMM from "@meteora-ag/dlmm";
import {
  deriveBinArrayBitmapExtension,
  unwrapSOLInstruction,
  wrapSOLInstruction,
} from "@meteora-ag/dlmm";
import { getTokenAtaForOwner } from "../pierron/pierronTokenAta.ts";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { buildEnsureHookTaxDelegateIx } from "../pierron/hookTaxDelegate.ts";
import { buildProtocolTaxAndPriceFloorIxs } from "../pierron/sellRedistributionTaxPretransfer.ts";
import { grossFromNet } from "../pierron/tradeTax.ts";
import {
  appendPierronTransferHookProgramMeta,
  demoteMeteoraConflictingHookMetas,
  resolveMeteoraSwapHookMetas,
  trimPierronHookMetasToExecuteCount,
} from "./pierronDlmmTransferHook.ts";
import { resolveTransferHookMetasForTransfer } from "../pierron/resolveTransferHookAccounts.ts";
import {
  LEGACY_TX_PACKET_DATA_SIZE,
  legacyTxFitsPacket,
  safeLegacyTxByteLength,
} from "../solana/legacyTxSize.ts";
import { buildAssertDexSwapPolicyIx } from "../pierron/assertDexSwapPolicy.ts";
import { fetchConsumedRedistributionClaimPubkeys } from "../pierron/redistributionClaimEligibility.ts";
import {
  buildPriceFloorSolFeeIxs,
  buildPriceFloorSolFeeLegacyTreasuryIx,
  calculatePriceFloorSolFeeLamports,
} from "../pierron/priceFloorSolFee.ts";
import { getPierronProgramId } from "../core/programIds.ts";
import { readTradeConfigDexRefs } from "../pierron/tradeConfigRefs.ts";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

/** Hook CPI tax is blocked by Token-2022 reentrancy; dApp/mobile use pre/post transfers. */
export const PIERRON_HOOK_TARGET_TAX = false;

export type PierronDlmmSwapBuildParams = {
  inToken: PublicKey;
  outToken: PublicKey;
  inAmount: BN;
  minOutAmount: BN;
  user: PublicKey;
  binArraysPubkey: PublicKey[];
  computeUnits?: number;
  cluster?: SupportedCluster;
  /** @deprecated use sellTaxBaseUnits */
  sellGrossInAmount?: BN;
  /** @deprecated use buyTaxBaseUnits */
  buyGrossOutAmount?: BN;
  /** 1% tax base units (pre-transfer before sell swap). */
  sellTaxBaseUnits?: bigint;
  /** Accounting remainder used to mirror on-chain sell tax rounding. */
  sellTaxRemainder?: bigint;
  /** 1% tax base units (post-transfer after buy swap). */
  buyTaxBaseUnits?: bigint;
  /** Gross PIERRON out from Meteora quote (buy ledger). Defaults to minOutAmount. */
  buyLedgerGrossAmount?: BN;
  redistributionVault?: PublicKey;
  /** MWA / Phantom: setup, swap, and tax as separate legacy txs. */
  forceSplit?: boolean;
  /**
   * Mobile Android sell: scal setup+tax+swap+ledger w 1 tx gdy się mieści.
   * Unika wspólnego blockhash 2/2 (Samsung wraca z Phantom za wolno).
   */
  preferSingleTx?: boolean;
  /**
   * Samsung mobile: gdy 1-tx się nie mieści, NIE rób forceSplit prep|swap
   * (swap ginie). Zamiast tego spróbuj tax+swap+ledger w jednej tx (path poniżej).
   */
  avoidForceSplit?: boolean;
  /** Pre-resolved consumed redistribution vouchers (avoids slow mobile RPC scan). */
  consumedRedistributionVouchers?: PublicKey[];
};

export type PierronDlmmSwapPlan = {
  transactions: Transaction[];
  /** Index of the tx containing the Meteora swap ix (for simulation). */
  swapTxIndex: number;
  /** Index of the tx with Pierron `transfer_hook` ledger (-1 if none). */
  ledgerTxIndex: number;
};

async function assembleLegacyTransaction(
  connection: {
    getLatestBlockhash: (
      commitment?: string
    ) => Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  },
  feePayer: PublicKey,
  instructions: TransactionInstruction[],
  computeUnits: number,
  options?: {
    heapFrameBytes?: number;
    priorityMicroLamports?: number;
    recentBlockhash?: { blockhash: string; lastValidBlockHeight: number };
  }
): Promise<Transaction> {
  const { blockhash, lastValidBlockHeight } =
    options?.recentBlockhash ??
    (await connection.getLatestBlockhash("processed"));

  const build = (withPriority: boolean): Transaction => {
    const budgetIxs: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
    ];
    if (withPriority) {
      const microLamports = options?.priorityMicroLamports ?? 250_000;
      budgetIxs.push(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports })
      );
    }
    if (options?.heapFrameBytes != null && options.heapFrameBytes > 0) {
      budgetIxs.push(
        ComputeBudgetProgram.requestHeapFrame({ bytes: options.heapFrameBytes })
      );
    }
    return new Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer,
    }).add(...budgetIxs, ...instructions);
  };

  // Priority pomaga wylądować na mobile, ale nie wolno przekroczyć 1232 B.
  const withPriority = build(true);
  if (legacyTxFitsPacket(withPriority)) {
    return withPriority;
  }
  return build(false);
}

async function assembleFittingLegacyTransaction(
  connection: {
    getLatestBlockhash: (
      commitment?: string
    ) => Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  },
  feePayer: PublicKey,
  instructions: TransactionInstruction[],
  computeUnits: number,
  options?: {
    heapFrameBytes?: number;
    priorityMicroLamports?: number;
    recentBlockhash?: { blockhash: string; lastValidBlockHeight: number };
    /**
     * When false (default), never drop requestHeapFrame to fit 1232 B —
     * transfer_hook OOM ("memory allocation failed") is worse than a 2-tx split.
     * Set true only for non-hook txs that can safely run on the default 32 KiB heap.
     */
    allowDropHeap?: boolean;
  }
): Promise<Transaction | null> {
  // Heap is required for Meteora swap+ledger (Token-2022 hook). Dropping it to
  // squeeze a single legacy packet causes SBF "out of memory" after wallet sign.
  const ordered: Array<{ heapFrameBytes?: number }> = options?.heapFrameBytes
    ? options.allowDropHeap
      ? [{ heapFrameBytes: options.heapFrameBytes }, {}]
      : [{ heapFrameBytes: options.heapFrameBytes }]
    : [{}];

  for (const attempt of ordered) {
    const tx = await assembleLegacyTransaction(
      connection,
      feePayer,
      instructions,
      computeUnits,
      {
        ...attempt,
        priorityMicroLamports: options?.priorityMicroLamports,
        recentBlockhash: options?.recentBlockhash,
      }
    );
    if (legacyTxFitsPacket(tx)) return tx;
  }
  return null;
}

/**
 * swap+ledger musi być ≤1232. Policy assert (vouchery) często go puchnie —
 * wynieś do wcześniejszej tx (tax/setup). Unwrap dropamy tylko gdy inaczej nie wejdzie
 * — wtedy caller dokłada osobną tx z CloseAccount (wSOL → native SOL).
 */
async function assembleSellSwapLedgerFitting(
  connection: {
    getLatestBlockhash: (
      commitment?: string
    ) => Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  },
  feePayer: PublicKey,
  prepared: PreparedPierronDlmmSwap
): Promise<{
  swapTx: Transaction;
  /** Dołączyć do tx z podatkiem / setupem (przed swapem). */
  prependToPrep: TransactionInstruction[];
  /** True = swap tx nie ma CloseAccount wSOL; trzeba dodać osobną unwrap tx. */
  deferredUnwrap: boolean;
} | null> {
  const policy = prepared.policyAssertIx ? [prepared.policyAssertIx] : [];
  const lead = prepared.swapLeadInstructions;
  const tail = prepared.swapTailInstructions;
  const swapIx = prepared.swapIx;
  const ledger = prepared.ledgerInstructions;

  const withTail: Array<{
    ixs: TransactionInstruction[];
    prependToPrep: TransactionInstruction[];
  }> = [
    {
      // Floor/ledger before unwrap — closing wSOL first breaks price-floor SyncNative.
      ixs: [...policy, ...lead, swapIx, ...ledger, ...tail],
      prependToPrep: [],
    },
    {
      ixs: [...lead, swapIx, ...ledger, ...tail],
      prependToPrep: [...policy],
    },
    {
      ixs: [swapIx, ...ledger, ...tail],
      prependToPrep: [...policy, ...lead],
    },
  ];
  const withoutTail: Array<{
    ixs: TransactionInstruction[];
    prependToPrep: TransactionInstruction[];
  }> =
    tail.length > 0
      ? [
          {
            ixs: [...lead, swapIx, ...ledger],
            prependToPrep: [...policy],
          },
          {
            ixs: [swapIx, ...ledger],
            prependToPrep: [...policy, ...lead],
          },
        ]
      : [];

  for (const v of withTail) {
    const swapTx = await assembleFittingLegacyTransaction(
      connection,
      feePayer,
      v.ixs,
      prepared.computeUnits,
      { heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES }
    );
    if (swapTx) {
      return { swapTx, prependToPrep: v.prependToPrep, deferredUnwrap: false };
    }
  }
  for (const v of withoutTail) {
    const swapTx = await assembleFittingLegacyTransaction(
      connection,
      feePayer,
      v.ixs,
      prepared.computeUnits,
      { heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES }
    );
    if (swapTx) {
      return { swapTx, prependToPrep: v.prependToPrep, deferredUnwrap: true };
    }
  }
  return null;
}

async function pushDeferredWsolUnwrapTx(
  connection: {
    getLatestBlockhash: (
      commitment?: string
    ) => Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  },
  user: PublicKey,
  transactions: Transaction[],
  unwrapIxs: TransactionInstruction[],
  deferred: boolean
): Promise<void> {
  if (!deferred || unwrapIxs.length === 0) return;
  const unwrapTx = await assembleFittingLegacyTransaction(
    connection,
    user,
    unwrapIxs,
    50_000
  );
  if (!unwrapTx) {
    throw new Error(
      `Transaction too large: wSOL unwrap > ${LEGACY_TX_PACKET_DATA_SIZE}`
    );
  }
  transactions.push(unwrapTx);
}

/** True when packing dropped CloseAccount (wSOL → native SOL). */
function coreOmitsWsolUnwrap(
  core: TransactionInstruction[],
  tail: TransactionInstruction[]
): boolean {
  if (tail.length === 0) return false;
  return !tail.every((t) => core.includes(t));
}

/** Extra BPF heap for swap+ledger tx (transfer_hook after Meteora swap). */
const SWAP_LEDGER_HEAP_FRAME_BYTES = 256 * 1024;

/** Ledger ix keys: 4 fixed + ≤11 hook metas; trailing keys are vouchers. */
const LEDGER_IX_MAX_KEYS_WITHOUT_VOUCHERS = 4 + 11;

function compactPriceFloorIxs(
  ixs: TransactionInstruction[]
): TransactionInstruction[] {
  return ixs.filter((ix) => !ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
}

function splitBuyLedgerParts(
  ledgerInstructions: TransactionInstruction[],
  cluster?: SupportedCluster
): {
  floorIxs: TransactionInstruction[];
  ledgerIx: TransactionInstruction | null;
} {
  const programId = getPierronProgramId(cluster);
  const floorIxs = ledgerInstructions.filter(
    (ix) => !ix.programId.equals(programId)
  );
  const ledgerIx =
    ledgerInstructions.find((ix) => ix.programId.equals(programId)) ?? null;
  return { floorIxs, ledgerIx };
}

function ledgerIxWithoutVouchers(
  ix: TransactionInstruction
): TransactionInstruction {
  if (ix.keys.length <= LEDGER_IX_MAX_KEYS_WITHOUT_VOUCHERS) return ix;
  return new TransactionInstruction({
    programId: ix.programId,
    keys: ix.keys.slice(0, LEDGER_IX_MAX_KEYS_WITHOUT_VOUCHERS),
    data: ix.data,
  });
}

function joinFloorAndLedger(
  floorIxs: TransactionInstruction[],
  ledgerIx: TransactionInstruction | null
): TransactionInstruction[] {
  return ledgerIx ? [...floorIxs, ledgerIx] : [...floorIxs];
}

/** SOL leg used for 0.5% price-floor fee (buy: amount_in, sell: min_out). */
function swapPriceFloorTransactionValueLamports(params: {
  buyingPierron: boolean;
  sellingPierron: boolean;
  inAmount: BN;
  minOutAmount: BN;
  inToken: PublicKey;
  outToken: PublicKey;
}): bigint {
  if (params.buyingPierron && params.inToken.equals(NATIVE_MINT)) {
    return BigInt(params.inAmount.toString());
  }
  if (params.sellingPierron && params.outToken.equals(NATIVE_MINT)) {
    return BigInt(params.minOutAmount.toString());
  }
  return 0n;
}

function paramsPriceFloorTransactionValueLamports(
  params: PierronDlmmSwapBuildParams
): bigint {
  const pierronMint = params.inToken.equals(NATIVE_MINT)
    ? params.outToken
    : params.inToken;
  return swapPriceFloorTransactionValueLamports({
    buyingPierron: params.outToken.equals(pierronMint),
    sellingPierron: params.inToken.equals(pierronMint),
    inAmount: params.inAmount,
    minOutAmount: params.minOutAmount,
    inToken: params.inToken,
    outToken: params.outToken,
  });
}

/** True when every lead ix (create ATA / wrap SOL) is present in the swap tx. */
function buySwapTxIncludesLead(
  tx: Transaction,
  lead: TransactionInstruction[]
): boolean {
  if (lead.length === 0) return true;
  return lead.every((leadIx) =>
    tx.instructions.some(
      (ix) =>
        ix.programId.equals(leadIx.programId) &&
        ix.data.equals(leadIx.data) &&
        ix.keys.length === leadIx.keys.length &&
        ix.keys.every(
          (k, i) =>
            k.pubkey.equals(leadIx.keys[i]!.pubkey) &&
            k.isSigner === leadIx.keys[i]!.isSigner &&
            k.isWritable === leadIx.keys[i]!.isWritable
        )
    )
  );
}

type PreparedPierronDlmmSwap = {
  setupInstructions: TransactionInstruction[];
  policyAssertIx: TransactionInstruction | null;
  swapLeadInstructions: TransactionInstruction[];
  swapIx: TransactionInstruction;
  swapTailInstructions: TransactionInstruction[];
  taxInstructions: TransactionInstruction[];
  taxAfterSwap: boolean;
  ledgerInstructions: TransactionInstruction[];
  computeUnits: number;
  recentBlockhash: { blockhash: string; lastValidBlockHeight: number };
};

async function preparePierronDlmmSwapInstructions(
  dlmmPool: InstanceType<typeof DLMM>,
  params: PierronDlmmSwapBuildParams
): Promise<PreparedPierronDlmmSwap> {
  const { inToken, outToken, inAmount, minOutAmount, user, binArraysPubkey } =
    params;
  const setupInstructions: TransactionInstruction[] = [];
  const swapLeadInstructions: TransactionInstruction[] = [];
  const swapTailInstructions: TransactionInstruction[] = [];
  const taxInstructions: TransactionInstruction[] = [];
  let taxAfterSwap = false;

  const [inTokenProgram, outTokenProgram] = inToken.equals(
    dlmmPool.lbPair.tokenXMint
  )
    ? [dlmmPool.tokenX.owner, dlmmPool.tokenY.owner]
    : [dlmmPool.tokenY.owner, dlmmPool.tokenX.owner];

  const connection = dlmmPool.program.provider.connection;
  const userTokenIn = getTokenAtaForOwner(inToken, user, inTokenProgram);
  const userTokenOut = getTokenAtaForOwner(outToken, user, outTokenProgram);

  const pierronIsY = !dlmmPool.lbPair.tokenYMint.equals(NATIVE_MINT);
  const pierronMint = pierronIsY
    ? dlmmPool.lbPair.tokenYMint
    : dlmmPool.lbPair.tokenXMint;
  const sellingPierron = inToken.equals(pierronMint);
  const buyingPierron = outToken.equals(pierronMint);
  const priceFloorTxValueLamports = swapPriceFloorTransactionValueLamports({
    buyingPierron,
    sellingPierron,
    inAmount,
    minOutAmount,
    inToken,
    outToken,
  });
  const pierronReserve = pierronIsY
    ? dlmmPool.lbPair.reserveY
    : dlmmPool.lbPair.reserveX;

  const [bitmapExtensionPda] = deriveBinArrayBitmapExtension(
    dlmmPool.pubkey,
    dlmmPool.program.programId
  );

  const dexRefsPromise = pierronMint.equals(NATIVE_MINT)
    ? Promise.resolve(null)
    : readTradeConfigDexRefs(connection, params.cluster);
  const taxHookMetasPromise = (async () => {
    const needSellTax =
      sellingPierron &&
      params.sellTaxBaseUnits != null &&
      params.sellTaxBaseUnits > 0n;
    const needBuyTax =
      buyingPierron &&
      params.buyTaxBaseUnits != null &&
      params.buyTaxBaseUnits > 0n;
    if (!needSellTax && !needBuyTax) return [];
    const refs = await dexRefsPromise;
    if (!refs) return [];
    return resolveTransferHookMetasForTransfer({
      connection,
      mint: pierronMint,
      source: sellingPierron ? userTokenIn : userTokenOut,
      destination: refs.redistributionVault,
      owner: user,
      cluster: params.cluster,
    });
  })();

  const [
    inAtaInfo,
    outAtaInfo,
    bitmapAcc,
    rawHookMetas,
    delegateIx,
    dexRefs,
    latestBlockhash,
    taxHookMetas,
  ] = await Promise.all([
    connection.getAccountInfo(userTokenIn, "processed"),
    connection.getAccountInfo(userTokenOut, "processed"),
    dlmmPool.binArrayBitmapExtension
      ? Promise.resolve(null)
      : connection.getAccountInfo(bitmapExtensionPda, "processed"),
    pierronMint.equals(NATIVE_MINT)
      ? Promise.resolve([] as {
          pubkey: PublicKey;
          isSigner: boolean;
          isWritable: boolean;
        }[])
      : resolveMeteoraSwapHookMetas({
          connection,
          lbPair: dlmmPool.pubkey,
          pierronMint,
          pierronReserve,
          userTokenIn,
          userTokenOut,
          user,
          sellingPierron,
          cluster: params.cluster,
        }),
    pierronMint.equals(NATIVE_MINT)
      ? Promise.resolve(null)
      : buildEnsureHookTaxDelegateIx({
          connection,
          owner: user,
          tokenAccount: sellingPierron ? userTokenIn : userTokenOut,
          mint: pierronMint,
          cluster: params.cluster,
        }),
    dexRefsPromise,
    connection.getLatestBlockhash("processed"),
    taxHookMetasPromise,
  ]);

  const createInTokenAccountIx = inAtaInfo
    ? undefined
    : createAssociatedTokenAccountIdempotentInstruction(
        user,
        userTokenIn,
        user,
        inToken,
        inTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
  const createOutTokenAccountIx = outAtaInfo
    ? undefined
    : createAssociatedTokenAccountIdempotentInstruction(
        user,
        userTokenOut,
        user,
        outToken,
        outTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

  if (createOutTokenAccountIx) setupInstructions.push(createOutTokenAccountIx);

  // Buy (SOL→PIERRON): wrap must live with swap for Phantom sim (empty wSOL →
  // Token insufficient funds 0x1). CreateAta only when missing — always emitting
  // CreateIdempotent blew the 1232 B budget by ~7 B and packing dropped wrap.
  if (createInTokenAccountIx) {
    if (buyingPierron && inToken.equals(NATIVE_MINT)) {
      swapLeadInstructions.push(createInTokenAccountIx);
    } else {
      setupInstructions.push(createInTokenAccountIx);
    }
  }

  if (delegateIx) setupInstructions.push(delegateIx);

  if (inToken.equals(NATIVE_MINT)) {
    // Buy: fold price-floor SOL into the same wrap as the swap input so the
    // ledger only needs TransferChecked (saves ~2 ixs / fits create+wrap under 1232).
    let wrapLamports = BigInt(inAmount.toString());
    if (buyingPierron) {
      wrapLamports += calculatePriceFloorSolFeeLamports(priceFloorTxValueLamports);
    }
    swapLeadInstructions.push(
      ...wrapSOLInstruction(user, userTokenIn, wrapLamports)
    );
    const closeIx = await unwrapSOLInstruction(user);
    if (closeIx) swapTailInstructions.push(closeIx);
  }
  if (outToken.equals(NATIVE_MINT)) {
    const closeIx = await unwrapSOLInstruction(user);
    if (closeIx) swapTailInstructions.push(closeIx);
  }

  const binArrays = binArraysPubkey.map((pubkey) => ({
    isSigner: false,
    isWritable: true,
    pubkey,
  }));

  let transferHookAccounts: {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
  }[] = [];
  let transferHookXLen = 0;
  let transferHookYLen = 0;

  if (!pierronMint.equals(NATIVE_MINT)) {
    const metas = demoteMeteoraConflictingHookMetas(rawHookMetas, {
      user,
      lbPair: dlmmPool.pubkey,
    });
    transferHookAccounts = appendPierronTransferHookProgramMeta(
      trimPierronHookMetasToExecuteCount(metas),
      params.cluster
    );
    if (pierronIsY) {
      transferHookYLen = transferHookAccounts.length;
    } else {
      transferHookXLen = transferHookAccounts.length;
    }
  }

  const slices = [
    { accountsType: { transferHookX: {} }, length: transferHookXLen },
    { accountsType: { transferHookY: {} }, length: transferHookYLen },
  ];

  const programId = dlmmPool.program.programId;
  const resolvedBitmapAcc =
    dlmmPool.binArrayBitmapExtension ?? bitmapAcc;
  if (!resolvedBitmapAcc) {
    const initBitmapIx = await dlmmPool.program.methods
      .initializeBinArrayBitmapExtension()
      .accountsPartial({
        binArrayBitmapExtension: bitmapExtensionPda,
        lbPair: dlmmPool.pubkey,
        funder: user,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();
    setupInstructions.push(initBitmapIx);
  }

  if (
    sellingPierron &&
    params.sellTaxBaseUnits != null &&
    params.sellTaxBaseUnits > 0n
  ) {
    const sellGrossBaseUnits = params.sellGrossInAmount
      ? BigInt(params.sellGrossInAmount.toString())
      : grossFromNet(BigInt(inAmount.toString()), params.sellTaxRemainder ?? 0n)
          .gross;
    taxInstructions.push(
      ...(await buildProtocolTaxAndPriceFloorIxs({
        connection,
        userTokenAccount: userTokenIn,
        mint: pierronMint,
        owner: user,
        grossBaseUnits: sellGrossBaseUnits,
        taxRemainder: params.sellTaxRemainder,
        tokenProgramId: inTokenProgram,
        cluster: params.cluster,
        redistributionVault:
          params.redistributionVault ?? dexRefs?.redistributionVault,
        includeSolFee: false,
        transferHookMetas: taxHookMetas,
      }))
    );
    taxAfterSwap = false;
  }

  if (
    buyingPierron &&
    params.buyTaxBaseUnits != null &&
    params.buyTaxBaseUnits > 0n
  ) {
    const buyGrossBaseUnits = BigInt(
      (params.buyLedgerGrossAmount ?? params.minOutAmount).toString()
    );
    // Token tax only here — SOL price-floor fee must sit in ledgerInstructions
    // (same tx as swap). Size fallback must never drop the fee.
    taxInstructions.push(
      ...(await buildProtocolTaxAndPriceFloorIxs({
        connection,
        userTokenAccount: userTokenOut,
        mint: pierronMint,
        owner: user,
        grossBaseUnits: buyGrossBaseUnits,
        tokenProgramId: outTokenProgram,
        cluster: params.cluster,
        redistributionVault:
          params.redistributionVault ?? dexRefs?.redistributionVault,
        includeSolFee: false,
        transferHookMetas: taxHookMetas,
      }))
    );
    taxAfterSwap = true;
  }

  let policyAssertIx: TransactionInstruction | null = null;
  let consumedVouchers: PublicKey[] =
    params.consumedRedistributionVouchers ?? [];
  if (!pierronMint.equals(NATIVE_MINT)) {
    const policyAmount = sellingPierron
      ? BigInt(inAmount.toString())
      : BigInt((params.buyLedgerGrossAmount ?? minOutAmount).toString());
    const pierronProgramId = getPierronProgramId(params.cluster);
    // An explicitly supplied empty array means trade-book already proves the tier.
    // Do not rescan historical vouchers (slow mobile RPC + oversized transaction).
    if (params.consumedRedistributionVouchers == null) {
      consumedVouchers = await fetchConsumedRedistributionClaimPubkeys({
        connection,
        programId: pierronProgramId,
        user,
        maxWaitMs: 2_000,
        skipProgramAccountsScan: true,
      });
    }
    policyAssertIx = buildAssertDexSwapPolicyIx({
      user,
      mint: pierronMint,
      amount: policyAmount,
      isSell: sellingPierron,
      cluster: params.cluster,
      consumedRedistributionVouchers: consumedVouchers,
    });
  }

  const swapIx = await dlmmPool.program.methods
    .swap2(inAmount, minOutAmount, { slices })
    .accountsPartial({
      lbPair: dlmmPool.pubkey,
      reserveX: dlmmPool.lbPair.reserveX,
      reserveY: dlmmPool.lbPair.reserveY,
      tokenXMint: dlmmPool.lbPair.tokenXMint,
      tokenYMint: dlmmPool.lbPair.tokenYMint,
      tokenXProgram: dlmmPool.tokenX.owner,
      tokenYProgram: dlmmPool.tokenY.owner,
      user,
      userTokenIn,
      userTokenOut,
      binArrayBitmapExtension: bitmapExtensionPda,
      oracle: dlmmPool.lbPair.oracle,
      hostFeeIn: null,
      memoProgram: MEMO_PROGRAM_ID,
    })
    .remainingAccounts(transferHookAccounts)
    .remainingAccounts(binArrays)
    .instruction();

  const ledgerInstructions: TransactionInstruction[] = [];
  if (!pierronMint.equals(NATIVE_MINT) && dexRefs) {
    const ledgerPoolVault = dexRefs.meteoraTokenVault;
    const ledgerPool = dexRefs.meteoraPool;
    if (sellingPierron) {
      // Create wSOL ATA in setup/prep — keep swap+ledger under 1232 B on mobile.
      const userWsol = getAssociatedTokenAddressSync(
        NATIVE_MINT,
        user,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      setupInstructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          user,
          userWsol,
          user,
          NATIVE_MINT,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      // SOL fee → Meteora wSOL reserve in the same tx as transfer_hook ledger.
      ledgerInstructions.push(
        ...(await buildPriceFloorSolFeeIxs({
          connection,
          payer: user,
          transactionValueLamports: priceFloorTxValueLamports,
          meteoraPool: ledgerPool,
          pierronTokenVault: ledgerPoolVault,
          cluster: params.cluster,
          skipCreateWsolAta: true,
          solReserve: dlmmPool.lbPair.tokenXMint.equals(NATIVE_MINT)
            ? dlmmPool.lbPair.reserveX
            : dlmmPool.lbPair.tokenYMint.equals(NATIVE_MINT)
            ? dlmmPool.lbPair.reserveY
            : undefined,
        }))
      );
    } else if (buyingPierron) {
      // Buy: fee with ledger (not only in tax) so size-fallback never drops it.
      if (
        priceFloorTxValueLamports > 0n &&
        calculatePriceFloorSolFeeLamports(priceFloorTxValueLamports) > 0n
      ) {
        // Buy setup already ensures wSOL ATA (getOrCreate + wrap) — skip createAta
        // so swap+ledger stays under the 1232 B legacy packet limit on mobile.
        ledgerInstructions.push(
          ...(await buildPriceFloorSolFeeIxs({
            connection,
            payer: user,
            transactionValueLamports: priceFloorTxValueLamports,
            meteoraPool: ledgerPool,
            pierronTokenVault: ledgerPoolVault,
            cluster: params.cluster,
            skipCreateWsolAta: true,
            // Fee lamports already in the buy wrap — only TransferChecked remains.
            preWrappedFeeOnly: inToken.equals(NATIVE_MINT),
            solReserve: dlmmPool.lbPair.tokenXMint.equals(NATIVE_MINT)
              ? dlmmPool.lbPair.reserveX
              : dlmmPool.lbPair.tokenYMint.equals(NATIVE_MINT)
              ? dlmmPool.lbPair.reserveY
              : undefined,
          }))
        );
      }
    }
    // Token-2022 Execute already CPIs Pierron during Swap2 (activity, tickets,
    // cooldown). A second transfer_hook ledger ix sees last_activity=now and
    // fails TransactionCooldownActive (6030), reverting the whole swap.
  }

  return {
    setupInstructions,
    policyAssertIx,
    swapLeadInstructions,
    swapIx,
    swapTailInstructions,
    taxInstructions,
    taxAfterSwap,
    ledgerInstructions,
    computeUnits: params.computeUnits ?? 1_400_000,
    recentBlockhash: latestBlockhash,
  };
}

function assertTxUnderLimit(tx: Transaction, label: string): void {
  const bytes = safeLegacyTxByteLength(tx);
  if (bytes > LEGACY_TX_PACKET_DATA_SIZE) {
    throw new Error(
      `Transaction too large: ${bytes} > ${LEGACY_TX_PACKET_DATA_SIZE} (${label})`
    );
  }
}

/**
 * Mobile sell: agresywne pakowanie w 1 legacy tx (setup+tax+swap+ledger).
 * 2 tx ze wspólnym blockhash pada na Samsungu (wolny powrót z Phantom).
 */
async function tryAssemblePreferSingleSellTx(
  connection: {
    getLatestBlockhash: (
      commitment?: string
    ) => Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  },
  params: PierronDlmmSwapBuildParams,
  prepared: PreparedPierronDlmmSwap
): Promise<PierronDlmmSwapPlan | null> {
  if (prepared.taxAfterSwap) return null;

  // Size probing is purely local. Reusing one fresh blockhash avoids dozens of serial RPC
  // calls (cores × CU variants × heap/priority variants), which previously hit the mobile
  // 35 s preparation timeout before Phantom could even open.
  const latestBlockhash = await connection.getLatestBlockhash("processed");
  const packingConnection = {
    getLatestBlockhash: async () => latestBlockhash,
  };

  const { floorIxs, ledgerIx } = splitBuyLedgerParts(
    prepared.ledgerInstructions,
    params.cluster
  );
  const floorCompact = compactPriceFloorIxs(floorIxs);
  const voucherCount = params.consumedRedistributionVouchers?.length ?? 0;
  const ledgerSlim =
    ledgerIx && voucherCount === 0 ? ledgerIxWithoutVouchers(ledgerIx) : null;
  const setup = prepared.setupInstructions;
  const tax = prepared.taxInstructions;
  const policy = prepared.policyAssertIx ? [prepared.policyAssertIx] : [];
  const lead = prepared.swapLeadInstructions;
  const tail = prepared.swapTailInstructions;
  const swap = prepared.swapIx;

  const fullLedger = joinFloorAndLedger(floorIxs, ledgerIx);
  const compactLedger = joinFloorAndLedger(floorCompact, ledgerIx);
  const priceFloorTxValueLamports = paramsPriceFloorTransactionValueLamports(params);
  const legacyFloorLedger =
    priceFloorTxValueLamports > 0n &&
    calculatePriceFloorSolFeeLamports(priceFloorTxValueLamports) > 0n
      ? joinFloorAndLedger(
          [
            buildPriceFloorSolFeeLegacyTreasuryIx({
              payer: params.user,
              transactionValueLamports: priceFloorTxValueLamports,
              cluster: params.cluster,
            }),
          ],
          ledgerIx
        )
      : [];
  // Prefer with-tail (native SOL) first; without-tail only as last resort + deferred unwrap.
  // Hermes on Samsung previously burned a minute on oversized combos — keep compact first.
  const withTailCores: TransactionInstruction[][] = [
    [...tax, swap, ...compactLedger, ...tail],
    [...tax, ...lead, swap, ...compactLedger, ...tail],
    ...(ledgerSlim
      ? [
          [
            ...tax,
            swap,
            ...joinFloorAndLedger(floorCompact, ledgerSlim),
            ...tail,
          ],
          [
            ...tax,
            ...lead,
            swap,
            ...joinFloorAndLedger(floorCompact, ledgerSlim),
            ...tail,
          ],
        ]
      : []),
    ...(legacyFloorLedger.length > 0
      ? [
          [...tax, swap, ...legacyFloorLedger, ...tail],
          [...tax, ...lead, swap, ...legacyFloorLedger, ...tail],
        ]
      : []),
    // The transfer hook already validates the sell policy on-chain. Keep the redundant
    // preflight policy variants only as larger fallbacks.
    [...tax, ...policy, ...lead, swap, ...compactLedger, ...tail],
    [...tax, ...policy, ...lead, swap, ...fullLedger, ...tail],
    [...tax, ...policy, ...lead, swap, ...prepared.ledgerInstructions, ...tail],
    ...(ledgerSlim
      ? [
          [
            ...tax,
            ...policy,
            ...lead,
            swap,
            ...joinFloorAndLedger(floorCompact, ledgerSlim),
            ...tail,
          ],
        ]
      : []),
  ];
  const withoutTailCores: TransactionInstruction[][] =
    tail.length > 0
      ? [
          [...tax, swap, ...compactLedger],
          [...tax, ...lead, swap, ...compactLedger],
          ...(ledgerSlim
            ? [
                [
                  ...tax,
                  swap,
                  ...joinFloorAndLedger(floorCompact, ledgerSlim),
                ],
                [
                  ...tax,
                  ...lead,
                  swap,
                  ...joinFloorAndLedger(floorCompact, ledgerSlim),
                ],
              ]
            : []),
          ...(legacyFloorLedger.length > 0
            ? [
                [...tax, swap, ...legacyFloorLedger],
                [...tax, ...lead, swap, ...legacyFloorLedger],
              ]
            : []),
          ...(ledgerSlim
            ? [
                [
                  ...tax,
                  ...policy,
                  ...lead,
                  swap,
                  ...joinFloorAndLedger(floorCompact, ledgerSlim),
                ],
              ]
            : []),
        ]
      : [];

  const tryCore = async (
    core: TransactionInstruction[]
  ): Promise<Transaction | null> => {
    const ixs = [...setup, ...core];
    if (ixs.length === 0) return null;
    // This helper already probes priority/no-priority and heap/no-heap. Compute-unit
    // values have identical packet size, so the old 3 × 5 nested search was redundant.
    return assembleFittingLegacyTransaction(
      packingConnection,
      params.user,
      ixs,
      prepared.computeUnits,
      {
        heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES,
        priorityMicroLamports: 500_000,
      }
    );
  };

  for (const core of withTailCores) {
    const tx = await tryCore(core);
    if (tx) {
      assertTxUnderLimit(tx, "prefer-single-sell");
      return {
        transactions: [tx],
        swapTxIndex: 0,
        ledgerTxIndex: prepared.ledgerInstructions.length > 0 ? 0 : -1,
      };
    }
  }
  for (const core of withoutTailCores) {
    const tx = await tryCore(core);
    if (tx) {
      assertTxUnderLimit(tx, "prefer-single-sell");
      const transactions = [tx];
      await pushDeferredWsolUnwrapTx(
        packingConnection,
        params.user,
        transactions,
        tail,
        true
      );
      return {
        transactions,
        swapTxIndex: 0,
        ledgerTxIndex: prepared.ledgerInstructions.length > 0 ? 0 : -1,
      };
    }
  }
  return null;
}

/**
 * Samsung Phantom: 2 tx w signTransactions = dwa ekrany POTWIERDŹ.
 * Ostatnia próba 1-tx (setup+tax+swap+ledger) zanim błąd.
 */
async function tryAssembleSamsungMandatorySingleSellTx(
  connection: {
    getLatestBlockhash: (
      commitment?: string
    ) => Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  },
  params: PierronDlmmSwapBuildParams,
  prepared: PreparedPierronDlmmSwap
): Promise<PierronDlmmSwapPlan | null> {
  if (prepared.taxAfterSwap) return null;

  const latestBlockhash = await connection.getLatestBlockhash("processed");
  const packingConnection = {
    getLatestBlockhash: async () => latestBlockhash,
  };

  const { floorIxs, ledgerIx } = splitBuyLedgerParts(
    prepared.ledgerInstructions,
    params.cluster
  );
  const floorCompact = compactPriceFloorIxs(floorIxs);
  const voucherCount = params.consumedRedistributionVouchers?.length ?? 0;
  const ledgerSlim =
    ledgerIx && voucherCount === 0 ? ledgerIxWithoutVouchers(ledgerIx) : null;
  const setup = prepared.setupInstructions;
  const tax = prepared.taxInstructions;
  const lead = prepared.swapLeadInstructions;
  const tail = prepared.swapTailInstructions;
  const swap = prepared.swapIx;

  const compactLedger = joinFloorAndLedger(floorCompact, ledgerIx);
  const slimLedger = ledgerSlim
    ? joinFloorAndLedger(floorCompact, ledgerSlim)
    : [];

  const withTailCores: TransactionInstruction[][] = [
    [...tax, swap, ...compactLedger, ...tail],
    [...tax, ...lead, swap, ...compactLedger, ...tail],
    ...(slimLedger.length > 0
      ? [
          [...tax, swap, ...slimLedger, ...tail],
          [...tax, ...lead, swap, ...slimLedger, ...tail],
        ]
      : []),
    [
      ...tax,
      ...lead,
      swap,
      ...prepared.ledgerInstructions,
      ...tail,
    ],
  ];
  const withoutTailCores: TransactionInstruction[][] =
    tail.length > 0
      ? [
          [...tax, swap, ...compactLedger],
          [...tax, ...lead, swap, ...compactLedger],
          ...(slimLedger.length > 0
            ? [
                [...tax, ...lead, swap, ...slimLedger],
                [...tax, swap, ...slimLedger],
              ]
            : []),
        ]
      : [];

  const tryCore = async (
    core: TransactionInstruction[]
  ): Promise<Transaction | null> => {
    const ixs = [...setup, ...core];
    if (ixs.length === 0) return null;
    return assembleFittingLegacyTransaction(
      packingConnection,
      params.user,
      ixs,
      prepared.computeUnits,
      {
        heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES,
        priorityMicroLamports: 500_000,
      }
    );
  };

  for (const core of withTailCores) {
    const tx = await tryCore(core);
    if (tx) {
      assertTxUnderLimit(tx, "samsung-mandatory-single-sell");
      return {
        transactions: [tx],
        swapTxIndex: 0,
        ledgerTxIndex: prepared.ledgerInstructions.length > 0 ? 0 : -1,
      };
    }
  }
  for (const core of withoutTailCores) {
    const tx = await tryCore(core);
    if (tx) {
      assertTxUnderLimit(tx, "samsung-mandatory-single-sell");
      const transactions = [tx];
      await pushDeferredWsolUnwrapTx(
        packingConnection,
        params.user,
        transactions,
        tail,
        true
      );
      return {
        transactions,
        swapTxIndex: 0,
        ledgerTxIndex: prepared.ledgerInstructions.length > 0 ? 0 : -1,
      };
    }
  }
  return null;
}

/**
 * Mobile buy: agresywne pakowanie w 1 legacy tx (setup+wrap+swap+ledger+tax).
 * forceSplit (2 tx) = dwa ekrany POTWIERDŹ w Phantom Android.
 */
async function tryAssemblePreferSingleBuyTx(
  connection: {
    getLatestBlockhash: (
      commitment?: string
    ) => Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  },
  params: PierronDlmmSwapBuildParams,
  prepared: PreparedPierronDlmmSwap
): Promise<PierronDlmmSwapPlan | null> {
  if (!prepared.taxAfterSwap) return null;

  const latestBlockhash = await connection.getLatestBlockhash("processed");
  const packingConnection = {
    getLatestBlockhash: async () => latestBlockhash,
  };

  const { floorIxs, ledgerIx } = splitBuyLedgerParts(
    prepared.ledgerInstructions,
    params.cluster
  );
  const floorCompact = compactPriceFloorIxs(floorIxs);
  const voucherCount = params.consumedRedistributionVouchers?.length ?? 0;
  const ledgerSlim =
    ledgerIx && voucherCount === 0 ? ledgerIxWithoutVouchers(ledgerIx) : null;
  const setup = prepared.setupInstructions;
  const policy = prepared.policyAssertIx ? [prepared.policyAssertIx] : [];
  const lead = prepared.swapLeadInstructions;
  const tail = prepared.swapTailInstructions;
  const tax = prepared.taxInstructions;
  const swap = prepared.swapIx;
  const priceFloorTxValueLamports = paramsPriceFloorTransactionValueLamports(params);
  const legacyFloorIxs =
    priceFloorTxValueLamports > 0n &&
    calculatePriceFloorSolFeeLamports(priceFloorTxValueLamports) > 0n
      ? [
          buildPriceFloorSolFeeLegacyTreasuryIx({
            payer: params.user,
            transactionValueLamports: priceFloorTxValueLamports,
            cluster: params.cluster,
          }),
        ]
      : [];

  const cores: TransactionInstruction[][] = [
    ...(legacyFloorIxs.length > 0
      ? [
          [
            ...setup,
            ...policy,
            ...lead,
            swap,
            ...joinFloorAndLedger(legacyFloorIxs, ledgerIx),
            ...tax,
            ...tail,
          ],
          [
            ...setup,
            ...lead,
            swap,
            ...joinFloorAndLedger(legacyFloorIxs, ledgerSlim ?? ledgerIx),
            ...tax,
          ],
        ]
      : []),
    [
      ...setup,
      ...policy,
      ...lead,
      swap,
      ...joinFloorAndLedger(floorCompact, ledgerIx),
      ...tax,
      ...tail,
    ],
    [
      ...setup,
      ...lead,
      swap,
      ...joinFloorAndLedger(floorCompact, ledgerIx),
      ...tax,
    ],
    ...(ledgerSlim
      ? [
          [
            ...setup,
            ...lead,
            swap,
            ...joinFloorAndLedger(floorCompact, ledgerSlim),
            ...tax,
          ],
          [
            ...setup,
            ...lead,
            swap,
            ...joinFloorAndLedger(floorCompact, ledgerSlim),
            ...tax,
            ...tail,
          ],
        ]
      : []),
    [
      ...setup,
      ...policy,
      ...lead,
      swap,
      ...joinFloorAndLedger(floorIxs, ledgerIx),
      ...tax,
      ...tail,
    ],
  ];

  for (const ixs of cores) {
    if (ixs.length === 0) continue;
    const tx = await assembleFittingLegacyTransaction(
      packingConnection,
      params.user,
      ixs,
      prepared.computeUnits,
      {
        heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES,
        priorityMicroLamports: 500_000,
      }
    );
    if (!tx) continue;
    if (lead.length > 0 && !buySwapTxIncludesLead(tx, lead)) continue;
    return {
      transactions: [tx],
      swapTxIndex: 0,
      ledgerTxIndex: prepared.ledgerInstructions.length > 0 ? 0 : -1,
    };
  }
  return null;
}

/** Legacy MWA / Phantom — always split setup, swap core, and 1% redistribution tax. */
export async function buildPierronDlmmSwapPlan(
  dlmmPool: InstanceType<typeof DLMM>,
  params: PierronDlmmSwapBuildParams
): Promise<PierronDlmmSwapPlan> {
  const prepared = await preparePierronDlmmSwapInstructions(dlmmPool, params);
  const latestBlockhash = prepared.recentBlockhash;
  const connection = {
    getLatestBlockhash: async () => latestBlockhash,
  };
  const sharedBlockhash = { recentBlockhash: latestBlockhash };

  // Ledger (price-floor + hook) must run before unwrap closes wSOL.
  const singleInstructions = [
    ...prepared.setupInstructions,
    ...(prepared.taxAfterSwap ? [] : prepared.taxInstructions),
    ...(prepared.policyAssertIx ? [prepared.policyAssertIx] : []),
    ...prepared.swapLeadInstructions,
    prepared.swapIx,
    ...prepared.ledgerInstructions,
    ...(prepared.taxAfterSwap ? prepared.taxInstructions : []),
    ...prepared.swapTailInstructions,
  ];
  if (!params.forceSplit) {
    const singleOpts = params.preferSingleTx
      ? {
          heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES,
          priorityMicroLamports: 500_000,
        }
      : { heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES };
    const singleProbe = await assembleFittingLegacyTransaction(
      connection,
      params.user,
      singleInstructions,
      prepared.computeUnits,
      { ...singleOpts, ...sharedBlockhash }
    );
    if (singleProbe) {
      return {
        transactions: [singleProbe],
        swapTxIndex: 0,
        ledgerTxIndex: prepared.ledgerInstructions.length > 0 ? 0 : -1,
      };
    }
    if (params.preferSingleTx) {
      const packed = prepared.taxAfterSwap
        ? await tryAssemblePreferSingleBuyTx(connection, params, prepared)
        : await tryAssemblePreferSingleSellTx(connection, params, prepared);
      if (packed) return packed;
      if (params.avoidForceSplit) {
        const mandatory = await tryAssembleSamsungMandatorySingleSellTx(
          connection,
          params,
          prepared
        );
        if (mandatory) return mandatory;
        // Samsung: 1-tx niemożliwe przy tym swapie — 2 tx (859+1223 B). Jeden signTransactions;
        // Phantom może pokazać 2× POTWIERDŹ, ale swap MUSI wejść (tax → processed → swap).
        params = { ...params, forceSplit: false, preferSingleTx: false };
      } else {
        params = { ...params, forceSplit: true, preferSingleTx: false };
      }
    }
  }

  const transactions: Transaction[] = [];
  let swapTxIndex = 0;
  let ledgerTxIndex = -1;

  const preSwapInstructions = [
    ...(prepared.policyAssertIx ? [prepared.policyAssertIx] : []),
    ...prepared.swapLeadInstructions,
  ];

  if (params.forceSplit) {
    // Buy: setup+policy | swap+ledger(+tax) — ledger MUST share the swap tx (on-chain
    // rejects ledger-only OfficialBuy/Sell; failed swap must not mint presence).
    if (prepared.taxAfterSwap) {
      // Prep = setup + policy only. Create wSOL + wrap MUST stay with Swap2 —
      // Phantom sims each tx alone. Create-in-prep + wrap-in-swap → IncorrectProgramId
      // on Sony after sell closes the ATA.
      const basePrep = [
        ...prepared.setupInstructions,
        ...(prepared.policyAssertIx ? [prepared.policyAssertIx] : []),
      ];
      if (basePrep.length > 0) {
        transactions.push(
          await assembleLegacyTransaction(
            connection,
            params.user,
            basePrep,
            prepared.policyAssertIx ? 600_000 : 500_000
          )
        );
        assertTxUnderLimit(transactions[transactions.length - 1], "setup+prep");
      }

      const { floorIxs, ledgerIx } = splitBuyLedgerParts(
        prepared.ledgerInstructions,
        params.cluster
      );
      const floorCompact = compactPriceFloorIxs(floorIxs);
      const ledgerSlim = ledgerIx ? ledgerIxWithoutVouchers(ledgerIx) : null;
      const lead = prepared.swapLeadInstructions;
      const tail = prepared.swapTailInstructions;
      const priceFloorTxValueLamports =
        paramsPriceFloorTransactionValueLamports(params);
      const legacyFloorIxs =
        priceFloorTxValueLamports > 0n &&
        calculatePriceFloorSolFeeLamports(priceFloorTxValueLamports) > 0n
          ? [
              buildPriceFloorSolFeeLegacyTreasuryIx({
                payer: params.user,
                transactionValueLamports: priceFloorTxValueLamports,
                cluster: params.cluster,
              }),
            ]
          : [];

      const isCreateWsolAtaIx = (ix: TransactionInstruction) =>
        ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) &&
        ix.keys.length >= 4 &&
        ix.keys[2]?.pubkey.equals(NATIVE_MINT);
      const createLead = lead.filter(isCreateWsolAtaIx);
      const wrapLead = lead.filter((ix) => !isCreateWsolAtaIx(ix));

      const floorLedgerVariants: Array<{
        floor: TransactionInstruction[];
        ledger: TransactionInstruction | null;
      }> = [
        ...(ledgerSlim
          ? [
              { floor: floorCompact, ledger: ledgerSlim },
              ...(legacyFloorIxs.length > 0
                ? [{ floor: legacyFloorIxs, ledger: ledgerSlim }]
                : []),
            ]
          : []),
        { floor: floorCompact, ledger: ledgerIx },
      ];

      let buySwapLedger: Transaction | null = null;
      let taxInSwapTx = false;
      let packBlockhash: { blockhash: string; lastValidBlockHeight: number } | null =
        null;

      const packBh = async () => {
        if (!packBlockhash) {
          packBlockhash = await connection.getLatestBlockhash();
        }
        return packBlockhash;
      };

      const tryAssembleCore = async (
        core: TransactionInstruction[],
        withTax: boolean
      ): Promise<Transaction | null> => {
        const ixs =
          withTax && prepared.taxInstructions.length > 0
            ? [...core, ...prepared.taxInstructions]
            : core;
        if (ixs.length === 0) return null;
        const bh = await packBh();
        // Never fall back to a no-heap swap+ledger tx — Token-2022 hook OOMs at 32 KiB.
        return assembleFittingLegacyTransaction(
          connection,
          params.user,
          ixs,
          prepared.computeUnits,
          {
            heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES,
            recentBlockhash: bh,
          }
        );
      };

      const tryPackBuySwapLedger = async (swapLead: TransactionInstruction[]) => {
        const cores: TransactionInstruction[][] = [];
        for (const { floor, ledger } of floorLedgerVariants) {
          cores.push([
            ...swapLead,
            prepared.swapIx,
            ...joinFloorAndLedger(floor, ledger),
          ]);
        }
        for (const withTax of [true, false]) {
          for (const core of cores) {
            const tx = await tryAssembleCore(core, withTax);
            if (tx) {
              buySwapLedger = tx;
              taxInSwapTx = withTax && prepared.taxInstructions.length > 0;
              return true;
            }
          }
        }
        return false;
      };

      const rebuildPrepTx = async (extraPrep: TransactionInstruction[]) => {
        transactions.length = 0;
        const prepIxs = [
          ...prepared.setupInstructions,
          ...(prepared.policyAssertIx ? [prepared.policyAssertIx] : []),
          ...extraPrep,
        ];
        if (prepIxs.length === 0) return;
        const bh = await packBh();
        transactions.push(
          await assembleLegacyTransaction(
            connection,
            params.user,
            prepIxs,
            prepared.policyAssertIx ? 600_000 : 500_000,
            { recentBlockhash: bh }
          )
        );
        assertTxUnderLimit(transactions[transactions.length - 1], "setup+prep");
      };

      // 1) standard: create+wrap w lead (checkpoint); slim ledger + bez tail najpierw.
      await tryPackBuySwapLedger(lead);

      // 2) po sprzedaży wSOL ATA znika — create w prep, wrap w swap (mniejsza tx2 + tax).
      if (!buySwapLedger && createLead.length > 0) {
        await rebuildPrepTx(createLead);
        await tryPackBuySwapLedger(wrapLead);
      }

      if (!buySwapLedger) {
        throw new Error(
          `Transaction too large: buy-wrap+swap+ledger > ${LEGACY_TX_PACKET_DATA_SIZE}`
        );
      }
      if (wrapLead.length > 0 && !buySwapTxIncludesLead(buySwapLedger, wrapLead)) {
        throw new Error(
          "Buy swap tx missing SOL wrap — odśwież Metro i spróbuj ponownie."
        );
      }
      if (lead.length > 0 && !buySwapTxIncludesLead(buySwapLedger, lead)) {
        // create-in-prep path: tylko wrap musi być w tx swapu
        if (
          createLead.length === 0 ||
          !buySwapTxIncludesLead(buySwapLedger, wrapLead)
        ) {
          throw new Error(
            "Buy swap tx missing SOL wrap/create — odśwież Metro i spróbuj ponownie."
          );
        }
      }
      swapTxIndex = transactions.length;
      ledgerTxIndex =
        prepared.ledgerInstructions.length > 0 ? transactions.length : -1;
      transactions.push(buySwapLedger);
      assertTxUnderLimit(buySwapLedger, "buy-swap+ledger");

      if (!taxInSwapTx && prepared.taxInstructions.length > 0) {
        const bh = await packBh();
        const buyTax = await assembleFittingLegacyTransaction(
          connection,
          params.user,
          prepared.taxInstructions,
          600_000,
          { recentBlockhash: bh }
        );
        if (!buyTax) {
          throw new Error(
            `Transaction too large: buy-tax > ${LEGACY_TX_PACKET_DATA_SIZE}`
          );
        }
        transactions.push(buyTax);
        assertTxUnderLimit(buyTax, "buy-tax");
      }

      return { transactions, swapTxIndex, ledgerTxIndex };
    }

    // Sell forceSplit — prep(tax/policy/lead/wSOL ATA) | swap+ledger (atomically).
    // Osobny ledger po padniętym swapie zapisywał obecność bez ticketów/obrotu.
    // Packing mirrors buy: compact floor, slim vouchers, legacy treasury fallback.
    const sellPrepIxs = [
      ...prepared.setupInstructions,
      ...(prepared.policyAssertIx ? [prepared.policyAssertIx] : []),
      ...prepared.swapLeadInstructions,
      ...prepared.taxInstructions,
    ];
    if (sellPrepIxs.length === 0) {
      throw new Error("Sell forceSplit: brak instrukcji prep (tax/policy).");
    }
    transactions.push(
      await assembleLegacyTransaction(
        connection,
        params.user,
        sellPrepIxs,
        700_000
      )
    );
    assertTxUnderLimit(transactions[transactions.length - 1], "sell-prep+tax");

    const { floorIxs, ledgerIx } = splitBuyLedgerParts(
      prepared.ledgerInstructions,
      params.cluster
    );
    const floorCompact = compactPriceFloorIxs(floorIxs);
    // Ledger vouchers = tylko fallback tieru przy opóźnionym trade booku. Limit sprzedaży
    // waliduje assert_dex_swap_policy w tx PREP (niesie pełne vouchery). Gdy swap+ledger nie
    // mieści się z voucherami (baseline ~1223/1232 B — jeden voucher przepełnia), próbujemy
    // wariant slim (bez voucherów) — swap MUSI wejść na łańcuch. Pełny wariant jest pierwszy,
    // więc gdy jest miejsce, vouchery zostają.
    const ledgerSlim = ledgerIx ? ledgerIxWithoutVouchers(ledgerIx) : null;
    const priceFloorTxValueLamports =
      paramsPriceFloorTransactionValueLamports(params);
    const legacyFloorIxs =
      priceFloorTxValueLamports > 0n &&
      calculatePriceFloorSolFeeLamports(priceFloorTxValueLamports) > 0n
        ? [
            buildPriceFloorSolFeeLegacyTreasuryIx({
              payer: params.user,
              transactionValueLamports: priceFloorTxValueLamports,
              cluster: params.cluster,
            }),
          ]
        : [];
    const tail = prepared.swapTailInstructions;
    const sellCores: TransactionInstruction[][] = [
      [prepared.swapIx, ...joinFloorAndLedger(floorIxs, ledgerIx), ...tail],
      [prepared.swapIx, ...joinFloorAndLedger(floorCompact, ledgerIx), ...tail],
      ...(ledgerSlim
        ? [
            [
              prepared.swapIx,
              ...joinFloorAndLedger(floorCompact, ledgerSlim),
              ...tail,
            ],
            [prepared.swapIx, ...joinFloorAndLedger(floorCompact, ledgerSlim)],
          ]
        : []),
      ...(legacyFloorIxs.length > 0
        ? [
            [
              prepared.swapIx,
              ...joinFloorAndLedger(legacyFloorIxs, ledgerIx),
              ...tail,
            ],
            ...(ledgerSlim
              ? [
                  [
                    prepared.swapIx,
                    ...joinFloorAndLedger(legacyFloorIxs, ledgerSlim),
                    ...tail,
                  ],
                  [
                    prepared.swapIx,
                    ...joinFloorAndLedger(legacyFloorIxs, ledgerSlim),
                  ],
                ]
              : []),
            [prepared.swapIx, ...joinFloorAndLedger(legacyFloorIxs, ledgerIx)],
          ]
        : []),
    ];

    let sellSwapLedger: Transaction | null = null;
    let deferredUnwrap = false;
    for (const ixs of sellCores) {
      if (ixs.length === 0) continue;
      // Never assemble swap+ledger without requestHeapFrame (hook OOM).
      sellSwapLedger = await assembleFittingLegacyTransaction(
        connection,
        params.user,
        ixs,
        prepared.computeUnits,
        { heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES }
      );
      if (sellSwapLedger) {
        deferredUnwrap = coreOmitsWsolUnwrap(ixs, tail);
        break;
      }
    }
    if (!sellSwapLedger) {
      throw new Error(
        `Transaction too large: sell-swap+ledger > ${LEGACY_TX_PACKET_DATA_SIZE}`
      );
    }
    swapTxIndex = transactions.length;
    ledgerTxIndex =
      prepared.ledgerInstructions.length > 0 ? transactions.length : -1;
    transactions.push(sellSwapLedger);
    assertTxUnderLimit(sellSwapLedger, "sell-swap+ledger");
    await pushDeferredWsolUnwrapTx(
      connection,
      params.user,
      transactions,
      tail,
      deferredUnwrap
    );

    return { transactions, swapTxIndex, ledgerTxIndex };
  }

  // ——— Sell / non-forceSplit (desktop/scripts): MAX 2 tx. ———
  // Mobile forceSplit → prep | swap+ledger (ledger nigdy osobno po swapie).

  if (prepared.taxInstructions.length > 0 && !prepared.taxAfterSwap) {
    const taxSwapLedgerIxs = [
      ...prepared.taxInstructions,
      ...(prepared.policyAssertIx ? [prepared.policyAssertIx] : []),
      ...prepared.swapLeadInstructions,
      prepared.swapIx,
      ...prepared.ledgerInstructions,
      ...prepared.swapTailInstructions,
    ];
    const taxSwapLedgerTx = await assembleFittingLegacyTransaction(
      connection,
      params.user,
      taxSwapLedgerIxs,
      prepared.computeUnits,
      { heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES }
    );
    if (taxSwapLedgerTx) {
      if (prepared.setupInstructions.length > 0) {
        const mergedSetup = await assembleFittingLegacyTransaction(
          connection,
          params.user,
          [...prepared.setupInstructions, ...taxSwapLedgerIxs],
          prepared.computeUnits,
          { heapFrameBytes: SWAP_LEDGER_HEAP_FRAME_BYTES }
        );
        if (mergedSetup) {
          return {
            transactions: [mergedSetup],
            swapTxIndex: 0,
            ledgerTxIndex:
              prepared.ledgerInstructions.length > 0 ? 0 : -1,
          };
        }
        if (!params.avoidForceSplit) {
          const setupTx = await assembleFittingLegacyTransaction(
            connection,
            params.user,
            prepared.setupInstructions,
            400_000
          );
          if (!setupTx) {
            throw new Error(
              `Transaction too large: setup > ${LEGACY_TX_PACKET_DATA_SIZE} (setup)`
            );
          }
          transactions.push(setupTx);
          swapTxIndex = transactions.length;
          ledgerTxIndex =
            prepared.ledgerInstructions.length > 0 ? transactions.length : -1;
          transactions.push(taxSwapLedgerTx);
          return { transactions, swapTxIndex, ledgerTxIndex };
        }
        // Samsung: 2-tx packed fallback poniżej (prep+tax | swap+ledger).
      } else {
        return {
          transactions: [taxSwapLedgerTx],
          swapTxIndex: 0,
          ledgerTxIndex:
            prepared.ledgerInstructions.length > 0 ? 0 : -1,
        };
      }
    }

    const packed = await assembleSellSwapLedgerFitting(
      connection,
      params.user,
      prepared
    );
    if (!packed) {
      throw new Error(
        `Transaction too large: swap+ledger > ${LEGACY_TX_PACKET_DATA_SIZE}`
      );
    }

    const prepTaxIxs = [
      ...prepared.setupInstructions,
      ...packed.prependToPrep,
      ...prepared.taxInstructions,
    ];
    const prepTaxTx = await assembleFittingLegacyTransaction(
      connection,
      params.user,
      prepTaxIxs,
      700_000
    );
    if (!prepTaxTx) {
      const taxOnly = await assembleFittingLegacyTransaction(
        connection,
        params.user,
        [...packed.prependToPrep, ...prepared.taxInstructions],
        600_000
      );
      if (!taxOnly) {
        throw new Error(
          `Transaction too large: sell-tax > ${LEGACY_TX_PACKET_DATA_SIZE}`
        );
      }
      transactions.push(taxOnly);
    } else {
      transactions.push(prepTaxTx);
    }

    swapTxIndex = transactions.length;
    ledgerTxIndex =
      prepared.ledgerInstructions.length > 0 ? transactions.length : -1;
    transactions.push(packed.swapTx);
    await pushDeferredWsolUnwrapTx(
      connection,
      params.user,
      transactions,
      prepared.swapTailInstructions,
      packed.deferredUnwrap
    );
    return { transactions, swapTxIndex, ledgerTxIndex };
  }

  const packedSolo = await assembleSellSwapLedgerFitting(
    connection,
    params.user,
    prepared
  );
  if (!packedSolo) {
    throw new Error(
      `Transaction too large: swap+ledger > ${LEGACY_TX_PACKET_DATA_SIZE}`
    );
  }

  const prepIxs = [...prepared.setupInstructions, ...packedSolo.prependToPrep];
  if (prepIxs.length > 0) {
    const prepTx = await assembleFittingLegacyTransaction(
      connection,
      params.user,
      prepIxs,
      400_000
    );
    if (!prepTx) {
      throw new Error(
        `Transaction too large: setup/policy > ${LEGACY_TX_PACKET_DATA_SIZE}`
      );
    }
    transactions.push(prepTx);
  }

  swapTxIndex = transactions.length;
  ledgerTxIndex =
    prepared.ledgerInstructions.length > 0 ? transactions.length : -1;
  transactions.push(packedSolo.swapTx);
  await pushDeferredWsolUnwrapTx(
    connection,
    params.user,
    transactions,
    prepared.swapTailInstructions,
    packedSolo.deferredUnwrap
  );

  if (prepared.taxInstructions.length > 0 && prepared.taxAfterSwap) {
    const buyTax = await assembleFittingLegacyTransaction(
      connection,
      params.user,
      prepared.taxInstructions,
      600_000
    );
    if (!buyTax) {
      throw new Error(
        `Transaction too large: buy-tax > ${LEGACY_TX_PACKET_DATA_SIZE}`
      );
    }
    transactions.push(buyTax);
  }

  return { transactions, swapTxIndex, ledgerTxIndex };
}

/** Buduje tx swap2 bez symulacji CU (Meteora SDK pada na hooku przy estimate). */
export async function buildPierronDlmmSwapTx(
  dlmmPool: InstanceType<typeof DLMM>,
  params: PierronDlmmSwapBuildParams
): Promise<Transaction> {
  const plan = await buildPierronDlmmSwapPlan(dlmmPool, params);
  if (plan.transactions.length !== 1) {
    throw new Error(`PIERRON_DLMM_SWAP_SPLIT:${plan.transactions.length}`);
  }
  return plan.transactions[0];
}
