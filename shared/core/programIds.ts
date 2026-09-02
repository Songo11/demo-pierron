import { PublicKey } from '@solana/web3.js';

export type SupportedCluster = 'localnet' | 'devnet' | 'testnet' | 'mainnet-beta';

type PublicKeyString = string | null;

type ProgramIdsConfig = {
  pierronProgramId: PublicKeyString;
  pierronStealthProgramId: PublicKeyString;
  pierronSettlementProgramId: PublicKeyString;
  /** Token-2022 transfer hook executor (mint extension program id on devnet). */
  pierronTransferHookProgramId: PublicKeyString;
  tokenMint: PublicKeyString;
  /** Primary DEX venue pubkey in `trade_config.meteora_pool` (Meteora lb_pair). */
  meteoraPool: PublicKeyString;
  /** Pierron token vault in the primary pool — `trade_config.meteora_token_vault`. */
  meteoraPrimaryPoolVault: PublicKeyString;
  /** Protocol lottery vault — `trade_config.lottery_vault`. */
  lotteryVault: PublicKeyString;
  /** Protocol redistribution vault — `trade_config.redistribution_vault`. */
  redistributionVault: PublicKeyString;
  /** @deprecated Unused — Pierron apps use Meteora only. Kept for legacy artifact JSON. */
  orcaWhirlpool: PublicKeyString;
  stealthSendLookupTable: PublicKeyString;
};

export type ProgramIds = {
  pierronProgramId: PublicKey | null;
  pierronStealthProgramId: PublicKey | null;
  pierronSettlementProgramId: PublicKey | null;
  pierronTransferHookProgramId: PublicKey | null;
  tokenMint: PublicKey | null;
  meteoraPool: PublicKey | null;
  meteoraPrimaryPoolVault: PublicKey | null;
  lotteryVault: PublicKey | null;
  redistributionVault: PublicKey | null;
  orcaWhirlpool: PublicKey | null;
  stealthSendLookupTable: PublicKey | null;
};

