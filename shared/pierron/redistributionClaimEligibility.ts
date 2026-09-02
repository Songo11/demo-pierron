import { Program } from "@coral-xyz/anchor";
import { PublicKey, type Connection } from "@solana/web3.js";
import {
  globalCycleIndex,
  isRedistributionClaimCycleComplete,
  isRedistributionClaimWindowExpired,
  epochsUntilRedistributionClaimExpires,
  participantCycleIndex,
} from "./ecosystemCycle.ts";
import { deriveAccountingStatePda, derivePendingRedistributionClaimPda } from "./redistributionPdas.ts";
import pierronIdl from "../idl/pierron.json" with { type: "json" };
import {
  MIN_ACTIVE_EPOCHS,
  REDISTRIBUTION_CYCLE_EPOCHS,
  REDISTRIBUTION_CLAIM_FEE,
  REDISTRIBUTION_VOUCHER_EXPIRY_EPOCHS,
  SECONDS_PER_EPOCH,
  MAX_REDISTRIBUTION_CLAIMS_FLOOR,
  MAX_REDISTRIBUTION_CLAIMS_DIVISOR,
  MAX_REDISTRIBUTION_CLAIMS_CAP,
} from "./tokenomicsConstants.ts";
import type { TradeBookParticipantSnapshot } from "./tradeBookParticipant.ts";

/** Mirror of `POST_ROLLOVER_DELAY_SECS` in programs/pierron/src/constants.rs */
export const POST_ROLLOVER_DELAY_SECS = 180;

export type PendingRedistributionClaimSnapshot = {
  address: PublicKey;
  amount: bigint;
  consumed: boolean;
  cycleStartEpoch: number;
  preparedAt?: number;
};

type DecodedPendingRedistributionRaw = PendingRedistributionClaimSnapshot & {
  preparedAt: bigint;
};

export type RedistributionClaimEligibility = {
  /** Show claim UI (cycle ended or pending voucher exists). */
  showButton: boolean;
  /** On-chain claim+settle should succeed now — button highlights. */
  canExecute: boolean;
  hasPendingVoucher: boolean;
  pendingVoucher?: PendingRedistributionClaimSnapshot;
  estimatedPayout: bigint;
  estimatedNetPayout: bigint;
  claimFee: bigint;
  blockReason?: string;
  /** When blocked by TooEarly — seconds until claim may open (lag-aware). */
  claimOpensInSecs?: number;
  /** Epochs left before unclaimed redistribution is forfeited at next settlement. */
  claimExpiresInEpochs?: number;
  cycleCompleteOnChain: boolean;
  redistributionShare: bigint;
  /** Fallback signal: voucher already consumed for current cycle, even if participant counters lag. */
  claimedByConsumedVoucher?: boolean;
};

type AccountingLike = {
  currentEpoch: number;
  epochStartTime: number;
  /** Needed to mirror on-chain `rollover_epoch` when wall clock is ahead of ledger. */
  genesisEpochTimestamp?: number;
  redistributionCycleStartEpoch: number;
  redistributionShare: bigint;
  redistributionPoolPrevious: bigint;
  redistributionClaimedFromPrevious: bigint;
  redistributionClaimsThisEpoch: number;
  eligibleUsersPreviousCycle: number;
  /** Mirror `AccountingState.active_users_snapshot` for claims-limit. */
  activeUsersSnapshot?: number;
};

/**
 * Claim may call `rollover_epoch` in-tx when wall clock > ledger epoch.
 * TooEarly is then measured from the *post-rollover* epoch start — not the fetched one.
 */
export function effectiveClaimEpochClock(params: {
  now: number;
  accounting: AccountingLike;
}): {
  effectiveEpoch: number;
  effectiveEpochStart: number;
  willRollover: boolean;
} {
  const genesis = params.accounting.genesisEpochTimestamp ?? 0;
  const wallEpoch =
    genesis > 0
      ? Math.max(0, Math.floor((params.now - genesis) / SECONDS_PER_EPOCH))
      : params.accounting.currentEpoch;
  const willRollover = wallEpoch > params.accounting.currentEpoch;
  const effectiveEpoch = Math.max(params.accounting.currentEpoch, wallEpoch);
  const effectiveEpochStart =
    willRollover && genesis > 0
      ? genesis + effectiveEpoch * SECONDS_PER_EPOCH
      : params.accounting.epochStartTime;
  return { effectiveEpoch, effectiveEpochStart, willRollover };
}

/** Seconds until post-rollover delay clears (0 = claim may proceed re: TooEarly). */
export function secondsUntilRedistributionClaimOpens(params: {
  now: number;
  accounting: AccountingLike;
}): number {
  const { effectiveEpochStart } = effectiveClaimEpochClock(params);
  return Math.max(
    0,
    effectiveEpochStart + POST_ROLLOVER_DELAY_SECS - params.now
  );
}

function toNum(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value && "toNumber" in value) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : fallback;
  }
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBigInt(value: unknown, fallback = 0n): bigint {
  if (value == null) return fallback;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "object" && value && "toString" in value) {
    try {
      return BigInt((value as { toString(): string }).toString());
    } catch {
      return fallback;
    }
  }
  try {
    return BigInt(String(value));
  } catch {
    return fallback;
  }
}

