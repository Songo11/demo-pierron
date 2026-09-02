import {
  LOTTERY_DRAW_INTERVAL_EPOCHS,
  LOTTERY_DRAW_EPOCH_MARKERS,
  LOTTERY_MIN_TICKETS_FOR_DRAW,
  LOTTERY_POST_WINDOW_DRAW_DELAY_SECS,
  LOTTERY_TICKET_PER_VOLUME,
  MAX_LOTTERY_TICKETS,
  MIN_ACTIVE_EPOCHS,
  REDISTRIBUTION_CYCLE_EPOCHS,
  SECONDS_PER_EPOCH,
} from "./tokenomicsConstants.ts";
import { participantTicketsFromSettledDrawWindow } from "./lotteryClaimEligibility.ts";

export type EpochMarkerState = "future" | "active" | "inactive" | "current-active" | "current-inactive";

export type EpochMarker = {
  key: string;
  epochNumber: number;
  state: EpochMarkerState;
  /** Epochs 1, 8, 15, 22 in the 28-epoch redistribution grid — lottery draw at epoch start. */
  isLotteryDrawEpoch?: boolean;
};

/** 1-based position inside the 28-epoch redistribution cycle (1…28). */
export function redistributionEpochInCycle(globalEpoch: number, cycleStartEpoch: number): number {
  const offset = Math.max(0, globalEpoch - cycleStartEpoch);
  return (offset % REDISTRIBUTION_CYCLE_EPOCHS) + 1;
}

/** Redistribution cycle start that contains `globalEpoch` (handles post-rollover prior cycle). */
export function redistributionCycleStartContainingEpoch(
  globalEpoch: number,
  currentRedistributionCycleStartEpoch: number
): number {
  const current = currentRedistributionCycleStartEpoch;
  if (current < 0 || globalEpoch < 0) {
    return current;
  }
  if (
    globalEpoch >= current &&
    globalEpoch < current + REDISTRIBUTION_CYCLE_EPOCHS
  ) {
    return current;
  }
  if (current >= REDISTRIBUTION_CYCLE_EPOCHS && globalEpoch < current) {
    const prior = current - REDISTRIBUTION_CYCLE_EPOCHS;
    if (globalEpoch >= prior) {
      return prior;
    }
  }
  return current;
}

/** Progress through the 7-epoch lottery sub-window inside the redistribution cycle. */
export function lotteryEpochsSinceDraw(globalEpoch: number, lotteryDrawEpoch: number): number {
  if (lotteryDrawEpoch < 0) {
    return Math.min(
      LOTTERY_DRAW_INTERVAL_EPOCHS,
      Math.max(1, globalEpoch + 1)
    );
  }
  return Math.min(
    LOTTERY_DRAW_INTERVAL_EPOCHS,
    Math.max(1, globalEpoch - lotteryDrawEpoch + 1)
  );
}

/** Start epoch of the active 7-epoch lottery sub-window (aligned to redistribution cycle). */
export function lotterySubWindowStart(
  redistributionCycleStartEpoch: number,
  globalEpoch: number
): number {
  const pos = redistributionEpochInCycle(globalEpoch, redistributionCycleStartEpoch) - 1;
  const sub = Math.floor(pos / LOTTERY_DRAW_INTERVAL_EPOCHS);
  return redistributionCycleStartEpoch + sub * LOTTERY_DRAW_INTERVAL_EPOCHS;
}

export function lotterySubWindowEnd(subWindowStart: number): number {
  return subWindowStart + LOTTERY_DRAW_INTERVAL_EPOCHS - 1;
}

/** Draw epochs in the activity grid: 1, 8, 15, 22 (start of epoch). */
export function isLotteryDrawEpochMarker(epochNumberInCycle: number): boolean {
  return (LOTTERY_DRAW_EPOCH_MARKERS as readonly number[]).includes(epochNumberInCycle);
}

/** Next draw epoch (1/8/15/22) after the current 7-epoch ticket window in the 28-epoch cycle. */
export function nextLotteryDrawEpochInCycle(epochInCycle: number): number {
  const pos = Math.max(1, epochInCycle);
  // Draw markers start a new ticket window; the draw for the window that just ended
  // happens at the marker epoch (handled via drawOverdue), not the following marker.
  if (pos === LOTTERY_DRAW_EPOCH_MARKERS[0]) {
    return LOTTERY_DRAW_EPOCH_MARKERS[1];
  }
  const drawEpoch =
    Math.ceil(pos / LOTTERY_DRAW_INTERVAL_EPOCHS) * LOTTERY_DRAW_INTERVAL_EPOCHS + 1;
  if (drawEpoch > REDISTRIBUTION_CYCLE_EPOCHS) return LOTTERY_DRAW_EPOCH_MARKERS[0];
  return drawEpoch;
}

export type LotteryClockProgress = {
  /** 1-based position in the live calendar 7-epoch sub-window (1…7). */
  epochInCycle: number;
  drawOverdue: boolean;
  drawPendingPayout: boolean;
  /** Draw finished and payout not claimed, but protocol already advanced to a later sub-window. */
  staleDrawPayoutPending: boolean;
  /** Start epoch of the overdue / pending draw window (may lag live calendar). */
  drawWindowAnchor: number;
  /** Start epoch of the live calendar sub-window (for ticket accumulation UI). */
  liveWindowAnchor: number;
};

/** Marker epoch (1/8/15/22) in the redistribution cycle for a recorded draw. */
export function lotteryDrawMarkerEpochInCycle(
  redistributionCycleStartEpoch: number,
  lotteryDrawEpoch: number
): number {
  if (lotteryDrawEpoch < 0 || redistributionCycleStartEpoch < 0) return -1;
  return redistributionEpochInCycle(
    lotteryDrawEpoch,
    redistributionCycleStartEpoch
  );
}

/**
 * Claim UI opens only after the on-chain marker epoch (`lotteryDrawEpoch`) has started.
 * Draw may execute on the last ticket epoch; `lotteryDrawEpoch = window_end + 1`.
 */
export function isLotteryClaimEpochReached(params: {
  globalEpoch: number;
  lotteryDrawEpoch: number;
  redistributionCycleStartEpoch?: number;
  lotteryTicketCycleStart?: number;
}): boolean {
  const {
    globalEpoch,
    lotteryDrawEpoch,
    redistributionCycleStartEpoch = -1,
    lotteryTicketCycleStart = -1,
  } = params;
  if (lotteryDrawEpoch < 0 || globalEpoch < 0) return false;
  let claimEpoch = lotteryDrawEpoch;
  if (redistributionCycleStartEpoch >= 0) {
    const poolStart = lotteryDrawPoolWindowStart({
      redistributionCycleStartEpoch,
      lotteryDrawEpoch,
      lotteryTicketCycleStart,
    });
    if (poolStart >= 0) {
      claimEpoch = Math.max(claimEpoch, scheduledLotteryDrawEpoch(poolStart));
    }
  }
  return globalEpoch >= claimEpoch;
}

/** First epoch when the scheduled draw runs for a ticket window (start of marker epoch 1/8/15/22). */
export function scheduledLotteryDrawEpoch(lotteryTicketCycleStart: number): number {
  return lotterySubWindowEnd(lotteryTicketCycleStart) + 1;
}

/** 1-based marker (1/8/15/22) when the pending ticket window's draw is scheduled. */
export function scheduledLotteryDrawMarkerInCycle(params: {
  redistributionCycleStartEpoch: number;
  ticketWindowStart: number;
}): number {
  return redistributionEpochInCycle(
    scheduledLotteryDrawEpoch(params.ticketWindowStart),
    params.redistributionCycleStartEpoch
  );
}

/** Last ticket epoch ended; draw has not run yet — waits for the marker epoch. */
export function lotteryAwaitingDrawMarker(params: {
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawn: boolean;
}): { awaiting: boolean; markerEpochInCycle: number } {
  const anchor = lotterySubWindowStart(
    params.redistributionCycleStartEpoch,
    params.globalEpoch
  );
  const scheduled = scheduledLotteryDrawEpoch(anchor);
  const windowEnd = lotterySubWindowEnd(anchor);
  const markerEpochInCycle = redistributionEpochInCycle(
    scheduled,
    params.redistributionCycleStartEpoch
  );
  const awaiting =
    !params.lotteryDrawn &&
    params.globalEpoch >= windowEnd &&
    params.globalEpoch < scheduled;
  return { awaiting, markerEpochInCycle };
}

/** Ticket-pool window start for a completed draw (`lotteryDrawEpoch` is the first post-window epoch). */
export function lotteryDrawPoolWindowStart(params: {
  redistributionCycleStartEpoch: number;
  lotteryDrawEpoch: number;
  lotteryTicketCycleStart: number;
}): number {
  const { redistributionCycleStartEpoch, lotteryDrawEpoch, lotteryTicketCycleStart } =
    params;
  if (lotteryDrawEpoch >= 0 && redistributionCycleStartEpoch >= 0) {
    const lastTicketEpoch = lotteryDrawEpoch - 1;
    const cycleStart = redistributionCycleStartContainingEpoch(
      lastTicketEpoch,
      redistributionCycleStartEpoch
    );
    return lotterySubWindowStart(cycleStart, lastTicketEpoch);
  }
  return lotteryTicketCycleStart;
}

