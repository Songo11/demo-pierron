import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  type AccountMeta,
  type TransactionSignature,
} from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import type { PartialLightLocalRuntimeConfig } from "../light/lightLocalRuntime.ts";
import type { SupportedCluster } from "../core/programIds.ts";
import {
  getConfiguredLotteryVault,
  getConfiguredRedistributionVault,
  getPierronTransferHookProgramId,
} from "../core/programIds.ts";
import {
  LEGACY_TX_PACKET_DATA_SIZE,
  safeLegacyTxByteLength,
} from "../solana/legacyTxSize.ts";
import { getPierronTokenAtaForOwner } from "./pierronTokenAta.ts";
import { buildPierronUserLightClaimBundle } from "./pierronUserLightBundle.ts";
import {
  buildClaimRedistributionInstruction,
  buildSettleRedistributionClaimInstruction,
} from "./pierronManualLightInstructions.ts";
import {
  derivePendingRedistributionClaimPda,
  resolveRedistributionClaimAccounts,
  resolveRedistributionSettlementTransferHookRemaining,
} from "./redistributionPdas.ts";
import type { TradeBookParticipantSnapshot } from "./tradeBookParticipant.ts";
import {
  decodePendingRedistributionClaimRaw,
  readAccountingFields,
  secondsUntilRedistributionClaimOpens,
  type PendingRedistributionClaimSnapshot,
} from "./redistributionClaimEligibility.ts";
import { REDISTRIBUTION_CYCLE_EPOCHS } from "./tokenomicsConstants.ts";

export type RedistributionWalletSigner = {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

export type PreparedRedistributionClaim = {
  transactions: Transaction[];
  needsPrepare: boolean;
  netAmountHint: bigint;
  /** Settled / prepared voucher PDA — prime consumed-voucher cache after success. */
  pendingRedistributionClaim: PublicKey;
};

type TradeConfigLike = {
  redistributionVault: PublicKey;
  lotteryVault: PublicKey;
};

type RedistributionClaimBuildParams = {
  connection: Connection;
  cluster: SupportedCluster;
  pierronProgram: Program;
  settlementProgram: Program;
  mint: PublicKey;
  user: PublicKey;
  participant?: TradeBookParticipantSnapshot | null;
  lightRuntime: PartialLightLocalRuntimeConfig;
  pendingVoucher?: PendingRedistributionClaimSnapshot | null;
  skipPrepare?: boolean;
};

function toPublicKey(value: unknown): PublicKey {
  if (value instanceof PublicKey) return value;
  return new PublicKey(String(value));
}

async function fetchTradeConfigVaults(params: {
  connection: Connection;
  tradeConfig: PublicKey;
  program: Program;
  cluster: SupportedCluster;
}): Promise<TradeConfigLike> {
  const configuredLottery = getConfiguredLotteryVault(params.cluster);
  const configuredRedistribution = getConfiguredRedistributionVault(params.cluster);
  if (configuredLottery && configuredRedistribution) {
    return {
      lotteryVault: configuredLottery,
      redistributionVault: configuredRedistribution,
    };
  }

  const raw = await (params.program.account as any).tradeConfig.fetch(params.tradeConfig);
  return {
    redistributionVault: toPublicKey(raw.redistributionVault ?? raw.redistribution_vault),
    lotteryVault: toPublicKey(raw.lotteryVault ?? raw.lottery_vault),
  };
}

function wrapRedistributionClaimStep(step: string, error: unknown): Error {
  const msg = String((error as Error)?.message ?? error);
  if (msg.startsWith(`[${step}]`)) return error instanceof Error ? error : new Error(msg);
  return new Error(`[${step}] ${msg}`);
}

async function stampBlockhash(connection: Connection, tx: Transaction, user: PublicKey) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = user;
}

function assertLegacyTxFits(step: string, tx: Transaction): void {
  const size = safeLegacyTxByteLength(tx);
  if (size > LEGACY_TX_PACKET_DATA_SIZE) {
    throw new Error(
      `[${step}-size] Transakcja odbioru redystrybucji jest za duża (${size} B > ${LEGACY_TX_PACKET_DATA_SIZE} B).`
    );
  }
}

