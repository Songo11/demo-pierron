import type DLMM from '@meteora-ag/dlmm';
import type { BN } from '@coral-xyz/anchor';

/** Progressive bin coverage — shallow pools on devnet often need >8 arrays. */
export const METEORA_SWAP_BIN_ARRAY_LIMITS = [8, 16, 32, 64] as const;

export function isMeteoraInsufficientLiquidityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Insufficient liquidity in binArrays') ||
    msg.includes('SWAP_QUOTE_INSUFFICIENT_LIQUIDITY') ||
    msg.includes('Insufficient liquidity')
  );
}

export async function quoteMeteoraDlmmSwap(params: {
  dlmm: InstanceType<typeof DLMM>;
  inAmount: BN;
  swapForY: boolean;
  slippageBps: BN;
  binArrayLimits?: readonly number[];
  /** Skip refetch when DLMM was just loaded (saves slow mobile RPC round-trip). */
  skipRefetch?: boolean;
  /** Prefetched bins (mobile warm) — unikamy getBinArrayForSwap na krytycznej ścieżce. */
  prefetchedBinArrays?: Awaited<
    ReturnType<InstanceType<typeof DLMM>['getBinArrayForSwap']>
  > | null;
}): Promise<{
  quote: Awaited<ReturnType<InstanceType<typeof DLMM>['swapQuote']>>;
  binArrays: Awaited<ReturnType<InstanceType<typeof DLMM>['getBinArrayForSwap']>>;
}> {
  if (!params.skipRefetch) {
    await params.dlmm.refetchStates();
  }

  if (params.prefetchedBinArrays && params.prefetchedBinArrays.length > 0) {
    try {
      const quote = params.dlmm.swapQuote(
        params.inAmount,
        params.swapForY,
        params.slippageBps,
        params.prefetchedBinArrays
      );
      return { quote, binArrays: params.prefetchedBinArrays };
    } catch (err) {
      if (!isMeteoraInsufficientLiquidityError(err)) {
        throw err;
      }
      // Za mało pokrycia w cache — spadnij do RPC poniżej.
    }
  }

  const limits = params.binArrayLimits ?? METEORA_SWAP_BIN_ARRAY_LIMITS;
  let lastLiquidityError: unknown;

  for (const maxBins of limits) {
    const binArrays = await params.dlmm.getBinArrayForSwap(params.swapForY, maxBins);
    try {
      const quote = params.dlmm.swapQuote(
        params.inAmount,
        params.swapForY,
        params.slippageBps,
        binArrays
      );
      return { quote, binArrays };
    } catch (err) {
      if (!isMeteoraInsufficientLiquidityError(err)) {
        throw err;
      }
      lastLiquidityError = err;
    }
  }

  throw lastLiquidityError ?? new Error('Insufficient liquidity in binArrays for swapQuote');
}