/** Last epoch (inclusive) in which an unclaimed payout remains valid. */
export function lotteryPayoutClaimDeadlineEpoch(params: {
  redistributionCycleStartEpoch: number;
  lotteryDrawEpoch: number;
  lotteryTicketCycleStart: number;
}): number {
  const { redistributionCycleStartEpoch, lotteryDrawEpoch, lotteryTicketCycleStart } =
    params;
  const poolWindowStart = lotteryDrawPoolWindowStart({
    redistributionCycleStartEpoch,
    lotteryDrawEpoch,
    lotteryTicketCycleStart,
  });
  const ticketWindowEnd = lotterySubWindowEnd(poolWindowStart);
  if (lotteryDrawEpoch < 0) {
    return ticketWindowEnd;
  }
  const scheduledDrawEpoch = scheduledLotteryDrawEpoch(poolWindowStart);
  // Truly late draw (after the scheduled marker epoch): short deadline at ticket window end.
  if (lotteryDrawEpoch > scheduledDrawEpoch) {
    return ticketWindowEnd;
  }
  // On-time draw: claim through the end of the 7-epoch window that begins at the draw
  // marker ("until the next lottery"). Anchor from the cycle that *contained* the draw —
  // never the live redistribution start. After rollover, SubWindowStart(liveCycle, pastDraw)
  // falsely snaps to the new cycle and extends the deadline by another full window.
  const drawCycleStart = redistributionCycleStartContainingEpoch(
    lotteryDrawEpoch,
    redistributionCycleStartEpoch
  );
  const drawSubStart = lotterySubWindowStart(drawCycleStart, lotteryDrawEpoch);
  const anchor =
    drawSubStart >= poolWindowStart ? drawSubStart : poolWindowStart;
  return lotterySubWindowEnd(anchor);
}

import { LOTTERY_PAYOUT_DELAY_SECS } from "./tokenomicsConstants.ts";

/** Wall-clock seconds until the post-draw payout delay elapses. */
export function lotteryPayoutDelayRemainingSecs(params: {
  lotteryDrawTime: number;
  now?: number;
}): number {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  return Math.max(0, params.lotteryDrawTime + Number(LOTTERY_PAYOUT_DELAY_SECS) - now);
}

/** Unclaimed draw still inside the mandatory payout delay — keeper must not forfeit yet. */
export function lotteryPayoutClaimProtectedFromForfeit(params: {
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  lotteryDrawTime: number;
  now?: number;
}): boolean {
  if (!params.lotteryDrawn || params.lotteryPaid) return false;
  return lotteryPayoutDelayRemainingSecs(params) > 0;
}

/** Draw/payout still open while the live protocol epoch is already in a later 7-epoch window. */
export function isStaleLotteryPayoutPending(params: {
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  lotteryDrawEpoch?: number;
  lotteryTicketCycleStart?: number;
}): boolean {
  if (!params.lotteryDrawn || params.lotteryPaid) {
    return false;
  }
  const drawTicketStart =
    params.lotteryDrawEpoch != null && params.lotteryDrawEpoch >= 0
      ? lotteryDrawPoolWindowStart({
          redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
          lotteryDrawEpoch: params.lotteryDrawEpoch,
          lotteryTicketCycleStart: params.lotteryTicketCycleStart ?? -1,
        })
      : params.lotteryTicketCycleStart != null && params.lotteryTicketCycleStart >= 0
        ? params.lotteryTicketCycleStart
        : lotterySubWindowStart(
            params.redistributionCycleStartEpoch,
            Math.max(0, params.lotteryDrawEpoch ?? 0)
          );
  const ticketEnd = lotterySubWindowEnd(drawTicketStart);
  const deadline = lotteryPayoutClaimDeadlineEpoch({
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
    lotteryDrawEpoch: Math.max(0, params.lotteryDrawEpoch ?? 0),
    lotteryTicketCycleStart: drawTicketStart,
  });
  return params.globalEpoch > deadline;
}

/** Draw or formal skip recorded on-chain for `windowStart` (no heuristic drift). */
export function lotteryWindowRecordedOnChain(params: {
  lotteryDrawEpoch: number;
  windowStart: number;
  redistributionCycleStartEpoch: number;
  /** Active draw ticket window — matches on-chain `lottery_ticket_cycle_start`. */
  lotteryTicketCycleStart?: number;
  lotteryDrawn?: boolean;
  lotteryPaid?: boolean;
}): boolean {
  const {
    lotteryDrawEpoch,
    windowStart,
    redistributionCycleStartEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
    lotteryPaid,
  } = params;
  if (windowStart < 0 || lotteryDrawEpoch < 0) {
    return false;
  }
  // Formal skip / post-payout: `lottery_draw_epoch` stamped to scheduled(window).
  // Before the first draw of a window, draw_epoch is the *previous* window's
  // marker (== this window's start), never scheduled(this window) — so this is
  // safe without requiring the ticket anchor to have advanced. Requiring
  // ticket advance caused a post-claim deadlock: finalize cleared drawn but
  // sync could not advance the anchor, so UI/keeper re-opened commit/draw.
  if (!lotteryDrawn && lotteryDrawEpoch === scheduledLotteryDrawEpoch(windowStart)) {
    return true;
  }
  const drawnWindow = lotteryDrawPoolWindowStart({
    redistributionCycleStartEpoch,
    lotteryDrawEpoch,
    lotteryTicketCycleStart: lotteryTicketCycleStart ?? windowStart,
  });
  if (windowStart === drawnWindow) {
    if (lotteryDrawn || lotteryPaid) {
      return true;
    }
  }
  // Keeper catch-up may execute draw_lottery one or more epochs after the draw marker.
  const windowEnd = lotterySubWindowEnd(windowStart);
  const nextSubStart = windowStart + LOTTERY_DRAW_INTERVAL_EPOCHS;
  const liveDrawnWindow = lotterySubWindowStart(
    redistributionCycleStartEpoch,
    lotteryDrawEpoch
  );
  if (
    lotteryDrawn &&
    liveDrawnWindow === nextSubStart &&
    lotteryDrawEpoch > windowEnd &&
    lotteryDrawEpoch <= windowEnd + LOTTERY_DRAW_INTERVAL_EPOCHS
  ) {
    return true;
  }
  if (
    lotteryTicketCycleStart != null &&
    lotteryTicketCycleStart >= 0 &&
    lotteryTicketCycleStart === windowStart &&
    lotteryDrawEpoch >= windowEnd &&
    lotteryDrawn
  ) {
    return true;
  }
  return false;
}

/** Participant's 7-epoch ticket window already drew (paid or payout still open). */
export function participantLotteryWindowDrawSettled(params: {
  windowStart: number;
  lotteryDrawEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryTicketCycleStart: number;
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
}): boolean {
  const { windowStart, lotteryDrawEpoch, redistributionCycleStartEpoch, lotteryTicketCycleStart, lotteryDrawn, lotteryPaid } =
    params;
  if (windowStart < 0) {
    return false;
  }
  if (lotteryDrawn && !lotteryPaid && lotteryDrawEpoch >= 0) {
    const poolWindow = lotteryDrawPoolWindowStart({
      redistributionCycleStartEpoch,
      lotteryDrawEpoch,
      lotteryTicketCycleStart,
    });
    if (poolWindow === windowStart) {
      return true;
    }
  }
  return lotteryWindowRecordedOnChain({
    lotteryDrawEpoch,
    windowStart,
    redistributionCycleStartEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
    lotteryPaid,
  });
}

/** On-chain pool anchor ended before this draw window — tickets belong to an older era. */
export function lotteryPoolAnchorStrictlyBeforeWindow(params: {
  lotteryTicketCycleStart: number;
  windowStart: number;
}): boolean {
  const { lotteryTicketCycleStart, windowStart } = params;
  if (lotteryTicketCycleStart < 0 || windowStart < 0) {
    return false;
  }
  return lotterySubWindowEnd(lotteryTicketCycleStart) < windowStart;
}

/** Post-rollover: prior window still needs draw while on-chain anchor already advanced. */
function lotteryOverdueDrawPendingForWindow(params: {
  windowStart: number;
  globalEpoch: number;
  lotteryDrawEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryTicketCycleStart?: number;
  lotteryDrawn?: boolean;
}): boolean {
  const {
    windowStart,
    globalEpoch,
    lotteryDrawEpoch,
    redistributionCycleStartEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
  } = params;
  if (lotteryDrawn || windowStart < 0 || lotteryDrawEpoch < 0) {
    return false;
  }
  const scheduled = scheduledLotteryDrawEpoch(windowStart);
  if (globalEpoch < scheduled) {
    return false;
  }
  if (
    lotteryWindowRecordedOnChain({
      lotteryDrawEpoch,
      windowStart,
      redistributionCycleStartEpoch,
      lotteryTicketCycleStart,
      lotteryDrawn,
    })
  ) {
    return false;
  }
  const prevStart = windowStart - LOTTERY_DRAW_INTERVAL_EPOCHS;
  return (
    prevStart >= 0 &&
    scheduledLotteryDrawEpoch(prevStart) === lotteryDrawEpoch
  );
}

