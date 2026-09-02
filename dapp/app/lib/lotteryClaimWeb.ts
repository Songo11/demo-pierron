import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionSignature,
} from '@solana/web3.js';

import type { AppSettings } from '../../../shared/core/config';
import { getProgramIds, setCurrentCluster } from '../../../shared/core/programIds';
import { sanitizeRpcUrlForDisplay } from '../../../shared/light/compressionRpcTransport.ts';
import {
  fetchPendingLotteryPayout,
  type PendingLotteryPayoutSnapshot,
} from '../../../shared/pierron/lotteryClaimEligibility.ts';
import {
  buildLotteryClaimTransactions,
  type PreparedLotteryClaim,
} from '../../../shared/pierron/lotteryClaimFlow.ts';
import {
  buildSyncUserFromTradeBookTransaction,
  waitForPierronLightAccountsIndexed,
} from '../../../shared/pierron/syncUserFromTradeBookFlow.ts';
import type { TradeBookParticipantSnapshot } from '../../../shared/pierron/tradeBookParticipant.ts';
import { assertDevnetRpcConnection } from '../../../shared/solana/devnetClusterAssert.ts';
import { resolvePierronDevnetCompressionEndpoint } from '../../../shared/solana/devnetRpcDefaults.ts';

import { loadAppSettings } from './appSettings';
import { pierronDevnet } from './pierronDevnet';

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

async function signAndSendTransactions(params: {
  connection: Connection;
  wallet: LotteryClaimWallet;
  transactions: Transaction[];
  onStage?: (message: string) => void;
}): Promise<TransactionSignature> {
  const { connection, wallet, transactions: txs } = params;
  const total = txs.length;
  const confirmContexts: { blockhash: string; lastValidBlockHeight: number }[] = [];

  for (const tx of txs) {
    tx.feePayer = wallet.publicKey;
    confirmContexts.push(await refreshTransactionBlockhash(connection, tx));
  }

  params.onStage?.(
    total > 1
      ? `Zatwierdź odbiór w portfelu (${total} tx, jedno okno)…`
      : 'Zatwierdź odbiór w portfelu…'
  );

  let signedList: Transaction[];
  if (total === 1) {
    signedList = [await wallet.signTransaction(txs[0]!)];
  } else if (typeof wallet.signAllTransactions === 'function') {
    signedList = await wallet.signAllTransactions(txs);
  } else {
    signedList = [];
    for (const tx of txs) {
      signedList.push(await wallet.signTransaction(tx));
    }
  }

  if (!Array.isArray(signedList) || signedList.length !== total) {
    throw new Error(
      `Portfel zwrócił ${signedList?.length ?? 0} podpisów, oczekiwano ${total}.`
    );
  }

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

export async function runLotteryClaimWeb(params: {
  connection: Connection;
  wallet: LotteryClaimWallet;
  program: LotteryClaimProgram;
  participant: TradeBookParticipantSnapshot | null;
  lotteryDrawEpoch: number;
  pendingVoucher?: PendingLotteryPayoutSnapshot | null;
  onStage?: (message: string) => void;
}): Promise<{ signature: TransactionSignature; payoutHint: bigint }> {
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

  const signature = await signAndSendTransactions({
    connection: params.connection,
    wallet: params.wallet,
    transactions: prepared.transactions,
    onStage: params.onStage,
  });

  return { signature, payoutHint: prepared.payoutHint };
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
