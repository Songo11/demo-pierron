/**
 * Tiny URL constants — keep free of @solana/web3.js so Next/Turbopack API routes
 * do not pull @noble/curves (Turbopack codegen bug: "got 8 segments, expected 4 or 5").
 */
/** Prefer Helius Worker (szybszy / stabilniejszy na mobile); classic Worker w failover. */
export const PIERRON_DEVNET_RPC_PROXY_DEFAULT =
  "https://pierron-helius-devnet.spierdalajcie111.workers.dev";

/** Secondary Pierron Worker (Helius upstream alias — kept for callers). */
export const PIERRON_DEVNET_HELIUS_PROXY_URL =
  "https://pierron-helius-devnet.spierdalajcie111.workers.dev";

/**
 * Mobile DEX failover chain (no keys). Primary stays EXPO_PUBLIC / PROXY_DEFAULT;
 * these kick in when primary resets / 429 / Network request failed.
 */
export const PIERRON_DEVNET_RPC_FAILOVER_DEFAULTS: readonly string[] = [
  "https://pierron-rpc-devnet.spierdalajcie111.workers.dev",
];