/** True when `drawEpoch` recorded a draw/skipped window `[windowStart, …]`. */
export function lotteryDrawSettledForWindow(params: {
  lotteryDrawEpoch: number;
  windowStart: number;
  redistributionCycleStartEpoch: number;
  /** On-chain anchor — empty skip advances past ended windows. */
  lotteryTicketCycleStart?: number;
  totalTickets?: number;
  lotteryDrawn?: boolean;
  lotteryPaid?: boolean;
  globalEpoch?: number;
}): boolean {
  const {
    lotteryDrawEpoch,
    windowStart,
    redistributionCycleStartEpoch,
    lotteryTicketCycleStart,
    totalTickets,
    lotteryDrawn,
    lotteryPaid,
    globalEpoch,
  } = params;
  if (windowStart < 0) {
    return false;
  }
  if (
    lotteryWindowRecordedOnChain({
      lotteryDrawEpoch,
      windowStart,
      redistributionCycleStartEpoch,
      lotteryTicketCycleStart,
      lotteryDrawn,
      lotteryPaid: params.lotteryPaid,
    })
  ) {
    return true;
  }
  if (
    lotteryDrawn === false &&
    globalEpoch != null &&
    lotteryTicketCycleStart != null &&
    lotteryTicketCycleStart >= 0 &&
    redistributionCycleStartEpoch >= 0
  ) {
    const liveSubStart = lotterySubWindowStart(
      redistributionCycleStartEpoch,
      globalEpoch
    );
    // Ticket pool already belongs to a later sub-window — stale pending draw had no pool.
    if (liveSubStart > windowStart && lotteryTicketCycleStart >= liveSubStart) {
      if (
        globalEpoch != null &&
        lotteryOverdueDrawPendingForWindow({
          windowStart,
          globalEpoch,
          lotteryDrawEpoch,
          redistributionCycleStartEpoch,
          lotteryTicketCycleStart,
          lotteryDrawn,
        })
      ) {
        return false;
      }
      return true;
    }
  }
  if (
    lotteryDrawn === false &&
    (totalTickets ?? 0) < LOTTERY_MIN_TICKETS_FOR_DRAW &&
    lotteryTicketCycleStart != null &&
    lotteryTicketCycleStart >= 0
  ) {
    const windowEnd = lotterySubWindowEnd(windowStart);
    const overduePending =
      globalEpoch != null &&
      lotteryOverdueDrawPendingForWindow({
        windowStart,
        globalEpoch,
        lotteryDrawEpoch,
        redistributionCycleStartEpoch,
        lotteryTicketCycleStart,
        lotteryDrawn,
      });
    if (lotteryTicketCycleStart > windowEnd) {
      return overduePending ? false : true;
    }
    if (globalEpoch != null) {
      const liveSubStart = lotterySubWindowStart(
        redistributionCycleStartEpoch,
        globalEpoch
      );
      if (liveSubStart > windowStart) {
        return overduePending ? false : true;
      }
    }
    if (
      globalEpoch != null &&
      redistributionCycleStartEpoch > windowStart &&
      globalEpoch > windowEnd
    ) {
      return overduePending ? false : true;
    }
  }
  return false;
}

/** On-chain global pool is stale when anchor ended before the live/pending window. */
export function isStaleOnChainLotteryPoolAnchor(params: {
  lotteryTicketCycleStart: number;
  activeTicketCycleStart: number;
}): boolean {
  return lotteryPoolAnchorStrictlyBeforeWindow({
    lotteryTicketCycleStart: params.lotteryTicketCycleStart,
    windowStart: params.activeTicketCycleStart,
  });
}

/** Tickets that count toward a pending overdue draw — excludes pool in a later sub-window. */
export function lotteryEffectiveTicketsForPendingWindow(params: {
  pendingWindowStart: number;
  liveWindowAnchor: number;
  lotteryTicketCycleStart: number;
  totalTickets: number;
}): number {
  const {
    pendingWindowStart,
    liveWindowAnchor,
    lotteryTicketCycleStart,
    totalTickets,
  } = params;
  if (
    liveWindowAnchor > pendingWindowStart &&
    lotteryTicketCycleStart >= liveWindowAnchor
  ) {
    return 0;
  }
  if (lotteryTicketCycleStart > pendingWindowStart) {
    return 0;
  }
  if (
    lotteryTicketCycleStart >= 0 &&
    lotteryPoolAnchorStrictlyBeforeWindow({
      lotteryTicketCycleStart,
      windowStart: pendingWindowStart,
    })
  ) {
    return 0;
  }
  return totalTickets;
}

/**
 * Global lottery ticket counter for UI.
 * After payout/claim on-chain resets `total_tickets` to 0 — do not resurrect stale
 * trade-book rows from a concluded window. Trade-book sum is only used to correct
 * on-chain desync during the live accumulating window.
 */
export function resolveGlobalLotteryTicketsForDisplay(params: {
  onChainTotalTickets: number;
  tradeBookCycleTotal: number;
  tradeBookQueryCycleStart: number;
  activeTicketCycleStart: number;
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawEpoch: number;
  lotteryTicketCycleStart: number;
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  /** Winner consumed payout — pool reset should read as zero globally. */
  lotteryClaimConsumed?: boolean;
}): number {
  const {
    onChainTotalTickets,
    tradeBookCycleTotal,
    tradeBookQueryCycleStart,
    activeTicketCycleStart,
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
    lotteryPaid,
    lotteryClaimConsumed,
  } = params;

  if (
    lotteryClaimConsumed &&
    onChainTotalTickets === 0 &&
    tradeBookCycleTotal === 0
  ) {
    return 0;
  }

  if (
    onChainTotalTickets > 0 &&
    lotteryTicketCycleStart >= 0 &&
    activeTicketCycleStart >= 0 &&
    lotteryPoolAnchorStrictlyBeforeWindow({
      lotteryTicketCycleStart,
      windowStart: activeTicketCycleStart,
    })
  ) {
    if (
      tradeBookQueryCycleStart >= 0 &&
      tradeBookQueryCycleStart === activeTicketCycleStart
    ) {
      return tradeBookCycleTotal;
    }
    return 0;
  }

  if (onChainTotalTickets === 0) {
    const concludedWindow =
      tradeBookQueryCycleStart >= 0 &&
      lotteryDrawSettledForWindow({
        lotteryDrawEpoch,
        windowStart: tradeBookQueryCycleStart,
        redistributionCycleStartEpoch,
        lotteryTicketCycleStart,
        totalTickets: 0,
        lotteryDrawn,
        lotteryPaid,
        globalEpoch,
      });
    if (
      tradeBookCycleTotal > 0 &&
      tradeBookQueryCycleStart >= 0 &&
      tradeBookQueryCycleStart < redistributionCycleStartEpoch &&
      !concludedWindow
    ) {
      return tradeBookCycleTotal;
    }
    const queryingStaleCycle =
      tradeBookQueryCycleStart >= 0 &&
      activeTicketCycleStart >= 0 &&
      tradeBookQueryCycleStart < activeTicketCycleStart;
    if (queryingStaleCycle || concludedWindow) {
      return 0;
    }
    if (
      tradeBookQueryCycleStart >= 0 &&
      tradeBookQueryCycleStart === activeTicketCycleStart
    ) {
      return tradeBookCycleTotal;
    }
    return 0;
  }

  if (
    tradeBookQueryCycleStart >= 0 &&
    tradeBookQueryCycleStart === activeTicketCycleStart
  ) {
    return Math.max(onChainTotalTickets, tradeBookCycleTotal);
  }
  return onChainTotalTickets;
}

/**
 * Global lottery pool for UI — always uses live/pending window trade-book sums,
 * never the viewing participant's `lottery_cycle_start` (that made each wallet show
 * a different global total).
 */
export function resolveDisplayedGlobalLotteryTickets(params: {
  onChainTotalTickets: number;
  liveWindowTradeBookTotal: number;
  pendingWindowTradeBookTotal: number;
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawEpoch: number;
  lotteryTicketCycleStart: number;
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  lotteryClock: Pick<
    LotteryClockProgress,
    "drawOverdue" | "drawPendingPayout" | "drawWindowAnchor" | "liveWindowAnchor"
  >;
  activeSwapTicketCycleStart: number;
  lotteryClaimConsumed?: boolean;
}): number {
  const {
    onChainTotalTickets,
    liveWindowTradeBookTotal,
    pendingWindowTradeBookTotal,
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
    lotteryPaid,
    lotteryClock,
    activeSwapTicketCycleStart,
    lotteryClaimConsumed,
  } = params;

  if (
    lotteryClaimConsumed &&
    onChainTotalTickets === 0 &&
    liveWindowTradeBookTotal === 0 &&
    pendingWindowTradeBookTotal === 0
  ) {
    return 0;
  }

  const liveAnchor =
    lotteryClock.liveWindowAnchor >= 0
      ? lotteryClock.liveWindowAnchor
      : activeSwapTicketCycleStart;
  const liveResolved =
    liveAnchor >= 0
      ? resolveGlobalLotteryTicketsForDisplay({
          onChainTotalTickets,
          tradeBookCycleTotal: liveWindowTradeBookTotal,
          tradeBookQueryCycleStart: liveAnchor,
          activeTicketCycleStart: activeSwapTicketCycleStart,
          globalEpoch,
          redistributionCycleStartEpoch,
          lotteryDrawEpoch,
          lotteryTicketCycleStart,
          lotteryDrawn,
          lotteryPaid,
          lotteryClaimConsumed,
        })
      : onChainTotalTickets;

  // Drawn pool stays in accounting.total_tickets until claim/reset.
  // Global UI counter for the live sub-window = live trade-book only (0 after draw).
  if (lotteryClock.drawPendingPayout) {
    const live = lotteryClock.liveWindowAnchor;
    const draw = lotteryClock.drawWindowAnchor;
    // Calendar still on the drawn sub-window — never count drawn-pool tickets as "live".
    if (live >= 0 && draw >= 0 && live === draw) {
      return 0;
    }
    return Math.max(0, liveWindowTradeBookTotal);
  }

  if (lotteryClock.drawOverdue) {
    const pendingAnchor = lotteryClock.drawWindowAnchor;
    const pendingOnChain = lotteryEffectiveTicketsForPendingWindow({
      pendingWindowStart: pendingAnchor,
      liveWindowAnchor: lotteryClock.liveWindowAnchor,
      lotteryTicketCycleStart,
      totalTickets: onChainTotalTickets,
    });
    const pendingResolved =
      pendingAnchor >= 0
        ? resolveGlobalLotteryTicketsForDisplay({
            onChainTotalTickets: pendingOnChain,
            tradeBookCycleTotal: pendingWindowTradeBookTotal,
            tradeBookQueryCycleStart: pendingAnchor,
            activeTicketCycleStart: pendingAnchor,
            globalEpoch,
            redistributionCycleStartEpoch,
            lotteryDrawEpoch,
            lotteryTicketCycleStart,
            lotteryDrawn,
            lotteryPaid,
            lotteryClaimConsumed,
          })
        : 0;
    const pendingPool = Math.max(
      pendingOnChain,
      pendingResolved,
      pendingWindowTradeBookTotal
    );
    const livePool = Math.max(liveResolved, liveWindowTradeBookTotal);
    // Kalendarz w nowym oknie: pokazuj live jeśli jest accrual; inaczej nie gasś
    // pending puli do zera (to powodowało mryganie globalnego licznika).
    if (pendingAnchor >= 0 && liveAnchor >= 0 && pendingAnchor !== liveAnchor) {
      return livePool > 0 ? livePool : Math.max(pendingPool, livePool);
    }
    return Math.max(pendingPool, livePool);
  }

  return liveResolved;
}

