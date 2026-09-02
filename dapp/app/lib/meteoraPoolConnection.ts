import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';

import { formatMeteoraCompactAmount } from '../../../shared/core/formatMeteoraAmount.ts';
import { pierronMeteoraAgUrl } from '../../../shared/meteora/pierronPoolExplorer.ts';
import { createPierronDlmmPool } from '../../../shared/meteora/createPierronDlmmPool.ts';
import {
  meteoraStylePoolTvlUi,
  sumPierronBinLiquidityUi,
} from '../../../shared/meteora/pierronDlmmPoolMetrics.ts';
import type DLMM from '@meteora-ag/dlmm';
import { NATIVE_MINT } from '@solana/spl-token';
import pierronIdl from '../../../shared/idl/pierron.json';
import { getPierronProgramId } from '../../../shared/core/programIds.ts';

import { pierronDevnet, TOKEN_2022_PROGRAM_ID } from './pierronDevnet';
import { assertDevnetRpcConnection } from '../../../shared/solana/devnetClusterAssert.ts';

const METEORA_DLMM_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';

export type MeteoraPoolConnection = {
  ready: boolean;
  poolAddress: string;
  poolVaultAddress: string;
  meteoraUiUrl: string;
  tokenMint: string;
  poolPierronTvlUi: number | null;
  poolPierronReserveUi: number | null;
  poolPierronBinLiquidityUi: number | null;
  activeId: number | null;
  binStep: number | null;
  error?: string;
};

export type MeteoraPoolSession = {
  connection: Connection;
  pool: PublicKey;
  mint: PublicKey;
  dlmm: InstanceType<typeof DLMM> | null;
  info: MeteoraPoolConnection;
};

let dlmmLoadPromise: Promise<InstanceType<typeof DLMM>> | null = null;

export function resetMeteoraDlmmLoadCache(): void {
  dlmmLoadPromise = null;
}

export function formatPoolAmountUi(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `${formatMeteoraCompactAmount(amount)} PIERRON`;
}

async function fetchVaultBalanceUi(connection: Connection, vault: PublicKey): Promise<number | null> {
  try {
    const acc = await getAccount(connection, vault, 'confirmed', TOKEN_2022_PROGRAM_ID);
    return Number(acc.amount) / 1_000_000;
  } catch {
    return null;
  }
}

/** Weryfikuje pulę on-chain (owner Meteora DLMM) i ładuje saldo vaultu. */
export async function connectMeteoraPool(
  connection: Connection
): Promise<MeteoraPoolSession> {
  await assertDevnetRpcConnection(connection);

  const pool = pierronDevnet.meteoraPool;
  const poolVault = pierronDevnet.poolAta;
  const mint = pierronDevnet.tokenMint;

  const poolAccount = await connection.getAccountInfo(pool, 'confirmed');
  if (!poolAccount?.data?.length) {
    throw new Error(
      `Konto puli Meteora nie istnieje na devnet: ${pool.toBase58()}`
    );
  }
  if (poolAccount.owner.toBase58() !== METEORA_DLMM_PROGRAM) {
    throw new Error(
      `Adres ${pool.toBase58()} nie jest pulą Meteora DLMM (owner: ${poolAccount.owner.toBase58().slice(0, 8)}…).`
    );
  }

  const poolPierronReserveUi = await fetchVaultBalanceUi(connection, poolVault);

  const info: MeteoraPoolConnection = {
    ready: poolPierronReserveUi != null,
    poolAddress: pool.toBase58(),
    poolVaultAddress: poolVault.toBase58(),
    meteoraUiUrl: pierronMeteoraAgUrl('devnet'),
    tokenMint: mint.toBase58(),
    poolPierronTvlUi: poolPierronReserveUi,
    poolPierronReserveUi,
    poolPierronBinLiquidityUi: null,
    activeId: null,
    binStep: null,
  };

  return { connection, pool, mint, dlmm: null, info };
}

