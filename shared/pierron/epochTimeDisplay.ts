import { SECONDS_PER_EPOCH } from "./tokenomicsConstants.ts";

export function secondsUntilOnChainEpochEnd(params: {
  now: number;
  epochStartTime: number;
  secondsPerEpoch: number;
}): number {
  const { now, epochStartTime, secondsPerEpoch } = params;
  if (epochStartTime <= 0 || secondsPerEpoch <= 0) return Number.NaN;
  return params.epochStartTime + secondsPerEpoch - now;
}

export function isOnChainEpochOverdue(params: {
  now: number;
  epochStartTime: number;
  secondsPerEpoch: number;
  graceSecs?: number;
}): boolean {
  const left = secondsUntilOnChainEpochEnd(params);
  if (!Number.isFinite(left)) return false;
  const grace = params.graceSecs ?? 0;
  return left + grace < 0;
}

export function onChainEpochOverdueSeconds(params: {
  now: number;
  epochStartTime: number;
  secondsPerEpoch: number;
}): number {
  const left = secondsUntilOnChainEpochEnd(params);
  if (!Number.isFinite(left)) return 0;
  return Math.max(0, -left);
}

/** Wall-clock epoch minus on-chain `current_epoch` (live, for UI lag display). */
export function estimateLiveEpochSyncLag(params: {
  currentEpoch: number;
  genesisEpochTimestamp: number;
  now?: number;
  secondsPerEpoch?: number;
}): number {
  const { currentEpoch, genesisEpochTimestamp } = params;
  if (genesisEpochTimestamp <= 0 || currentEpoch < 0) return 0;
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const secondsPerEpoch = params.secondsPerEpoch ?? SECONDS_PER_EPOCH;
  const effectiveEpoch = Math.floor(
    Math.max(0, now - genesisEpochTimestamp) / secondsPerEpoch
  );
  return Math.max(0, effectiveEpoch - currentEpoch);
}
