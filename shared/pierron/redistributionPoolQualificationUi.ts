import type { TradeBookParticipantSnapshot } from "./tradeBookParticipant.ts";
import {
  accountAgeSecondsAtRollover,
  evaluateRedistributionPoolQualification,
} from "./redistributionPoolQualification.ts";
import { participantCycleIndex } from "./ecosystemCycle.ts";
import {
  MIN_ACCOUNT_AGE_SECONDS,
  REDISTRIBUTION_CYCLE_EPOCHS,
} from "./tokenomicsConstants.ts";

export function formatRedistributionPoolQualificationLines(params: {
  participant: TradeBookParticipantSnapshot | null;
  tokenBalance: bigint;
  blockReason?: string;
  protocolCycleIndex?: number;
  accounting?: {
    genesisEpochTimestamp?: number;
    redistributionCycleStartEpoch: number;
    redistributionShare: bigint;
    redistributionPoolPrevious: bigint;
    redistributionClaimedFromPrevious: bigint;
    eligibleUsersPreviousCycle: number;
  };
  labels: {
    activityOk: string;
    activityMissing: string;
    balanceOk: string;
    balanceMissing: string;
    ageOk: string;
    ageMissing: string;
    ageAtRolloverOk: string;
    ageAtRolloverMissing: string;
    poolZeroAtRollover: string;
    poolAlreadyClaimed: string;
    eligibleUsersAtRollover: string;
    pastCycleClaimMissed?: string;
  };
}): string[] {
  const participant = params.participant;
  const accountCreatedAt =
    participant?.createdAt ??
    participant?.initializedAt ??
    0;
  const q = evaluateRedistributionPoolQualification({
    participant,
    tokenBalance: params.tokenBalance,
    accountCreatedAt,
  });

  const lines: string[] = [];
  lines.push(
    q.activityMet ? params.labels.activityOk : params.labels.activityMissing
  );
  lines.push(q.balanceMet ? params.labels.balanceOk : params.labels.balanceMissing);
  // Age gate disabled when MIN_ACCOUNT_AGE_SECONDS <= 0 — omit misleading 24h lines.
  if (MIN_ACCOUNT_AGE_SECONDS > 0) {
    lines.push(q.accountAgeMet ? params.labels.ageOk : params.labels.ageMissing);
  }

  const accounting = params.accounting;
  const activityCycleEpoch =
    participant != null && (participant.unclaimedRedistributionCycleStart ?? -1) >= 0
      ? participant.unclaimedRedistributionCycleStart
      : participant?.activityCycleEpoch ?? -1;
  const userActivityCycle = participantCycleIndex(activityCycleEpoch);
  const claimRolloverCycleStartEpoch =
    activityCycleEpoch >= 0
      ? activityCycleEpoch + REDISTRIBUTION_CYCLE_EPOCHS
      : accounting?.redistributionCycleStartEpoch ?? -1;
  const inImmediateClaimWindow =
    params.protocolCycleIndex != null &&
    userActivityCycle >= 0 &&
    userActivityCycle === params.protocolCycleIndex - 1;
  const pastCycleClaimMissed = params.blockReason === "past_cycle_claim_missed";

  if (
    MIN_ACCOUNT_AGE_SECONDS > 0 &&
    accounting &&
    accountCreatedAt > 0 &&
    accounting.genesisEpochTimestamp &&
    claimRolloverCycleStartEpoch >= 0 &&
    !pastCycleClaimMissed
  ) {
    const ageAtRollover = accountAgeSecondsAtRollover({
      accountCreatedAt,
      genesisEpochTimestamp: accounting.genesisEpochTimestamp,
      redistributionCycleStartEpoch: claimRolloverCycleStartEpoch,
    });
    const ageAtRolloverMet = ageAtRollover >= MIN_ACCOUNT_AGE_SECONDS;
    lines.push(
      ageAtRolloverMet
        ? params.labels.ageAtRolloverOk
        : params.labels.ageAtRolloverMissing.replace(
            "{hours}",
            (ageAtRollover / 3600).toFixed(1)
          )
    );
  }

  if (pastCycleClaimMissed && params.labels.pastCycleClaimMissed) {
    lines.push(params.labels.pastCycleClaimMissed);
    return lines;
  }

  if (!accounting || !q.activityMet) {
    return lines;
  }

  const remaining =
    accounting.redistributionPoolPrevious > accounting.redistributionClaimedFromPrevious
      ? accounting.redistributionPoolPrevious - accounting.redistributionClaimedFromPrevious
      : 0n;
  const poolExhausted =
    accounting.redistributionPoolPrevious > 0n &&
    remaining <= 0n &&
    accounting.redistributionClaimedFromPrevious > 0n;

  if (
    (params.blockReason === "pool_already_claimed" || poolExhausted) &&
    inImmediateClaimWindow
  ) {
    lines.push(params.labels.poolAlreadyClaimed);
    if (accounting.eligibleUsersPreviousCycle > 0) {
      lines.push(
        params.labels.eligibleUsersAtRollover.replace(
          "{n}",
          String(accounting.eligibleUsersPreviousCycle)
        )
      );
    }
    return lines;
  }

  if (
    inImmediateClaimWindow &&
    accounting.redistributionShare <= 0n &&
    accounting.eligibleUsersPreviousCycle <= 0
  ) {
    lines.push(params.labels.poolZeroAtRollover);
  }

  return lines;
}