/**
 * Participant ticket counter for UI.
 * Trade-book `ticket_count` survives draw/payout until the next swap — hide stale rows
 * from concluded windows so users see 0 after claim and a fresh count in the new cycle.
 */
export function resolveParticipantLotteryTicketsForDisplay(params: {
  ticketCount: number;
  lotteryCycleStart: number;
  ticketEpoch?: number;
  activeTicketCycleStart: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawEpoch: number;
  lotteryTicketCycleStart: number;
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  /** Open payout window — only preserve tickets for claim UI when requested. */
  drawPendingPayout?: boolean;
  /** User consumed lottery payout — clear only the settled draw window, not live accrual. */
  lotteryClaimConsumed?: boolean;
  /** Winner / pending-win during payout delay — keep ticket range for claim. */
  preserveForPendingClaim?: boolean;
  /** Overdue draw window anchor — preserve tickets only for this pending pool. */
  pendingDrawWindowStart?: number;
  drawOverdue?: boolean;
  lotteryCycleVolumeRaw?: number;
  epochVolumeRaw?: number;
  txsThisEpoch?: number;
}): number {
  const {
    ticketCount,
    lotteryCycleStart,
    ticketEpoch = lotteryCycleStart,
    activeTicketCycleStart,
    redistributionCycleStartEpoch,
    lotteryDrawEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
    lotteryPaid,
    drawPendingPayout = lotteryDrawn && !lotteryPaid,
    lotteryClaimConsumed,
    preserveForPendingClaim,
    lotteryCycleVolumeRaw = 0,
    epochVolumeRaw = 0,
    txsThisEpoch = 0,
  } = params;

  if (ticketCount <= 0 || lotteryCycleStart < 0) {
    return 0;
  }

  const bleedTickets = participantLotteryTicketsAfterStaleVolumeBleed({
    ticketCount,
    lotteryCycleVolumeRaw,
    epochVolumeRaw,
    txsThisEpoch,
    lotteryClaimConsumed,
  });
  // Post-claim clamp only inside the live ticket window.
  if (
    bleedTickets != null &&
    (lotteryCycleStart === activeTicketCycleStart ||
      ticketEpoch === activeTicketCycleStart)
  ) {
    return bleedTickets;
  }

  if (
    activeTicketCycleStart >= 0 &&
    lotteryCycleStart >= 0 &&
    lotteryCycleStart < activeTicketCycleStart &&
    !preserveForPendingClaim
  ) {
    const pendingDrawWindowStart = params.pendingDrawWindowStart ?? -1;
    const drawOverdue = params.drawOverdue ?? false;
    if (
      !(
        drawOverdue &&
        pendingDrawWindowStart >= 0 &&
        lotteryCycleStart === pendingDrawWindowStart
      )
    ) {
      return 0;
    }
  }

  if (lotteryClaimConsumed) {
    const fromDrawWindow =
      lotteryDrawEpoch >= 0 &&
      redistributionCycleStartEpoch >= 0 &&
      participantTicketsFromSettledDrawWindow({
        participant: { lotteryCycleStart, ticketEpoch, ticketCount },
        lotteryDrawEpoch,
        lotteryTicketCycleStart,
        redistributionCycleStartEpoch,
      });
    if (fromDrawWindow) {
      return 0;
    }
    if (
      lotteryCycleStart === activeTicketCycleStart ||
      ticketEpoch === activeTicketCycleStart
    ) {
      return ticketCount;
    }
    return 0;
  }

  const windowSettled = participantLotteryWindowDrawSettled({
    windowStart: lotteryCycleStart,
    lotteryDrawEpoch,
    redistributionCycleStartEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
    lotteryPaid,
  });

  // While payout is open, draw-window `ticket_count` is frozen for claim on-chain.
  // It must NOT appear as the live-cycle counter — users start from 0 and earn again.
  // Claim UI uses lottery_winner / eligibility, not this display value.
  if (preserveForPendingClaim && drawPendingPayout) {
    // Never surface draw-era ticket_count for winners — even if reminted onto live.
    return 0;
  }

  if (windowSettled && lotteryCycleStart !== activeTicketCycleStart) {
    return 0;
  }

  const inActiveCycle = lotteryCycleStart === activeTicketCycleStart;

  if (!inActiveCycle) {
    if (drawPendingPayout) {
      return 0;
    }
    if (windowSettled) {
      return 0;
    }
    const pendingDrawWindowStart = params.pendingDrawWindowStart ?? -1;
    const drawOverdue = params.drawOverdue ?? false;
    if (
      drawOverdue &&
      pendingDrawWindowStart >= 0 &&
      (lotteryCycleStart === pendingDrawWindowStart ||
        ticketEpoch === pendingDrawWindowStart)
    ) {
      return ticketCount;
    }
    return 0;
  }

  return ticketCount;
}

/**
 * Live-cycle ticket counter while a prior draw payout is still open.
 * Never surface draw-era `ticket_count` (claim uses `lottery_winner`). Show 0 until
 * the wallet is on the live window, then volume-only post-draw accrual.
 */
export function resolveLiveCycleLotteryTicketsWhilePayoutPending(params: {
  ticketCount: number;
  ticketEpoch: number;
  lotteryCycleStart: number;
  liveCycleStart: number;
  lotteryCycleVolumeRaw: number;
  /** Drawn pool window — tickets anchored here must not inflate the live counter. */
  drawPoolStart?: number;
  /** On-chain lottery_draw_epoch — activity at/before this is not live accrual. */
  lotteryDrawEpoch?: number;
}): number {
  const {
    ticketEpoch,
    lotteryCycleStart,
    liveCycleStart,
    lotteryCycleVolumeRaw,
  } = params;
  const drawPoolStart = params.drawPoolStart ?? -1;
  const lotteryDrawEpoch = params.lotteryDrawEpoch ?? -1;
  if (liveCycleStart < 0) {
    return 0;
  }
  // Calendar still on the drawn sub-window — counters reset until the next window.
  if (drawPoolStart >= 0 && liveCycleStart === drawPoolStart) {
    return 0;
  }
  // Still anchored on the drawn pool row (not reminted to live).
  if (drawPoolStart >= 0 && lotteryCycleStart === drawPoolStart) {
    return 0;
  }
  if (
    drawPoolStart >= 0 &&
    ticketEpoch === drawPoolStart &&
    lotteryCycleStart !== liveCycleStart
  ) {
    return 0;
  }
  // Reminted live row still carrying draw-era ticket_epoch — hide until post-draw swaps.
  if (
    lotteryDrawEpoch >= 0 &&
    ticketEpoch >= 0 &&
    ticketEpoch < lotteryDrawEpoch &&
    lotteryCycleStart === liveCycleStart
  ) {
    return 0;
  }
  const onLiveCycle =
    lotteryCycleStart === liveCycleStart || ticketEpoch === liveCycleStart;
  if (!onLiveCycle) {
    return 0;
  }
  // Volume only — raw ticket_count may still hold draw-era inflation (Samsung 29 vs 9).
  return lotteryTicketsFromCycleVolume(lotteryCycleVolumeRaw);
}

/** Mirrors on-chain `lottery_pending_draw_window_start`. */
export function lotteryPendingDrawWindowStart(params: {
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawn: boolean;
  lotteryDrawEpoch?: number;
  lotteryTicketCycleStart?: number;
  totalTickets?: number;
}): number {
  const { globalEpoch, redistributionCycleStartEpoch, lotteryDrawn } = params;
  const lotteryDrawEpoch = params.lotteryDrawEpoch ?? -1;
  const settledParams = {
    lotteryDrawEpoch,
    lotteryTicketCycleStart: params.lotteryTicketCycleStart,
    totalTickets: params.totalTickets,
    lotteryDrawn,
    globalEpoch,
  };
  const cycle = redistributionCycleStartEpoch;
  if (cycle < 0) {
    return lotterySubWindowStart(0, globalEpoch);
  }
  const pos = redistributionEpochInCycle(globalEpoch, cycle);
  const subIdx = Math.floor((pos - 1) / LOTTERY_DRAW_INTERVAL_EPOCHS);
  const currentSubStart = cycle + subIdx * LOTTERY_DRAW_INTERVAL_EPOCHS;
  const currentSubEnd = lotterySubWindowEnd(currentSubStart);

  // Post–28-cycle rollover: draw the last 7-epoch window of the previous cycle first.
  if (cycle >= REDISTRIBUTION_CYCLE_EPOCHS && pos <= LOTTERY_DRAW_INTERVAL_EPOCHS) {
    const priorCycleStart = cycle - REDISTRIBUTION_CYCLE_EPOCHS;
    const lastSubStart = priorCycleStart + 3 * LOTTERY_DRAW_INTERVAL_EPOCHS;
    const lastSubEnd = lotterySubWindowEnd(lastSubStart);
    if (
      globalEpoch > lastSubEnd &&
      !lotteryDrawSettledForWindow({
        ...settledParams,
        windowStart: lastSubStart,
        redistributionCycleStartEpoch: priorCycleStart,
      })
    ) {
      return lastSubStart;
    }
  }

  if (globalEpoch >= currentSubEnd) {
    return currentSubStart;
  }

  const treatAsUndrawn =
    !lotteryDrawn ||
    isStaleLotteryPayoutPending({
      globalEpoch,
      redistributionCycleStartEpoch: cycle,
      lotteryDrawn,
      lotteryPaid: false,
      lotteryDrawEpoch,
    });

  if (subIdx > 0 && treatAsUndrawn) {
    const prevStart = currentSubStart - LOTTERY_DRAW_INTERVAL_EPOCHS;
    const prevEnd = lotterySubWindowEnd(prevStart);
    if (
      globalEpoch > prevEnd &&
      !lotteryDrawSettledForWindow({
        ...settledParams,
        windowStart: prevStart,
        redistributionCycleStartEpoch: cycle,
      })
    ) {
      return prevStart;
    }
  }

  return currentSubStart;
}