/** Split prepare (Light ZK) and settle — combined tx exceeds 1232 B packet limit. */
export async function buildRedistributionClaimTransactions(
  params: RedistributionClaimBuildParams
): Promise<PreparedRedistributionClaim> {
  const accounts = resolveRedistributionClaimAccounts({
    mint: params.mint,
    user: params.user,
    programId: params.pierronProgram.programId,
    settlementProgramId: params.settlementProgram.programId,
    cluster: params.cluster,
  });

  const accounting = await (params.pierronProgram.account as any).accountingState.fetch(
    accounts.accountingState
  );
  const cycleStartEpoch = Number(
    accounting.redistributionCycleStartEpoch ?? accounting.redistribution_cycle_start_epoch ?? 0
  );
  const vaults = await fetchTradeConfigVaults({
    connection: params.connection,
    tradeConfig: accounts.tradeConfig,
    program: params.pierronProgram,
    cluster: params.cluster,
  });

  const userToken = getPierronTokenAtaForOwner(params.mint, params.user);
  const derivedPendingPda = derivePendingRedistributionClaimPda({
    programId: params.pierronProgram.programId,
    user: params.user,
    redistributionCycleStartEpoch: cycleStartEpoch,
  });

  // Nigdy nie ufaj samemu snapshotowi UI — settle wymaga konta on-chain.
  async function readLiveVoucher(
    address: PublicKey,
    fallbackCycle: number
  ): Promise<PendingRedistributionClaimSnapshot | null> {
    try {
      const info = await params.connection.getAccountInfo(address, "confirmed");
      if (!info?.data?.length) return null;
      const decoded = decodePendingRedistributionClaimRaw(address, Buffer.from(info.data), fallbackCycle);
      if (!decoded || decoded.consumed || decoded.amount <= 0n) return null;
      return {
        address,
        amount: decoded.amount,
        consumed: decoded.consumed,
        cycleStartEpoch: decoded.cycleStartEpoch,
        preparedAt: Number(decoded.preparedAt),
      };
    } catch {
      return null;
    }
  }

  function voucherProbeCycleStarts(): number[] {
    const starts = new Set<number>();
    starts.add(cycleStartEpoch);
    if (params.pendingVoucher?.cycleStartEpoch != null && params.pendingVoucher.cycleStartEpoch >= 0) {
      starts.add(params.pendingVoucher.cycleStartEpoch);
    }
    for (let i = 1; i <= 8; i++) {
      const prev = cycleStartEpoch - i * REDISTRIBUTION_CYCLE_EPOCHS;
      if (prev >= 0) starts.add(prev);
    }
    return [...starts].sort((a, b) => b - a);
  }

  let voucherOnChain: PendingRedistributionClaimSnapshot | null = null;
  if (params.pendingVoucher && !params.pendingVoucher.consumed) {
    voucherOnChain = await readLiveVoucher(
      params.pendingVoucher.address,
      params.pendingVoucher.cycleStartEpoch
    );
  }
  if (!voucherOnChain) {
    for (const start of voucherProbeCycleStarts()) {
      const pda = derivePendingRedistributionClaimPda({
        programId: params.pierronProgram.programId,
        user: params.user,
        redistributionCycleStartEpoch: start,
      });
      voucherOnChain = await readLiveVoucher(pda, start);
      if (voucherOnChain) break;
    }
  }

  // Prepare zawsze celuje PDA z bieżącego accounting (seeds Anchor).
  // Settle: żywy voucher (może być ze starszego cyklu) albo derived.
  const preparePda = derivedPendingPda;
  const settlePda = voucherOnChain?.address ?? derivedPendingPda;
  const skipPrepare =
    params.skipPrepare === true ||
    Boolean(voucherOnChain && !voucherOnChain.consumed);

  // Mirror on-chain TooEarly: claim may rollover epoch in-tx, then enforce 180s delay.
  if (!skipPrepare) {
    const now = Math.floor(Date.now() / 1000);
    const opensIn = secondsUntilRedistributionClaimOpens({
      now,
      accounting: readAccountingFields(accounting as Record<string, unknown>),
    });
    if (opensIn > 0) {
      throw new Error(
        `Error Code: TooEarly. Error Number: 6002. Too early. ` +
          `Odbiór za ~${opensIn}s po starcie epoki on-chain (w tym po lag/rollover).`
      );
    }
  }

  const transactions: Transaction[] = [];

  if (!skipPrepare) {
    let light;
    try {
      light = await buildPierronUserLightClaimBundle({
        owner: params.user,
        pierronProgramId: params.pierronProgram.programId,
        participant: params.participant,
        runtime: params.lightRuntime,
      });
    } catch (error) {
      throw wrapRedistributionClaimStep("light-bundle", error);
    }

    const prepareRemaining: AccountMeta[] = [
      // Writable: claim clears unclaimed_* snapshot via mutate_trade_book_entry.
      { pubkey: accounts.tradeBook, isSigner: false, isWritable: true },
      ...light.lightRemainingAccounts,
    ];

    let prepareIx;
    try {
      prepareIx = buildClaimRedistributionInstruction({
        programId: params.pierronProgram.programId,
        user: params.user,
        redistributionVault: vaults.redistributionVault,
        redistributionAuthority: accounts.redistributionAuthority,
        accountingState: accounts.accountingState,
        pendingRedistributionClaim: preparePda,
        userToken,
        proof: light.proofBytes,
        userAccount: light.userAccount,
        userCoreMeta: light.userCoreMeta as Record<string, unknown>,
        userEpochMeta: light.userEpochMeta as Record<string, unknown>,
        remainingAccounts: prepareRemaining,
      });
    } catch (error) {
      throw wrapRedistributionClaimStep("prepare-ix", error);
    }

    const prepareTx = new Transaction();
    prepareTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    prepareTx.add(prepareIx);
    await stampBlockhash(params.connection, prepareTx, params.user);
    assertLegacyTxFits("prepare", prepareTx);
    transactions.push(prepareTx);
  }

  let settleIx;
  try {
    const transferHookRemaining = await resolveRedistributionSettlementTransferHookRemaining({
      connection: params.connection,
      mint: params.mint,
      redistributionVault: vaults.redistributionVault,
      userToken,
      settlementAuthority: accounts.settlementAuthority,
      cluster: params.cluster,
      accounts,
    });
    settleIx = buildSettleRedistributionClaimInstruction({
      programId: params.settlementProgram.programId,
      settlementAuthority: accounts.settlementAuthority,
      pierronProgram: params.pierronProgram.programId,
      transferHookProgram: getPierronTransferHookProgramId(params.cluster),
      tradeConfig: accounts.tradeConfig,
      accountingState: accounts.accountingState,
      pendingRedistributionClaim: settlePda,
      claimant: params.user,
      redistributionVault: vaults.redistributionVault,
      redistributionAuthority: accounts.redistributionAuthority,
      lotteryVault: vaults.lotteryVault,
      lotteryAuthority: accounts.lotteryAuthority,
      userToken,
      sourceMint: params.mint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      extraAccountMetaList: accounts.extraAccountMetaState,
      venueAllowlist: accounts.venueAllowlist,
      tradeBook: accounts.tradeBook,
      hookTaxDelegate: accounts.hookTaxDelegate,
      remainingAccounts: transferHookRemaining.map((m) => ({
        pubkey: m.pubkey,
        isSigner: m.isSigner,
        isWritable: m.isWritable,
      })),
    });
  } catch (error) {
    throw wrapRedistributionClaimStep("settle-ix", error);
  }

  const settleTx = new Transaction();
  settleTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
  settleTx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      params.user,
      userToken,
      params.user,
      params.mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  settleTx.add(settleIx);
  await stampBlockhash(params.connection, settleTx, params.user);
  assertLegacyTxFits("settle", settleTx);
  transactions.push(settleTx);

  return {
    transactions,
    needsPrepare: !skipPrepare,
    netAmountHint:
      (voucherOnChain?.amount && voucherOnChain.amount > 0n
        ? voucherOnChain.amount
        : params.pendingVoucher?.amount) ?? 0n,
    pendingRedistributionClaim: settlePda,
  };
}