const PROGRAM_IDS_RAW: Record<SupportedCluster, ProgramIdsConfig> = {
  localnet: {
    pierronProgramId: 'A9kNasYvn9ZqdEzHvRHqQFtouqdRzzE2udR8aUqbKb13',
    pierronStealthProgramId: '5hnbLpHpm2Pk9o9TSJyCPYqq11cMigUMrXN1NEfWGQXA',
    pierronSettlementProgramId: 'GGSQGnaDWM8fVp6hJPuC6xCQ7P8B8rm7ZUMZcUyf9of3',
    pierronTransferHookProgramId: '4rD1CuYVhrTrEbcpMSzNY4BmqTZEfEyU7LJRX9sS3kuC',
    tokenMint: 'BYcQtZN9RbgRDyiRbBSr1UxgcEyWkyqqfmrumdKwLMri',
    meteoraPool: '96RRWGfUZ1rpxnuF5xx5KXDBPhm9yej4RbJ6DVcYCg5W',
    meteoraPrimaryPoolVault: '95isMbTEeu2JHrYuDRiWdpFJWbS6W6fYr3p8M1F2fgqU',
    lotteryVault: '2ePM87z7fuY9hWMPyXgqPcDQ5hTeDQouAw3hnrLpyAkY',
    redistributionVault: 'D1ajrrwmWqtKA65aTkYcZicd6ncAhtPWQDWRTYfURzhx',
    orcaWhirlpool: '96RRWGfUZ1rpxnuF5xx5KXDBPhm9yej4RbJ6DVcYCg5W',
    stealthSendLookupTable: null,
  },
  devnet: {
    pierronProgramId: 'A9kNasYvn9ZqdEzHvRHqQFtouqdRzzE2udR8aUqbKb13',
    pierronStealthProgramId: '5hnbLpHpm2Pk9o9TSJyCPYqq11cMigUMrXN1NEfWGQXA',
    pierronSettlementProgramId: 'GGSQGnaDWM8fVp6hJPuC6xCQ7P8B8rm7ZUMZcUyf9of3',
    pierronTransferHookProgramId: '4rD1CuYVhrTrEbcpMSzNY4BmqTZEfEyU7LJRX9sS3kuC',
    tokenMint: 'BYcQtZN9RbgRDyiRbBSr1UxgcEyWkyqqfmrumdKwLMri',
    meteoraPool: '96RRWGfUZ1rpxnuF5xx5KXDBPhm9yej4RbJ6DVcYCg5W',
    meteoraPrimaryPoolVault: '95isMbTEeu2JHrYuDRiWdpFJWbS6W6fYr3p8M1F2fgqU',
    lotteryVault: '2ePM87z7fuY9hWMPyXgqPcDQ5hTeDQouAw3hnrLpyAkY',
    redistributionVault: 'D1ajrrwmWqtKA65aTkYcZicd6ncAhtPWQDWRTYfURzhx',
    orcaWhirlpool: '96RRWGfUZ1rpxnuF5xx5KXDBPhm9yej4RbJ6DVcYCg5W',
    stealthSendLookupTable: '9SYv1P4XydQyHXEFh76CbhCdaaFxQy5Kr6msRGa57Akk',
  },
  testnet: {
    pierronProgramId: null,
    pierronStealthProgramId: null,
    pierronSettlementProgramId: null,
    pierronTransferHookProgramId: null,
    tokenMint: null,
    meteoraPool: null,
    meteoraPrimaryPoolVault: null,
    lotteryVault: null,
    redistributionVault: null,
    orcaWhirlpool: null,
    stealthSendLookupTable: null,
  },
  'mainnet-beta': {
    pierronProgramId: null,
    pierronStealthProgramId: null,
    pierronSettlementProgramId: null,
    pierronTransferHookProgramId: null,
    tokenMint: null,
    meteoraPool: null,
    meteoraPrimaryPoolVault: null,
    lotteryVault: null,
    redistributionVault: null,
    orcaWhirlpool: null,
    stealthSendLookupTable: null,
  },
};

let currentCluster: SupportedCluster = 'localnet';

function toPublicKeyOrNull(value: PublicKeyString): PublicKey | null {
  return value ? new PublicKey(value) : null;
}

function getRawConfig(cluster: SupportedCluster): ProgramIdsConfig {
  return PROGRAM_IDS_RAW[cluster];
}

function requireProgramId(
  label: keyof ProgramIdsConfig,
  cluster: SupportedCluster
): PublicKey {
  const value = PROGRAM_IDS_RAW[cluster][label];
  if (!value) {
    throw new Error(
      `Brak konfiguracji ${label} dla klastra "${cluster}". Uzupełnij shared/core/programIds.ts.`
    );
  }
  return new PublicKey(value);
}

export function setCurrentCluster(cluster: SupportedCluster) {
  currentCluster = cluster;
}

export function getCurrentCluster(): SupportedCluster {
  return currentCluster;
}

export function inferClusterFromRpcUrl(rpcUrl: string): SupportedCluster {
  const normalized = rpcUrl.toLowerCase();

  if (normalized.includes('127.0.0.1') || normalized.includes('localhost')) {
    return 'localnet';
  }
  if (normalized.includes('devnet')) {
    return 'devnet';
  }
  if (normalized.includes('testnet')) {
    return 'testnet';
  }
  return 'mainnet-beta';
}

export function setCurrentClusterFromRpcUrl(rpcUrl: string): SupportedCluster {
  const inferred = inferClusterFromRpcUrl(rpcUrl);
  setCurrentCluster(inferred);
  return inferred;
}

