'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

import type { EpochMarker } from '../../../shared/pierron/ecosystemCycle.ts';
import {
  nextLotteryDrawEpochInCycle,
  resolveEcosystemEpochViews,
} from '../../../shared/pierron/ecosystemCycle.ts';
import { inferSecondsPerEpoch, SECONDS_PER_EPOCH } from '../../../shared/pierron/tokenomicsConstants';
import {
  estimateLiveEpochSyncLag,
  onChainEpochOverdueSeconds,
  secondsUntilOnChainEpochEnd,
} from '../../../shared/pierron/epochTimeDisplay.ts';
import type { TradeBookParticipantSnapshot } from '../../../shared/pierron/tradeBookParticipant.ts';
import { useTranslations } from '../context/LocaleContext';
import { formatMessage } from '../lib/formatMessage';
import { usePierronProgram } from '../lib/anchor';
import { pierronDevnet } from '../lib/pierronDevnet';
import { loadEcosystemSnapshot } from '../lib/ecosystem/loadEcosystemSnapshot';
import {
  EMPTY_DEFLATION_SNAPSHOT,
  EMPTY_ECOSYSTEM_SNAPSHOT,
  type DeflationSnapshot,
  type EcosystemSnapshot,
} from '../lib/ecosystem/types';

const ECOSYSTEM_AUTO_REFRESH_MS = 30_000;

export type LiveEpochUi = {
  protocolEpoch: number;
  liveProtocolEpoch: number;
  displayEpoch: number;
  epochTimeLeft: string;
  completedEpochsInLoyaltyCycle: number;
  loyaltyCycleWindowCompleted: boolean;
  redistributionSettlementIn: string;
  loyaltyDrawIn: string;
  lotteryDrawOverdue: boolean;
};

