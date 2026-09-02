import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';

import {
  baseUnitsToUi,
  BURN_ALLOCATION,
} from '../../../shared/pierron/tokenomicsConstants.ts';
import { pierronDevnet, TOKEN_2022_PROGRAM_ID } from '../pierronDevnet';
import {
  EMPTY_DEFLATION_SNAPSHOT,
  type DeflationSnapshot,
} from './types';

export { EMPTY_DEFLATION_SNAPSHOT, type DeflationSnapshot };

const DEFLATION_RPC_TIMEOUT_MS = 12_000;

/** Human-readable PIERRON amount from `baseUnitsToUi` string (no thousands separators in input). */
export function formatTokenomicsUiLabel(uiAmount: string): string {
  const n = Number(uiAmount);
  if (!Number.isFinite(n) || uiAmount === '—') return uiAmount;
  if (n >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })} mld PIERRON`;
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })} mln PIERRON`;
  }
  if (n >= 1_000) {
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} PIERRON`;
  }
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })} PIERRON`;
}

function rpcWithTimeout<T>(promise: Promise<T>, ms = DEFLATION_RPC_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('rpc_timeout')), ms);
    }),
  ]);
}

function readField(obj: Record<string, unknown> | null, ...keys: string[]): unknown {
  if (!obj) return undefined;
  for (const key of keys) {
    if (key in obj) return obj[key];
  }
  return undefined;
}

function toNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object' && value && 'toString' in value) {
    const parsed = Number((value as { toString(): string }).toString());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** On-chain burn pool metrics; safe to call in background (timeouts, no throw). */
export async function fetchDeflationSnapshot(params: {
  connection: Connection;
  program: { programId: PublicKey; account: { burnState: { fetch: (pda: PublicKey) => Promise<unknown> } } };
  accounting: Record<string, unknown>;
}): Promise<DeflationSnapshot> {
  try {
    const { connection, program, accounting } = params;
    const burnPending = Boolean(readField(accounting, 'burnPending', 'burn_pending'));
    const burnAllocRaw = BigInt(
      toNumber(readField(accounting, 'burnAllocation', 'burn_allocation'), Number(BURN_ALLOCATION))
    );

    const [burnStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('burn-state')],
      program.programId
    );

    let burnStateAcc: Record<string, unknown> | null = null;
    try {
      burnStateAcc = (await rpcWithTimeout(
        program.account.burnState.fetch(burnStatePda)
      )) as Record<string, unknown>;
    } catch {
      burnStateAcc = null;
    }

    const totalBurnedRaw = BigInt(
      burnStateAcc ? toNumber(readField(burnStateAcc, 'totalBurned', 'total_burned')) : 0
    );
    const lastBurnEpoch = burnStateAcc
      ? toNumber(readField(burnStateAcc, 'lastBurnEpoch', 'last_burn_epoch'), -1)
      : -1;

    let burnVaultBalanceRaw = 0n;
    try {
      const vaultAcc = await rpcWithTimeout(
        getAccount(connection, pierronDevnet.burnVault, undefined, TOKEN_2022_PROGRAM_ID)
      );
      burnVaultBalanceRaw = vaultAcc.amount;
    } catch {
      burnVaultBalanceRaw = 0n;
    }

    const remainingCapRaw =
      burnAllocRaw > totalBurnedRaw ? burnAllocRaw - totalBurnedRaw : 0n;
    const progressPercent =
      burnAllocRaw > 0n ? Number((totalBurnedRaw * 10000n) / burnAllocRaw) / 100 : 0;

    return {
      loaded: true,
      burnAllocationUi: baseUnitsToUi(burnAllocRaw),
      burnVaultBalanceUi: baseUnitsToUi(burnVaultBalanceRaw),
      totalBurnedUi: baseUnitsToUi(totalBurnedRaw),
      remainingCapUi: baseUnitsToUi(remainingCapRaw),
      burnPending,
      lastBurnEpoch,
      progressPercent,
    };
  } catch {
    return EMPTY_DEFLATION_SNAPSHOT;
  }
}