export function getProgramIds(cluster: SupportedCluster = currentCluster): ProgramIds {
  const raw = getRawConfig(cluster);

  return {
    pierronProgramId: toPublicKeyOrNull(raw.pierronProgramId),
    pierronStealthProgramId: toPublicKeyOrNull(raw.pierronStealthProgramId),
    pierronSettlementProgramId: toPublicKeyOrNull(raw.pierronSettlementProgramId),
    pierronTransferHookProgramId: toPublicKeyOrNull(raw.pierronTransferHookProgramId),
    tokenMint: toPublicKeyOrNull(raw.tokenMint),
    meteoraPool: toPublicKeyOrNull(raw.meteoraPool),
    meteoraPrimaryPoolVault: toPublicKeyOrNull(raw.meteoraPrimaryPoolVault),
    lotteryVault: toPublicKeyOrNull(raw.lotteryVault),
    redistributionVault: toPublicKeyOrNull(raw.redistributionVault),
    orcaWhirlpool: toPublicKeyOrNull(raw.orcaWhirlpool),
    stealthSendLookupTable: toPublicKeyOrNull(raw.stealthSendLookupTable),
  };
}

export function isClusterConfigured(cluster: SupportedCluster = currentCluster): boolean {
  const ids = getProgramIds(cluster);
  return Boolean(
    ids.pierronProgramId &&
      ids.pierronStealthProgramId &&
      ids.pierronSettlementProgramId
  );
}

export function patchProgramIds(
  cluster: SupportedCluster,
  patch: Partial<Record<keyof ProgramIdsConfig, string | null>>
) {
  PROGRAM_IDS_RAW[cluster] = {
    ...PROGRAM_IDS_RAW[cluster],
    ...patch,
  };
}

export function getPierronProgramId(
  cluster: SupportedCluster = currentCluster
): PublicKey {
  return requireProgramId('pierronProgramId', cluster);
}

export function getPierronStealthProgramId(
  cluster: SupportedCluster = currentCluster
): PublicKey {
  return requireProgramId('pierronStealthProgramId', cluster);
}

export function getPierronSettlementProgramId(
  cluster: SupportedCluster = currentCluster
): PublicKey {
  return requireProgramId('pierronSettlementProgramId', cluster);
}

export function getPierronTransferHookProgramId(
  cluster: SupportedCluster = currentCluster
): PublicKey {
  return requireProgramId('pierronTransferHookProgramId', cluster);
}

export function getConfiguredTokenMint(
  cluster: SupportedCluster = currentCluster
): PublicKey | null {
  return toPublicKeyOrNull(PROGRAM_IDS_RAW[cluster].tokenMint);
}

export function getConfiguredMeteoraPool(
  cluster: SupportedCluster = currentCluster
): PublicKey | null {
  return toPublicKeyOrNull(PROGRAM_IDS_RAW[cluster].meteoraPool);
}

export function getConfiguredMeteoraPrimaryPoolVault(
  cluster: SupportedCluster = currentCluster
): PublicKey | null {
  return toPublicKeyOrNull(PROGRAM_IDS_RAW[cluster].meteoraPrimaryPoolVault);
}

export function getConfiguredLotteryVault(
  cluster: SupportedCluster = currentCluster
): PublicKey | null {
  return toPublicKeyOrNull(PROGRAM_IDS_RAW[cluster].lotteryVault);
}

export function getConfiguredRedistributionVault(
  cluster: SupportedCluster = currentCluster
): PublicKey | null {
  return toPublicKeyOrNull(PROGRAM_IDS_RAW[cluster].redistributionVault);
}

/** @deprecated Unused — Pierron uses Meteora only. */
export function getConfiguredOrcaWhirlpool(
  cluster: SupportedCluster = currentCluster
): PublicKey | null {
  return toPublicKeyOrNull(PROGRAM_IDS_RAW[cluster].orcaWhirlpool);
}

export function getConfiguredStealthSendLookupTable(
  cluster: SupportedCluster = currentCluster
): PublicKey | null {
  return toPublicKeyOrNull(PROGRAM_IDS_RAW[cluster].stealthSendLookupTable);
}

export const PIERRON_PROGRAM_ID = getPierronProgramId();
export const PIERRON_STEALTH_PROGRAM_ID = getPierronStealthProgramId();
export const PIERRON_SETTLEMENT_PROGRAM_ID = getPierronSettlementProgramId();
