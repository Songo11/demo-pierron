import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionSignature,
} from '@solana/web3.js';

import type { AppSettings } from '../../shared/core/config';
import { getProgramIds, setCurrentCluster } from '../../shared/core/programIds';
import { sanitizeRpcUrlForDisplay } from '../../shared/light/compressionRpcTransport.ts';
import {
  fetchPendingLotteryPayout,
  type PendingLotteryPayoutSnapshot,
} from '../../shared/pierron/lotteryClaimEligibility.ts';
import {
  buildLotteryClaimTransactions,
  type PreparedLotteryClaim,
} from '../../shared/pierron/lotteryClaimFlow.ts';
import {
  buildSyncUserFromTradeBookTransaction,
  waitForPierronLightAccountsIndexed,
} from '../../shared/pierron/syncUserFromTradeBookFlow.ts';
import type { TradeBookParticipantSnapshot } from '../../shared/pierron/tradeBookParticipant.ts';
import { assertDevnetRpcConnection } from '../../shared/solana/devnetClusterAssert.ts';
import { resolvePierronDevnetCompressionEndpoint } from '../../shared/solana/devnetRpcDefaults.ts';

import { loadAppSettings } from './appSettings';
import { pierronDevnet } from './pierronDevnet';
import { signTransactionsForWallet } from './signTransactionsForWallet';

export type LotteryClaimWallet = {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>;
};

