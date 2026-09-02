import type DLMM from "@meteora-ag/dlmm";

/** Sum PIERRON (token Y) sitting in DLMM bins — swappable liquidity, not full reserve vault. */
export async function sumPierronBinLiquidityUi(
  dlmm: InstanceType<typeof DLMM>,
  span = 512
): Promise<number> {
  const { bins } = await dlmm.getBinsAroundActiveBin(span, span);
  let totalY = 0n;
  for (const bin of bins) {
    totalY += BigInt(bin.yAmount.toString());
  }
  const decimals = dlmm.tokenY.mint.decimals;
  return Number(totalY) / 10 ** decimals;
}

/**
 * When emission vault >> total_released (devnet overmint), Meteora UI tracks ~released
 * amount (~8–9B) rather than raw vault balance (~20B).
 */
export function meteoraStylePoolTvlUi(params: {
  vaultUi: number | null;
  totalReleasedUi: number | null;
}): number | null {
  const { vaultUi, totalReleasedUi } = params;
  if (vaultUi == null) return totalReleasedUi;
  if (totalReleasedUi == null) return vaultUi;
  if (vaultUi > totalReleasedUi * 1.15) return totalReleasedUi;
  return vaultUi;
}
