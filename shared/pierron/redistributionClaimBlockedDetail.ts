import type { RedistributionClaimEligibility } from "./redistributionClaimEligibility.ts";

export function buildRedistributionClaimBlockedDetail(params: {
  eligibility: Pick<
    RedistributionClaimEligibility,
    "blockReason" | "canExecute" | "hasPendingVoucher" | "showButton"
  >;
  qualLines: string[];
  mapBlockReason: (reason: string | undefined) => string;
}): string {
  const reason = params.eligibility.blockReason;
  const headline = params.mapBlockReason(reason);
  const qual = params.qualLines.filter(Boolean);
  if (qual.length === 0) return headline;
  if (reason === "pool_already_claimed") {
    return [headline, ...qual.filter((line) => !line.includes("eligible_users=0"))].join("\n\n");
  }
  if (reason === "past_cycle_claim_missed") {
    return [headline, ...qual.filter((line) => !line.includes("eligible_users=0"))].join("\n\n");
  }
  if (reason === "stale_redistribution_claim") {
    return headline;
  }
  return [headline, ...qual].join("\n\n");
}
