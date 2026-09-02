import type { AppCluster } from "../core/config.ts";
import {
  meteoraAgDlmmUrl as canonicalMeteoraAgUrl,
  PIERRON_DEVNET_METEORA_POOL,
} from "./pierronPoolCanonical.ts";

export { PIERRON_DEVNET_METEORA_POOL, meteoraAgDlmmUrl } from "./pierronPoolCanonical.ts";
export {
  describePoolAddressProblem,
  isPierronDevnetMeteoraPool,
  isValidSolanaAddress,
  poolAddressDiffHint,
} from "./pierronPoolCanonical.ts";

/** @deprecated PIERRON often missing from Meteora devnet index; prefer dapp /meteora. */
export const METEORA_AG_UI_BROKEN_FOR_PIERRON = true;

export function solanaClusterQuery(cluster: AppCluster): string {
  if (cluster === "mainnet-beta") return "";
  if (cluster === "localnet") return "?cluster=custom&customUrl=http://127.0.0.1:8899";
  return `?cluster=${cluster}`;
}

/** On-chain pool account — always works when pool exists. */
export function pierronPoolSolscanUrl(
  poolAddress: string,
  cluster: AppCluster = "devnet"
): string {
  return `https://solscan.io/account/${poolAddress}${solanaClusterQuery(cluster)}`;
}

/** Pierron dapp pool viewer (RPC, swap) — primary devnet UI. */
export function pierronPoolDappPath(): string {
  return "/meteora";
}

/** Exact Meteora link — use copy button; manual paste from chat breaks base58. */
export function pierronMeteoraAgUrl(cluster: AppCluster = "devnet"): string {
  return canonicalMeteoraAgUrl(PIERRON_DEVNET_METEORA_POOL, cluster);
}

/** Preferred external link when user asks for "pool page". */
export function pierronPoolExplorerUrl(
  poolAddress: string,
  cluster: AppCluster = "devnet"
): string {
  return pierronPoolSolscanUrl(poolAddress, cluster);
}