export function readAccountingFields(raw: Record<string, unknown>): AccountingLike {
  return {
    currentEpoch: toNum(raw.currentEpoch ?? raw.current_epoch),
    epochStartTime: toNum(raw.epochStartTime ?? raw.epoch_start_time),
    genesisEpochTimestamp: toNum(
      raw.genesisEpochTimestamp ?? raw.genesis_epoch_timestamp
    ),
    redistributionCycleStartEpoch: toNum(
      raw.redistributionCycleStartEpoch ?? raw.redistribution_cycle_start_epoch
    ),
    redistributionShare: toBigInt(raw.redistributionShare ?? raw.redistribution_share),
    redistributionPoolPrevious: toBigInt(
      raw.redistributionPoolPrevious ?? raw.redistribution_pool_previous
    ),
    redistributionClaimedFromPrevious: toBigInt(
      raw.redistributionClaimedFromPrevious ?? raw.redistribution_claimed_from_previous
    ),
    redistributionClaimsThisEpoch: toNum(
      raw.redistributionClaimsThisEpoch ?? raw.redistribution_claims_this_epoch
    ),
    eligibleUsersPreviousCycle: toNum(
      raw.eligibleUsersPreviousCycle ?? raw.eligible_users_previous_cycle
    ),
    activeUsersSnapshot: toNum(
      raw.activeUsersSnapshot ?? raw.active_users_snapshot
    ),
  };
}

/** Mirror `programs/pierron::helpers::dynamic_claims_limit` — NEVER eligible_users/2. */
function dynamicClaimsLimit(accounting: AccountingLike): number {
  const snapshot = Math.max(0, accounting.activeUsersSnapshot ?? 0);
  const fromSnapshot = Math.floor(snapshot / MAX_REDISTRIBUTION_CLAIMS_DIVISOR);
  return Math.min(
    MAX_REDISTRIBUTION_CLAIMS_CAP,
    Math.max(MAX_REDISTRIBUTION_CLAIMS_FLOOR, fromSnapshot)
  );
}

function poolRemaining(accounting: AccountingLike): bigint {
  return accounting.redistributionPoolPrevious > accounting.redistributionClaimedFromPrevious
    ? accounting.redistributionPoolPrevious - accounting.redistributionClaimedFromPrevious
    : 0n;
}

/**
 * Effective per-user share for UI / claim readiness.
 * Mirrors on-chain repair: when rollover zeroed share (eligible_users=0) but the
 * previous-cycle pool still has funds, treat remaining pool as the claimable share.
 */
function safeClaimAmount(accounting: AccountingLike): bigint {
  const remaining = poolRemaining(accounting);
  if (remaining <= 0n) return 0n;
  if (accounting.redistributionShare > 0n) {
    return remaining < accounting.redistributionShare
      ? remaining
      : accounting.redistributionShare;
  }
  if (accounting.eligibleUsersPreviousCycle <= 0) {
    return remaining;
  }
  return 0n;
}

function collectClaimBlockers(params: {
  now: number;
  participant: TradeBookParticipantSnapshot;
  accounting: AccountingLike;
  cycleCompleteOnChain: boolean;
  userActivityCycle: number;
  protocolCycleIndex: number;
  estimatedPayout: bigint;
  userTokenBalance: bigint;
  consumedVoucherCount?: number;
}): string[] {
  const blockers: string[] = [];
  const { participant, accounting, cycleCompleteOnChain, userActivityCycle, estimatedPayout } =
    params;
  const effectiveActiveEpochs = effectiveRedistributionActiveEpochs(
    participant,
    params.consumedVoucherCount ?? 0,
    params.accounting.currentEpoch
  );

  if (effectiveActiveEpochs < MIN_ACTIVE_EPOCHS) {
    blockers.push("insufficient_activity");
  }
  if (userActivityCycle < 0) {
    blockers.push("no_activity_cycle");
  }
  if (!cycleCompleteOnChain) {
    blockers.push("cycle_not_complete");
  }
  if (userActivityCycle >= 0 && participant.lastClaimedCycle >= userActivityCycle) {
    blockers.push("already_claimed");
  }
  if (estimatedPayout <= 0n) {
    const remaining = poolRemaining(accounting);
    const userNotClaimedThisCycle =
      userActivityCycle >= 0 && participant.lastClaimedCycle < userActivityCycle;
    const poolExhausted =
      accounting.redistributionPoolPrevious > 0n &&
      remaining <= 0n &&
      (accounting.redistributionClaimsThisEpoch > 0 ||
        accounting.redistributionClaimedFromPrevious > 0n);
    const inImmediateClaimWindow =
      userActivityCycle >= 0 && userActivityCycle === params.protocolCycleIndex - 1;
    if (poolExhausted && userNotClaimedThisCycle && inImmediateClaimWindow) {
      blockers.push("pool_already_claimed");
    } else if (
      accounting.redistributionShare <= 0n &&
      accounting.eligibleUsersPreviousCycle <= 0 &&
      remaining <= 0n &&
      effectiveActiveEpochs >= MIN_ACTIVE_EPOCHS &&
      cycleCompleteOnChain
    ) {
      blockers.push("no_pool_share");
    } else if (effectiveActiveEpochs >= MIN_ACTIVE_EPOCHS && cycleCompleteOnChain) {
      blockers.push("no_prize");
    } else {
      blockers.push("no_prize");
    }
  }
  if (secondsUntilRedistributionClaimOpens({ now: params.now, accounting }) > 0) {
    blockers.push("too_early_after_rollover");
  }
  if (accounting.redistributionClaimsThisEpoch >= dynamicClaimsLimit(accounting)) {
    blockers.push("claims_limit_reached");
  }
  if (participant.lastClaimTime > 0) {
    const cooldownEnd =
      participant.lastClaimTime + REDISTRIBUTION_CYCLE_EPOCHS * SECONDS_PER_EPOCH;
    if (params.now < cooldownEnd) {
      blockers.push("claim_cooldown");
    }
  }
  if (params.userTokenBalance < REDISTRIBUTION_CLAIM_FEE) {
    blockers.push("insufficient_fee_balance");
  }

  return blockers;
}

