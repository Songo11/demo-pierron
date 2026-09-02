import { pierronDevnet } from './pierronDevnet';

/**
 * Browser JSON-RPC endpoint for @solana/web3.js ConnectionProvider.
 *
 * Prefer same-origin `/api/solana-rpc` so `solana-client` never hits Worker CORS.
 * Outside the browser (SSR), fall back to the configured Worker / env URL.
 */
export function resolveBrowserSolanaRpcEndpoint(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    // Include "devnet" in the URL so wallet-adapter
    // getInferredClusterFromEndpoint() returns 'devnet' (not mainnet-beta).
    // Mobile Wallet Adapter / Phantom authorize against that cluster.
    return `${window.location.origin}/api/solana-rpc?cluster=devnet`;
  }
  return pierronDevnet.rpcUrl;
}
