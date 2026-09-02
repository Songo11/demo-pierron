/**
 * Mirrors `programs/pierron/src/constants.rs` claim-tier thresholds.
 * After devnet upgrade with `--features devnet-low-claim-tiers`, tiers are 1/2/3/4.
 */
import {
  BASE_LIMIT,
  DEVNET_EPOCH_SELL_VOLUME_TIERS,
  DEVNET_USER_LIMIT_TIERS,
  EPOCH_GLOBAL_SELL_VOLUME_GE_375_CLAIMS,
  EPOCH_GLOBAL_SELL_VOLUME_LT_175_CLAIMS,
  EPOCH_GLOBAL_SELL_VOLUME_LT_25_CLAIMS,
  EPOCH_GLOBAL_SELL_VOLUME_LT_375_CLAIMS,
  EPOCH_GLOBAL_SELL_VOLUME_LT_75_CLAIMS,
  TX_COOLDOWN_TIER_0_SECS,
  TX_COOLDOWN_TIER_1_SECS,
  TX_COOLDOWN_TIER_2_SECS,
  TX_COOLDOWN_TIER_3_SECS,
  TX_COOLDOWN_TIER_4_SECS,
  USER_LIMIT_BONUS_TIER_1,
  USER_LIMIT_BONUS_TIER_2,
  USER_LIMIT_BONUS_TIER_3,
  USER_LIMIT_BONUS_TIER_4,
} from "./tokenomicsConstants";

export const CLAIM_TIER_THRESHOLDS_PRODUCTION = [25, 75, 175, 375] as const;
export const CLAIM_TIER_THRESHOLDS_DEVNET_LOW = [1, 2, 3, 4] as const;

/** Devnet program id — auto-enables low tiers unless env overrides. */
export const PIERRON_PROGRAM_DEVNET = "A9kNasYvn9ZqdEzHvRHqQFtouqdRzzE2udR8aUqbKb13";

function envFlag(name: string): boolean | undefined {
  const v =
    typeof process !== "undefined" ? process.env[name] : undefined;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return undefined;
}

/** Whether client mirrors on-chain `devnet-low-claim-tiers` build. */
export function useDevnetLowClaimTiers(programId?: string): boolean {
  const explicit =
    envFlag("PIERRON_DEVNET_LOW_CLAIM_TIERS") ??
    envFlag("NEXT_PUBLIC_PIERRON_DEVNET_LOW_CLAIM_TIERS");
  if (explicit !== undefined) return explicit;
  if (programId) return programId === PIERRON_PROGRAM_DEVNET;
  return true;
}

export function claimTierThresholds(programId?: string): readonly [number, number, number, number] {
  return useDevnetLowClaimTiers(programId)
    ? CLAIM_TIER_THRESHOLDS_DEVNET_LOW
    : CLAIM_TIER_THRESHOLDS_PRODUCTION;
}

function tierIndex(count: number, programId?: string): number {
  const [t1, t2, t3, t4] = claimTierThresholds(programId);
  if (count >= t4) return 4;
  if (count >= t3) return 3;
  if (count >= t2) return 2;
  if (count >= t1) return 1;
  return 0;
}

export function userLimitBonusFromClaimCount(
  count: number,
  programId?: string
): bigint {
  const [t1, t2, t3, t4] = claimTierThresholds(programId);
  if (count >= t4) return USER_LIMIT_BONUS_TIER_4;
  if (count >= t3) return USER_LIMIT_BONUS_TIER_3;
  if (count >= t2) return USER_LIMIT_BONUS_TIER_2;
  if (count >= t1) return USER_LIMIT_BONUS_TIER_1;
  return 0n;
}

export function userLimitFromClaimCount(count: number, programId?: string): bigint {
  if (useDevnetLowClaimTiers(programId)) {
    return DEVNET_USER_LIMIT_TIERS[tierIndex(count, programId)];
  }
  return BASE_LIMIT + userLimitBonusFromClaimCount(count, programId);
}

export function epochTurnoverLimitFromTotalClaims(
  claims: number,
  programId?: string
): bigint {
  if (useDevnetLowClaimTiers(programId)) {
    return DEVNET_EPOCH_SELL_VOLUME_TIERS[tierIndex(claims, programId)];
  }
  const [t1, t2, t3, t4] = claimTierThresholds(programId);
  if (claims >= t4) return EPOCH_GLOBAL_SELL_VOLUME_GE_375_CLAIMS;
  if (claims >= t3) return EPOCH_GLOBAL_SELL_VOLUME_LT_375_CLAIMS;
  if (claims >= t2) return EPOCH_GLOBAL_SELL_VOLUME_LT_175_CLAIMS;
  if (claims >= t1) return EPOCH_GLOBAL_SELL_VOLUME_LT_75_CLAIMS;
  return EPOCH_GLOBAL_SELL_VOLUME_LT_25_CLAIMS;
}

export function epochTransactionCooldownSeconds(
  redistributionClaimCount: number,
  programId?: string
): number {
  const [t1, t2, t3, t4] = claimTierThresholds(programId);
  if (redistributionClaimCount >= t4) return TX_COOLDOWN_TIER_4_SECS;
  if (redistributionClaimCount >= t3) return TX_COOLDOWN_TIER_3_SECS;
  if (redistributionClaimCount >= t2) return TX_COOLDOWN_TIER_2_SECS;
  if (redistributionClaimCount >= t1) return TX_COOLDOWN_TIER_1_SECS;
  return TX_COOLDOWN_TIER_0_SECS;
}