export function evaluateRedistributionClaimEligibility(params: {
  now?: number;
  accounting: AccountingLike;
  participant: TradeBookParticipantSnapshot | null;
  pendingVoucher?: PendingRedistributionClaimSnapshot | null;
  userTokenBalance?: bigint;
  /** Consumed redistribution voucher count — reconciles stale trade-book rows after settle-only claims. */
  consumedVoucherCount?: number;
}): RedistributionClaimEligibility {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const participant = params.participant;
  const accounting = params.accounting;
  const consumedVoucherCount = params.consumedVoucherCount ?? 0;
  const claimFee = REDISTRIBUTION_CLAIM_FEE;
  const userTokenBalance = params.userTokenBalance ?? 0n;
  const estimatedPayout =
    params.pendingVoucher?.consumed === false
      ? params.pendingVoucher.amount
      : safeClaimAmount(accounting);
  const estimatedNetPayout = estimatedPayout > claimFee ? estimatedPayout - claimFee : 0n;

  if (!participant) {
    return {
      showButton: false,
      canExecute: false,
      hasPendingVoucher: false,
      estimatedPayout,
      estimatedNetPayout,
      claimFee,
      blockReason: "no_participant",
      cycleCompleteOnChain: false,
      redistributionShare: accounting.redistributionShare,
    };
  }

  const activityCycleEpoch = resolveRedistributionClaimActivityCycleEpoch(
    participant,
    accounting.currentEpoch,
    consumedVoucherCount
  );
  const userActivityCycle = participantCycleIndex(activityCycleEpoch);
  const cycleCompleteOnChain = isRedistributionClaimCycleComplete({
    protocolEpoch: accounting.currentEpoch,
    activityCycleEpoch,
  });
  const hasPendingVoucher = Boolean(
    params.pendingVoucher &&
      !params.pendingVoucher.consumed &&
      params.pendingVoucher.amount > 0n &&
      (params.pendingVoucher.preparedAt ?? 0) > 0
  );
  // Prepare stores the *claimed past-cycle* start on the voucher — not necessarily the
  // live redistributionCycleStartEpoch. Match either live window or resolved claim cycle.
  const consumedVoucherForClaimCycle = Boolean(
    params.pendingVoucher &&
      params.pendingVoucher.consumed &&
      params.pendingVoucher.amount > 0n &&
      (params.pendingVoucher.cycleStartEpoch === accounting.redistributionCycleStartEpoch ||
        params.pendingVoucher.cycleStartEpoch === activityCycleEpoch ||
        (userActivityCycle >= 0 &&
          participantCycleIndex(params.pendingVoucher.cycleStartEpoch) ===
            userActivityCycle))
  );
  const pendingPreparedAt = params.pendingVoucher?.preparedAt ?? 0;
  const pendingVoucherExpired =
    hasPendingVoucher &&
    pendingPreparedAt > 0 &&
    now >= pendingPreparedAt + REDISTRIBUTION_VOUCHER_EXPIRY_EPOCHS * SECONDS_PER_EPOCH;

  const claimableUnclaimed = hasClaimableUnclaimedRedistributionSnapshot(
    participant,
    accounting.currentEpoch
  );
  const claimingLiveCycle =
    activityCycleEpoch >= 0 &&
    activityCycleEpoch === participant.activityCycleEpoch &&
    activityCycleEpoch !== (participant.unclaimedRedistributionCycleStart ?? -2);
  const effectiveActiveEpochs = claimingLiveCycle
    ? Math.max(0, participant.activeEpochsCount)
    : effectiveRedistributionActiveEpochs(
        participant,
        params.consumedVoucherCount ?? 0,
        params.accounting.currentEpoch
      );
  const qualifiedForPastCycle =
    (effectiveActiveEpochs >= MIN_ACTIVE_EPOCHS && cycleCompleteOnChain) ||
    claimableUnclaimed;

  // Only treat trade-book lag as "already claimed" for the cycle we are claiming.
  const staleTradeBookAfterClaim =
    !claimingLiveCycle &&
    hasStaleTradeBookAfterClaim(participant, consumedVoucherCount);

  if (consumedVoucherForClaimCycle || staleTradeBookAfterClaim) {
    return {
      showButton: false,
      canExecute: false,
      hasPendingVoucher: false,
      pendingVoucher: params.pendingVoucher ?? undefined,
      estimatedPayout,
      estimatedNetPayout,
      claimFee,
      blockReason: "already_claimed",
      cycleCompleteOnChain,
      redistributionShare: accounting.redistributionShare,
      claimedByConsumedVoucher: true,
    };
  }

  // Trade-book already records this cycle as claimed — hide panel even if activity
  // markers still look "qualified" (post-settle refresh).
  if (
    userActivityCycle >= 0 &&
    participant.lastClaimedCycle >= userActivityCycle &&
    !claimableUnclaimed
  ) {
    return {
      showButton: false,
      canExecute: false,
      hasPendingVoucher: false,
      pendingVoucher: params.pendingVoucher ?? undefined,
      estimatedPayout,
      estimatedNetPayout,
      claimFee,
      blockReason: "already_claimed",
      cycleCompleteOnChain,
      redistributionShare: accounting.redistributionShare,
      claimedByConsumedVoucher: false,
    };
  }

  if (hasPendingVoucher) {
    if (pendingVoucherExpired) {
      return {
        showButton: false,
        canExecute: false,
        hasPendingVoucher: false,
        pendingVoucher: params.pendingVoucher ?? undefined,
        estimatedPayout,
        estimatedNetPayout,
        claimFee,
        blockReason: "pending_voucher_expired",
        cycleCompleteOnChain,
        redistributionShare: accounting.redistributionShare,
      };
    }
    const blockers: string[] = [];
    if (userTokenBalance < claimFee) blockers.push("insufficient_fee_balance");
    return {
      showButton: true,
      canExecute: blockers.length === 0,
      hasPendingVoucher: true,
      pendingVoucher: params.pendingVoucher ?? undefined,
      estimatedPayout,
      estimatedNetPayout,
      claimFee,
      blockReason: blockers[0],
      cycleCompleteOnChain,
      redistributionShare: accounting.redistributionShare,
      claimedByConsumedVoucher: false,
    };
  }

  const claimExpiresInEpochs = epochsUntilRedistributionClaimExpires({
    protocolEpoch: accounting.currentEpoch,
    activityCycleEpoch,
  });
  const claimWindowExpired = isRedistributionClaimWindowExpired({
    protocolEpoch: accounting.currentEpoch,
    activityCycleEpoch,
  });

  if (
    claimWindowExpired &&
    cycleCompleteOnChain &&
    userActivityCycle >= 0 &&
    participant.lastClaimedCycle < userActivityCycle
  ) {
    return {
      showButton: false,
      canExecute: false,
      hasPendingVoucher: false,
      estimatedPayout,
      estimatedNetPayout,
      claimFee,
      blockReason: "stale_redistribution_claim",
      claimExpiresInEpochs: 0,
      cycleCompleteOnChain,
      redistributionShare: accounting.redistributionShare,
      claimedByConsumedVoucher: false,
    };
  }

  const protocolCycleIndex = globalCycleIndex(accounting.currentEpoch);
  const blockers = collectClaimBlockers({
    now,
    participant,
    accounting,
    cycleCompleteOnChain,
    userActivityCycle,
    protocolCycleIndex,
    estimatedPayout,
    userTokenBalance,
    consumedVoucherCount,
  });

  const alreadyClaimed = blockers.includes("already_claimed");
  const showButton = qualifiedForPastCycle && !alreadyClaimed;
  const claimOpensInSecs = secondsUntilRedistributionClaimOpens({ now, accounting });

  return {
    showButton,
    canExecute: showButton && blockers.length === 0,
    hasPendingVoucher: false,
    estimatedPayout,
    estimatedNetPayout,
    claimFee,
    blockReason: blockers[0],
    claimOpensInSecs:
      blockers[0] === "too_early_after_rollover" ? claimOpensInSecs : undefined,
    claimExpiresInEpochs,
    cycleCompleteOnChain,
    redistributionShare: accounting.redistributionShare,
    claimedByConsumedVoucher: false,
  };
}