/** Rewind ticket-cycle anchor when rollover skipped draw at 7/14/21/28 boundary. */
export function pendingLotteryTicketCycleStart(params: {
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryTicketCycleStart: number;
  lotteryDrawn: boolean;
  totalTickets: number;
  lotteryDrawEpoch?: number;
}): number {
  const {
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
    totalTickets,
    lotteryDrawEpoch = -1,
  } = params;
  const subStart = lotterySubWindowStart(
    redistributionCycleStartEpoch,
    globalEpoch
  );
  // Keep on-chain anchor while payout is open or stale — do not jump to the live sub-window.
  if (lotteryDrawn && lotteryTicketCycleStart >= 0) {
    return lotteryTicketCycleStart;
  }
  if (lotteryDrawn) {
    return subStart;
  }
  if (lotteryTicketCycleStart < 0) {
    return subStart;
  }
  const pendingStart = lotteryPendingDrawWindowStart({
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawn,
    lotteryDrawEpoch,
    lotteryTicketCycleStart,
    totalTickets,
  });
  if (pendingStart < subStart) {
    if (lotteryTicketCycleStart >= subStart) {
      return lotteryTicketCycleStart;
    }
    if (totalTickets < LOTTERY_MIN_TICKETS_FOR_DRAW) {
      return subStart;
    }
    return pendingStart;
  }
  if (
    lotteryDrawSettledForWindow({
      lotteryDrawEpoch,
      windowStart: lotteryTicketCycleStart,
      redistributionCycleStartEpoch,
    })
  ) {
    return subStart;
  }
  if (totalTickets < LOTTERY_MIN_TICKETS_FOR_DRAW) {
    return lotteryTicketCycleStart >= subStart
      ? lotteryTicketCycleStart
      : subStart;
  }
  // On-chain already advanced to the active sub-window (e.g. after skip_lottery_draw).
  if (lotteryTicketCycleStart >= subStart) {
    return lotteryTicketCycleStart;
  }
  // Ticket pool still anchored to an earlier sub-window that ended without draw.
  const ticketWindowEnd = lotterySubWindowEnd(lotteryTicketCycleStart);
  if (globalEpoch > ticketWindowEnd) {
    return lotteryTicketCycleStart;
  }
  return lotteryTicketCycleStart;
}

/** Mirrors on-chain `lottery_ticket_cycle_start` — anchor used when awarding swap tickets. */
export function activeLotteryTicketCycleStart(params: {
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryTicketCycleStart: number;
  lotteryDrawn: boolean;
  lotteryDrawEpoch?: number;
  totalTickets?: number;
}): number {
  const {
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
    lotteryDrawEpoch = -1,
    totalTickets = 0,
  } = params;
  const derived = lotterySubWindowStart(
    redistributionCycleStartEpoch,
    globalEpoch
  );
  if (lotteryDrawn) {
    return derived;
  }
  if (
    lotteryDrawSettledForWindow({
      lotteryDrawEpoch,
      windowStart: lotteryTicketCycleStart,
      redistributionCycleStartEpoch,
    })
  ) {
    return derived;
  }
  const pendingStart = lotteryPendingDrawWindowStart({
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawn,
    lotteryDrawEpoch,
    lotteryTicketCycleStart,
    totalTickets,
  });
  if (pendingStart < derived) {
    if (pendingStart < redistributionCycleStartEpoch) {
      return derived;
    }
    if (lotteryTicketCycleStart >= derived) {
      return lotteryTicketCycleStart;
    }
    if (totalTickets < LOTTERY_MIN_TICKETS_FOR_DRAW) {
      return derived;
    }
    return pendingStart;
  }
  if (
    lotteryDrawSettledForWindow({
      lotteryDrawEpoch,
      windowStart: lotteryTicketCycleStart,
      redistributionCycleStartEpoch,
    })
  ) {
    return derived;
  }
  if (totalTickets < LOTTERY_MIN_TICKETS_FOR_DRAW) {
    return lotteryTicketCycleStart >= derived ? lotteryTicketCycleStart : derived;
  }
  return lotteryTicketCycleStart >= derived ? lotteryTicketCycleStart : derived;
}

/** Lottery countdown aligned to redistribution cycle (draw at epochs 7/14/21/28). */
export function lotteryClockProgress(params: {
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  lotteryDrawEpoch?: number;
  /** On-chain `lottery_ticket_cycle_start` — anchors overdue detection when draw pending. */
  lotteryTicketCycleStart?: number;
  totalTickets?: number;
}): LotteryClockProgress {
  const {
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawn,
    lotteryPaid,
    lotteryDrawEpoch = -1,
    lotteryTicketCycleStart,
    totalTickets = 0,
  } = params;

  const derivedAnchor = lotterySubWindowStart(
    redistributionCycleStartEpoch,
    globalEpoch
  );
  const liveEpochInCycle = Math.min(
    LOTTERY_DRAW_INTERVAL_EPOCHS,
    Math.max(1, globalEpoch - derivedAnchor + 1)
  );

  if (lotteryDrawn && !lotteryPaid) {
    const staleDrawPayoutPending = isStaleLotteryPayoutPending({
      globalEpoch,
      redistributionCycleStartEpoch,
      lotteryDrawn,
      lotteryPaid,
      lotteryDrawEpoch,
      lotteryTicketCycleStart,
    });
    if (staleDrawPayoutPending) {
      const pendingStart = lotteryPendingDrawWindowStart({
        globalEpoch,
        redistributionCycleStartEpoch,
        lotteryDrawn: false,
        lotteryDrawEpoch,
        lotteryTicketCycleStart,
        totalTickets,
      });
      const windowEnd = lotterySubWindowEnd(pendingStart);
      const scheduledDrawEpoch = scheduledLotteryDrawEpoch(pendingStart);
      const needsDraw =
        globalEpoch >= scheduledDrawEpoch &&
        !lotteryDrawSettledForWindow({
          lotteryDrawEpoch,
          windowStart: pendingStart,
          redistributionCycleStartEpoch,
          lotteryTicketCycleStart,
          totalTickets,
          lotteryDrawn: false,
          globalEpoch,
        });
      const anchor = needsDraw ? pendingStart : derivedAnchor;
      return {
        epochInCycle: liveEpochInCycle,
        drawOverdue: needsDraw,
        // Still an open on-chain payout — winner can claim until keeper expires.
        drawPendingPayout: true,
        staleDrawPayoutPending: true,
        drawWindowAnchor: anchor,
        liveWindowAnchor: derivedAnchor,
      };
    }
    return {
      epochInCycle: liveEpochInCycle,
      drawOverdue: false,
      drawPendingPayout: true,
      staleDrawPayoutPending: false,
      drawWindowAnchor: Math.max(
        0,
        lotteryTicketCycleStart != null && lotteryTicketCycleStart >= 0
          ? lotteryTicketCycleStart
          : lotterySubWindowStart(redistributionCycleStartEpoch, Math.max(0, lotteryDrawEpoch))
      ),
      liveWindowAnchor: derivedAnchor,
    };
  }

  const pendingStart = lotteryPendingDrawWindowStart({
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawn,
    lotteryDrawEpoch,
    lotteryTicketCycleStart,
    totalTickets,
  });
  const scheduledDrawEpoch = scheduledLotteryDrawEpoch(pendingStart);
  const settledTicketStart =
    lotteryTicketCycleStart != null && lotteryTicketCycleStart >= 0
      ? lotteryTicketCycleStart
      : pendingStart;
  const drawSettled = lotteryDrawSettledForWindow({
    lotteryDrawEpoch,
    windowStart: pendingStart,
    redistributionCycleStartEpoch,
    lotteryTicketCycleStart: settledTicketStart,
    totalTickets,
    lotteryDrawn,
    globalEpoch,
  });
  const drawOverdue =
    !lotteryDrawn && globalEpoch >= scheduledDrawEpoch && !drawSettled;

  return {
    epochInCycle: liveEpochInCycle,
    drawOverdue,
    drawPendingPayout: false,
    staleDrawPayoutPending: false,
    drawWindowAnchor: drawOverdue ? pendingStart : derivedAnchor,
    liveWindowAnchor: derivedAnchor,
  };
}

/** @deprecated Use {@link lotterySubWindowStart} — lottery is redistribution-aligned. */
export function lotteryDrawWindowAnchor(params: {
  lotteryDrawEpoch: number;
  lotteryTicketCycleStart: number;
  lotteryDrawn: boolean;
}): number {
  void params;
  return 0;
}

/**
 * 1-based position in the active lottery **ticket** cycle (matches on-chain
 * `lottery_ticket_cycle_start` and trade-book ticket accumulation).
 */