/** @deprecated Use buildRedistributionClaimTransactions — single tx exceeds 1232 B when prepare is needed. */
export async function buildRedistributionClaimTransaction(
  params: RedistributionClaimBuildParams
): Promise<Transaction> {
  const prepared = await buildRedistributionClaimTransactions(params);
  if (prepared.transactions.length === 1) {
    return prepared.transactions[0]!;
  }
  throw new Error(
    "Redistribution claim requires multiple transactions — use buildRedistributionClaimTransactions."
  );
}

export async function executeRedistributionClaim(params: {
  connection: Connection;
  cluster: SupportedCluster;
  pierronProgram: Program;
  settlementProgram: Program;
  mint: PublicKey;
  wallet: RedistributionWalletSigner;
  participant?: TradeBookParticipantSnapshot | null;
  lightRuntime: PartialLightLocalRuntimeConfig;
  pendingVoucher?: PendingRedistributionClaimSnapshot | null;
  sendRawTransaction: (raw: Buffer) => Promise<TransactionSignature>;
  confirmSignature: (signature: TransactionSignature, tx: Transaction) => Promise<void>;
}): Promise<{ signature: TransactionSignature; netAmountHint: bigint }> {
  const prepared = await buildRedistributionClaimTransactions({
    connection: params.connection,
    cluster: params.cluster,
    pierronProgram: params.pierronProgram,
    settlementProgram: params.settlementProgram,
    mint: params.mint,
    user: params.wallet.publicKey,
    participant: params.participant,
    lightRuntime: params.lightRuntime,
    pendingVoucher: params.pendingVoucher,
  });

  let lastSignature: TransactionSignature = "";
  for (const tx of prepared.transactions) {
    const signed = await params.wallet.signTransaction(tx);
    lastSignature = await params.sendRawTransaction(
      signed.serialize({ requireAllSignatures: true, verifySignatures: false })
    );
    await params.confirmSignature(lastSignature, signed);
  }

  return { signature: lastSignature, netAmountHint: prepared.netAmountHint };
}