/**
 * Live redistribution grid / cycle progress.
 * Always the on-chain live `activity_bitmap` while the participant is in the
 * current redistribution window. Never substitute the frozen prior-cycle claim
 * snapshot — that cleared green squares after the next epoch once `txs_epoch`
 * no longer matched `current_epoch` (swap showed activity, then vanished).
 */
export function liveRedistributionActivityBitmap(
  participant: TradeBookParticipantSnapshot,
  redistributionCycleStartEpoch: number
): number {
  if (
    participant.activityCycleEpoch < 0 ||
    redistributionCycleStartEpoch < 0 ||
    participant.activityCycleEpoch < redistributionCycleStartEpoch
  ) {
    return 0;
  }
  return participant.activityBitmap;
}

export function participantHasLiveSwapThisEpoch(
  participant: TradeBookParticipantSnapshot,
  currentEpoch: number
): boolean {
  return participant.txsEpoch === currentEpoch && participant.txsThisEpoch > 0;
}

export function hasUnclaimedRedistributionSnapshot(
  participant: TradeBookParticipantSnapshot
): boolean {
  return (
    (participant.unclaimedRedistributionCycleStart ?? -1) >= 0 &&
    (participant.unclaimedActiveEpochs ?? 0) >= MIN_ACTIVE_EPOCHS
  );
}