function formatDuration(seconds: number, lessThanMin: string): string {
  const sec = Math.max(0, Math.floor(seconds));
  if (sec <= 0) return lessThanMin;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function useEcosystemSnapshot() {
  const t = useTranslations();
  const { connection } = useConnection();
  const { publicKey: wallet } = useWallet();
  const { program, idlError, idlLoading, programReady } = usePierronProgram();

  const [snapshot, setSnapshot] = useState<EcosystemSnapshot>(EMPTY_ECOSYSTEM_SNAPSHOT);
  const [deflation, setDeflation] = useState<DeflationSnapshot>(EMPTY_DEFLATION_SNAPSHOT);
  const [participant, setParticipant] = useState<TradeBookParticipantSnapshot | null>(null);
  const [liveRedistributionMarkers, setLiveRedistributionMarkers] = useState<EpochMarker[]>([]);
  const [claimRedistributionMarkers, setClaimRedistributionMarkers] = useState<EpochMarker[] | null>(
    null
  );
  const [redistributionQualLines, setRedistributionQualLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallClockTick, setWallClockTick] = useState(0);
  const [tabVisible, setTabVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  const loadInFlightRef = useRef(false);
  const loadQueuedRef = useRef(false);

  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setWallClockTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const doLoad = useCallback(async () => {
    if (!program) return;
    if (loadInFlightRef.current) {
      loadQueuedRef.current = true;
      return;
    }
    loadInFlightRef.current = true;
    try {
      const result = await loadEcosystemSnapshot({
        connection,
        program,
        wallet: wallet ?? null,
        cluster: 'devnet',
        tokenMint: pierronDevnet.tokenMint,
        programId: pierronDevnet.pierronProgramId,
        t,
      });
      setSnapshot(result.snapshot);
      setDeflation(result.deflation);
      setParticipant(result.participant);
      setLiveRedistributionMarkers(result.liveRedistributionMarkers);
      setClaimRedistributionMarkers(result.claimRedistributionMarkers);
      setRedistributionQualLines(result.redistributionQualLines);
      setError(null);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
      if (loadQueuedRef.current) {
        loadQueuedRef.current = false;
        void doLoad();
      }
    }
  }, [connection, program, wallet, t]);

  useEffect(() => {
    if (idlLoading) {
      setLoading(true);
      return;
    }
    if (idlError && !program) {
      setLoading(false);
      setError((prev) => prev ?? `IDL: ${idlError}`);
      return;
    }
    if (!program) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void doLoad();
  }, [program, idlLoading, idlError, doLoad]);

  useEffect(() => {
    if (!tabVisible || !program) return;
    const id = setInterval(() => {
      void doLoad();
    }, ECOSYSTEM_AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [tabVisible, program, doLoad]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await doLoad();
  }, [doLoad]);

  const liveEpochUi = useMemo((): LiveEpochUi => {
    void wallClockTick;
    const genesis = snapshot.genesisEpochTimestamp;
    if (genesis <= 0) {
      return {
        protocolEpoch: snapshot.currentEpoch,
        liveProtocolEpoch: snapshot.currentEpoch,
        displayEpoch: snapshot.displayEpoch,
        epochTimeLeft: snapshot.epochTimeLeft,
        completedEpochsInLoyaltyCycle: snapshot.completedEpochsInLoyaltyCycle,
        loyaltyCycleWindowCompleted: snapshot.loyaltyCycleWindowCompleted,
        redistributionSettlementIn: snapshot.redistributionSettlementIn,
        loyaltyDrawIn: snapshot.loyaltyDrawIn,
        lotteryDrawOverdue: snapshot.lotteryDrawOverdue,
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const elapsed = Math.max(0, now - genesis);
    const onChainEpoch = snapshot.currentEpoch;
    const secondsPerEpoch = inferSecondsPerEpoch({
      currentEpoch: onChainEpoch,
      epochStartTime: snapshot.epochStartTime,
      genesisEpochTimestamp: genesis,
      fallback: SECONDS_PER_EPOCH,
    });
    const liveLag = estimateLiveEpochSyncLag({
      currentEpoch: onChainEpoch,
      genesisEpochTimestamp: genesis,
      now,
      secondsPerEpoch,
    });
    const liveProtocolEpoch = onChainEpoch + liveLag;
    const epochViews = resolveEcosystemEpochViews({
      currentEpoch: onChainEpoch,
      protocolEpoch: onChainEpoch,
      effectiveEpoch: liveProtocolEpoch,
      redistributionCycleStartEpoch: snapshot.redistributionCycleStartEpoch,
      lotteryDrawEpoch: snapshot.lotteryDrawEpoch,
      lotteryTicketCycleStart: snapshot.lotteryTicketCycleStart,
      lotteryDrawn: snapshot.lotteryDrawn,
      lotteryPaid: snapshot.lotteryPaid,
      activityCycleEpoch: participant?.activityCycleEpoch ?? -1,
      totalTickets: snapshot.globalTotalTickets,
    });
    const displayEpoch = epochViews.redistributionEpochInCycle;
    const completedEpochsInLoyaltyCycle = epochViews.lotteryClock.epochInCycle;
    const lotteryDrawOverdue =
      epochViews.lotteryClock.drawOverdue && !snapshot.lotteryInsufficientTickets;
    const loyaltyDrawIn = epochViews.lotteryClock.staleDrawPayoutPending
      ? epochViews.lotteryClock.drawOverdue
        ? t.ecosystem.lotteryDrawPending
        : formatMessage(t.ecosystem.lotteryNextDrawEpoch, {
            n: nextLotteryDrawEpochInCycle(displayEpoch),
          })
      : snapshot.lotteryAwaitingDrawMarker
        ? formatMessage(t.ecosystem.lotteryNextDrawEpoch, {
            n: snapshot.lotteryScheduledDrawMarkerInCycle,
          })
        : epochViews.lotteryClock.drawPendingPayout
          ? t.ecosystem.lotteryPayoutPending
          : lotteryDrawOverdue
            ? t.ecosystem.lotteryDrawPending
            : formatMessage(t.ecosystem.lotteryNextDrawEpoch, {
                n: nextLotteryDrawEpochInCycle(displayEpoch),
              });

    const onChainLeft = secondsUntilOnChainEpochEnd({
      now,
      epochStartTime: snapshot.epochStartTime,
      secondsPerEpoch,
    });
    const onChainOverdue = onChainEpochOverdueSeconds({
      now,
      epochStartTime: snapshot.epochStartTime,
      secondsPerEpoch,
    });
    let epochTimeLeft = snapshot.epochTimeLeft;
    if (liveLag <= 1 && onChainOverdue <= 0 && Number.isFinite(onChainLeft) && onChainLeft > 0) {
      epochTimeLeft = formatDuration(onChainLeft, t.common.mniejNizMin);
    } else if (liveLag > 0 || onChainOverdue > 0) {
      epochTimeLeft =
        onChainOverdue > 0
          ? formatMessage(t.ecosystem.epochOnChainOverdue, {
              duration: formatDuration(onChainOverdue, t.common.mniejNizMin),
            })
          : formatMessage(t.ecosystem.epochKeeperLag, { n: liveLag });
    }

    return {
      protocolEpoch: onChainEpoch,
      liveProtocolEpoch,
      displayEpoch,
      epochTimeLeft,
      completedEpochsInLoyaltyCycle,
      loyaltyCycleWindowCompleted: snapshot.loyaltyCycleWindowCompleted,
      redistributionSettlementIn: snapshot.cycleCompleteOnChain
        ? t.ecosystem.redistributionSettlementNow
        : displayEpoch >= snapshot.redistributionCycleLength
          ? t.ecosystem.redistributionSettlementAfterRollover
          : formatMessage(t.common.zaEpok, {
              n: snapshot.redistributionCycleLength - displayEpoch,
            }),
      loyaltyDrawIn,
      lotteryDrawOverdue,
    };
  }, [wallClockTick, snapshot, participant, t]);

  return {
    snapshot,
    deflation,
    participant,
    liveRedistributionMarkers,
    claimRedistributionMarkers,
    redistributionQualLines,
    liveEpochUi,
    loading: idlLoading || loading,
    refreshing,
    error: error ?? (idlError ? `IDL: ${idlError}` : null),
    idlLoading,
    programReady,
    refresh,
    wallet,
  };
}