export function lotteryEpochInTicketCycle(
  globalEpoch: number,
  lotteryTicketCycleStart: number,
  opts?: { drawOverdue?: boolean; redistributionCycleStartEpoch?: number }
): number {
  if (opts?.redistributionCycleStartEpoch != null && opts.redistributionCycleStartEpoch >= 0) {
    const anchor = lotterySubWindowStart(opts.redistributionCycleStartEpoch, globalEpoch);
    return Math.min(
      LOTTERY_DRAW_INTERVAL_EPOCHS,
      Math.max(1, globalEpoch - anchor + 1)
    );
  }
  if (opts?.drawOverdue) {
    return LOTTERY_DRAW_INTERVAL_EPOCHS;
  }
  if (lotteryTicketCycleStart < 0) {
    return (globalEpoch % LOTTERY_DRAW_INTERVAL_EPOCHS) + 1;
  }
  return Math.min(
    LOTTERY_DRAW_INTERVAL_EPOCHS,
    Math.max(1, globalEpoch - lotteryTicketCycleStart + 1)
  );
}

/** Draw interval elapsed but keeper has not executed `draw_lottery` yet. */
export function isLotteryDrawOverdue(
  globalEpoch: number,
  lotteryDrawEpoch: number,
  lotteryDrawn: boolean,
  lotteryTicketCycleStart = 0,
  lotteryPaid = false,
  redistributionCycleStartEpoch = 0
): boolean {
  if (
    !lotteryDrawn &&
    lotteryDrawEpoch >= 0 &&
    lotteryTicketCycleStart >= 0 &&
    lotteryDrawSettledForWindow({
      lotteryDrawEpoch,
      windowStart: lotteryTicketCycleStart,
      redistributionCycleStartEpoch,
    })
  ) {
    return false;
  }
  return lotteryClockProgress({
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawn,
    lotteryPaid,
    lotteryDrawEpoch,
    lotteryTicketCycleStart,
  }).drawOverdue;
}

/**
 * True when a 7-epoch ticket window has ended but draw/skip has not settled it.
 */
export function lotteryPendingWindowNeedsDraw(params: {
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  lotteryDrawEpoch?: number;
  lotteryTicketCycleStart?: number;
  totalTickets?: number;
}): boolean {
  const lotteryDrawEpoch = params.lotteryDrawEpoch ?? -1;
  const stale = isStaleLotteryPayoutPending({
    ...params,
    lotteryDrawEpoch,
  });
  const pendingStart = lotteryPendingDrawWindowStart({
    globalEpoch: params.globalEpoch,
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
    lotteryDrawn: stale ? false : params.lotteryDrawn,
    lotteryDrawEpoch,
    lotteryTicketCycleStart: params.lotteryTicketCycleStart,
    totalTickets: params.totalTickets,
  });
  const scheduledDrawEpoch = scheduledLotteryDrawEpoch(pendingStart);
  if (params.globalEpoch < scheduledDrawEpoch) {
    return false;
  }
  return !lotteryDrawSettledForWindow({
    lotteryDrawEpoch,
    windowStart: pendingStart,
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
    lotteryTicketCycleStart: params.lotteryTicketCycleStart,
    totalTickets: params.totalTickets,
    lotteryDrawn: stale ? false : params.lotteryDrawn,
    lotteryPaid: params.lotteryPaid,
    globalEpoch: params.globalEpoch,
  });
}

/**
 * On-chain rollover deadlock: last ticket epoch ended, draw scheduled for next epoch,
 * but epoch cannot advance until draw settles (pre-fix program blocks rollover).
 */
export function isLotteryEpochRolloverDeadlock(params: {
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  lotteryDrawEpoch?: number;
}): boolean {
  const lotteryDrawEpoch = params.lotteryDrawEpoch ?? -1;
  const stale = isStaleLotteryPayoutPending({
    ...params,
    lotteryDrawEpoch,
  });
  const pendingStart = lotteryPendingDrawWindowStart({
    globalEpoch: params.globalEpoch,
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
    lotteryDrawn: stale ? false : params.lotteryDrawn,
    lotteryDrawEpoch,
  });
  const windowEnd = lotterySubWindowEnd(pendingStart);
  const scheduledDraw = scheduledLotteryDrawEpoch(pendingStart);
  if (params.globalEpoch !== windowEnd) {
    return false;
  }
  if (stale ? false : params.lotteryDrawn) {
    return false;
  }
  if (scheduledDraw !== params.globalEpoch + 1) {
    return false;
  }
  return !lotteryDrawSettledForWindow({
    lotteryDrawEpoch,
    windowStart: pendingStart,
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
  });
}

/**
 * Run lottery (draw/skip) before epoch catch-up when draw is due at the current on-chain epoch.
 */
export function shouldPrioritizeLotteryBeforeCatchup(params: {
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  lotteryDrawEpoch?: number;
  lotteryTicketCycleStart?: number;
  totalTickets?: number;
  timeInEpochSec: number;
}): boolean {
  const { globalEpoch, redistributionCycleStartEpoch } = params;
  const lotteryDrawEpoch = params.lotteryDrawEpoch ?? -1;
  const pendingStart = lotteryPendingDrawWindowStart({
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawn: params.lotteryDrawn,
    lotteryDrawEpoch,
  });
  const scheduledDraw = scheduledLotteryDrawEpoch(pendingStart);
  if (globalEpoch < scheduledDraw) {
    return false;
  }
  if (
    lotteryPendingWindowNeedsDraw({
      globalEpoch,
      redistributionCycleStartEpoch,
      lotteryDrawn: params.lotteryDrawn,
      lotteryPaid: params.lotteryPaid,
      lotteryDrawEpoch,
    })
  ) {
    return true;
  }
  if (
    isLotteryAutomatedDrawDue({
      globalEpoch,
      redistributionCycleStartEpoch,
      timeInEpochSec: params.timeInEpochSec,
    })
  ) {
    return true;
  }
  return lotteryClockProgress({
    globalEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawn: params.lotteryDrawn,
    lotteryPaid: params.lotteryPaid,
    lotteryDrawEpoch,
    lotteryTicketCycleStart: params.lotteryTicketCycleStart ?? -1,
    totalTickets: params.totalTickets ?? 0,
  }).drawOverdue;
}

/**
 * True at draw epochs 1/8/15/22 once `timeInEpochSec` ≥ delay (default ~5s).
 * Draw runs at the **start** of these epochs for the completed 7-epoch ticket window.
 */
export function isLotteryAutomatedDrawDue(params: {
  globalEpoch: number;
  redistributionCycleStartEpoch: number;
  timeInEpochSec: number;
}): boolean {
  const { globalEpoch, redistributionCycleStartEpoch, timeInEpochSec } = params;
  if (timeInEpochSec < LOTTERY_POST_WINDOW_DRAW_DELAY_SECS) {
    return false;
  }
  if (redistributionCycleStartEpoch < 0) {
    return false;
  }
  const pos = redistributionEpochInCycle(globalEpoch, redistributionCycleStartEpoch);
  if (!isLotteryDrawEpochMarker(pos)) {
    return false;
  }
  return true;
}

export function participantCycleIndex(activityCycleEpoch: number): number {
  if (activityCycleEpoch < 0) return -1;
  return Math.floor(activityCycleEpoch / REDISTRIBUTION_CYCLE_EPOCHS);
}

export function globalCycleIndex(globalEpoch: number): number {
  return Math.floor(globalEpoch / REDISTRIBUTION_CYCLE_EPOCHS);
}

export function isParticipantInCurrentCycle(
  activityCycleEpoch: number,
  globalEpoch: number
): boolean {
  if (activityCycleEpoch < 0) return false;
  return participantCycleIndex(activityCycleEpoch) === globalCycleIndex(globalEpoch);
}

/**
 * Participant activity counts toward the **current** redistribution window when their
 * `activity_cycle_epoch` is at or after on-chain `redistribution_cycle_start_epoch`.
 * (Stricter than {@link isParticipantInCurrentCycle} — avoids stale bitmap from an old cycle.)
 */
export function isParticipantInActiveRedistributionWindow(params: {
  activityCycleEpoch: number;
  redistributionCycleStartEpoch: number;
  globalEpoch: number;
  cycleLength?: number;
}): boolean {
  const len = params.cycleLength ?? REDISTRIBUTION_CYCLE_EPOCHS;
  const { activityCycleEpoch, redistributionCycleStartEpoch, globalEpoch } = params;
  if (activityCycleEpoch < 0 || redistributionCycleStartEpoch < 0) return false;
  if (activityCycleEpoch < redistributionCycleStartEpoch) return false;
  const cycleEnd = redistributionCycleStartEpoch + len - 1;
  return globalEpoch >= redistributionCycleStartEpoch && globalEpoch <= cycleEnd;
}

/**
 * On-chain `activity_bitmap` uses bit `(global_epoch % 28)`, not UI slot index.
 * Map 1-based epoch-in-cycle (from `redistribution_cycle_start_epoch`) to that bit.
 */
export function activityBitmapBitIndex(
  epochNumberInCycle: number,
  redistributionCycleStartEpoch: number,
  cycleLength: number = REDISTRIBUTION_CYCLE_EPOCHS
): number {
  const globalEpoch = redistributionCycleStartEpoch + epochNumberInCycle - 1;
  return ((globalEpoch % cycleLength) + cycleLength) % cycleLength;
}

export function isActivityBitmapBitSet(
  activityBitmap: number,
  epochNumberInCycle: number,
  redistributionCycleStartEpoch: number,
  cycleLength?: number
): boolean {
  const len = cycleLength ?? REDISTRIBUTION_CYCLE_EPOCHS;
  const bit = 1 << activityBitmapBitIndex(epochNumberInCycle, redistributionCycleStartEpoch, len);
  return (activityBitmap & bit) !== 0;
}

