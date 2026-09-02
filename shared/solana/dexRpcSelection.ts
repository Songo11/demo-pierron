import type { DevnetRpcSettings } from "./devnetRpcDefaults.ts";
import {
  isBlockedDevnetRpcUrl,
  resolvePierronDevnetRpcUrl,
} from "./devnetRpcDefaults.ts";
import { isPublicSolanaClusterRpc } from "./rpcEndpoint.ts";

type DexRpcCacheEntry = {
  url: string;
  expiresAt: number;
};

const DEX_RPC_CACHE_TTL_MS = 5 * 60_000;
let dexRpcCache: DexRpcCacheEntry | null = null;

export function invalidateDexRpcHealthCache(): void {
  dexRpcCache = null;
}

function readDexRpcCache(): string | null {
  if (!dexRpcCache) return null;
  if (Date.now() >= dexRpcCache.expiresAt) {
    dexRpcCache = null;
    return null;
  }
  return dexRpcCache.url;
}

function writeDexRpcCache(url: string): void {
  dexRpcCache = {
    url,
    expiresAt: Date.now() + DEX_RPC_CACHE_TTL_MS,
  };
}

/**
 * Devnet DEX RPC for mobile Meteora swap.
 * Sync pick only — health-probe (2× RPC per connect) saturated the Pierron Worker
 * when two phones share Wi-Fi. Real requests use createResilientConnection backoff.
 */
export async function resolveMobileDevnetDexRpcUrl(
  settings: DevnetRpcSettings,
  _probeAccount: string
): Promise<string> {
  const cached = readDexRpcCache();
  if (cached && !isBlockedDevnetRpcUrl(cached) && !isPublicSolanaClusterRpc(cached)) {
    return cached;
  }
  if (cached) {
    invalidateDexRpcHealthCache();
  }

  const url = resolvePierronDevnetRpcUrl(settings);
  writeDexRpcCache(url);
  return url;
}

/** Synchronous pick when probe is unnecessary (settings screen hints). */
export function resolveMobileDevnetDexRpcUrlSync(
  settings: DevnetRpcSettings
): string {
  return resolvePierronDevnetRpcUrl(settings);
}
