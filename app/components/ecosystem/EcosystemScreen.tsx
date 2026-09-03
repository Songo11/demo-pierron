'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, type Transaction } from '@solana/web3.js';
import dynamic from 'next/dynamic';

import ActivityMarkerGrid from '../ActivityMarkerGrid';
import CollapsibleSection from '../CollapsibleSection';
import { useTranslations } from '../../context/LocaleContext';
import { useEcosystemSnapshot } from '../../hooks/useEcosystemSnapshot';
import { usePierronProgram } from '../../lib/anchor';
import {
  mapClaimBlockReasonToMessage,
  mapLotteryClaimBlockReasonToMessage,
} from '../../lib/ecosystem/claimBlockMessages';
import { formatTokenomicsUiLabel } from '../../lib/ecosystem/deflationSnapshot';
import { formatMessage } from '../../lib/formatMessage';
import { POST_ROLLOVER_DELAY_SECS } from '../../shared/pierron/redistributionClaimEligibility.ts';

const EcosystemMeteoraPoolCard = dynamic(() => import('./EcosystemMeteoraPoolCard'), {
  ssr: false,
  loading: () => (
    <div className="pierron-ecosystem-span-2">
      <p className="pierron-helper">…</p>
    </div>
  ),
});

function shortenAddress(addr: string, head = 8, tail = 6) {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export default function EcosystemScreen() {
  const t = useTranslations();
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { program } = usePierronProgram();
  const {
    snapshot,
    deflation,
    participant,
    liveRedistributionMarkers,
    claimRedistributionMarkers,
    redistributionQualLines,
    liveEpochUi,
    loading,
    refreshing,
    error,
    idlLoading,
    programReady,
    refresh,
    wallet,
  } = useEcosystemSnapshot();

  const [lotteryClaiming, setLotteryClaiming] = useState(false);
  const [lotteryClaimStatus, setLotteryClaimStatus] = useState<string | null>(null);
  // Mobile Chrome: Photon prepare runs in the background so one tap only opens the wallet.
  const [lotteryPreparedClaim, setLotteryPreparedClaim] = useState<{
    transactions: Transaction[];
    payoutHint: bigint;
    lotteryDrawEpoch: number;
  } | null>(null);
  const [lotteryBackgroundPreparing, setLotteryBackgroundPreparing] = useState(false);
  const lotteryPrepareGenerationRef = useRef(0);
  /** Avoid re-running failed silent prepares in a loop for the same draw. */
  const lotterySilentPrepareKeyRef = useRef<string | null>(null);
  const [redistributionClaiming, setRedistributionClaiming] = useState(false);
  const [redistributionClaimStatus, setRedistributionClaimStatus] = useState<string | null>(
    null
  );
  const [nowSecs, setNowSecs] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(() => setNowSecs(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  const redistributionProgressPercent = useMemo(() => {
    return Math.max(
      0,
      Math.min(100, (liveEpochUi.displayEpoch / snapshot.redistributionCycleLength) * 100)
    );
  }, [liveEpochUi.displayEpoch, snapshot.redistributionCycleLength]);

  const loyaltyProgressPercent = useMemo(() => {
    if (snapshot.lotteryClaimUiPriority) return 100;
    return Math.max(
      0,
      Math.min(
        100,
        (liveEpochUi.completedEpochsInLoyaltyCycle / snapshot.loyaltyCycleLength) * 100
      )
    );
  }, [
    liveEpochUi.completedEpochsInLoyaltyCycle,
    snapshot.loyaltyCycleLength,
    snapshot.lotteryClaimUiPriority,
  ]);

  const showRedistributionClaimPanel =
    snapshot.claimBlockReason !== 'stale_redistribution_claim' &&
    snapshot.claimBlockReason !== 'already_claimed' &&
    (snapshot.redistributionPastCycleClaimWindow ||
      snapshot.showClaimButton ||
      snapshot.hasPendingVoucher);

  // Live countdown (same 180s post-epoch-start gate as on-chain / mobile).
  // Pending settle-only voucher skips TooEarly — do not gray/yellow-lock the button.
  const redistributionRolloverDelayRemainingSecs = useMemo(() => {
    if (snapshot.hasPendingVoucher) return 0;
    if (!snapshot.showClaimButton) return 0;
    if (snapshot.epochStartTime > 0) {
      return Math.max(0, snapshot.epochStartTime + POST_ROLLOVER_DELAY_SECS - nowSecs);
    }
    return snapshot.claimBlockReason === 'too_early_after_rollover'
      ? Math.max(0, snapshot.claimOpensInSecs)
      : 0;
  }, [
    nowSecs,
    snapshot.claimBlockReason,
    snapshot.claimOpensInSecs,
    snapshot.epochStartTime,
    snapshot.hasPendingVoucher,
    snapshot.showClaimButton,
  ]);

  const showLotteryClaimPanel =
    !snapshot.lotteryClaimedByConsumedVoucher &&
    snapshot.lotteryClaimBlockReason !== 'already_paid' &&
    snapshot.lotteryClaimBlockReason !== 'stale_payout' &&
    snapshot.lotteryClaimBlockReason !== 'awaiting_keeper_draw' &&
    snapshot.lotteryClaimBlockReason !== 'awaiting_keeper_commits' &&
    snapshot.lotteryUserHasStake &&
    snapshot.showLotteryClaimButton &&
    (snapshot.lotteryDrawn ||
      snapshot.hasPendingLotteryVoucher ||
      snapshot.lotteryClaimLatchActive);

  const lotteryClaimButtonEnabled =
    snapshot.showLotteryClaimButton && snapshot.canExecuteLotteryClaim;

  useEffect(() => {
    if (
      lotteryPreparedClaim &&
      lotteryPreparedClaim.lotteryDrawEpoch !== snapshot.lotteryDrawEpoch
    ) {
      lotteryPrepareGenerationRef.current += 1;
      lotterySilentPrepareKeyRef.current = null;
      setLotteryPreparedClaim(null);
      setLotteryClaimStatus(null);
      setLotteryBackgroundPreparing(false);
    }
  }, [lotteryPreparedClaim, snapshot.lotteryDrawEpoch]);

  // Mobile: silently build Light proof while claim panel is ready — claim tap only signs.
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
    if (!lotteryClaimButtonEnabled || lotteryClaiming || lotteryBackgroundPreparing) return;
    if (!publicKey || !signTransaction || !program) return;
    if (
      lotteryPreparedClaim &&
      lotteryPreparedClaim.lotteryDrawEpoch === snapshot.lotteryDrawEpoch
    ) {
      return;
    }

    const attemptKey = `${publicKey.toBase58()}:${snapshot.lotteryDrawEpoch}`;
    if (lotterySilentPrepareKeyRef.current === attemptKey) return;
    lotterySilentPrepareKeyRef.current = attemptKey;

    const generation = ++lotteryPrepareGenerationRef.current;
    const wallet = {
      publicKey,
      signTransaction: signTransaction as (tx: Transaction) => Promise<Transaction>,
      signAllTransactions: signAllTransactions as
        | ((txs: Transaction[]) => Promise<Transaction[]>)
        | undefined,
    };

    setLotteryBackgroundPreparing(true);
    setLotteryClaimStatus(t.ecosystem.claimLotteryPreparing);

    void (async () => {
      try {
        const { prepareLotteryClaimWeb } = await import('../../lib/lotteryClaimWeb');
        const prepared = await prepareLotteryClaimWeb({
          connection,
          wallet,
          program,
          participant,
          lotteryDrawEpoch: snapshot.lotteryDrawEpoch,
          allowWalletSigning: false,
          onStage: (msg) => {
            if (lotteryPrepareGenerationRef.current === generation) {
              setLotteryClaimStatus(msg);
            }
          },
        });
        if (lotteryPrepareGenerationRef.current !== generation) return;
        setLotteryPreparedClaim(prepared);
        setLotteryClaimStatus(null);
      } catch {
        if (lotteryPrepareGenerationRef.current !== generation) return;
        // Soft-fail / Light sync: interactive claim on button press (no retry loop).
        setLotteryPreparedClaim(null);
        setLotteryClaimStatus(null);
      } finally {
        if (lotteryPrepareGenerationRef.current === generation) {
          setLotteryBackgroundPreparing(false);
        }
      }
    })();
  }, [
    connection,
    lotteryBackgroundPreparing,
    lotteryClaimButtonEnabled,
    lotteryClaiming,
    lotteryPreparedClaim,
    participant,
    program,
    publicKey,
    signAllTransactions,
    signTransaction,
    snapshot.lotteryDrawEpoch,
    t.ecosystem.claimLotteryPreparing,
  ]);

  const redistributionHasPayoutEstimate =
    snapshot.estimatedNetPayoutUi !== '—' && snapshot.estimatedNetPayoutUi !== '0';
  // Ready (accent): pending settle-only always; otherwise after delay + executable/payout.
  const redistributionClaimReadyVisual =
    !redistributionClaiming &&
    (snapshot.hasPendingVoucher
      ? true
      : snapshot.showClaimButton &&
        redistributionRolloverDelayRemainingSecs <= 0 &&
        (snapshot.canExecuteClaim ||
          ((snapshot.claimBlockReason === 'too_early_after_rollover' ||
            snapshot.claimBlockReason == null) &&
            redistributionHasPayoutEstimate)));
  const redistributionClaimTapEnabled =
    !redistributionClaiming &&
    (snapshot.hasPendingVoucher ||
      (snapshot.showClaimButton &&
        (snapshot.canExecuteClaim || redistributionRolloverDelayRemainingSecs > 0)));

  const lotteryProtocolBox = useMemo(() => {
    if (snapshot.lotteryInsufficientTickets) {
      return {
        title: t.ecosystem.lotteryInsufficientTicketsTitle,
        lines: [
          `${liveEpochUi.completedEpochsInLoyaltyCycle} / ${snapshot.loyaltyCycleLength} ${t.ecosystem.epochs} · ${t.ecosystem.globalLotteryTickets}: ${snapshot.globalTotalTickets} (min. ${snapshot.minTicketsForDraw})`,
          t.ecosystem.lotteryInsufficientTicketsHint,
        ],
      };
    }
    if (snapshot.lotteryAwaitingClaimMarker && !snapshot.lotteryClaimUiPriority) {
      return {
        title: formatMessage(t.ecosystem.lotteryClaimOpensAtMarker, {
          marker: snapshot.lotteryDrawMarkerEpochInCycle,
        }),
        lines: [
          formatMessage(t.ecosystem.lotteryDrawAwaitingClaimMarker, {
            marker: snapshot.lotteryDrawMarkerEpochInCycle,
            poolStart: snapshot.lotteryDrawPoolWindowStart,
          }),
        ],
      };
    }
    if (snapshot.lotteryStaleDrawPayoutPending && !snapshot.lotteryClaimUiPriority) {
      return {
        title: t.ecosystem.lotteryDrawPending,
        lines: [t.ecosystem.lotteryStalePayoutKeeperHint],
      };
    }
    if (
      !snapshot.lotteryClaimUiPriority &&
      (snapshot.lotteryProtocolKeeperPending ||
        snapshot.lotteryAwaitingKeeperCommits ||
        snapshot.lotteryAwaitingKeeperDraw ||
        (snapshot.lotteryStaleDrawPayoutPending && snapshot.lotteryDrawOverdue))
    ) {
      const lines: string[] = [];
      if (snapshot.lotteryKeeperBacklog) {
        lines.push(
          formatMessage(t.ecosystem.lotteryKeeperBacklogLiveWindow, {
            current: liveEpochUi.completedEpochsInLoyaltyCycle,
            total: snapshot.loyaltyCycleLength,
          }),
          formatMessage(t.ecosystem.lotteryKeeperBacklogHint, {
            start: snapshot.lotteryPendingWindowStart,
            end: snapshot.lotteryPendingWindowEnd,
            marker: snapshot.lotteryPendingDrawMarkerInCycle,
          })
        );
      } else {
        lines.push(
          `${liveEpochUi.completedEpochsInLoyaltyCycle} / ${snapshot.loyaltyCycleLength} ${t.ecosystem.epochs} — ${
            snapshot.lotteryAwaitingKeeperCommits
              ? t.ecosystem.lotteryCommitsPending
              : t.ecosystem.lotteryDrawPending
          }`
        );
      }
      if (snapshot.lotteryAwaitingKeeperCommits) {
        lines.push(
          formatMessage(t.ecosystem.lotteryCommitsProgress, {
            current: snapshot.lotteryCommitCount,
            required: snapshot.lotteryMinCommits,
          })
        );
      }
      lines.push(
        snapshot.lotteryStaleDrawPayoutPending && snapshot.lotteryDrawOverdue
          ? t.ecosystem.lotteryStalePayoutKeeperHint
          : snapshot.lotteryAwaitingKeeperCommits
            ? t.ecosystem.lotteryCommitsPendingHint
            : snapshot.lotteryKeeperBacklog
              ? t.ecosystem.lotteryKeeperBacklogDrawHint
              : snapshot.lotteryCommitCount >= snapshot.lotteryMinCommits
                ? formatMessage(t.ecosystem.lotteryDrawPendingWindowHint, {
                    start: snapshot.lotteryPendingWindowStart,
                    end: snapshot.lotteryPendingWindowEnd,
                    marker: snapshot.lotteryPendingDrawMarkerInCycle,
                  })
                : t.ecosystem.lotteryCommitsPendingHint
      );
      if (snapshot.lotteryEpochsOverdue > 0) {
        lines.push(
          formatMessage(t.ecosystem.lotteryOverdueEpochs, {
            n: snapshot.lotteryEpochsOverdue,
            start: snapshot.lotteryPendingWindowStart,
            end: snapshot.lotteryPendingWindowEnd,
          })
        );
      }
      if (!snapshot.showLotteryClaimButton) {
        lines.push(
          formatMessage(t.ecosystem.lotteryTicketsWaitingDraw, {
            n: snapshot.ticketsCurrentCycle,
          })
        );
      }
      return {
        title: snapshot.lotteryAwaitingKeeperCommits
          ? t.ecosystem.lotteryCommitsPending
          : t.ecosystem.lotteryDrawPending,
        lines,
      };
    }
    return {
      title: t.ecosystem.lotteryProtocolStatusTitle,
      lines: [
        t.ecosystem.lotteryProtocolIdle,
        `${t.ecosystem.nextDraw}: ${liveEpochUi.loyaltyDrawIn}`,
      ],
    };
  }, [liveEpochUi.completedEpochsInLoyaltyCycle, liveEpochUi.loyaltyDrawIn, snapshot, t.ecosystem]);

  const handleClaimRedistribution = useCallback(() => {
    if (!redistributionClaimTapEnabled) {
      if (snapshot.showClaimButton && !snapshot.canExecuteClaim) {
        alert(mapClaimBlockReasonToMessage(snapshot.claimBlockReason, t.ecosystem));
      }
      return;
    }

    if (!publicKey || !signTransaction || !program) {
      alert(t.ecosystem.claimRedistributionGenericError);
      return;
    }

    void (async () => {
      setRedistributionClaiming(true);
      setRedistributionClaimStatus(
        snapshot.hasPendingVoucher
          ? t.ecosystem.claimRedistributionFinish
          : t.ecosystem.claimRedistributionPreparing
      );
      try {
        const { runRedistributionClaimWeb, mapRedistributionClaimErrorMessage } = await import(
          '../../lib/redistributionClaimWeb'
        );
        const pendingSnap = snapshot.pendingRedistributionVoucher;
        const pendingVoucher = pendingSnap
          ? {
              address: new PublicKey(pendingSnap.address),
              amount: BigInt(pendingSnap.amount),
              cycleStartEpoch: pendingSnap.cycleStartEpoch,
              preparedAt: pendingSnap.preparedAt,
              consumed: pendingSnap.consumed,
            }
          : null;
        const result = await runRedistributionClaimWeb({
          connection,
          wallet: {
            publicKey,
            signTransaction: signTransaction as (
              tx: Transaction
            ) => Promise<Transaction>,
            signAllTransactions: signAllTransactions as
              | ((txs: Transaction[]) => Promise<Transaction[]>)
              | undefined,
          },
          program,
          participant,
          redistributionCycleStartEpoch: snapshot.redistributionCycleStartEpoch,
          pendingVoucher,
          onStage: setRedistributionClaimStatus,
        });
        alert(
          formatMessage(t.ecosystem.claimRedistributionSuccessBody, {
            amount: snapshot.estimatedNetPayoutUi,
            signature: `${result.signature.slice(0, 8)}…`,
          })
        );
        setRedistributionClaimStatus(null);
        await refresh();
      } catch (err) {
        let detail = err instanceof Error ? err.message : String(err);
        try {
          const mod = await import('../../lib/redistributionClaimWeb');
          detail = mod.mapRedistributionClaimErrorMessage(err, t.ecosystem);
        } catch {
          /* keep detail */
        }
        alert(`${t.ecosystem.claimRedistributionErrorTitle}\n\n${detail}`);
        setRedistributionClaimStatus(null);
      } finally {
        setRedistributionClaiming(false);
      }
    })();
  }, [
    connection,
    participant,
    program,
    publicKey,
    refresh,
    redistributionClaimTapEnabled,
    signAllTransactions,
    signTransaction,
    snapshot.canExecuteClaim,
    snapshot.claimBlockReason,
    snapshot.estimatedNetPayoutUi,
    snapshot.hasPendingVoucher,
    snapshot.pendingRedistributionVoucher,
    snapshot.redistributionCycleStartEpoch,
    snapshot.showClaimButton,
    t.ecosystem,
  ]);

  const handleClaimLottery = useCallback(() => {
    if (!lotteryClaimButtonEnabled && !lotteryPreparedClaim) {
      if (snapshot.showLotteryClaimButton && !snapshot.canExecuteLotteryClaim) {
        alert(
          mapLotteryClaimBlockReasonToMessage(
            snapshot.lotteryClaimBlockReason,
            t.ecosystem,
            snapshot.lotteryPayoutDelayRemainingSecs
          )
        );
      }
      return;
    }

    if (!publicKey || !signTransaction || !program) {
      alert(t.ecosystem.claimLotteryGenericError);
      return;
    }

    // Wait for silent Photon prepare — opening the wallet mid-prepare fails on Chrome MWA.
    if (lotteryBackgroundPreparing && !lotteryPreparedClaim) {
      setLotteryClaimStatus(t.ecosystem.claimLotteryPreparing);
      return;
    }

    const wallet = {
      publicKey,
      signTransaction: signTransaction as (tx: Transaction) => Promise<Transaction>,
      signAllTransactions: signAllTransactions as
        | ((txs: Transaction[]) => Promise<Transaction[]>)
        | undefined,
    };

    void (async () => {
      setLotteryClaiming(true);
      try {
        const {
          prepareLotteryClaimWeb,
          submitPreparedLotteryClaimWeb,
          runLotteryClaimWeb,
          mapLotteryClaimErrorMessage,
          isMobileWebClaimGestureRequired,
        } = await import('../../lib/lotteryClaimWeb');

        const finishSuccess = async (signature: string) => {
          lotteryPrepareGenerationRef.current += 1;
          setLotteryPreparedClaim(null);
          alert(
            formatMessage(t.ecosystem.claimLotterySuccessBody, {
              amount: snapshot.lotteryPrizeUi,
              signature: `${signature.slice(0, 8)}…`,
            })
          );
          setLotteryClaimStatus(null);
          await refresh();
        };

        // Mobile: proof already built in background — this tap only opens the wallet.
        if (
          lotteryPreparedClaim &&
          lotteryPreparedClaim.lotteryDrawEpoch === snapshot.lotteryDrawEpoch
        ) {
          setLotteryClaimStatus(t.ecosystem.claimLotteryApproveSign);
          const result = await submitPreparedLotteryClaimWeb({
            connection,
            wallet,
            prepared: lotteryPreparedClaim,
            onStage: setLotteryClaimStatus,
          });
          await finishSuccess(result.signature);
          return;
        }

        if (isMobileWebClaimGestureRequired()) {
          // Fallback when background prepare could not finish (e.g. Light sync).
          setLotteryClaimStatus(t.ecosystem.claimLotteryPreparing);
          const prepared = await prepareLotteryClaimWeb({
            connection,
            wallet,
            program,
            participant,
            lotteryDrawEpoch: snapshot.lotteryDrawEpoch,
            allowWalletSigning: true,
            onStage: setLotteryClaimStatus,
          });
          try {
            setLotteryClaimStatus(t.ecosystem.claimLotteryApproveSign);
            const result = await submitPreparedLotteryClaimWeb({
              connection,
              wallet,
              prepared,
              onStage: setLotteryClaimStatus,
            });
            await finishSuccess(result.signature);
          } catch (signErr) {
            // Gesture often expires during Light sync+prepare — next tap only signs.
            setLotteryPreparedClaim(prepared);
            setLotteryClaimStatus(t.ecosystem.claimLotteryTapToSign);
            const { isMwaWalletNotFoundMessage } = await import(
              '../../lib/openInMobileWalletBrowser'
            );
            const msg = signErr instanceof Error ? signErr.message : String(signErr);
            if (isMwaWalletNotFoundMessage(msg) || /MWA|nie odpowiedział na podpis/i.test(msg)) {
              return;
            }
            throw signErr;
          }
          return;
        }

        setLotteryClaimStatus(t.ecosystem.claimLotteryPreparing);
        const result = await runLotteryClaimWeb({
          connection,
          wallet,
          program,
          participant,
          lotteryDrawEpoch: snapshot.lotteryDrawEpoch,
          onStage: setLotteryClaimStatus,
        });
        await finishSuccess(result.signature);
      } catch (err) {
        let detail = err instanceof Error ? err.message : String(err);
        try {
          const mod = await import('../../lib/lotteryClaimWeb');
          detail = mod.mapLotteryClaimErrorMessage(err, t.ecosystem);
        } catch {
          /* keep detail */
        }
        alert(`${t.ecosystem.claimLotteryErrorTitle}\n\n${detail}`);
        setLotteryClaimStatus(null);
        // Keep prepared txs if sign failed after prepare (retry opens wallet again).
      } finally {
        setLotteryClaiming(false);
      }
    })();
  }, [
    connection,
    lotteryBackgroundPreparing,
    lotteryClaimButtonEnabled,
    lotteryPreparedClaim,
    participant,
    program,
    publicKey,
    refresh,
    signAllTransactions,
    signTransaction,
    snapshot.canExecuteLotteryClaim,
    snapshot.lotteryClaimBlockReason,
    snapshot.lotteryDrawEpoch,
    snapshot.lotteryPayoutDelayRemainingSecs,
    snapshot.lotteryPrizeUi,
    snapshot.showLotteryClaimButton,
    t.ecosystem,
  ]);

  return (
    <div className="pierron-screen pierron-ecosystem-screen">
      <div className="pierron-ecosystem-header-row">
        <div>
          <h1 className="pierron-title">{t.ecosystem.title}</h1>
          <p className="pierron-subtitle">{t.ecosystem.subtitle}</p>
          {wallet ? (
            <p className="pierron-wallet-badge" style={{ marginBottom: 0 }}>
              {t.common.portfelLabel}: {shortenAddress(wallet.toBase58(), 8, 6)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="pierron-btn-secondary"
          onClick={() => {
            void refresh();
          }}
          disabled={refreshing}
          style={{ marginBottom: 0, width: 'auto', minWidth: 200, flexShrink: 0 }}
        >
          {refreshing ? t.ecosystem.refreshOnChain + '…' : t.ecosystem.refreshOnChain}
        </button>
      </div>

      {loading ? <p className="pierron-loading">{t.ecosystem.refreshOnChain}…</p> : null}
      {idlLoading ? (
        <p className="pierron-helper">{t.common.laczenie} (IDL)</p>
      ) : null}
      {!programReady && !idlLoading ? (
        <p className="pierron-error-inline">
          {t.ecosystem.loadError}: program Anchor niedostępny (sprawdź /public/idl/pierron.json).
        </p>
      ) : null}
      {error ? (
        <p className="pierron-error-inline">
          {t.ecosystem.loadError}: {error}
        </p>
      ) : null}

      <div className="pierron-ecosystem-grid">
        <EcosystemMeteoraPoolCard />

        <div className="pierron-ecosystem-span-2">
          <CollapsibleSection
            title={t.ecosystem.deflationStatusTitle}
            defaultExpanded
            subtitle={
              deflation.loaded
                ? `${deflation.progressPercent.toFixed(1)}% · ${formatTokenomicsUiLabel(deflation.totalBurnedUi)} / ${formatTokenomicsUiLabel(deflation.burnAllocationUi)}`
                : undefined
            }
          >
            <div className="pierron-progress-track">
              <div
                className="pierron-progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, deflation.progressPercent))}%` }}
              />
            </div>
            <p className="pierron-helper">{t.ecosystem.deflationBurnProgress}</p>
            <div className="pierron-info-table">
              <div className="pierron-info-row">
                <span className="pierron-info-row-label">{t.ecosystem.deflationBurnAllocation}</span>
                <span className="pierron-info-row-value">
                  {deflation.loaded
                    ? formatTokenomicsUiLabel(deflation.burnAllocationUi)
                    : t.ecosystem.deflationNotLoaded}
                </span>
              </div>
              <div className="pierron-info-row">
                <span className="pierron-info-row-label">{t.ecosystem.deflationBurnVaultBalance}</span>
                <span className="pierron-info-row-value">
                  {deflation.loaded
                    ? formatTokenomicsUiLabel(deflation.burnVaultBalanceUi)
                    : t.ecosystem.deflationNotLoaded}
                </span>
              </div>
              <div className="pierron-info-row">
                <span className="pierron-info-row-label">{t.ecosystem.deflationTotalBurned}</span>
                <span className="pierron-info-row-value">
                  {deflation.loaded
                    ? formatTokenomicsUiLabel(deflation.totalBurnedUi)
                    : t.ecosystem.deflationNotLoaded}
                </span>
              </div>
              <div className="pierron-info-row">
                <span className="pierron-info-row-label">{t.ecosystem.deflationRemainingToBurn}</span>
                <span className="pierron-info-row-value">
                  {deflation.loaded
                    ? formatTokenomicsUiLabel(deflation.remainingCapUi)
                    : t.ecosystem.deflationNotLoaded}
                </span>
              </div>
              <div className="pierron-info-row">
                <span className="pierron-info-row-label">{t.ecosystem.deflationBurnPending}</span>
                <span className="pierron-info-row-value">
                  {deflation.loaded
                    ? deflation.burnPending
                      ? t.ecosystem.deflationBurnPendingYes
                      : t.ecosystem.deflationBurnPendingNo
                    : t.ecosystem.deflationNotLoaded}
                </span>
              </div>
              <div className="pierron-info-row" style={{ marginBottom: 0 }}>
                <span className="pierron-info-row-label">{t.ecosystem.deflationLastBurnEpoch}</span>
                <span className="pierron-info-row-value">
                  {deflation.loaded && deflation.lastBurnEpoch >= 0
                    ? String(deflation.lastBurnEpoch)
                    : deflation.loaded
                      ? '—'
                      : t.ecosystem.deflationNotLoaded}
                </span>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        <div className="pierron-ecosystem-span-2 pierron-top-stats">
          <div className="pierron-top-stat">
            <p className="pierron-top-stat-label">{t.ecosystem.epochCycle}</p>
            <p className="pierron-top-stat-value">{liveEpochUi.displayEpoch}</p>
          </div>
          <div className="pierron-top-stat">
            <p className="pierron-top-stat-label">{t.ecosystem.transactions}</p>
            <p className="pierron-top-stat-value">{snapshot.transactionsThisEpoch}</p>
          </div>
          <div className="pierron-top-stat">
            <p className="pierron-top-stat-label">{t.ecosystem.tickets}</p>
            <p className="pierron-top-stat-value">{snapshot.ticketsCurrentCycle}</p>
          </div>
        </div>

        <CollapsibleSection title={t.ecosystem.activityTitle} defaultExpanded>
          <div>
            <div className="pierron-info-row">
              <span className="pierron-info-row-label">{t.ecosystem.currentEpochCycle}</span>
              <span className="pierron-info-row-value">{liveEpochUi.displayEpoch}</span>
            </div>
            <div className="pierron-info-row">
              <span className="pierron-info-row-label">{t.ecosystem.globalEpoch}</span>
              <span className="pierron-info-row-value">{liveEpochUi.protocolEpoch}</span>
            </div>
            <div className="pierron-info-row">
              <span className="pierron-info-row-label">{t.ecosystem.yourTransactions}</span>
              <span className="pierron-info-row-value">{snapshot.transactionsThisEpoch}</span>
            </div>
            <div className="pierron-info-row">
              <span className="pierron-info-row-label">{t.ecosystem.epochTurnover}</span>
              <span className="pierron-info-row-value">{snapshot.epochVolume} PIERRON</span>
            </div>
            <div className="pierron-info-row">
              <span className="pierron-info-row-label">{t.ecosystem.epochEnd}</span>
              <span className="pierron-info-row-value">{liveEpochUi.epochTimeLeft}</span>
            </div>
          </div>
          <p className="pierron-helper" style={{ marginBottom: 0 }}>
            {t.ecosystem.activityHelper}
          </p>
        </CollapsibleSection>

        <CollapsibleSection
          title={t.ecosystem.redistributionFunds}
          defaultExpanded
          subtitle={
            snapshot.redistributionEligible
              ? t.ecosystem.qualified
              : t.ecosystem.buildingQualification
          }
        >
          <span
            className={`pierron-status-badge ${
              snapshot.redistributionEligible
                ? 'pierron-status-badge-active'
                : 'pierron-status-badge-inactive'
            }`}
          >
            {snapshot.redistributionEligible
              ? t.ecosystem.qualified
              : t.ecosystem.buildingQualification}
          </span>
          <div>
            <div className="pierron-info-row">
              <span className="pierron-info-row-label">{t.ecosystem.cycleProgress}</span>
              <span className="pierron-info-row-value">
                {liveEpochUi.displayEpoch} / {snapshot.redistributionCycleLength} {t.ecosystem.epochs}
              </span>
            </div>
            <div className="pierron-info-row">
              <span className="pierron-info-row-label">{t.ecosystem.activeEpochs}</span>
              <span className="pierron-info-row-value">
                {snapshot.activeEpochsInRedistributionCycle} / {snapshot.minActiveEpochsRequired}{' '}
                {t.ecosystem.required}
              </span>
            </div>
            <div className="pierron-info-row">
              <span className="pierron-info-row-label">{t.ecosystem.nextSettlement}</span>
              <span className="pierron-info-row-value">{liveEpochUi.redistributionSettlementIn}</span>
            </div>
          </div>
          <div className="pierron-progress-track">
            <div
              className="pierron-progress-fill"
              style={{ width: `${redistributionProgressPercent}%` }}
            />
          </div>
          <p className="pierron-helper">{snapshot.redistributionStatusText}</p>
          <p className="pierron-section-label">{t.ecosystem.currentActivityCycleTitle}</p>
          <p className="pierron-helper">{t.ecosystem.activityResetHint}</p>
          <p className="pierron-helper">{t.ecosystem.activityLotteryDrawHint}</p>
          <div className="pierron-marker-grid-panel">
            <ActivityMarkerGrid markers={liveRedistributionMarkers} />
          </div>
        </CollapsibleSection>

      {showRedistributionClaimPanel ? (
        <div className="pierron-claim-card">
          <h2 className="pierron-claim-card-title">{t.ecosystem.redistributionClaimPanelTitle}</h2>
          <p className="pierron-helper">
            {formatMessage(t.ecosystem.claimPanelActiveEpochs, {
              active: snapshot.claimCycleActiveEpochs,
              required: snapshot.minActiveEpochsRequired,
            })}
          </p>
          {claimRedistributionMarkers ? (
            <div className="pierron-marker-grid-panel pierron-marker-grid-panel-mini">
              <ActivityMarkerGrid markers={claimRedistributionMarkers} mini />
            </div>
          ) : null}
          {snapshot.redistributionPastCycleClaimWindow && snapshot.showClaimButton ? (
            <p className="pierron-helper">{t.ecosystem.redistributionClaimBeforeSwapHint}</p>
          ) : null}
          {redistributionQualLines.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              {redistributionQualLines.map((line) => (
                <p key={line} className="pierron-helper">
                  {line}
                </p>
              ))}
            </div>
          ) : null}
          {snapshot.showClaimButton &&
          snapshot.claimExpiresInEpochs > 0 &&
          snapshot.claimBlockReason !== 'stale_redistribution_claim' ? (
            <p className="pierron-helper" style={{ fontWeight: 600 }}>
              {formatMessage(t.ecosystem.redistributionClaimExpiresInEpochs, {
                n: snapshot.claimExpiresInEpochs,
              })}
            </p>
          ) : null}
          {redistributionRolloverDelayRemainingSecs > 0 ? (
            <p className="pierron-helper" style={{ fontWeight: 600 }}>
              {mapClaimBlockReasonToMessage('too_early_after_rollover', t.ecosystem)} (
              {redistributionRolloverDelayRemainingSecs}s)
            </p>
          ) : null}
          {redistributionClaimReadyVisual && redistributionHasPayoutEstimate ? (
            <p className="pierron-helper" style={{ fontWeight: 600 }}>
              {formatMessage(t.ecosystem.claimRedistributionReadyAmount, {
                amount: snapshot.estimatedNetPayoutUi,
              })}
            </p>
          ) : null}
          <button
            type="button"
            className={`pierron-claim-btn ${
              redistributionClaimReadyVisual
                ? 'pierron-claim-btn-ready'
                : 'pierron-claim-btn-locked'
            }`}
            onClick={handleClaimRedistribution}
            disabled={!redistributionClaimTapEnabled}
          >
            {redistributionClaiming
              ? redistributionClaimStatus ?? t.ecosystem.claimRedistributionInProgress
              : snapshot.hasPendingVoucher
                ? t.ecosystem.claimRedistributionFinish
                : t.ecosystem.claimRedistribution}
          </button>
          <p className="pierron-helper">
            {redistributionClaiming
              ? redistributionClaimStatus ?? t.ecosystem.claimRedistributionInProgress
              : redistributionClaimReadyVisual
                ? formatMessage(t.ecosystem.claimRedistributionReadyAmount, {
                    amount: snapshot.estimatedNetPayoutUi,
                  })
                : redistributionRolloverDelayRemainingSecs > 0
                  ? `${mapClaimBlockReasonToMessage('too_early_after_rollover', t.ecosystem)} (${redistributionRolloverDelayRemainingSecs}s)`
                  : snapshot.showClaimButton
                    ? mapClaimBlockReasonToMessage(snapshot.claimBlockReason, t.ecosystem)
                    : t.ecosystem.claimRedistributionLocked}
          </p>
        </div>
      ) : null}

      <CollapsibleSection
        title={t.ecosystem.loyaltyTitle}
        defaultExpanded
        subtitle={snapshot.loyaltyActive ? t.ecosystem.loyaltyActive : t.ecosystem.loyaltyInactive}
      >
        <span
          className={`pierron-status-badge ${
            snapshot.loyaltyActive
              ? 'pierron-status-badge-active'
              : 'pierron-status-badge-inactive'
          }`}
        >
          {snapshot.loyaltyActive ? t.ecosystem.loyaltyActive : t.ecosystem.loyaltyInactive}
        </span>

        <div style={{ marginBottom: 12 }}>
          <p className="pierron-info-row-label">{t.ecosystem.bonusCycle}</p>
          <p className="pierron-info-row-value" style={{ textAlign: 'left', marginTop: 4 }}>
            {snapshot.lotteryClaimUiPriority
              ? formatMessage(t.ecosystem.lotteryWindowClosedDrawDone, {
                  completed: snapshot.loyaltyCycleLength,
                  total: snapshot.loyaltyCycleLength,
                })
              : snapshot.lotteryAwaitingDrawMarker
                ? formatMessage(t.ecosystem.lotteryWindowClosedAwaitingDraw, {
                    completed: snapshot.loyaltyCycleLength,
                    total: snapshot.loyaltyCycleLength,
                    marker: snapshot.lotteryScheduledDrawMarkerInCycle,
                  })
                : liveEpochUi.loyaltyCycleWindowCompleted
                  ? formatMessage(t.ecosystem.lotteryWindowClosedDrawDone, {
                      completed: snapshot.loyaltyCycleLength,
                      total: snapshot.loyaltyCycleLength,
                    })
                  : `${liveEpochUi.completedEpochsInLoyaltyCycle} / ${snapshot.loyaltyCycleLength} ${t.ecosystem.epochs}`}
          </p>
          {snapshot.lotteryClaimUiPriority ? (
            <p className="pierron-helper">
              {formatMessage(t.ecosystem.lotteryDrawAwaitingClaimMarker, {
                marker:
                  snapshot.lotteryClaimMarkerEpochInCycle > 0
                    ? snapshot.lotteryClaimMarkerEpochInCycle
                    : snapshot.lotteryDrawMarkerEpochInCycle,
                poolStart:
                  snapshot.lotteryClaimPoolWindowStart >= 0
                    ? snapshot.lotteryClaimPoolWindowStart
                    : snapshot.lotteryDrawPoolWindowStart,
              })}
            </p>
          ) : snapshot.lotteryAwaitingDrawMarker ? (
            <p className="pierron-helper">
              {formatMessage(t.ecosystem.lotteryNextDrawEpoch, {
                n: snapshot.lotteryScheduledDrawMarkerInCycle,
              })}
            </p>
          ) : liveEpochUi.loyaltyCycleWindowCompleted ? (
            snapshot.lotteryDrawPendingPayout &&
            snapshot.lotteryDrawPoolWindowStart === snapshot.lotteryTicketCycleStart ? (
              <p className="pierron-helper">
                {formatMessage(t.ecosystem.lotteryDrawAwaitingClaimMarker, {
                  marker: snapshot.lotteryDrawMarkerEpochInCycle,
                  poolStart: snapshot.lotteryDrawPoolWindowStart,
                })}
              </p>
            ) : (
              <p className="pierron-helper">
                {formatMessage(t.ecosystem.lotteryNewWindowProgress, {
                  current: liveEpochUi.completedEpochsInLoyaltyCycle,
                  total: snapshot.loyaltyCycleLength,
                })}
              </p>
            )
          ) : snapshot.lotteryAwaitingClaimMarker ? (
            <p className="pierron-helper">
              {formatMessage(t.ecosystem.lotteryDrawAwaitingClaimMarker, {
                marker: snapshot.lotteryDrawMarkerEpochInCycle,
                poolStart: snapshot.lotteryDrawPoolWindowStart,
              })}
            </p>
          ) : snapshot.lotteryStaleDrawPayoutPending ? (
            <p className="pierron-helper pierron-accent-hint">
              {t.ecosystem.lotteryStalePayoutKeeperHint}
            </p>
          ) : snapshot.lotteryDrawOverdue && !snapshot.lotteryClaimUiPriority ? (
            <p className="pierron-helper pierron-accent-hint">
              {formatMessage(t.ecosystem.lotteryBonusWindowOverdue, {
                completed: liveEpochUi.completedEpochsInLoyaltyCycle,
                total: snapshot.loyaltyCycleLength,
              })}
            </p>
          ) : null}
        </div>

        <div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.lotteryCycleVolume}</span>
            <span className="pierron-info-row-value">{snapshot.lotteryCycleVolumeUi}</span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.lotteryNextTicketVolume}</span>
            <span className="pierron-info-row-value">{snapshot.lotteryVolumeToNextTicketUi}</span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.yourTickets}</span>
            <span className="pierron-info-row-value">{snapshot.ticketsCurrentCycle}</span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.globalLotteryTickets}</span>
            <span className="pierron-info-row-value">{snapshot.globalTotalTickets}</span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.lotteryPoolSyncLabel}</span>
            <span className="pierron-info-row-value">
              {snapshot.lotteryPoolDesync
                ? t.ecosystem.lotteryPoolSyncWarning
                : t.ecosystem.lotteryPoolSyncOk}
            </span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.lotteryPriorCycleTicketsLabel}</span>
            <span className="pierron-info-row-value">{snapshot.lotteryStaleTickets}</span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.tradeBookSyncStatus}</span>
            <span className="pierron-info-row-value">
              {snapshot.participantLoadFailed
                ? t.ecosystem.tradeBookSyncFailed
                : t.ecosystem.tradeBookSyncOk}
            </span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.nextDraw}</span>
            <span className="pierron-info-row-value">
              {snapshot.lotteryClaimUiPriority
                ? t.ecosystem.lotteryPayoutPending
                : snapshot.lotteryStaleDrawPayoutPending
                  ? liveEpochUi.loyaltyDrawIn
                  : snapshot.lotteryDrawOverdue
                    ? snapshot.lotteryAwaitingKeeperCommits
                      ? t.ecosystem.lotteryCommitsPending
                      : t.ecosystem.lotteryDrawPending
                    : liveEpochUi.loyaltyDrawIn}
            </span>
          </div>
        </div>
        {snapshot.lotteryPoolDesync ? (
          <p className="pierron-helper">
            {formatMessage(t.ecosystem.lotteryPoolDesyncHint, {
              inPool: snapshot.lotteryTicketsInPool,
              earned: snapshot.ticketsCurrentCycle,
              global: snapshot.onChainGlobalTotalTickets,
            })}
          </p>
        ) : null}
        <p className="pierron-helper">
          {snapshot.lotteryStaleTickets > 0
            ? formatMessage(t.ecosystem.lotteryStaleCycle, {
                n: snapshot.lotteryStaleTickets,
                e: snapshot.lotteryStaleCycleStart,
              })
            : t.ecosystem.lotteryPriorCycleTicketsIdle}
        </p>
        {snapshot.participantLoadFailed ? (
          <p className="pierron-helper pierron-accent-hint">
            {t.ecosystem.participantLoadFailedHint}
          </p>
        ) : null}
        <div className="pierron-progress-track">
          <div
            className="pierron-progress-fill"
            style={{ width: `${loyaltyProgressPercent}%` }}
          />
        </div>
        <p className="pierron-helper">
          {snapshot.loyaltyStatusText} {t.ecosystem.loyaltyHelper}
        </p>
        <div className="pierron-lottery-keeper-box">
          <p className="pierron-lottery-keeper-title">{lotteryProtocolBox.title}</p>
          {lotteryProtocolBox.lines.map((line, idx) => (
            <p key={`lottery-protocol-line-${idx}`} className="pierron-helper">
              {line}
            </p>
          ))}
        </div>
        <p className="pierron-helper">{t.ecosystem.lotteryTicketThresholdHint}</p>
      </CollapsibleSection>

      {showLotteryClaimPanel ? (
        <div className="pierron-claim-card">
          <h2 className="pierron-claim-card-title">{t.ecosystem.lotteryClaimPanelTitle}</h2>
          {snapshot.lotteryClaimMarkerEpochInCycle > 0 ? (
            <p className="pierron-helper">
              {formatMessage(t.ecosystem.lotteryClaimDrawContext, {
                marker: snapshot.lotteryClaimMarkerEpochInCycle,
                poolStart: snapshot.lotteryClaimPoolWindowStart,
              })}
            </p>
          ) : null}
          {snapshot.lotteryDrawPendingPayout && !snapshot.lotteryStaleDrawPayoutPending ? (
            <p className="pierron-helper">{t.ecosystem.lotteryPayoutPendingHint}</p>
          ) : snapshot.lotteryStaleDrawPayoutPending && snapshot.showLotteryClaimButton ? (
            <p className="pierron-helper">{t.ecosystem.lotteryStalePayoutWinnerHint}</p>
          ) : snapshot.lotteryStaleDrawPayoutPending ? (
            <p className="pierron-helper">{t.ecosystem.lotteryStalePayoutKeeperHint}</p>
          ) : null}
          {snapshot.lotteryDrawPendingPayout && !snapshot.lotteryStaleDrawPayoutPending ? (
            <p className="pierron-helper">{t.ecosystem.lotteryAccumulatingWhileClaimPending}</p>
          ) : null}
          <button
            type="button"
            className={`pierron-claim-btn ${
              lotteryClaimButtonEnabled || lotteryPreparedClaim
                ? 'pierron-claim-btn-ready'
                : 'pierron-claim-btn-locked'
            }`}
            onClick={handleClaimLottery}
            disabled={
              lotteryClaiming ||
              lotteryBackgroundPreparing ||
              (!lotteryClaimButtonEnabled &&
                !lotteryPreparedClaim &&
                !snapshot.showLotteryClaimButton)
            }
          >
            {lotteryClaiming
              ? lotteryClaimStatus ?? t.ecosystem.claimLotteryInProgress
              : lotteryBackgroundPreparing
                ? t.ecosystem.claimLotteryPreparing
                : snapshot.hasPendingLotteryVoucher
                  ? t.ecosystem.claimLotteryFinish
                  : t.ecosystem.claimLottery}
          </button>
          <p className="pierron-helper">
            {lotteryClaiming && lotteryClaimStatus
              ? lotteryClaimStatus
              : lotteryBackgroundPreparing && lotteryClaimStatus
                ? lotteryClaimStatus
                : lotteryPreparedClaim && lotteryClaimButtonEnabled
                  ? formatMessage(t.ecosystem.claimLotteryReadyAmount, {
                      amount: snapshot.lotteryPrizeUi,
                    })
                  : lotteryClaimButtonEnabled
                    ? formatMessage(t.ecosystem.claimLotteryReadyAmount, {
                        amount: snapshot.lotteryPrizeUi,
                      })
                    : mapLotteryClaimBlockReasonToMessage(
                        snapshot.lotteryClaimBlockReason,
                        t.ecosystem,
                        snapshot.lotteryPayoutDelayRemainingSecs
                      )}
          </p>
        </div>
      ) : null}

      <CollapsibleSection title={t.ecosystem.participationHistory} defaultExpanded>
        <div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.receivedRedistributions}</span>
            <span className="pierron-info-row-value">{snapshot.redistributionClaimsCount}</span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.lastClaim}</span>
            <span className="pierron-info-row-value">{snapshot.lastClaimText}</span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-row-label">{t.ecosystem.lastActiveEpochLabel}</span>
            <span className="pierron-info-row-value">
              {snapshot.lastActiveEpoch > 0 ? snapshot.lastActiveEpoch : '—'}
            </span>
          </div>
        </div>
        <p className="pierron-helper">{t.ecosystem.historyHelper}</p>
      </CollapsibleSection>
      </div>
    </div>
  );
}