/** Active epochs in the current redistribution window (matches on-chain bitmap semantics). */
export function countActiveEpochsInRedistributionWindow(params: {
  activityBitmap: number;
  redistributionCycleStartEpoch: number;
  epochInCycle: number;
  cycleLength?: number;
}): number {
  const len = params.cycleLength ?? REDISTRIBUTION_CYCLE_EPOCHS;
  const end = Math.min(len, Math.max(0, params.epochInCycle));
  let count = 0;
  for (let epochNumber = 1; epochNumber <= end; epochNumber++) {
    if (
      isActivityBitmapBitSet(
        params.activityBitmap,
        epochNumber,
        params.redistributionCycleStartEpoch,
        len
      )
    ) {
      count++;
    }
  }
  return count;
}

/** One square per epoch in the cycle; uses on-chain activity bitmap bits 0…27. */
export function buildRedistributionMarkers(params: {
  cycleLength?: number;
  epochInCycle: number;
  activityBitmap: number;
  participantInCurrentCycle: boolean;
  redistributionCycleStartEpoch: number;
}): EpochMarker[] {
  const cycleLength = params.cycleLength ?? REDISTRIBUTION_CYCLE_EPOCHS;
  const {
    epochInCycle,
    activityBitmap,
    participantInCurrentCycle,
    redistributionCycleStartEpoch,
  } = params;

  return Array.from({ length: cycleLength }, (_, index) => {
    const epochNumber = index + 1;
    const wasActive = isActivityBitmapBitSet(
      activityBitmap,
      epochNumber,
      redistributionCycleStartEpoch,
      cycleLength
    );

    if (!participantInCurrentCycle || epochNumber > epochInCycle) {
      return {
        key: `redistribution-${epochNumber}`,
        epochNumber,
        state: "future" as const,
        isLotteryDrawEpoch: isLotteryDrawEpochMarker(epochNumber),
      };
    }

    if (epochNumber < epochInCycle) {
      return {
        key: `redistribution-${epochNumber}`,
        epochNumber,
        state: wasActive ? ("active" as const) : ("inactive" as const),
        isLotteryDrawEpoch: isLotteryDrawEpochMarker(epochNumber),
      };
    }

    return {
      key: `redistribution-${epochNumber}`,
      epochNumber,
      state: wasActive ? ("current-active" as const) : ("current-inactive" as const),
      isLotteryDrawEpoch: isLotteryDrawEpochMarker(epochNumber),
    };
  });
}

/**
 * Redistribution grid for the **current protocol cycle** — keeps advancing while a
 * past-cycle claim or payout window is open (does not freeze at 28/28).
 */
export function buildLiveRedistributionActivityMarkers(params: {
  currentEpoch: number;
  redistributionCycleStartEpoch: number;
  activityCycleEpoch: number;
  activityBitmap: number;
  cycleLength?: number;
}): EpochMarker[] {
  const len = params.cycleLength ?? REDISTRIBUTION_CYCLE_EPOCHS;
  const inParticipantCycle = isParticipantInActiveRedistributionWindow({
    activityCycleEpoch: params.activityCycleEpoch,
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
    globalEpoch: params.currentEpoch,
    cycleLength: len,
  });
  const epochInCycle = redistributionEpochInCycle(
    params.currentEpoch,
    params.redistributionCycleStartEpoch
  );
  return buildRedistributionMarkers({
    cycleLength: len,
    epochInCycle,
    activityBitmap: inParticipantCycle ? params.activityBitmap : 0,
    participantInCurrentCycle: true,
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
  });
}

/** Completed 28-epoch window — for the small claim sub-panel only. */
export function buildRedistributionClaimCycleMarkers(params: {
  activityCycleStartEpoch: number;
  activityBitmap: number;
  cycleLength?: number;
}): EpochMarker[] {
  const cycleLength = params.cycleLength ?? REDISTRIBUTION_CYCLE_EPOCHS;
  return buildRedistributionMarkers({
    cycleLength,
    epochInCycle: cycleLength,
    activityBitmap: params.activityBitmap,
    participantInCurrentCycle: true,
    redistributionCycleStartEpoch: params.activityCycleStartEpoch,
  });
}

/**
 * Lottery ticket-cycle grid for **ongoing** participation — not frozen during
 * draw-overdue, payout-delay, or claim UI.
 */
export function buildLiveLotteryActivityMarkers(params: {
  currentEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryTicketCycleStart: number;
  participantLotteryCycleStart: number;
  lotteryDrawEpoch?: number;
  lotteryDrawn?: boolean;
  lotteryPaid?: boolean;
  drawOverdue?: boolean;
  cycleLength?: number;
}): Array<{ key: string; epochNumber: number; isCompleted: boolean; isCurrent: boolean }> {
  const cycleLength = params.cycleLength ?? LOTTERY_DRAW_INTERVAL_EPOCHS;
  const inCurrentTicketCycle =
    params.participantLotteryCycleStart >= 0 &&
    params.participantLotteryCycleStart === params.lotteryTicketCycleStart;
  const clock = lotteryClockProgress({
    globalEpoch: params.currentEpoch,
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
    lotteryDrawEpoch: params.lotteryDrawEpoch ?? -1,
    lotteryTicketCycleStart: params.lotteryTicketCycleStart,
    lotteryDrawn: params.lotteryDrawn ?? false,
    lotteryPaid: params.lotteryPaid ?? false,
  });
  const epochInCycle = clock.epochInCycle;
  const completed = inCurrentTicketCycle ? epochInCycle : 1;
  return buildLotteryMarkers({
    cycleLength,
    completedEpochs: completed,
    drawOverdue: false,
  });
}

/** Finished 8-epoch draw interval — claim sub-panel only. */
export function buildLotteryClaimIntervalMarkers(params: {
  cycleLength?: number;
}): Array<{ key: string; epochNumber: number; isCompleted: boolean; isCurrent: boolean }> {
  const cycleLength = params.cycleLength ?? LOTTERY_DRAW_INTERVAL_EPOCHS;
  return buildLotteryMarkers({
    cycleLength,
    completedEpochs: cycleLength,
    drawOverdue: true,
  });
}

export function buildLotteryMarkers(params: {
  completedEpochs: number;
  cycleLength?: number;
  /** When true, all interval epochs are shown as completed (draw window ended). */
  drawOverdue?: boolean;
}): Array<{ key: string; epochNumber: number; isCompleted: boolean; isCurrent: boolean }> {
  const cycleLength = params.cycleLength ?? LOTTERY_DRAW_INTERVAL_EPOCHS;
  if (params.drawOverdue) {
    return Array.from({ length: cycleLength }, (_, index) => {
      const epochNumber = index + 1;
      return {
        key: `loyalty-${epochNumber}`,
        epochNumber,
        isCompleted: true,
        isCurrent: false,
      };
    });
  }
  const completed = Math.min(cycleLength, Math.max(1, params.completedEpochs));
  return Array.from({ length: cycleLength }, (_, index) => {
    const epochNumber = index + 1;
    return {
      key: `loyalty-${epochNumber}`,
      epochNumber,
      isCompleted: epochNumber < completed,
      isCurrent: epochNumber === completed,
    };
  });
}

/** Epochs past the 7-epoch ticket window while draw has not run (0 = still inside window). */
export function lotteryEpochsPastDrawWindow(
  protocolEpoch: number,
  drawWindowAnchor: number
): number {
  if (drawWindowAnchor < 0) return 0;
  const windowEnd = lotterySubWindowEnd(drawWindowAnchor);
  return Math.max(0, protocolEpoch - windowEnd);
}

/** Epoch used to match trade-book `txs_epoch` / volume when keeper lags wall clock. */
export function protocolLedgerEpoch(currentEpoch: number, effectiveEpoch: number): number {
  return Math.max(currentEpoch, effectiveEpoch);
}

/**
 * Whether trade-book counters (`txs_this_epoch`, `epoch_volume`) belong to the epoch shown in UI.
 * Swaps stamp `txs_epoch` with on-chain `accounting.current_epoch` at ledger time; when the keeper
 * has not ticked yet, wall-clock `effectiveEpoch` can be ahead of `currentEpoch`.
 */
export function participantMetricsInDisplayedEpoch(params: {
  participantEpoch: number;
  currentEpoch: number;
  effectiveEpoch: number;
}): boolean {
  const { participantEpoch, currentEpoch, effectiveEpoch } = params;
  if (participantEpoch < 0) return false;
  const ledgerEpoch = protocolLedgerEpoch(currentEpoch, effectiveEpoch);
  if (participantEpoch === currentEpoch || participantEpoch === ledgerEpoch) {
    return true;
  }
  // Keeper lag: ledger may already be on effective epoch while accounting.current_epoch trails.
  if (currentEpoch < effectiveEpoch && participantEpoch === effectiveEpoch) {
    return true;
  }
  return false;
}

/**
 * UI-facing epoch clocks — cycle progress, activity grid, and lottery follow on-chain
 * `protocolEpoch`. Wall-clock `effectiveEpoch` is exposed separately for lag warnings only.
 */
