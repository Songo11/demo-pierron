/** Compact token amount like Meteora UI: 7.15B, 549.93K, 1.06M */
export function formatMeteoraCompactAmount(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${(amount / 1_000).toFixed(2)}K`;
  }
  return amount.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