/** Unclaimed freeze that is still inside the 28-epoch post-rollover claim window. */
export function hasClaimableUnclaimedRedistributionSnapshot(
  participant: TradeBookParticipantSnapshot,
  protocolEpoch: number
): boolean {
  if (!hasUnclaimedRedistributionSnapshot(participant)) return false;
  return !isRedistributionClaimWindowExpired({
    protocolEpoch,
    activityCycleEpoch: participant.unclaimedRedistributionCycleStart,
  });
}

/**
 * Activity-cycle anchor for past-cycle redistribution claim UI / eligibility.
 * Prefer a still-claimable frozen snapshot, but NEVER let an expired unclaimed
 * row hide a newer completed live cycle (≥9 active epochs).
 */
export function resolveRedistributionClaimActivityCycleEpoch(
  participant: TradeBookParticipantSnapshot,
  protocolEpoch: number,
  consumedVoucherCount = 0
): number {
  const live = participant.activityCycleEpoch;
  const unclaimed = participant.unclaimedRedistributionCycleStart ?? -1;
  const unclaimedClaimable = hasClaimableUnclaimedRedistributionSnapshot(
    participant,
    protocolEpoch
  );

  const liveActive = effectiveRedistributionActiveEpochs(
    participant,
    consumedVoucherCount,
    protocolEpoch
  );
  // When unclaimed is stale, count live activity alone for the newer cycle.
  const liveEpochsForClaim = unclaimedClaimable
    ? liveActive
    : Math.max(0, participant.activeEpochsCount);
  const liveClaimable =
    live >= 0 &&
    liveEpochsForClaim >= MIN_ACTIVE_EPOCHS &&
    isRedistributionClaimCycleComplete({
      protocolEpoch,
      activityCycleEpoch: live,
    }) &&
    !isRedistributionClaimWindowExpired({
      protocolEpoch,
      activityCycleEpoch: live,
    });

  if (unclaimedClaimable && liveClaimable) {
    return Math.max(unclaimed, live);
  }
  if (liveClaimable) return live;
  if (unclaimedClaimable) return unclaimed;
  // Keep expired unclaimed for stale messaging when nothing newer qualifies.
  if (hasUnclaimedRedistributionSnapshot(participant)) return unclaimed;
  return live;
}

/**
 * Trade-book still shows an unclaimed snapshot after settle landed.
 * Do NOT treat any historical consumed voucher as proof — that falsely hid
 * the next-cycle claim button on desktop RPC (GPA works) while mobile often
 * timed out at consumedCount=0 and still showed the button.
 */
export function hasStaleTradeBookAfterClaim(
  participant: TradeBookParticipantSnapshot,
  consumedVoucherCount: number
): boolean {
  if (!hasUnclaimedRedistributionSnapshot(participant)) return false;
  const unclaimedCycle = participantCycleIndex(
    participant.unclaimedRedistributionCycleStart
  );
  if (unclaimedCycle >= 0 && participant.lastClaimedCycle >= unclaimedCycle) {
    return true;
  }
  // Consumed voucher count ahead of trade-book claim counter = settle lag.
  const claimCount = Math.max(0, participant.redistributionClaimCount ?? 0);
  return consumedVoucherCount > claimCount;
}

/**
 * Past-cycle claim panel / eligibility display only.
 * Prefer the frozen unclaimed snapshot while a prior-cycle claim is outstanding.
 * Do not use this for the live activity grid — see {@link liveRedistributionActivityBitmap}.
 */
export function effectiveRedistributionActivityBitmap(
  participant: TradeBookParticipantSnapshot,
  consumedVoucherCount = 0,
  currentEpoch?: number
): number {
  const liveSwap =
    currentEpoch != null && participantHasLiveSwapThisEpoch(participant, currentEpoch);
  const ledgerLag = hasStaleTradeBookAfterClaim(participant, consumedVoucherCount);
  if (ledgerLag || liveSwap) {
    return participant.activityBitmap;
  }
  if (hasUnclaimedRedistributionSnapshot(participant)) {
    const frozen = participant.unclaimedActivityBitmap ?? 0;
    if (frozen > 0) return frozen;
  }
  return participant.activityBitmap;
}

/** Active epochs counting toward a past-cycle claim (survives first swap in new cycle on-chain). */
export function effectiveRedistributionActiveEpochs(
  participant: TradeBookParticipantSnapshot,
  consumedVoucherCount = 0,
  currentEpoch?: number
): number {
  const liveSwap =
    currentEpoch != null && participantHasLiveSwapThisEpoch(participant, currentEpoch);
  const ledgerLag = hasStaleTradeBookAfterClaim(participant, consumedVoucherCount);
  if (ledgerLag || liveSwap) {
    return participant.activeEpochsCount;
  }
  return Math.max(participant.activeEpochsCount, participant.unclaimedActiveEpochs ?? 0);
}

/** Activity cycle anchor for live-window UI after claim settle or legacy consume-only rows. */
export function effectiveLiveActivityCycleEpoch(
  participant: TradeBookParticipantSnapshot,
  redistributionCycleStartEpoch: number,
  currentEpoch: number,
  consumedVoucherCount = 0
): number {
  const liveSwap = participantHasLiveSwapThisEpoch(participant, currentEpoch);
  const staleAfterClaim = hasStaleTradeBookAfterClaim(participant, consumedVoucherCount);
  if (liveSwap || staleAfterClaim) {
    return Math.max(participant.activityCycleEpoch, redistributionCycleStartEpoch);
  }
  return participant.activityCycleEpoch;
}

