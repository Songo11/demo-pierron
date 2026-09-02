/**
 * Tiny URL constants — keep free of @solana/web3.js so Next/Turbopack API routes
 * do not pull @noble/curves (Turbopack codegen bug: "got 8 segments, expected 4 or 5").
 */
export const PIERRON_DEVNET_RPC_PROXY_DEFAULT =
  "https://pierron-rpc-devnet.spierdalajcie111.workers.dev";

/** @deprecated Współdzielony / wyczerpany proxy — nie używać. */
export const PIERRON_DEVNET_HELIUS_PROXY_URL =
  "https://pierron-helius-devnet.spierdalajcie111.workers.dev";

/** Server-side failover when the Pierron Worker blips (no keys, safe in Next route). */
export const PIERRON_DEVNET_RPC_FAILOVER_DEFAULTS: readonly string[] = [
  "https://solana-devnet.api.onfinality.io/public",
];
