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
import type { PartialLightLocalRuntimeConfig } from "../light/lightLocalRuntime.ts";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronTransferHookProgramId } from "../core/programIds.ts";
import {
  getConfiguredLotteryVault,
  getConfiguredRedistributionVault,
} from "../core/programIds.ts";
import { getPierronTokenAtaForOwner } from "./pierronTokenAta.ts";
import {
  buildPierronUserLightClaimBundle,
} from "./pierronUserLightBundle.ts";
import {
  buildPayoutLotteryInstruction,
  buildSettleLotteryPayoutInstruction,
} from "./pierronManualLightInstructions.ts";
import {
  derivePendingLotteryPayoutPda,
  resolveLotteryClaimAccounts,
  resolveLotterySettlementTransferHookRemaining,
} from "./lotteryPdas.ts";
import type { TradeBookParticipantSnapshot } from "./tradeBookParticipant.ts";
import type { PendingLotteryPayoutSnapshot } from "./lotteryClaimEligibility.ts";

export type LotteryWalletSigner = {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

export type PreparedLotteryClaim = {
  transactions: Transaction[];
  needsPrepare: boolean;
  payoutHint: bigint;
};

type TradeConfigLike = {
  lotteryVault: PublicKey;
};

const LEGACY_TX_SIZE_LIMIT = 1232;

function normalizeTxInstructionsForSerialize(tx: Transaction): void {
  for (const ix of tx.instructions) {
    if (!Buffer.isBuffer(ix.data)) {
      ix.data = Buffer.from(ix.data);
    }
  }
}

function legacyTxSerializedSize(tx: Transaction): number {
  if (!tx.recentBlockhash) return Number.POSITIVE_INFINITY;
  normalizeTxInstructionsForSerialize(tx);
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
}

/** TradeConfig.lottery_vault at byte offset 264 (8 disc + 8×32 pubkey fields). */
const TRADE_CONFIG_LOTTERY_VAULT_OFFSET = 264;
/** `TradeConfig.redistribution_vault` field offset (after 8-byte disc). */
const TRADE_CONFIG_REDISTRIBUTION_VAULT_OFFSET = 328;

function isTransientRpcError(error: unknown): boolean {
  const msg = String((error as Error)?.message ?? error);
  return /network request failed|failed to fetch|fetch failed|429|too many requests|timeout|econnreset/i.test(
    msg
  );
}

async function fetchTradeConfigVaults(params: {
  connection: Connection;
  tradeConfig: PublicKey;
  cluster: SupportedCluster;
}): Promise<TradeConfigLike & { redistributionVault: PublicKey }> {
  const configuredLottery = getConfiguredLotteryVault(params.cluster);
  const configuredRedistribution = getConfiguredRedistributionVault(params.cluster);
  if (configuredLottery && configuredRedistribution) {
    return {
      lotteryVault: configuredLottery,
      redistributionVault: configuredRedistribution,
    };
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
    try {
      const info = await params.connection.getAccountInfo(params.tradeConfig);
      if (!info?.data || info.data.length < TRADE_CONFIG_REDISTRIBUTION_VAULT_OFFSET + 32) {
        throw new Error("Nie można odczytać vaultów z trade_config.");
      }
      return {
        lotteryVault: new PublicKey(
          info.data.subarray(
            TRADE_CONFIG_LOTTERY_VAULT_OFFSET,
            TRADE_CONFIG_LOTTERY_VAULT_OFFSET + 32
          )
        ),
        redistributionVault: new PublicKey(
          info.data.subarray(
            TRADE_CONFIG_REDISTRIBUTION_VAULT_OFFSET,
            TRADE_CONFIG_REDISTRIBUTION_VAULT_OFFSET + 32
          )
        ),
      };
    } catch (error) {
      lastError = error;
      if (!isTransientRpcError(error) || attempt >= 3) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function wrapLotteryClaimStep(step: string, error: unknown): Error {
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

/** Prepare + settle are separate legacy txs (ZK proof exceeds 1232 B combined). */
export async function buildLotteryClaimTransactions(params: {
  connection: Connection;
  cluster: SupportedCluster;
  pierronProgramId: PublicKey;
  settlementProgramId: PublicKey;
  mint: PublicKey;
  user: PublicKey;
  lotteryDrawEpoch: number;
  participant?: TradeBookParticipantSnapshot | null;
  lightRuntime: PartialLightLocalRuntimeConfig;
  pendingVoucher?: PendingLotteryPayoutSnapshot | null;
  skipPrepare?: boolean;
}): Promise<PreparedLotteryClaim> {
  const accounts = resolveLotteryClaimAccounts({
    mint: params.mint,
    programId: params.pierronProgramId,
    settlementProgramId: params.settlementProgramId,
    cluster: params.cluster,
  });

  let vaults: TradeConfigLike & { redistributionVault: PublicKey };
  try {
    vaults = await fetchTradeConfigVaults({
      connection: params.connection,
      tradeConfig: accounts.tradeConfig,
      cluster: params.cluster,
    });
  } catch (error) {
    throw wrapLotteryClaimStep("vault", error);
  }

  const winnerToken = getPierronTokenAtaForOwner(params.mint, params.user);

  // Prepare `init` seeds use `accounting.lottery_draw_epoch` — never reuse a consumed
  // voucher PDA from a previous draw (that yields Anchor ConstraintSeeds / Custom:2006).
  const liveVoucher =
    params.pendingVoucher &&
    !params.pendingVoucher.consumed &&
    (params.pendingVoucher.drawEpoch < 0 ||
      params.pendingVoucher.drawEpoch === params.lotteryDrawEpoch)
      ? params.pendingVoucher
      : null;

  const pendingPda =
    liveVoucher?.address ??
    derivePendingLotteryPayoutPda({
      programId: params.pierronProgramId,
      lotteryDrawEpoch: params.lotteryDrawEpoch,
    });

  if (!pendingPda) {
    throw new Error("Brak PDA vouchera loterii.");
  }

  const skipPrepare = params.skipPrepare || Boolean(liveVoucher);

  const transactions: Transaction[] = [];

  if (!skipPrepare) {
    let light;
    try {
      light = await buildPierronUserLightClaimBundle({
        owner: params.user,
        pierronProgramId: params.pierronProgramId,
        participant: params.participant,
        runtime: params.lightRuntime,
      });
    } catch (error) {
      throw wrapLotteryClaimStep("bundle", error);
    }

    const prepareRemaining = [
      { pubkey: accounts.tradeBook, isSigner: false, isWritable: false },
      ...light.lightRemainingAccounts,
    ];

    let prepareIx;
    try {
      prepareIx = buildPayoutLotteryInstruction({
        programId: params.pierronProgramId,
        payer: params.user,
        accountingState: accounts.accountingState,
        lotteryVault: vaults.lotteryVault,
        lotteryAuthority: accounts.lotteryAuthority,
        pendingLotteryPayout: pendingPda,
        proof: light.proofBytes,
        userAccount: light.userAccount,
        userCoreMeta: light.userCoreMeta as Record<string, unknown>,
        userEpochMeta: light.userEpochMeta as Record<string, unknown>,
        remainingAccounts: prepareRemaining,
      });
    } catch (error) {
      throw wrapLotteryClaimStep("prepare-ix", error);
    }

    const prepareTx = new Transaction();
    prepareTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    prepareTx.add(prepareIx);
    await stampBlockhash(params.connection, prepareTx, params.user);

    let prepareSize: number;
    try {
      prepareSize = legacyTxSerializedSize(prepareTx);
    } catch (error) {
      throw wrapLotteryClaimStep("prepare-serialize", error);
    }
    if (prepareSize > LEGACY_TX_SIZE_LIMIT) {
      throw new Error(
        `[prepare-size] Transakcja przygotowania vouchera loterii jest za duża (${prepareSize} B > ${LEGACY_TX_SIZE_LIMIT} B).`
      );
    }
    transactions.push(prepareTx);
  }

  let transferIx;
  try {
    transferIx = buildSettleLotteryPayoutInstruction({
      programId: params.settlementProgramId,
      payer: params.user,
      settlementAuthority: accounts.settlementAuthority,
      pierronProgram: params.pierronProgramId,
      tradeConfig: accounts.tradeConfig,
      accountingState: accounts.accountingState,
      pendingLotteryPayout: pendingPda,
      lotteryVault: vaults.lotteryVault,
      lotteryAuthority: accounts.lotteryAuthority,
      winnerToken,
      sourceMint: params.mint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      transferHookProgram: getPierronTransferHookProgramId(params.cluster),
      extraAccountMetaList: accounts.extraAccountMetaState,
      venueAllowlist: accounts.venueAllowlist,
      tradeBook: accounts.tradeBook,
      redistributionVault: vaults.redistributionVault,
      hookTaxDelegate: accounts.hookTaxDelegate,
    });
    const hookRemaining = await resolveLotterySettlementTransferHookRemaining({
      connection: params.connection,
      mint: params.mint,
      lotteryVault: vaults.lotteryVault,
      winnerToken,
      settlementAuthority: accounts.settlementAuthority,
      redistributionVault: vaults.redistributionVault,
      cluster: params.cluster,
      accounts,
    });
    transferIx.keys.push(...hookRemaining);
  } catch (error) {
    throw wrapLotteryClaimStep("transfer-ix", error);
  }

  const transferTx = new Transaction();
  transferTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
  transferTx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      params.user,
      winnerToken,
      params.user,
      params.mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  transferTx.add(transferIx);
  await stampBlockhash(params.connection, transferTx, params.user);

  let transferSize: number;
  try {
    transferSize = legacyTxSerializedSize(transferTx);
  } catch (error) {
    throw wrapLotteryClaimStep("transfer-serialize", error);
  }
  if (transferSize > LEGACY_TX_SIZE_LIMIT) {
    throw new Error(
      `[transfer-size] Transakcja transferu loterii jest za duża (${transferSize} B > ${LEGACY_TX_SIZE_LIMIT} B).`
    );
  }

  // pierron-settlement `settle_lottery_payout` already CPIs `consume_lottery_payout`
  // after Token-2022 transfer. A trailing `claim_lottery_payout` sees consumed=true
  // and fails LotteryAlreadyPaid (6019), reverting the whole tx.
  transactions.push(transferTx);

  return {
    transactions,
    needsPrepare: !skipPrepare,
    payoutHint: liveVoucher?.amount ?? 0n,
  };
}

/** @deprecated Prefer buildLotteryClaimTransactions — single tx exceeds legacy size limit. */
export async function buildLotteryClaimTransaction(params: {
  connection: Connection;
  cluster: SupportedCluster;
  pierronProgramId: PublicKey;
  settlementProgramId: PublicKey;
  mint: PublicKey;
  user: PublicKey;
  lotteryDrawEpoch: number;
  participant?: TradeBookParticipantSnapshot | null;
  lightRuntime: PartialLightLocalRuntimeConfig;
  pendingVoucher?: PendingLotteryPayoutSnapshot | null;
  skipPrepare?: boolean;
}): Promise<Transaction> {
  const prepared = await buildLotteryClaimTransactions(params);
  if (prepared.transactions.length !== 1) {
    throw new Error(
      "Odbiór loterii wymaga dwóch transakcji (prepare + settle). Użyj buildLotteryClaimTransactions."
    );
  }
  return prepared.transactions[0]!;
}

export async function executeLotteryClaim(params: {
  connection: Connection;
  cluster: SupportedCluster;
  pierronProgramId: PublicKey;
  settlementProgramId: PublicKey;
  mint: PublicKey;
  wallet: LotteryWalletSigner;
  lotteryDrawEpoch: number;
  participant?: TradeBookParticipantSnapshot | null;
  lightRuntime: PartialLightLocalRuntimeConfig;
  pendingVoucher?: PendingLotteryPayoutSnapshot | null;
  sendRawTransaction: (raw: Buffer) => Promise<TransactionSignature>;
  confirmSignature: (signature: TransactionSignature, tx: Transaction) => Promise<void>;
}): Promise<{ signature: TransactionSignature; payoutHint: bigint }> {
  const prepared = await buildLotteryClaimTransactions({
    connection: params.connection,
    cluster: params.cluster,
    pierronProgramId: params.pierronProgramId,
    settlementProgramId: params.settlementProgramId,
    mint: params.mint,
    user: params.wallet.publicKey,
    lotteryDrawEpoch: params.lotteryDrawEpoch,
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

  return { signature: lastSignature, payoutHint: prepared.payoutHint };
}