/** Anchor Program from IDL — account namespace is loosely typed at compile time. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LotteryClaimProgram = { account: any };

function isLightPrepareError(error: unknown): boolean {
  const msg = String((error as Error)?.message ?? error);
  return /\[bundle\]|Light|skompresowan|Photon|6061|6087|0x17ad|0x17bf|LIGHT NEW USER|sync_user|Brak skompresowanego|fetchCompressedAccountsByOwnerOverRpc failed/i.test(
    msg
  );
}

async function refreshTransactionBlockhash(
  connection: Connection,
  tx: Transaction
): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const latest = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = latest.blockhash;
  tx.lastValidBlockHeight = latest.lastValidBlockHeight;
  return latest;
}

/** Light/Photon URLs without importing stealthOnChainExecutor (default web3 import breaks Next/webpack). */
function resolveLightRuntime(settings: AppSettings) {
  const cluster = settings.cluster === 'localnet' ? 'localnet' : 'devnet';
  setCurrentCluster(cluster);

  if (cluster === 'localnet') {
    const rpcUrl = settings.solanaRpcUrl?.trim() || 'http://127.0.0.1:8899';
    const photonUrl = settings.lightPhotonUrl?.trim() || 'http://127.0.0.1:8784';
    const proverUrl = settings.lightProverUrl?.trim() || 'http://127.0.0.1:3001';
    return {
      cluster: cluster as 'localnet',
      lightRuntime: {
        rpcUrl,
        photonUrl,
        indexerUrl: photonUrl,
        proverUrl,
      },
    };
  }

  const compressionEndpoint = resolvePierronDevnetCompressionEndpoint({
    solanaRpcUrl: settings.solanaRpcUrl?.trim() || pierronDevnet.rpcUrl,
    lightPhotonUrl: settings.lightPhotonUrl,
  });
  // Browser: same-origin proxy — Worker CORS blocks web3.js `solana-client` header.
  const endpoint =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/solana-rpc`
      : compressionEndpoint;
  const customProver = settings.lightProverUrl?.trim();
  return {
    cluster: cluster as 'devnet',
    lightRuntime: {
      rpcUrl: endpoint,
      photonUrl: endpoint,
      indexerUrl: endpoint,
      proverUrl: typeof window !== 'undefined' ? endpoint : customProver || compressionEndpoint,
    },
  };
}

export type PreparedLotteryClaimWeb = {
  /** Legacy txs as base64 (unsigned) — do not keep live Transaction in React state. */
  wireTransactions: string[];
  payoutHint: bigint;
  lotteryDrawEpoch: number;
  blockhash: string;
  lastValidBlockHeight: number;
};

/** Android/iOS Chrome: MWA needs a fresh user gesture — prepare must finish before the tap that opens the wallet. */
export function isMobileWebClaimGestureRequired(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Thrown when background prepare needs a wallet signature (Light sync) — wait for a user tap. */
export const LIGHT_SYNC_REQUIRES_GESTURE = 'LIGHT_SYNC_REQUIRES_GESTURE';

function encodeWireTransactions(txs: Transaction[]): string[] {
  return txs.map((tx) =>
    Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false })
    ).toString('base64')
  );
}

export function decodeWireTransactions(wires: string[]): Transaction[] {
  return wires.map((wire) => Transaction.from(Buffer.from(wire, 'base64')));
}

async function signAndSendTransactions(params: {
  connection: Connection;
  wallet: LotteryClaimWallet;
  transactions: Transaction[];
  /** Skip RPC before wallet open — required on mobile Chrome (user gesture). */
  skipBlockhashRefresh?: boolean;
  confirmContexts?: { blockhash: string; lastValidBlockHeight: number }[];
  onStage?: (message: string) => void;
}): Promise<TransactionSignature> {
  const { connection, wallet, transactions: txs } = params;
  const total = txs.length;
  const confirmContexts: { blockhash: string; lastValidBlockHeight: number }[] =
    params.confirmContexts ? [...params.confirmContexts] : [];

  if (!params.skipBlockhashRefresh) {
    for (const tx of txs) {
      tx.feePayer = wallet.publicKey;
      confirmContexts.push(await refreshTransactionBlockhash(connection, tx));
    }
  } else if (confirmContexts.length !== total) {
    throw new Error('Brak świeżego blockhash przed podpisem — poczekaj chwilę i spróbuj ponownie.');
  } else {
    for (const tx of txs) {
      tx.feePayer = wallet.publicKey;
    }
  }

  params.onStage?.(
    total > 1
      ? `Zatwierdź odbiór w portfelu (${total} tx, jedno okno)…`
      : 'Zatwierdź odbiór w portfelu…'
  );

  // Batch required on mobile — sequential MWA sessions hang after the first hop.
  const signedList = await signTransactionsForWallet(wallet, txs, {
    requireBatchOnMobile: true,
  });

  let lastSig: TransactionSignature = '';
  for (let i = 0; i < total; i++) {
    const signed = signedList[i]!;
    const ctx = confirmContexts[i]!;
    params.onStage?.(
      total > 1 ? `Wysyłanie na devnet (${i + 1}/${total})…` : 'Wysyłanie na devnet…'
    );
    lastSig = await connection.sendRawTransaction(
      signed.serialize({ requireAllSignatures: true, verifySignatures: false }),
      { skipPreflight: true, maxRetries: 5 }
    );
    const conf = await connection.confirmTransaction(
      { signature: lastSig, ...ctx },
      'confirmed'
    );
    if (conf.value.err) {
      throw new Error(
        `Transakcja odbioru odrzucona on-chain (${i + 1}/${total}): ${JSON.stringify(conf.value.err)}`
      );
    }
  }

  return lastSig;
}

/** Re-stamp blockhash on prepared wire txs (safe to run in background while waiting for tap). */
export async function refreshPreparedLotteryClaimWeb(params: {
  connection: Connection;
  prepared: PreparedLotteryClaimWeb;
  feePayer: PublicKey;
}): Promise<PreparedLotteryClaimWeb> {
  const txs = decodeWireTransactions(params.prepared.wireTransactions);
  let blockhash = '';
  let lastValidBlockHeight = 0;
  for (const tx of txs) {
    tx.feePayer = params.feePayer;
    const latest = await refreshTransactionBlockhash(params.connection, tx);
    blockhash = latest.blockhash;
    lastValidBlockHeight = latest.lastValidBlockHeight;
  }
  return {
    ...params.prepared,
    wireTransactions: encodeWireTransactions(txs),
    blockhash,
    lastValidBlockHeight,
  };
}
export async function prepareLotteryClaimWeb(params: {
  connection: Connection;
  wallet: LotteryClaimWallet;
  program: LotteryClaimProgram;
  participant: TradeBookParticipantSnapshot | null;
  lotteryDrawEpoch: number;
  pendingVoucher?: PendingLotteryPayoutSnapshot | null;
  /** When false, skip Light sync signing (for silent background prepare on mobile). */
  allowWalletSigning?: boolean;
  onStage?: (message: string) => void;
}): Promise<PreparedLotteryClaimWeb> {
  await assertDevnetRpcConnection(params.connection);

  if (params.lotteryDrawEpoch < 0) {
    throw new Error('Brak epoki losowania do odbioru nagrody.');
  }

  const settings = await loadAppSettings();
  const { cluster, lightRuntime } = resolveLightRuntime(settings);
  const ids = getProgramIds(cluster);
  const pierronProgramId = ids.pierronProgramId ?? pierronDevnet.pierronProgramId;
  const settlementProgramId = ids.pierronSettlementProgramId;
  const mint = ids.tokenMint ?? pierronDevnet.tokenMint;

  if (!settlementProgramId) {
    throw new Error('Brak settlement program id dla klastra.');
  }

  let pendingVoucher = params.pendingVoucher ?? null;
  if (!pendingVoucher) {
    pendingVoucher = await fetchPendingLotteryPayout({
      connection: params.connection,
      program: params.program,
      programId: pierronProgramId,
      lotteryDrawEpoch: params.lotteryDrawEpoch,
    });
    if (pendingVoucher?.consumed) {
      pendingVoucher = null;
    }
  }

  params.onStage?.('Przygotowanie proof Light (Photon)…');

  let prepared: PreparedLotteryClaim;
  try {
    prepared = await prepareClaim({
      connection: params.connection,
      cluster,
      pierronProgramId,
      settlementProgramId,
      mint,
      user: params.wallet.publicKey,
      lotteryDrawEpoch: params.lotteryDrawEpoch,
      participant: params.participant,
      lightRuntime,
      pendingVoucher,
    });
  } catch (firstErr) {
    if (!isLightPrepareError(firstErr)) {
      throw firstErr;
    }
    if (params.allowWalletSigning === false) {
      throw new Error(LIGHT_SYNC_REQUIRES_GESTURE);
    }
    params.onStage?.('Aktualizacja konta Light przed odbiorem…');
    await syncLightThenWait({
      connection: params.connection,
      wallet: params.wallet,
      cluster,
      pierronProgramId,
      mint,
      participant: params.participant,
      lightRuntime,
      onStage: params.onStage,
    });
    prepared = await prepareClaim({
      connection: params.connection,
      cluster,
      pierronProgramId,
      settlementProgramId,
      mint,
      user: params.wallet.publicKey,
      lotteryDrawEpoch: params.lotteryDrawEpoch,
      participant: params.participant,
      lightRuntime,
      pendingVoucher,
    });
  }

  const blockhash = prepared.transactions[0]?.recentBlockhash ?? '';
  const lastValidBlockHeight = prepared.transactions[0]?.lastValidBlockHeight ?? 0;
  for (const tx of prepared.transactions) {
    tx.feePayer = params.wallet.publicKey;
  }

  return {
    wireTransactions: encodeWireTransactions(prepared.transactions),
    payoutHint: prepared.payoutHint,
    lotteryDrawEpoch: params.lotteryDrawEpoch,
    blockhash,
    lastValidBlockHeight,
  };
}

/**
 * Sign+send with zero RPC awaits before the wallet opens.
 * Call only with a freshly `refreshPreparedLotteryClaimWeb`'d payload (mobile Chrome).
 */
export async function signPreparedLotteryClaimWebNow(params: {
  connection: Connection;
  wallet: LotteryClaimWallet;
  prepared: PreparedLotteryClaimWeb;
  onStage?: (message: string) => void;
}): Promise<{ signature: TransactionSignature; payoutHint: bigint }> {
  const txs = decodeWireTransactions(params.prepared.wireTransactions);
  const confirmContexts = params.prepared.wireTransactions.map(() => ({
    blockhash: params.prepared.blockhash,
    lastValidBlockHeight: params.prepared.lastValidBlockHeight,
  }));
  const signature = await signAndSendTransactions({
    connection: params.connection,
    wallet: params.wallet,
    transactions: txs,
    skipBlockhashRefresh: true,
    confirmContexts,
    onStage: params.onStage,
  });
  return { signature, payoutHint: params.prepared.payoutHint };
}

/** Sign+send after prepare (desktop / non-gesture path — may refresh blockhash first). */
export async function submitPreparedLotteryClaimWeb(params: {
  connection: Connection;
  wallet: LotteryClaimWallet;
  prepared: PreparedLotteryClaimWeb;
  skipBlockhashRefresh?: boolean;
  onStage?: (message: string) => void;
}): Promise<{ signature: TransactionSignature; payoutHint: bigint }> {
  await assertDevnetRpcConnection(params.connection);
  if (params.skipBlockhashRefresh) {
    return signPreparedLotteryClaimWebNow(params);
  }
  const refreshed = await refreshPreparedLotteryClaimWeb({
    connection: params.connection,
    prepared: params.prepared,
    feePayer: params.wallet.publicKey,
  });
  return signPreparedLotteryClaimWebNow({
    ...params,
    prepared: refreshed,
  });
}

async function syncLightThenWait(params: {
  connection: Connection;
  wallet: LotteryClaimWallet;
  cluster: 'devnet' | 'localnet';
  pierronProgramId: PublicKey;
  mint: PublicKey;
  participant: TradeBookParticipantSnapshot | null;
  lightRuntime: ReturnType<typeof resolveLightRuntime>['lightRuntime'];
  onStage?: (message: string) => void;
}): Promise<void> {
  params.onStage?.('Przygotowanie sync Light…');
  const syncPrepared = await buildSyncUserFromTradeBookTransaction({
    connection: params.connection,
    cluster: params.cluster,
    pierronProgramId: params.pierronProgramId,
    mint: params.mint,
    user: params.wallet.publicKey,
    participant: params.participant,
    lightRuntime: params.lightRuntime,
  });

  params.onStage?.('Zatwierdź sync Light w portfelu…');
  await signAndSendTransactions({
    connection: params.connection,
    wallet: params.wallet,
    transactions: [syncPrepared.transaction],
    onStage: params.onStage,
  });

  params.onStage?.('Photon indeksuje konto Light…');
  await waitForPierronLightAccountsIndexed({
    owner: params.wallet.publicKey,
    pierronProgramId: params.pierronProgramId,
    runtime: params.lightRuntime,
    timeoutMs: 90_000,
    pollMs: 2_500,
    onProgress: (elapsedMs) => {
      const secs = Math.max(1, Math.round(elapsedMs / 1000));
      params.onStage?.(`Photon indeksuje konto Light… (${secs} s)`);
    },
  });
}

async function prepareClaim(params: {
  connection: Connection;
  cluster: 'devnet' | 'localnet';
  pierronProgramId: PublicKey;
  settlementProgramId: PublicKey;
  mint: PublicKey;
  user: PublicKey;
  lotteryDrawEpoch: number;
  participant: TradeBookParticipantSnapshot | null;
  lightRuntime: ReturnType<typeof resolveLightRuntime>['lightRuntime'];
  pendingVoucher?: PendingLotteryPayoutSnapshot | null;
}): Promise<PreparedLotteryClaim> {
  return buildLotteryClaimTransactions({
    connection: params.connection,
    cluster: params.cluster,
    pierronProgramId: params.pierronProgramId,
    settlementProgramId: params.settlementProgramId,
    mint: params.mint,
    user: params.user,
    lotteryDrawEpoch: params.lotteryDrawEpoch,
    participant: params.participant,
    lightRuntime: params.lightRuntime,
    pendingVoucher: params.pendingVoucher,
  });
}

/** One-shot claim (desktop / Light-sync path). Prefer background prepare + submit on mobile. */
export async function runLotteryClaimWeb(params: {
  connection: Connection;
  wallet: LotteryClaimWallet;
  program: LotteryClaimProgram;
  participant: TradeBookParticipantSnapshot | null;
  lotteryDrawEpoch: number;
  pendingVoucher?: PendingLotteryPayoutSnapshot | null;
  onStage?: (message: string) => void;
}): Promise<{ signature: TransactionSignature; payoutHint: bigint }> {
  const prepared = await prepareLotteryClaimWeb(params);
  return submitPreparedLotteryClaimWeb({
    connection: params.connection,
    wallet: params.wallet,
    prepared,
    onStage: params.onStage,
  });
}

export function mapLotteryClaimErrorMessage(
  error: unknown,
  t: {
    claimLotteryNoLightAccount: string;
    claimLotteryNotWinner: string;
    claimLotteryGenericError: string;
    claimLotteryNoHeliusKey?: string;
  }
): string {
  const msg = sanitizeRpcUrlForDisplay(String((error as Error)?.message ?? error));
  if (
    msg === 'DEVNET_RPC_REQUIRED' ||
    msg.includes('DEVNET_RPC_REQUIRED') ||
    msg === 'HELIUS_REQUIRED' ||
    msg.includes('HELIUS_REQUIRED')
  ) {
    return t.claimLotteryNoHeliusKey ?? t.claimLotteryNoLightAccount;
  }
  if (msg.includes(LIGHT_SYNC_REQUIRES_GESTURE)) {
    return t.claimLotteryNoLightAccount;
  }
  if (msg.includes('PHOTON_INDEXING_TIMEOUT')) {
    return (
      'Konto Light jest już na łańcuchu, ale Photon jeszcze go nie widzi. ' +
      'Poczekaj ok. 30 s i naciśnij „Odbierz nagrodę” ponownie.'
    );
  }
  if (msg.includes('Light') || msg.includes('skompresowanego konta') || msg.includes('Photon')) {
    return t.claimLotteryNoLightAccount;
  }
  if (msg.includes('User rejected') || /reject|denied|cancel/i.test(msg)) {
    return t.claimLotteryGenericError + ' (anulowano w portfelu)';
  }
  if (msg.includes('Network request failed') || msg.includes('fetch failed') || msg.includes('timeout')) {
    return t.claimLotteryGenericError + ' (Photon/RPC — sprawdź połączenie i spróbuj ponownie)';
  }
  const stepMatch = msg.match(
    /^\[(bundle|vault|hook-metas|prepare-ix|prepare-serialize|prepare-size|settle-ix|settle-serialize|settle-size|transfer-ix|transfer-serialize|transfer-size|consume-ix|claim-serialize)\]\s*/
  );
  if (stepMatch) {
    const detail = msg.slice(stepMatch[0].length).trim();
    return detail ? `${t.claimLotteryGenericError} (${stepMatch[1]}: ${detail})` : t.claimLotteryGenericError;
  }
  return msg.length > 0 && msg.length < 280 ? msg : t.claimLotteryGenericError;
}