/** Pełny klient DLMM — ładowany leniwie przy pierwszym swapie / wycenie. */
export async function getPoolDlmm(
  session: MeteoraPoolSession,
  wallet?: {
    publicKey: PublicKey;
    signTransaction: (
      tx: import('@solana/web3.js').Transaction
    ) => Promise<import('@solana/web3.js').Transaction>;
    signAllTransactions?: (
      txs: import('@solana/web3.js').Transaction[]
    ) => Promise<import('@solana/web3.js').Transaction[]>;
  }
): Promise<InstanceType<typeof DLMM>> {
  if (session.dlmm) {
    return session.dlmm;
  }

  if (!dlmmLoadPromise) {
    dlmmLoadPromise = (async () => {
      try {
        const dlmm = await createPierronDlmmPool(session.connection, session.pool, {
          cluster: 'devnet',
        });
        if (wallet) {
          (dlmm as { program: { provider: unknown } }).program.provider = {
            connection: session.connection,
            wallet,
          };
        }
        const pierronIsY = dlmm.tokenY.publicKey.equals(session.mint);
        if (!pierronIsY || !dlmm.tokenX.publicKey.equals(NATIVE_MINT)) {
          throw new Error('Pula nie jest parą WSOL / PIERRON.');
        }
        session.info.activeId = dlmm.lbPair.activeId;
        session.info.binStep = dlmm.lbPair.binStep;
        session.dlmm = dlmm;
        return dlmm;
      } catch (err) {
        dlmmLoadPromise = null;
        throw err;
      }
    })();
  }

  return dlmmLoadPromise;
}

/** TVL, płynność w binach, vault — jak w mobilce. */
export async function enrichMeteoraPoolDisplayMetrics(
  session: MeteoraPoolSession
): Promise<MeteoraPoolConnection> {
  const vaultUi =
    session.info.poolPierronReserveUi ??
    (await fetchVaultBalanceUi(session.connection, pierronDevnet.poolAta));

  let totalReleasedUi: number | null = null;
  try {
    const programId = getPierronProgramId('devnet');
    const readonlyProvider = new AnchorProvider(
      session.connection,
      {
        publicKey: PublicKey.default,
        signTransaction: async <T>(tx: T) => tx,
        signAllTransactions: async <T>(txs: T[]) => txs,
      } as never,
      { commitment: 'confirmed' }
    );
    const program = new Program(
      { ...pierronIdl, address: programId.toBase58() } as never,
      readonlyProvider
    );
    const [accountingPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('accounting')],
      programId
    );
    const accounting = await (program as { account: { accountingState: { fetch: (pda: PublicKey) => Promise<unknown> } } }).account.accountingState.fetch(
      accountingPda
    );
    const raw =
      (accounting as { totalReleased?: unknown; total_released?: unknown }).totalReleased ??
      (accounting as { total_released?: unknown }).total_released;
    totalReleasedUi = Number(raw) / 1_000_000;
  } catch {
    totalReleasedUi = null;
  }

  let binLiquidityUi: number | null = session.info.poolPierronBinLiquidityUi;
  try {
    const dlmm = await getPoolDlmm(session);
    binLiquidityUi = await sumPierronBinLiquidityUi(dlmm);
    session.info.activeId = dlmm.lbPair.activeId;
    session.info.binStep = dlmm.lbPair.binStep;
  } catch {
    binLiquidityUi = session.info.poolPierronBinLiquidityUi;
  }

  const tvlUi = meteoraStylePoolTvlUi({ vaultUi, totalReleasedUi });

  const next: MeteoraPoolConnection = {
    ...session.info,
    poolPierronTvlUi: tvlUi,
    poolPierronReserveUi: vaultUi,
    poolPierronBinLiquidityUi: binLiquidityUi,
    ready: tvlUi != null || vaultUi != null || binLiquidityUi != null,
  };
  session.info = next;
  return next;
}

/** Connect + pełne metryki puli (używaj na ekranie swap). */
export async function connectAndEnrichMeteoraPool(
  connection: Connection
): Promise<{ session: MeteoraPoolSession; info: MeteoraPoolConnection }> {
  const session = await connectMeteoraPool(connection);
  const info = await enrichMeteoraPoolDisplayMetrics(session);
  return { session, info };
}
