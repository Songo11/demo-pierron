import type { TradeBookParticipantSnapshot } from "./tradeBookParticipant.ts";
import { effectiveRedistributionActiveEpochs } from "./redistributionClaimEligibility.ts";
import {
  MIN_ACCOUNT_AGE_SECONDS,
  MIN_ACTIVE_EPOCHS,
  MIN_BALANCE_FOR_REDISTRIBUTION,
  MIN_EPOCH_VOLUME_FOR_REDISTRIBUTION,
  SECONDS_PER_EPOCH,
} from "./tokenomicsConstants.ts";

/** Unix time when the current redistribution cycle started (rollover of the previous cycle). */
export function redistributionCycleRolloverTimestamp(params: {
  genesisEpochTimestamp: number;
  redistributionCycleStartEpoch: number;
}): number {
  if (params.genesisEpochTimestamp <= 0 || params.redistributionCycleStartEpoch < 0) {
    return 0;
  }
  return (
    params.genesisEpochTimestamp +
    params.redistributionCycleStartEpoch * SECONDS_PER_EPOCH
  );
}

/** Account age in seconds at the last cycle rollover (when pool share is fixed). */
export function accountAgeSecondsAtRollover(params: {
  accountCreatedAt: number;
  genesisEpochTimestamp: number;
  redistributionCycleStartEpoch: number;
}): number {
  const rollover = redistributionCycleRolloverTimestamp(params);
  if (rollover <= 0 || params.accountCreatedAt <= 0) return 0;
  return Math.max(0, rollover - params.accountCreatedAt);
}

export type RedistributionPoolQualification = {
  /** Met for pool split at last swap / rollover (MIN_ACTIVE_EPOCHS epoch squares). */
  activityMet: boolean;
  balanceMet: boolean;
  accountAgeMet: boolean;
  /** Legacy per-epoch volume gate (removed on-chain; kept for UI transparency). */
  peakEpochVolumeMet: boolean;
  /** Would qualify for pool split with current on-chain rules. */
  poolQualified: boolean;
  accountAgeSeconds: number;
  tokenBalance: bigint;
  peakEpochVolumeBase: bigint;
  activeEpochsCount: number;
  unmetReasons: string[];
};

export function evaluateRedistributionPoolQualification(params: {
  now?: number;
  participant: TradeBookParticipantSnapshot | null;
  tokenBalance?: bigint;
  /** Trade-book `initializedAt` / `createdAt` (seconds). */
  accountCreatedAt?: number;
}): RedistributionPoolQualification {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const participant = params.participant;
  const tokenBalance = params.tokenBalance ?? 0n;
  const createdAt =
    params.accountCreatedAt ??
    (participant?.lastActivity && participant.lastActivity > 0
      ? participant.lastActivity
      : 0);

  if (!participant) {
    return {
      activityMet: false,
      balanceMet: false,
      accountAgeMet: false,
      peakEpochVolumeMet: false,
      poolQualified: false,
      accountAgeSeconds: 0,
      tokenBalance,
      peakEpochVolumeBase: 0n,
      activeEpochsCount: 0,
      unmetReasons: ["no_participant"],
    };
  }

  const accountAgeSeconds = createdAt > 0 ? Math.max(0, now - createdAt) : 0;
  const peakEpochVolumeBase = BigInt(participant.epochVolume ?? 0);
  const activeEpochsCount = effectiveRedistributionActiveEpochs(participant);

  const activityMet = activeEpochsCount >= MIN_ACTIVE_EPOCHS;
  const balanceMet = tokenBalance >= MIN_BALANCE_FOR_REDISTRIBUTION;
  const accountAgeMet = accountAgeSeconds >= MIN_ACCOUNT_AGE_SECONDS;
  const peakEpochVolumeMet = peakEpochVolumeBase >= MIN_EPOCH_VOLUME_FOR_REDISTRIBUTION;
  const poolQualified = activityMet && balanceMet && accountAgeMet;

  const unmetReasons: string[] = [];
  if (!activityMet) unmetReasons.push("activity");
  if (!balanceMet) unmetReasons.push("balance");
  if (!accountAgeMet) unmetReasons.push("account_age");

  return {
    activityMet,
    balanceMet,
    accountAgeMet,
    peakEpochVolumeMet,
    poolQualified,
    accountAgeSeconds,
    tokenBalance,
    peakEpochVolumeBase,
    activeEpochsCount,
    unmetReasons,
  };
}
