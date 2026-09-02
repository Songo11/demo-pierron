import { Connection, PublicKey } from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronProgramId } from "../core/programIds.ts";
import { deriveTradeConfigPda } from "./initUserTradeAccounts.ts";

export type TradeConfigDexRefs = {
  tradeConfig: PublicKey;
  meteoraPool: PublicKey;
  meteoraTokenVault: PublicKey;
  redistributionVault: PublicKey;
};

const CACHE_TTL_MS = 120_000;
let cache: { key: string; at: number; refs: TradeConfigDexRefs } | null = null;

function cacheKey(cluster?: SupportedCluster): string {
  return String(cluster ?? "devnet");
}

/** Read `trade_config` DEX refs (OfficialBuy/Sell). Cached — to samo konto było czytane 2–3× na swap. */
export async function readTradeConfigDexRefs(
  connection: Connection,
  cluster?: SupportedCluster
): Promise<TradeConfigDexRefs> {
  const key = cacheKey(cluster);
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.refs;
  }
  const programId = getPierronProgramId(cluster);
  const tradeConfig = deriveTradeConfigPda(programId, cluster);
  const acc = await connection.getAccountInfo(tradeConfig, "processed");
  const vaultOffset = 8 + 32 * 10;
  if (!acc?.data || acc.data.length < vaultOffset + 32) {
    throw new Error("trade_config missing on-chain");
  }
  const data = acc.data;
  const refs: TradeConfigDexRefs = {
    tradeConfig,
    meteoraPool: new PublicKey(data.subarray(8 + 32 * 2, 8 + 32 * 3)),
    meteoraTokenVault: new PublicKey(data.subarray(8 + 32 * 3, 8 + 32 * 4)),
    redistributionVault: new PublicKey(
      data.subarray(vaultOffset, vaultOffset + 32)
    ),
  };
  cache = { key, at: Date.now(), refs };
  return refs;
}