export async function fetchPendingRedistributionClaim(params: {
  connection: { getAccountInfo: (pk: PublicKey) => Promise<{ data: Buffer } | null> };
  program: {
    account: {
      pendingRedistributionClaim: {
        fetch: (pda: PublicKey) => Promise<Record<string, unknown>>;
      };
    };
  };
  programId: PublicKey;
  user: PublicKey;
  redistributionCycleStartEpoch: number;
}): Promise<PendingRedistributionClaimSnapshot | null> {
  const pda = derivePendingRedistributionClaimPda({
    programId: params.programId,
    user: params.user,
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
  });

  try {
    const info = await params.connection.getAccountInfo(pda);
    if (!info?.data) return null;
    // Raw decode only — avoids a second Anchor RPC round-trip per PDA.
    const decoded = decodePendingRedistributionClaimRaw(
      pda,
      Buffer.from(info.data),
      params.redistributionCycleStartEpoch
    );
    return decoded
      ? {
          address: decoded.address,
          amount: decoded.amount,
          consumed: decoded.consumed,
          cycleStartEpoch: decoded.cycleStartEpoch,
          preparedAt: Number(decoded.preparedAt),
        }
      : null;
  } catch {
    return null;
  }
}

/** Finds an open voucher across current and prior redistribution cycle anchors. */
export async function fetchPendingRedistributionClaimAny(params: {
  connection: {
    getAccountInfo: (pk: PublicKey) => Promise<{ data: Buffer } | null>;
    getMultipleAccountsInfo?: (
      pks: PublicKey[]
    ) => Promise<Array<{ data: Buffer | Uint8Array } | null>>;
    getProgramAccounts?: (
      programId: PublicKey,
      config?: {
        filters?: Array<
          | { dataSize?: number }
          | { memcmp?: { offset: number; bytes: string } }
        >;
      }
    ) => Promise<Array<{ pubkey: PublicKey; account: { data: Buffer } }>>;
  };
  program: {
    account: {
      pendingRedistributionClaim: {
        fetch: (pda: PublicKey) => Promise<Record<string, unknown>>;
      };
    };
  };
  programId: PublicKey;
  user: PublicKey;
  redistributionCycleStartEpoch: number;
  extraCycleStarts?: number[];
  maxPreviousCyclesToProbe?: number;
  /** Mobile: skip slow GPA fallback (PDA batch is enough). */
  skipProgramAccountsScan?: boolean;
}): Promise<PendingRedistributionClaimSnapshot | null> {
  const starts = new Set<number>();
  const currentStart = Math.max(0, params.redistributionCycleStartEpoch);
  starts.add(currentStart);
  for (const e of params.extraCycleStarts ?? []) {
    if (e >= 0) starts.add(e);
  }
  const cycleLen = REDISTRIBUTION_CYCLE_EPOCHS;
  const backfillCycles = Math.max(0, params.maxPreviousCyclesToProbe ?? 6);
  for (let i = 1; i <= backfillCycles; i++) {
    const prevStart = currentStart - i * cycleLen;
    if (prevStart >= 0) starts.add(prevStart);
  }

  const orderedStarts = [...starts].sort((a, b) => b - a);
  const pdaRows = orderedStarts.map((start) => ({
    start,
    pda: derivePendingRedistributionClaimPda({
      programId: params.programId,
      user: params.user,
      redistributionCycleStartEpoch: start,
    }),
  }));

  let infos: Array<{ data: Buffer | Uint8Array } | null> = [];
  if (typeof params.connection.getMultipleAccountsInfo === "function" && pdaRows.length > 0) {
    try {
      infos = await params.connection.getMultipleAccountsInfo(pdaRows.map((r) => r.pda));
    } catch {
      infos = [];
    }
  }
  if (infos.length !== pdaRows.length) {
    // Fallback: parallel single gets (still far better than sequential Anchor pairs).
    infos = await Promise.all(
      pdaRows.map((r) => params.connection.getAccountInfo(r.pda).catch(() => null))
    );
  }

  for (let i = 0; i < pdaRows.length; i++) {
    const info = infos[i];
    if (!info?.data) continue;
    const decoded = decodePendingRedistributionClaimRaw(
      pdaRows[i].pda,
      Buffer.from(info.data),
      pdaRows[i].start
    );
    if (decoded && !decoded.consumed && decoded.amount > 0n) {
      return {
        address: decoded.address,
        amount: decoded.amount,
        consumed: decoded.consumed,
        cycleStartEpoch: decoded.cycleStartEpoch,
        preparedAt: Number(decoded.preparedAt),
      };
    }
  }

  // Last-resort GPA — often slow/dropped on mobile; skip when requested.
  if (
    !params.skipProgramAccountsScan &&
    typeof params.connection.getProgramAccounts === "function"
  ) {
    try {
      const userOffset = 8 + 32 + 32; // discriminator + token_mint + source_vault
      const consumedOffset = 8 + 32 + 32 + 32 + 8 + 8 + 8; // bool consumed in account layout
      const rows = await params.connection.getProgramAccounts(params.programId, {
        filters: [
          { dataSize: 130 },
          { memcmp: { offset: userOffset, bytes: params.user.toBase58() } },
          { memcmp: { offset: consumedOffset, bytes: "1" } }, // false == 0x00 => base58 "1"
        ],
      });
      const decoded = rows
        .map((row) =>
          decodePendingRedistributionClaimRaw(
            row.pubkey,
            row.account.data,
            params.redistributionCycleStartEpoch
          )
        )
        .filter(
          (row): row is DecodedPendingRedistributionRaw =>
            Boolean(row && !row.consumed && row.amount > 0n)
        )
        .sort((a, b) => Number(b.preparedAt - a.preparedAt));
      if (decoded[0]) {
        return {
          address: decoded[0].address,
          amount: decoded[0].amount,
          consumed: decoded[0].consumed,
          cycleStartEpoch: decoded[0].cycleStartEpoch,
          preparedAt: Number(decoded[0].preparedAt),
        };
      }
    } catch {
      // ignore and fall through to null
    }
  }

  return null;
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const VOUCHER_CACHE_TTL_MS = 5 * 60_000;
const consumedVoucherCache = new Map<
  string,
  { pubkeys: PublicKey[]; expiresAt: number }
>();
const consumedVoucherInFlight = new Map<string, Promise<PublicKey[]>>();

function voucherCacheKey(programId: PublicKey, user: PublicKey): string {
  return `${programId.toBase58()}:${user.toBase58()}`;
}

export function primeConsumedRedistributionVoucherCache(params: {
  programId: PublicKey;
  user: PublicKey;
  pubkeys: PublicKey[];
}): void {
  consumedVoucherCache.set(voucherCacheKey(params.programId, params.user), {
    pubkeys: params.pubkeys,
    expiresAt: Date.now() + VOUCHER_CACHE_TTL_MS,
  });
}

async function getProgramAccountsWithTimeout(
  connection: Pick<Connection, "getProgramAccounts">,
  programId: PublicKey,
  filters: Parameters<NonNullable<Connection["getProgramAccounts"]>>[1]["filters"],
  timeoutMs = 12_000
): Promise<Array<{ pubkey: PublicKey; account: { data: Buffer } }>> {
  return Promise.race([
    connection.getProgramAccounts!(programId, { filters }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getProgramAccounts timeout")), timeoutMs)
    ),
  ]);
}

async function readRedistributionCycleStartEpoch(params: {
  connection: Pick<Connection, "getAccountInfo">;
  programId: PublicKey;
}): Promise<number> {
  try {
    const accountingPda = deriveAccountingStatePda(params.programId);
    const program = new Program(pierronIdl as any, {
      connection: params.connection as Connection,
    });
    const accounting: any = await program.account.accountingState.fetch(accountingPda);
    return Number(
      accounting.redistributionCycleStartEpoch ??
        accounting.redistribution_cycle_start_epoch ??
        0
    );
  } catch {
    return 0;
  }
}

/** Mobile RPC often drops `getProgramAccounts` — probe deterministic voucher PDAs instead. */
async function probeConsumedRedistributionVoucherPdas(params: {
  connection: Pick<Connection, "getAccountInfo" | "getMultipleAccountsInfo">;
  programId: PublicKey;
  user: PublicKey;
  redistributionCycleStartEpoch: number;
  maxCyclesBack?: number;
  /** Skip inter-batch sleeps (mobile prep background refresh). */
  fastProbe?: boolean;
}): Promise<PublicKey[]> {
  const out: PublicKey[] = [];
  const base = params.redistributionCycleStartEpoch;
  if (base < 0) return out;
  const maxCycles = params.maxCyclesBack ?? 12;
  const cycles: number[] = [];
  for (let i = 0; i < maxCycles; i++) {
    const cycleStart = base - i * REDISTRIBUTION_CYCLE_EPOCHS;
    if (cycleStart < 0) break;
    cycles.push(cycleStart);
  }
  if (cycles.length === 0) return out;

  const pdas = cycles.map((cycleStart) =>
    derivePendingRedistributionClaimPda({
      programId: params.programId,
      user: params.user,
      redistributionCycleStartEpoch: cycleStart,
    })
  );

  let infos: Array<{ data: Buffer | Uint8Array } | null> = [];
  try {
    if (typeof params.connection.getMultipleAccountsInfo === "function") {
      infos = await params.connection.getMultipleAccountsInfo(pdas);
    }
  } catch {
    infos = [];
  }
  if (infos.length !== pdas.length) {
    infos = await Promise.all(
      pdas.map((pda) => params.connection.getAccountInfo(pda).catch(() => null))
    );
  }

  for (let i = 0; i < pdas.length; i++) {
    const info = infos[i];
    if (!info?.data || info.data.length < 130) continue;
    const decoded = decodePendingRedistributionClaimRaw(
      pdas[i],
      Buffer.from(info.data),
      cycles[i]
    );
    if (decoded?.consumed && decoded.amount > 0n) {
      out.push(pdas[i]);
    }
  }
  return out;
}

async function fetchConsumedRedistributionClaimPubkeysUncached(params: {
  connection: Pick<Connection, "getProgramAccounts" | "getAccountInfo" | "getMultipleAccountsInfo">;
  programId: PublicKey;
  user: PublicKey;
  redistributionCycleStartEpoch?: number;
  skipProgramAccountsScan?: boolean;
  fastProbe?: boolean;
}): Promise<PublicKey[]> {
  const seen = new Set<string>();
  const out: PublicKey[] = [];
  const pushUnique = (pk: PublicKey) => {
    const key = pk.toBase58();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(pk);
  };

  if (
    !params.skipProgramAccountsScan &&
    typeof params.connection.getProgramAccounts === "function"
  ) {
    const userOffset = 8 + 32 + 32;
    try {
      const rows = await getProgramAccountsWithTimeout(
        params.connection,
        params.programId,
        [
          { dataSize: 130 },
          { memcmp: { offset: userOffset, bytes: params.user.toBase58() } },
        ]
      );
      for (const row of rows) {
        const decoded = decodePendingRedistributionClaimRaw(
          row.pubkey,
          row.account.data,
          -1
        );
        if (decoded?.consumed && decoded.amount > 0n) pushUnique(row.pubkey);
      }
      if (out.length > 0) return out;
    } catch {
      // fall through to PDA probe
    }
  }

  const cycleStart =
    params.redistributionCycleStartEpoch ??
    (await readRedistributionCycleStartEpoch({
      connection: params.connection,
      programId: params.programId,
    }));
  const probed = await probeConsumedRedistributionVoucherPdas({
    connection: params.connection,
    programId: params.programId,
    user: params.user,
    redistributionCycleStartEpoch: cycleStart,
    fastProbe: params.fastProbe,
  });
  for (const pk of probed) pushUnique(pk);
  return out;
}

/** Consumed redistribution voucher PDAs — tier fallback when trade book lags. */
export async function fetchConsumedRedistributionClaimPubkeys(params: {
  connection: Pick<Connection, "getProgramAccounts" | "getAccountInfo" | "getMultipleAccountsInfo">;
  programId: PublicKey;
  user: PublicKey;
  redistributionCycleStartEpoch?: number;
  /** Abort slow mobile RPC scans (returns cache or partial result). */
  maxWaitMs?: number;
  /** Mobile prep: skip GPA, probe deterministic PDAs only. */
  skipProgramAccountsScan?: boolean;
}): Promise<PublicKey[]> {
  const cacheKey = voucherCacheKey(params.programId, params.user);
  const cached = consumedVoucherCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return [...cached.pubkeys];
  }

  let work = consumedVoucherInFlight.get(cacheKey);
  if (!work) {
    work = fetchConsumedRedistributionClaimPubkeysUncached({
      ...params,
      fastProbe: params.skipProgramAccountsScan === true,
    })
      .then((pubkeys) => {
        if (pubkeys.length > 0) {
          consumedVoucherCache.set(cacheKey, {
            pubkeys,
            expiresAt: Date.now() + VOUCHER_CACHE_TTL_MS,
          });
        }
        return pubkeys;
      })
      .finally(() => {
        consumedVoucherInFlight.delete(cacheKey);
      });
    consumedVoucherInFlight.set(cacheKey, work);
  }

  const maxWaitMs = params.maxWaitMs ?? 8_000;
  const result = await Promise.race([
    work,
    sleepMs(maxWaitMs).then(() => null as PublicKey[] | null),
  ]);
  if (result != null) return result;
  return cached?.pubkeys ?? [];
}

