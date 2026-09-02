import { BN } from "@coral-xyz/anchor";
import { PublicKey, type Connection } from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { createPierronDlmmPool } from "../meteora/createPierronDlmmPool.ts";
import { quoteMeteoraDlmmSwap } from "../meteora/meteoraDlmmSwapQuote.ts";

/** Quote gross PIERRON → SOL (lamports) via the official Meteora pool. */
export async function quotePierronGrossSolValueLamports(params: {
  connection: Connection;
  grossBaseUnits: bigint;
  meteoraPool: PublicKey;
  cluster?: SupportedCluster;
}): Promise<bigint> {
  if (params.grossBaseUnits <= 0n) return 0n;
  const dlmm = await createPierronDlmmPool(
    params.connection,
    params.meteoraPool,
    { cluster: params.cluster }
  );
  const { quote } = await quoteMeteoraDlmmSwap({
    dlmm,
    inAmount: new BN(params.grossBaseUnits.toString()),
    swapForY: false,
    slippageBps: new BN(0),
  });
  const value = BigInt(quote.outAmount.toString());
  if (value <= 0n) {
    throw new Error(
      "PIERRON→SOL quote returned zero — pool may lack liquidity for price floor"
    );
  }
  return value;
}
