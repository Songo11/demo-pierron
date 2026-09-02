import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  type AppSettings,
} from '../../shared/core/config';
import {
  isBlockedDevnetRpcUrl,
  PIERRON_DEVNET_HELIUS_PROXY_URL,
  readDevnetHeliusProxyUrlFromEnv,
} from '../../shared/solana/devnetRpcDefaults.ts';
import { PUBLIC_CLUSTER_RPC } from '../../shared/solana/rpcEndpoint.ts';
import { invalidateDexRpcHealthCache } from '../../shared/solana/dexRpcSelection.ts';
import { pierronDevnet } from './pierronDevnet';
import { loadJson, saveJson } from './webStorage';

const LEGACY_DEVNET_MINTS = new Set([
  '9JBzAStvTBqNVE2cxg9TPUXbT8tNMgRkptH5dcZofitT',
  'BcGrJZ2sfYYuHRAYsGqcB9nkbzp5XQjrtn1HcrXyoC6D',
]);

type StoredSettings = AppSettings & { heliusApiKey?: string };

function stripLegacyHeliusKey(settings: StoredSettings): AppSettings {
  const { heliusApiKey: _removed, ...rest } = settings;
  return rest;
}

function defaultMintForCluster(cluster: AppSettings['cluster']): string {
  if (cluster === 'devnet' || cluster === 'localnet') {
    return pierronDevnet.tokenMint.toBase58();
  }
  return '';
}

export async function loadAppSettings(): Promise<AppSettings> {
  const savedRaw = await loadJson<StoredSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  let next = stripLegacyHeliusKey(savedRaw);

  const savedMint = savedRaw.stealthMintAddress?.trim() ?? '';
  if (!savedMint || LEGACY_DEVNET_MINTS.has(savedMint)) {
    next = {
      ...next,
      stealthMintAddress: defaultMintForCluster(savedRaw.cluster),
    };
  }

  const legacyProxy = PIERRON_DEVNET_HELIUS_PROXY_URL;
  const savedRpc = savedRaw.solanaRpcUrl?.trim() ?? '';
  const savedPhoton = savedRaw.lightPhotonUrl?.trim() ?? '';
  if (savedPhoton === legacyProxy || isBlockedDevnetRpcUrl(savedPhoton)) {
    next = { ...next, lightPhotonUrl: '' };
  }
  if (savedRpc === legacyProxy || isBlockedDevnetRpcUrl(savedRpc)) {
    next = { ...next, solanaRpcUrl: '' };
  }

  const proxyConfigured = Boolean(readDevnetHeliusProxyUrlFromEnv());
  const onDevnet = savedRaw.cluster === 'devnet' || savedRaw.cluster === 'localnet';
  const rpcAfterMigration = next.solanaRpcUrl?.trim() ?? '';
  if (
    onDevnet &&
    (!rpcAfterMigration ||
      isBlockedDevnetRpcUrl(rpcAfterMigration) ||
      rpcAfterMigration === PUBLIC_CLUSTER_RPC.devnet)
  ) {
    next = { ...next, solanaRpcUrl: '' };
  } else if (onDevnet && !proxyConfigured && isBlockedDevnetRpcUrl(rpcAfterMigration)) {
    next = { ...next, solanaRpcUrl: '' };
  }

  const hadLegacyKey = Boolean(savedRaw.heliusApiKey?.trim());
  if (next !== savedRaw || hadLegacyKey) {
    invalidateDexRpcHealthCache();
    await saveJson(STORAGE_KEYS.settings, next);
  }
  return next;
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  invalidateDexRpcHealthCache();
  await saveJson(STORAGE_KEYS.settings, settings);
}