/** Counts consumed redistribution vouchers for user (fallback when participant counter lags). */
export async function countConsumedRedistributionClaimsForUser(params: {
  connection: Pick<Connection, "getProgramAccounts" | "getAccountInfo" | "getMultipleAccountsInfo">;
  programId: PublicKey;
  user: PublicKey;
  redistributionCycleStartEpoch?: number;
  skipProgramAccountsScan?: boolean;
}): Promise<number> {
  const pubkeys = await fetchConsumedRedistributionClaimPubkeys(params);
  return pubkeys.length;
}

/** Browser-safe LE readers — Next/web3 often gives Uint8Array without Buffer methods. */
function readI64Le(bytes: Uint8Array, offset: number): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getBigInt64(0, true);
}

function readU64Le(bytes: Uint8Array, offset: number): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

function asUint8Array(data: Buffer | Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

export function decodePendingRedistributionClaimRaw(
  address: PublicKey,
  data: Buffer | Uint8Array,
  fallbackCycleStart: number
): DecodedPendingRedistributionRaw | null {
  // [8 disc][32 mint][32 source][32 user][8 cycle][8 amount][8 prepared][1 consumed][1 bump]
  const bytes = asUint8Array(data);
  if (!bytes || bytes.length < 130) return null;
  const cycleStartEpoch = Number(readI64Le(bytes, 104));
  const amount = readU64Le(bytes, 112);
  const preparedAt = readI64Le(bytes, 120);
  const consumed = bytes[128] !== 0;
  return {
    address,
    amount,
    consumed,
    preparedAt,
    cycleStartEpoch: Number.isFinite(cycleStartEpoch)
      ? cycleStartEpoch
      : fallbackCycleStart,
  };
}
