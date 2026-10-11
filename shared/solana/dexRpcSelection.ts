import type { DevnetRpcSettings } from "./devnetRpcDefaults.ts";
import {
  isBlockedDevnetRpcUrl,
  resolvePierronDevnetDexRpcCandidates,
  resolvePierronDevnetRpcUrl,
} from "./devnetRpcDefaults.ts";
import { raceFirstReachableDexRpc } from "./resilientConnection.ts";
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
 * Parallel race (1× getAccountInfo / URL, 5s) — picks the live Worker first.
 * Sync-only pick previously pinned a hung primary; UI withTimeout(18s) then aborted
 * before sequential failover could run.
 */
export async function resolveMobileDevnetDexRpcUrl(
  settings: DevnetRpcSettings,
  probeAccount: string
): Promise<string> {
  const cached = readDexRpcCache();
  if (cached && !isBlockedDevnetRpcUrl(cached) && !isPublicSolanaClusterRpc(cached)) {
    return cached;
  }
  if (cached) {
    invalidateDexRpcHealthCache();
  }

  const candidates = resolvePierronDevnetDexRpcCandidates(settings);
  if (candidates.length === 0) {
    throw new Error(
      "DEX_RPC_PUBLIC: Brak RPC na devnet. Cloudflare Worker Pierron (domyślny) lub własny URL w ustawieniach."
    );
  }

  try {
    const url = await raceFirstReachableDexRpc(candidates, probeAccount, 5_000);
    writeDexRpcCache(url);
    return url;
  } catch {
    // Probe miss — NIE cache'uj (może to wiszący URL z ustawień). Failover w Connection.
    return resolvePierronDevnetRpcUrl(settings);
  }
}

/** Synchronous pick when probe is unnecessary (settings screen hints). */
export function resolveMobileDevnetDexRpcUrlSync(
  settings: DevnetRpcSettings
): string {
  return resolvePierronDevnetRpcUrl(settings);
}
