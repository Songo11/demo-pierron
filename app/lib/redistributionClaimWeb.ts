import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
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
  fetchPendingRedistributionClaimAny,
  primeConsumedRedistributionVoucherCache,
  type PendingRedistributionClaimSnapshot,
} from '../../shared/pierron/redistributionClaimEligibility.ts';
import {
  buildRedistributionClaimTransactions,
  type PreparedRedistributionClaim,
} from '../../shared/pierron/redistributionClaimFlow.ts';
import {
  buildSyncUserFromTradeBookTransaction,
  waitForPierronLightAccountsIndexed,
} from '../../shared/pierron/syncUserFromTradeBookFlow.ts';
import type { TradeBookParticipantSnapshot } from '../../shared/pierron/tradeBookParticipant.ts';
import { assertDevnetRpcConnection } from '../../shared/solana/devnetClusterAssert.ts';
import { resolvePierronDevnetCompressionEndpoint } from '../../shared/solana/devnetRpcDefaults.ts';
import { REDISTRIBUTION_CYCLE_EPOCHS } from '../../shared/pierron/tokenomicsConstants.ts';

import { loadAppSettings } from './appSettings';
import { pierronDevnet } from './pierronDevnet';
import { signTransactionsForWallet } from './signTransactionsForWallet';

export type RedistributionClaimWallet = {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedistributionClaimProgram = { account: any; programId: PublicKey };

const SETTLEMENT_IDL_PATH =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PIERRON_SETTLEMENT_IDL_URL) ||
  '/idl/pierron_settlement.json';

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
  wallet: RedistributionClaimWallet;
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

  const signedList = await signTransactionsForWallet(wallet, txs, {
    requireBatchOnMobile: false,
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

async function syncLightThenWait(params: {
  connection: Connection;
  wallet: RedistributionClaimWallet;
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

async function loadSettlementProgram(params: {
  connection: Connection;
  settlementProgramId: PublicKey;
  wallet: RedistributionClaimWallet;
}): Promise<Program> {
  const res = await fetch(SETTLEMENT_IDL_PATH, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Settlement IDL HTTP ${res.status}`);
  const idl = (await res.json()) as Idl;
  const provider = new AnchorProvider(
    params.connection,
    {
      publicKey: params.wallet.publicKey,
      signTransaction: async (tx: Transaction) => {
        const [signed] = await signTransactionsForWallet(params.wallet, [tx], {
          requireBatchOnMobile: false,
        });
        return signed!;
      },
      signAllTransactions: async (txs: Transaction[]) =>
        signTransactionsForWallet(params.wallet, txs, {
          requireBatchOnMobile: false,
        }),
    } as never,
    { commitment: 'confirmed' }
  );
  return new Program(
    { ...idl, address: params.settlementProgramId.toBase58() } as Idl,
    provider
  );
}

async function prepareClaim(params: {
  connection: Connection;
  cluster: 'devnet' | 'localnet';
  pierronProgram: Program;
  settlementProgram: Program;
  mint: PublicKey;
  user: PublicKey;
  participant: TradeBookParticipantSnapshot | null;
  lightRuntime: ReturnType<typeof resolveLightRuntime>['lightRuntime'];
  pendingVoucher?: PendingRedistributionClaimSnapshot | null;
}): Promise<PreparedRedistributionClaim> {
  return buildRedistributionClaimTransactions({
    connection: params.connection,
    cluster: params.cluster,
    pierronProgram: params.pierronProgram,
    settlementProgram: params.settlementProgram,
    mint: params.mint,
    user: params.user,
    participant: params.participant,
    lightRuntime: params.lightRuntime,
    pendingVoucher: params.pendingVoucher,
  });
}

export async function runRedistributionClaimWeb(params: {
  connection: Connection;
  wallet: RedistributionClaimWallet;
  program: RedistributionClaimProgram;
  participant: TradeBookParticipantSnapshot | null;
  redistributionCycleStartEpoch: number;
  pendingVoucher?: PendingRedistributionClaimSnapshot | null;
  onStage?: (message: string) => void;
}): Promise<{ signature: TransactionSignature; netAmountHint: bigint }> {
  await assertDevnetRpcConnection(params.connection);

  const settings = await loadAppSettings();
  const { cluster, lightRuntime } = resolveLightRuntime(settings);
  const ids = getProgramIds(cluster);
  const pierronProgramId = ids.pierronProgramId ?? pierronDevnet.pierronProgramId;
  const settlementProgramId = ids.pierronSettlementProgramId;
  const mint = ids.tokenMint ?? pierronDevnet.tokenMint;

  if (!settlementProgramId) {
    throw new Error('Brak settlement program id dla klastra.');
  }

  const cycleStart = Math.max(0, params.redistributionCycleStartEpoch);
  let pendingVoucher = params.pendingVoucher ?? null;
  if (!pendingVoucher || pendingVoucher.consumed || pendingVoucher.amount <= 0n) {
    pendingVoucher = await fetchPendingRedistributionClaimAny({
      connection: params.connection,
      program: params.program,
      programId: pierronProgramId,
      user: params.wallet.publicKey,
      redistributionCycleStartEpoch: cycleStart,
      extraCycleStarts: [
        params.pendingVoucher?.cycleStartEpoch ?? -1,
        params.participant?.unclaimedRedistributionCycleStart ?? -1,
        params.participant?.activityCycleEpoch ?? -1,
        cycleStart - REDISTRIBUTION_CYCLE_EPOCHS,
      ],
      maxPreviousCyclesToProbe: 8,
    });
  }

  const settlementProgram = await loadSettlementProgram({
    connection: params.connection,
    settlementProgramId,
    wallet: params.wallet,
  });

  const pierronProgram = params.program as unknown as Program;
  const settleOnly = Boolean(
    pendingVoucher && !pendingVoucher.consumed && pendingVoucher.amount > 0n
  );

  params.onStage?.(
    settleOnly
      ? 'Dokańczanie odbioru (voucher on-chain)…'
      : 'Przygotowanie proof Light (Photon)…'
  );

  let prepared: PreparedRedistributionClaim;
  try {
    prepared = await prepareClaim({
      connection: params.connection,
      cluster,
      pierronProgram,
      settlementProgram,
      mint,
      user: params.wallet.publicKey,
      participant: params.participant,
      lightRuntime,
      pendingVoucher,
    });
  } catch (firstErr) {
    // Settle-only must never fall into Light sync — voucher already exists.
    if (settleOnly || !isLightPrepareError(firstErr)) {
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
      pierronProgram,
      settlementProgram,
      mint,
      user: params.wallet.publicKey,
      participant: params.participant,
      lightRuntime,
      pendingVoucher,
    });
  }

  if (settleOnly && prepared.needsPrepare) {
    throw new Error(
      'Wykryto voucher odbioru, ale klient próbował ścieżkę Light zamiast settle. Odśwież stronę i kliknij „Dokończ odbiór”.'
    );
  }

  const signature = await signAndSendTransactions({
    connection: params.connection,
    wallet: params.wallet,
    transactions: prepared.transactions,
    onStage: params.onStage,
  });

  // Immediately unlock swap tier / cooldown for subsequent buys (skip empty-[] path).
  primeConsumedRedistributionVoucherCache({
    programId: pierronProgramId,
    user: params.wallet.publicKey,
    pubkeys: [prepared.pendingRedistributionClaim],
  });

  return { signature, netAmountHint: prepared.netAmountHint };
}

export function mapRedistributionClaimErrorMessage(
  error: unknown,
  t: {
    claimRedistributionNoLightAccount: string;
    claimRedistributionGenericError: string;
    claimRedistributionTooEarly?: string;
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
    return t.claimLotteryNoHeliusKey ?? t.claimRedistributionNoLightAccount;
  }
  if (msg.includes('PHOTON_INDEXING_TIMEOUT')) {
    return (
      'Konto Light jest już na łańcuchu, ale Photon jeszcze go nie widzi. ' +
      'Poczekaj ok. 30 s i naciśnij „Odbierz redystrybucję” ponownie.'
    );
  }
  if (
    msg.includes('Error Code: TooEarly') ||
    msg.includes('Error Number: 6002') ||
    msg.includes('custom program error: 0x1772') ||
    /\bToo early\b/i.test(msg)
  ) {
    return (
      t.claimRedistributionTooEarly ??
      'Pula się domyka — odbiór kilka minut po starcie nowego cyklu on-chain.'
    );
  }
  if (msg.includes('Light') || msg.includes('skompresowanego konta') || msg.includes('Photon')) {
    return t.claimRedistributionNoLightAccount;
  }
  if (msg.includes('User rejected') || /reject|denied|cancel/i.test(msg)) {
    return t.claimRedistributionGenericError + ' (anulowano w portfelu)';
  }
  return msg || t.claimRedistributionGenericError;
}