export function resolveEcosystemEpochViews(params: {
  currentEpoch: number;
  effectiveEpoch: number;
  redistributionCycleStartEpoch: number;
  lotteryDrawEpoch: number;
  lotteryTicketCycleStart: number;
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  activityCycleEpoch: number;
  /** Global ticket pool — used to detect missed draw after rollover. */
  totalTickets?: number;
  /** On-chain `accounting.current_epoch` for trade-book window checks. */
  protocolEpoch?: number;
}) {
  const {
    currentEpoch,
    effectiveEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
    lotteryPaid,
    activityCycleEpoch,
    totalTickets = 0,
  } = params;
  const protocolEpoch = params.protocolEpoch ?? currentEpoch;
  /** Lottery draw/skip follows on-chain epoch — wall clock must not run ahead of keeper. */
  const lotteryEpoch = protocolEpoch;

  const participantInCurrentCycle = isParticipantInActiveRedistributionWindow({
    activityCycleEpoch,
    redistributionCycleStartEpoch,
    globalEpoch: protocolEpoch,
  });

  const derivedTicketCycleStart = lotterySubWindowStart(
    redistributionCycleStartEpoch,
    lotteryEpoch
  );
  const effectiveTicketCycleStart = pendingLotteryTicketCycleStart({
    globalEpoch: lotteryEpoch,
    redistributionCycleStartEpoch,
    lotteryTicketCycleStart,
    lotteryDrawn,
    totalTickets,
    lotteryDrawEpoch,
  });

  const lotteryClock = lotteryClockProgress({
    globalEpoch: lotteryEpoch,
    redistributionCycleStartEpoch,
    lotteryDrawn,
    lotteryPaid,
    lotteryDrawEpoch,
    totalTickets,
    lotteryTicketCycleStart:
      lotteryTicketCycleStart >= 0 ? lotteryTicketCycleStart : effectiveTicketCycleStart,
  });

  const lotteryEpochInCycle = lotteryClock.epochInCycle;

  const lotteryMarkerEpoch = lotteryClock.drawPendingPayout
    ? LOTTERY_DRAW_INTERVAL_EPOCHS
    : lotteryEpochInCycle;

  return {
    participantInCurrentCycle,
    redistributionEpochInCycle: redistributionEpochInCycle(
      protocolEpoch,
      redistributionCycleStartEpoch
    ),
    wallClockEpochInCycle: redistributionEpochInCycle(
      effectiveEpoch,
      redistributionCycleStartEpoch
    ),
    lotteryClock,
    lotteryEpochInCycle,
    lotteryMarkerEpoch,
    lotteryEpochsOverdue: lotteryClock.drawOverdue
      ? lotteryEpochsPastDrawWindow(lotteryEpoch, lotteryClock.drawWindowAnchor)
      : 0,
    derivedTicketCycleStart,
  };
}

/**
 * Matches on-chain `current_cycle > user_activity_cycle` in `claim_redistribution`:
 * the user's 28-epoch activity cycle has ended and protocol epoch is in a later cycle
 * (typically the first epoch after rollover — tax from the previous cycle is fixed in
 * `redistribution_share`).
 */
export function isRedistributionClaimCycleComplete(params: {
  protocolEpoch: number;
  activityCycleEpoch: number;
}): boolean {
  if (params.activityCycleEpoch < 0) return false;
  return globalCycleIndex(params.protocolEpoch) > participantCycleIndex(params.activityCycleEpoch);
}

/**
 * Redistribution claim must happen within the next 28-epoch cycle after the user's
 * activity cycle ends — same forfeiture model as lottery `stale_payout`.
 */
export function isRedistributionClaimWindowExpired(params: {
  protocolEpoch: number;
  activityCycleEpoch: number;
}): boolean {
  if (params.activityCycleEpoch < 0) return false;
  const userCycle = participantCycleIndex(params.activityCycleEpoch);
  const protocolCycle = globalCycleIndex(params.protocolEpoch);
  return protocolCycle > userCycle + 1;
}

/** Last protocol epoch (inclusive) of the post-rollover claim window. */
export function redistributionClaimWindowDeadlineEpoch(activityCycleEpoch: number): number {
  const userCycle = participantCycleIndex(activityCycleEpoch);
  if (userCycle < 0) return -1;
  return (userCycle + 2) * REDISTRIBUTION_CYCLE_EPOCHS - 1;
}

/** Epochs remaining to claim before the next redistribution settlement forfeit. */
export function epochsUntilRedistributionClaimExpires(params: {
  protocolEpoch: number;
  activityCycleEpoch: number;
}): number {
  const deadline = redistributionClaimWindowDeadlineEpoch(params.activityCycleEpoch);
  if (deadline < 0) return 0;
  return Math.max(0, deadline - params.protocolEpoch + 1);
}

/** @deprecated Use {@link isRedistributionClaimCycleComplete} — UI follows on-chain rollover, not epoch-28 half. */
export function isRedistributionClaimWindowOpen(params: {
  epochInCycle: number;
  secondsIntoEpoch: number;
}): boolean {
  void params;
  return false;
}

export function countActiveEpochsFromBitmap(activityBitmap: number): number {
  let n = activityBitmap;
  let count = 0;
  while (n > 0) {
    count += n & 1;
    n >>>= 1;
  }
  return count;
}

/** @deprecated Prefer {@link countActiveEpochsInRedistributionWindow} for UI sync. */
export function countActiveEpochsFromBitmapInWindow(
  activityBitmap: number,
  redistributionCycleStartEpoch: number,
  epochInCycle: number,
  cycleLength?: number
): number {
  return countActiveEpochsInRedistributionWindow({
    activityBitmap,
    redistributionCycleStartEpoch,
    epochInCycle,
    cycleLength,
  });
}

/** Lottery tickets earned from gross swap volume in the current lottery cycle (base mint units). */
export function lotteryTicketsFromCycleVolume(volumeBaseUnits: number): number {
  if (volumeBaseUnits <= 0) return 0;
  return Math.min(
    Math.floor(volumeBaseUnits / Number(LOTTERY_TICKET_PER_VOLUME)),
    Number(MAX_LOTTERY_TICKETS)
  );
}

/**
 * Post-claim UI clamp: draw-window `ticket_count` left on a live row while volume only
 * reflects live swaps (`ticket_count` > tickets-from-volume).
 *
 * Do NOT use "volume − epochVolume" heuristics — that false-positives on normal
 * multi-epoch accrual in an open ticket window (first swap of a new epoch).
 */
export function participantLotteryTicketsAfterStaleVolumeBleed(params: {
  ticketCount: number;
  lotteryCycleVolumeRaw: number;
  epochVolumeRaw: number;
  txsThisEpoch: number;
  /** Required — only correct after the user consumed a lottery payout. */
  lotteryClaimConsumed?: boolean;
}): number | null {
  const {
    ticketCount,
    lotteryCycleVolumeRaw,
    lotteryClaimConsumed,
  } = params;
  if (!lotteryClaimConsumed || ticketCount <= 0) {
    return null;
  }
  const fromVolume = lotteryTicketsFromCycleVolume(lotteryCycleVolumeRaw);
  if (ticketCount <= fromVolume) {
    return null;
  }
  return fromVolume;
}

/**
 * UI/on-chain gap: trade-book volume accrued but `ticket_count` still 0.
 * Only for the live ticket cycle — never surface stale orphan-window volume.
 */
export function participantLotteryTicketsFromVolumeFallback(params: {
  ticketCount: number;
  lotteryCycleVolumeRaw: number;
  epochVolumeRaw?: number;
  lotteryCycleStart: number;
  activeTicketCycleStart: number;
  ticketCycleRollPending?: boolean;
}): number {
  const inActiveCycle =
    params.lotteryCycleStart >= 0 &&
    params.lotteryCycleStart === params.activeTicketCycleStart;
  if (!inActiveCycle && !params.ticketCycleRollPending) {
    return 0;
  }
  if (params.ticketCount > 0 && (inActiveCycle || params.ticketCycleRollPending)) {
    return params.ticketCount;
  }
  // Prefer lottery_cycle_volume only — never epochVolume (covers ~1 protocol epoch,
  // not the full lottery sub-window; caused Sony UI to show 15 instead of 30).
  if (inActiveCycle || params.ticketCycleRollPending) {
    return lotteryTicketsFromCycleVolume(params.lotteryCycleVolumeRaw);
  }
  return 0;
}

/** Tickets actually in the global draw pool for this participant (may be < ticket_count if pool desynced). */
export function participantTicketsInGlobalPool(params: {
  ticketStart: number;
  ticketCount: number;
  globalTotalTickets: number;
}): number {
  if (params.ticketCount <= 0) return 0;
  const rangeEnd = params.ticketStart + params.ticketCount;
  if (params.globalTotalTickets < rangeEnd) {
    return Math.max(0, params.globalTotalTickets - params.ticketStart);
  }
  return params.ticketCount;
}

export function lotteryGlobalPoolBehindParticipant(params: {
  ticketStart: number;
  ticketCount: number;
  globalTotalTickets: number;
}): boolean {
  return (
    params.ticketCount > 0 &&
    params.globalTotalTickets < params.ticketStart + params.ticketCount
  );
}

/** Hide false desync when keeper draw is overdue — rollover clears `total_tickets` until reconcile/draw. */
export function shouldWarnLotteryPoolDesync(params: {
  inCurrentTicketCycle: boolean;
  ticketStart: number;
  ticketCount: number;
  onChainGlobalTotalTickets: number;
  drawOverdue: boolean;
  drawPendingPayout: boolean;
}): boolean {
  if (!params.inCurrentTicketCycle || params.ticketCount <= 0) {
    return false;
  }
  if (params.drawOverdue || params.drawPendingPayout) {
    return false;
  }
  return lotteryGlobalPoolBehindParticipant({
    ticketStart: params.ticketStart,
    ticketCount: params.ticketCount,
    globalTotalTickets: params.onChainGlobalTotalTickets,
  });
}

/** @deprecated Use on-chain `ticket_count` or {@link lotteryTicketsFromCycleVolume}. */
export function lotteryTicketsFromEpochVolume(volumeBaseUnits: number): number {
  return lotteryTicketsFromCycleVolume(volumeBaseUnits);
}

export { MIN_ACTIVE_EPOCHS, REDISTRIBUTION_CYCLE_EPOCHS, LOTTERY_DRAW_INTERVAL_EPOCHS, SECONDS_PER_EPOCH };
