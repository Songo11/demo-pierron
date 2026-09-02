import type { AppCluster, AppSettings } from "../core/config.ts";
import { DEFAULT_SETTINGS } from "../core/config.ts";
import { resolveDexRpcEndpointForSettings } from "../solana/devnetRpcDefaults.ts";

/**
 * RPC for Meteora swap / pool reads.
 * Prefers dedicated endpoints (Helius secure / worker) over public cluster URLs.
 */
export function resolveDexRpcEndpoint(settings: AppSettings): string {
  return resolveDexRpcEndpointForSettings(settings);
}

export function resolveDexRpcEndpointForCluster(
  cluster: AppCluster,
  solanaRpcUrl?: string
): string {
  return resolveDexRpcEndpoint({
    ...DEFAULT_SETTINGS,
    cluster,
    solanaRpcUrl,
  });
}
