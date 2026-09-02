import { PublicKey } from "@solana/web3.js";
import {
  isLotteryClaimEpochReached,
  isStaleLotteryPayoutPending,
  lotteryClockProgress,
  lotteryDrawPoolWindowStart,
  lotterySubWindowStart,
  lotterySubWindowEnd,
  lotteryEffectiveTicketsForPendingWindow,
  lotteryPendingWindowNeedsDraw,
  pendingLotteryTicketCycleStart,
  lotteryWindowRecordedOnChain,
  scheduledLotteryDrawEpoch,
} from "./ecosystemCycle.ts";
import {
  LOTTERY_DRAW_INTERVAL_EPOCHS,
  LOTTERY_MIN_COMMITS_FLOOR,
  LOTTERY_MIN_COMMITS_PERCENT,
  LOTTERY_MIN_TICKETS_FOR_DRAW,
  LOTTERY_PAYOUT_DELAY_SECS,
  LOTTERY_PRIZE_PER_DRAW,
  REDISTRIBUTION_CYCLE_EPOCHS,
} from "./tokenomicsConstants.ts";
import { derivePendingLotteryPayoutPda } from "./lotteryPdas.ts";
import type { TradeBookParticipantSnapshot } from "./tradeBookParticipant.ts";

export type PendingLotteryPayoutSnapshot = {
  address: PublicKey;
  amount: bigint;
  consumed: boolean;
  drawEpoch: number;
  winningTicket: number;
  winner: PublicKey;
};

export type LotteryClaimEligibility = {
  showButton: boolean;
  canExecute: boolean;
  isWinner: boolean;
  hasPendingVoucher: boolean;
  /** User already settled this draw — consumed on-chain voucher. */
  claimedByConsumedVoucher: boolean;
  pendingVoucher?: PendingLotteryPayoutSnapshot;
  estimatedPayout: bigint;
  blockReason?: string;
  payoutDelayRemainingSecs: number;
  /** 7-epoch window ended; keeper must run commit_lottery + draw_lottery on-chain. */
  awaitingKeeperDraw: boolean;
  /** User has tickets in the current on-chain ticket cycle. */
  hasTicketsInCurrentCycle: boolean;
  /** 7-epoch window ended but global pool below min tickets — keeper should skip, not draw. */
  lotteryInsufficientTickets: boolean;
  /** Draw overdue but entropy commits still below on-chain threshold. */
  awaitingKeeperCommits: boolean;
  lotteryCommitCount: number;
  lotteryMinCommits: number;
  /** Global protocol: a ticket window ended and draw/skip not yet settled (all wallets). */
  protocolKeeperPending: boolean;
  globalTotalTickets: number;
  minTicketsForDraw: number;
};

type AccountingLike = {
  lotteryDrawn: boolean;
  lotteryPaid: boolean;
  winningTicket: number;
  lotteryDrawEpoch: number;
  lotteryDrawTime: number;
  lotteryTicketCycleStart: number;
  redistributionCycleStartEpoch: number;
  totalTickets: number;
  lotteryWinner?: PublicKey | null;
  lotteryCommitCount?: number;
  activeUsersSnapshot?: number;
  activeUsersRedistribution?: number;
};

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

function readOptionalPubkey(value: unknown): PublicKey | null {
  if (value == null) return null;
  try {
    const pk = value instanceof PublicKey ? value : new PublicKey(String(value));
    if (pk.equals(PublicKey.default)) return null;
    return pk;
  } catch {
    return null;
  }
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

export function readLotteryAccountingFields(
  raw: Record<string, unknown>
): AccountingLike {
  return {
    lotteryDrawn: Boolean(raw.lotteryDrawn ?? raw.lottery_drawn),
    lotteryPaid: Boolean(raw.lotteryPaid ?? raw.lottery_paid),
    winningTicket: toNum(raw.winningTicket ?? raw.winning_ticket),
    lotteryDrawEpoch: toNum(raw.lotteryDrawEpoch ?? raw.lottery_draw_epoch, -1),
    lotteryDrawTime: toNum(raw.lotteryDrawTime ?? raw.lottery_draw_time),
    lotteryTicketCycleStart: toNum(
      raw.lotteryTicketCycleStart ?? raw.lottery_ticket_cycle_start,
      -1
    ),
    redistributionCycleStartEpoch: toNum(
      raw.redistributionCycleStartEpoch ?? raw.redistribution_cycle_start_epoch,
      -1
    ),
    totalTickets: toNum(raw.totalTickets ?? raw.total_tickets),
    lotteryWinner: readOptionalPubkey(raw.lotteryWinner ?? raw.lottery_winner),
    lotteryCommitCount: toNum(raw.lotteryCommitCount ?? raw.lottery_commit_count),
    activeUsersSnapshot: toNum(raw.activeUsersSnapshot ?? raw.active_users_snapshot),
    activeUsersRedistribution: toNum(
      raw.activeUsersRedistribution ?? raw.active_users_redistribution
    ),
  };
}

/** Mirrors on-chain `lottery_ticket_cycle_start` (redistribution-aligned sub-window). */
export function effectiveLotteryTicketCycleStart(
  accounting: {
    lotteryTicketCycleStart: number;
    lotteryDrawEpoch: number;
    redistributionCycleStartEpoch?: number;
    lotteryDrawn?: boolean;
    lotteryPaid?: boolean;
    totalTickets?: number;
  },
  currentEpoch?: number,
  participantLotteryCycleStart?: number
): number {
  const cycleStart = accounting.redistributionCycleStartEpoch ?? -1;
  let base = -1;
  if (currentEpoch != null && currentEpoch >= 0 && cycleStart >= 0) {
    base = pendingLotteryTicketCycleStart({
      globalEpoch: currentEpoch,
      redistributionCycleStartEpoch: cycleStart,
      lotteryTicketCycleStart: accounting.lotteryTicketCycleStart,
      lotteryDrawn: accounting.lotteryDrawn ?? false,
      totalTickets: accounting.totalTickets ?? 0,
      lotteryDrawEpoch: accounting.lotteryDrawEpoch,
    });
  } else if (accounting.lotteryTicketCycleStart > 0) {
    base = accounting.lotteryTicketCycleStart;
  } else if (accounting.lotteryDrawEpoch >= 0) {
    base = accounting.lotteryDrawEpoch;
  }

  if (
    participantLotteryCycleStart != null &&
    participantLotteryCycleStart >= 0 &&
    currentEpoch != null &&
    cycleStart >= 0 &&
    !(accounting.lotteryDrawn && !(accounting.lotteryPaid ?? false))
  ) {
    const liveSub = lotterySubWindowStart(cycleStart, currentEpoch);
    if (
      participantLotteryCycleStart >= liveSub &&
      participantLotteryCycleStart > base
    ) {
      return participantLotteryCycleStart;
    }
  }
  return base;
}

/** On-chain minimum commit_lottery count before draw_lottery. */
export function lotteryMinCommitsRequired(accounting: AccountingLike): number {
  const active =
    (accounting.activeUsersSnapshot ?? 0) > 0
      ? (accounting.activeUsersSnapshot ?? 0)
      : (accounting.activeUsersRedistribution ?? 0);
  return Math.max(
    LOTTERY_MIN_COMMITS_FLOOR,
    Math.floor((active * LOTTERY_MIN_COMMITS_PERCENT) / 100)
  );
}

/** Mirrors on-chain `participant_holds_pending_lottery_win`. */
export function participantHoldsPendingLotteryWin(params: {
  participant: TradeBookParticipantSnapshot;
  winningTicket: number;
  lotteryTicketCycleStart: number;
  lotteryDrawEpoch?: number;
  redistributionCycleStartEpoch?: number;
  lotteryDrawn?: boolean;
  lotteryPaid?: boolean;
  globalEpoch?: number;
  lotteryWinner?: PublicKey | null;
  globalTotalTickets?: number;
}): boolean {
  const {
    participant,
    winningTicket,
    lotteryTicketCycleStart,
    lotteryDrawEpoch = -1,
    redistributionCycleStartEpoch = -1,
    lotteryDrawn = false,
    lotteryPaid = false,
    globalEpoch = -1,
    lotteryWinner = null,
    globalTotalTickets = 0,
  } = params;
  if (!(lotteryDrawn && !lotteryPaid) || winningTicket < 0) {
    return false;
  }
  if (
    globalEpoch >= 0 &&
    redistributionCycleStartEpoch >= 0 &&
    isStaleLotteryPayoutPending({
      globalEpoch,
      redistributionCycleStartEpoch,
      lotteryDrawn,
      lotteryPaid,
      lotteryDrawEpoch,
      lotteryTicketCycleStart,
    })
  ) {
    return false;
  }

  // On-chain `lottery_winner` is authoritative. After a swap in the live window,
  // `lottery_cycle_start` (and sometimes ticket anchors) move — still treat as
  // pending claim so the claim button does not disappear.
  if (lotteryWinner?.equals(participant.owner)) {
    return true;
  }

  if (participant.ticketCount <= 0) {
    return false;
  }
  const start = participant.ticketStart;
  const end = start + participant.ticketCount;
  if (winningTicket < start || winningTicket >= end) return false;

  return participantTicketsInDrawWindow({
    participant,
    lotteryTicketCycleStart,
    lotteryDrawEpoch,
    redistributionCycleStartEpoch,
  });
}

/** Participant tickets belong to the drawn lottery sub-window (not a later live window). */
export function participantTicketsInDrawWindow(params: {
  participant: Pick<TradeBookParticipantSnapshot, "lotteryCycleStart" | "ticketEpoch">;
  lotteryTicketCycleStart: number;
  lotteryDrawEpoch: number;
  redistributionCycleStartEpoch: number;
}): boolean {
  if (params.lotteryDrawEpoch < 0 || params.redistributionCycleStartEpoch < 0) {
    return false;
  }
  const poolStart = lotteryDrawPoolWindowStart({
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
    lotteryDrawEpoch: params.lotteryDrawEpoch,
    lotteryTicketCycleStart: params.lotteryTicketCycleStart,
  });
  if (poolStart < 0) {
    return false;
  }
  return (
    params.participant.lotteryCycleStart === poolStart ||
    params.participant.ticketEpoch === poolStart
  );
}

/** True when participant row still carries tickets from a concluded draw window. */
export function participantTicketsFromSettledDrawWindow(params: {
  participant: Pick<TradeBookParticipantSnapshot, "lotteryCycleStart" | "ticketEpoch" | "ticketCount">;
  lotteryDrawEpoch: number;
  lotteryTicketCycleStart: number;
  redistributionCycleStartEpoch: number;
}): boolean {
  if (params.participant.ticketCount <= 0) {
    return false;
  }
  return participantTicketsInDrawWindow({
    participant: params.participant,
    lotteryDrawEpoch: params.lotteryDrawEpoch,
    lotteryTicketCycleStart: params.lotteryTicketCycleStart,
    redistributionCycleStartEpoch: params.redistributionCycleStartEpoch,
  });
}

function participantOwnsWinningTicket(params: {
  participant: TradeBookParticipantSnapshot;
  winningTicket: number;
  lotteryTicketCycleStart: number;
  lotteryDrawEpoch?: number;
  redistributionCycleStartEpoch?: number;
  lotteryDrawn?: boolean;
  lotteryPaid?: boolean;
  globalEpoch?: number;
  /** Draw finished; payout not claimed — ticket range is authoritative. */
  drawPendingPayout?: boolean;
  /** Pending on-chain voucher already validated the draw window. */
  trustPendingVoucher?: boolean;
  lotteryWinner?: PublicKey | null;
  globalTotalTickets?: number;
}): boolean {
  const {
    participant,
    winningTicket,
    lotteryTicketCycleStart,
    lotteryDrawEpoch = -1,
    redistributionCycleStartEpoch = -1,
    lotteryDrawn = false,
    lotteryPaid = false,
    globalEpoch = -1,
    drawPendingPayout = false,
    trustPendingVoucher = false,
    lotteryWinner = null,
    globalTotalTickets = 0,
  } = params;

  if (drawPendingPayout || trustPendingVoucher) {
    return participantHoldsPendingLotteryWin({
      participant,
      winningTicket,
      lotteryTicketCycleStart,
      lotteryDrawEpoch,
      redistributionCycleStartEpoch,
      lotteryDrawn,
      lotteryPaid,
      globalEpoch,
      lotteryWinner,
      globalTotalTickets,
    });
  }

  if (participant.ticketCount <= 0 || winningTicket < 0) return false;
  const start = participant.ticketStart;
  const end = start + participant.ticketCount;
  if (winningTicket < start || winningTicket >= end) return false;

  return participantTicketsInDrawWindow({
    participant,
    lotteryTicketCycleStart,
    lotteryDrawEpoch,
    redistributionCycleStartEpoch,
  });
}

/** Pending voucher must belong to the active redistribution cycle and match open draw state. */
export function isPendingVoucherInActiveCycle(params: {
  voucher: PendingLotteryPayoutSnapshot;
  accounting: AccountingLike;
  currentEpoch?: number;
}): boolean {
  const { voucher, accounting } = params;
  const cycleStart = accounting.redistributionCycleStartEpoch;
  if (cycleStart < 0 || voucher.drawEpoch < 0) return false;

  const poolStart = lotteryDrawPoolWindowStart({
    redistributionCycleStartEpoch: cycleStart,
    lotteryDrawEpoch: voucher.drawEpoch,
    lotteryTicketCycleStart: accounting.lotteryTicketCycleStart,
  });
  if (poolStart < cycleStart || poolStart >= cycleStart + REDISTRIBUTION_CYCLE_EPOCHS) {
    return false;
  }

  const currentEpoch = params.currentEpoch ?? -1;
  if (
    currentEpoch >= 0 &&
    isStaleLotteryPayoutPending({
      globalEpoch: currentEpoch,
      redistributionCycleStartEpoch: cycleStart,
      lotteryDrawn: true,
      lotteryPaid: false,
      lotteryDrawEpoch: voucher.drawEpoch,
      lotteryTicketCycleStart: poolStart,
    })
  ) {
    return false;
  }

  if (accounting.lotteryDrawn && !accounting.lotteryPaid && accounting.lotteryDrawEpoch >= 0) {
    return voucher.drawEpoch === accounting.lotteryDrawEpoch;
  }

  // No open draw on accounting — do not treat orphan vouchers as claimable.
  return false;
}

export function evaluateLotteryClaimEligibility(params: {
  accounting: AccountingLike;
  participant: TradeBookParticipantSnapshot | null;
  pendingVoucher?: PendingLotteryPayoutSnapshot | null;
  /** On-chain `accounting.current_epoch` — required for draw-overdue detection. */
  currentEpoch?: number;
  now?: number;
}): LotteryClaimEligibility {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const { accounting, participant, pendingVoucher } = params;
  const currentEpoch = params.currentEpoch ?? -1;

  const payoutReadyAt =
    accounting.lotteryDrawTime + Number(LOTTERY_PAYOUT_DELAY_SECS);
  const payoutDelayRemainingSecs = Math.max(0, payoutReadyAt - now);

  const effectiveCycleStart = effectiveLotteryTicketCycleStart(
    accounting,
    currentEpoch
  );

  const lotteryClock =
    currentEpoch >= 0 && accounting.redistributionCycleStartEpoch >= 0
      ? lotteryClockProgress({
          globalEpoch: currentEpoch,
          redistributionCycleStartEpoch: accounting.redistributionCycleStartEpoch,
          lotteryDrawn: accounting.lotteryDrawn,
          lotteryPaid: accounting.lotteryPaid,
          lotteryDrawEpoch: accounting.lotteryDrawEpoch,
          lotteryTicketCycleStart: effectiveCycleStart,
          totalTickets: accounting.totalTickets,
        })
      : null;

  const liveTicketCycleStart =
    lotteryClock?.drawPendingPayout && !lotteryClock.staleDrawPayoutPending
      ? lotteryClock.liveWindowAnchor
      : effectiveCycleStart;

  const hasTicketsInCurrentCycle =
    participant != null &&
    participant.ticketCount > 0 &&
    participant.lotteryCycleStart === liveTicketCycleStart;

  const minTicketsForDraw = Number(LOTTERY_MIN_TICKETS_FOR_DRAW);
  const globalTotalTickets = accounting.totalTickets;
  const pendingWindowStart =
    lotteryClock?.drawOverdue && lotteryClock.drawWindowAnchor >= 0
      ? lotteryClock.drawWindowAnchor
      : effectiveCycleStart;
  const liveWindowAnchor = lotteryClock?.liveWindowAnchor ?? pendingWindowStart;
  const pendingWindowTickets = lotteryClock
    ? lotteryEffectiveTicketsForPendingWindow({
        pendingWindowStart,
        liveWindowAnchor,
        lotteryTicketCycleStart: effectiveCycleStart,
        totalTickets: globalTotalTickets,
      })
    : globalTotalTickets;
  const staleEmptyPendingWindow = Boolean(
    lotteryClock?.drawOverdue &&
      !accounting.lotteryDrawn &&
      pendingWindowTickets < minTicketsForDraw &&
      effectiveCycleStart >= liveWindowAnchor
  );
  const lotteryInsufficientTickets = Boolean(
    lotteryClock?.drawOverdue &&
      !accounting.lotteryDrawn &&
      pendingWindowTickets < minTicketsForDraw &&
      !staleEmptyPendingWindow
  );

  const lotteryMinCommits = lotteryMinCommitsRequired(accounting);
  const lotteryCommitCount = accounting.lotteryCommitCount ?? 0;
  const awaitingKeeperCommits = Boolean(
    lotteryClock?.drawOverdue &&
      !accounting.lotteryDrawn &&
      !lotteryInsufficientTickets &&
      pendingWindowTickets >= minTicketsForDraw &&
      lotteryCommitCount < lotteryMinCommits
  );
  const awaitingKeeperDraw = Boolean(
    lotteryClock?.drawOverdue &&
      !accounting.lotteryDrawn &&
      !lotteryInsufficientTickets &&
      pendingWindowTickets >= minTicketsForDraw &&
      !awaitingKeeperCommits
  );

  const participantWindowStart = participant?.lotteryCycleStart ?? -1;
  const participantWindowEnded =
    participantWindowStart >= 0 &&
    currentEpoch >= 0 &&
    currentEpoch > lotterySubWindowEnd(participantWindowStart);
  const participantWindowNeedsDraw =
    participant != null &&
    (participant.ticketCount ?? 0) > 0 &&
    participantWindowEnded &&
    !accounting.lotteryDrawn &&
    !lotteryWindowRecordedOnChain({
      lotteryDrawEpoch: accounting.lotteryDrawEpoch,
      windowStart: participantWindowStart,
      redistributionCycleStartEpoch: accounting.redistributionCycleStartEpoch,
      lotteryTicketCycleStart: participantWindowStart,
    });
  const participantPendingTickets =
    participantWindowNeedsDraw && participant
      ? Math.max(
          pendingWindowTickets,
          participant.ticketStart + participant.ticketCount
        )
      : pendingWindowTickets;
  const awaitingKeeperDrawWithParticipant =
    participantWindowNeedsDraw && participantPendingTickets >= minTicketsForDraw;
  const effectiveAwaitingKeeperDraw =
    awaitingKeeperDraw || awaitingKeeperDrawWithParticipant;

  const protocolKeeperPending =
    currentEpoch >= 0 &&
    accounting.redistributionCycleStartEpoch >= 0 &&
    lotteryPendingWindowNeedsDraw({
      globalEpoch: currentEpoch,
      redistributionCycleStartEpoch: accounting.redistributionCycleStartEpoch,
      lotteryDrawn: accounting.lotteryDrawn,
      lotteryPaid: accounting.lotteryPaid,
      lotteryDrawEpoch: accounting.lotteryDrawEpoch,
      lotteryTicketCycleStart: effectiveCycleStart,
      totalTickets: globalTotalTickets,
    });

  const pendingForUser =
    pendingVoucher &&
    !pendingVoucher.consumed &&
    participant &&
    pendingVoucher.winner.equals(participant.owner) &&
    isPendingVoucherInActiveCycle({
      voucher: pendingVoucher,
      accounting,
      currentEpoch,
    });
  const consumedVoucherForUser = userHasConsumedLotteryVoucher({
    pendingVoucher,
    participant,
    accounting,
    currentEpoch,
  });

  const staleDrawPayoutPending = Boolean(lotteryClock?.staleDrawPayoutPending);

  const claimEpochReached =
    currentEpoch < 0 ||
    accounting.lotteryDrawEpoch < 0 ||
    isLotteryClaimEpochReached({
      globalEpoch: currentEpoch,
      lotteryDrawEpoch: accounting.lotteryDrawEpoch,
      redistributionCycleStartEpoch: accounting.redistributionCycleStartEpoch,
      lotteryTicketCycleStart: accounting.lotteryTicketCycleStart,
    });

  const drawPendingPayout =
    (accounting.lotteryDrawn && !accounting.lotteryPaid) || Boolean(pendingForUser);

  const effectiveWinningTicket =
    accounting.winningTicket > 0
      ? accounting.winningTicket
      : pendingVoucher && !pendingVoucher.consumed
        ? pendingVoucher.winningTicket
        : 0;

  const winnerByPubkey =
    participant != null &&
    drawPendingPayout &&
    accounting.lotteryWinner != null &&
    accounting.lotteryWinner.equals(participant.owner);

  const isWinner =
    winnerByPubkey ||
    (participant != null &&
      !accounting.lotteryPaid &&
      drawPendingPayout &&
      participantOwnsWinningTicket({
        participant,
        winningTicket: effectiveWinningTicket,
        lotteryTicketCycleStart: accounting.lotteryTicketCycleStart,
        lotteryDrawEpoch: accounting.lotteryDrawEpoch,
        redistributionCycleStartEpoch: accounting.redistributionCycleStartEpoch,
        lotteryDrawn: accounting.lotteryDrawn,
        lotteryPaid: accounting.lotteryPaid,
        globalEpoch: currentEpoch,
        drawPendingPayout,
        trustPendingVoucher: Boolean(pendingForUser),
        lotteryWinner: accounting.lotteryWinner,
        globalTotalTickets: globalTotalTickets,
      }));

  // After claim deadline (7-epoch window): payout forfeited — keeper runs expire_stale_lottery_payout.
  const winnerCanStillClaim =
    !staleDrawPayoutPending &&
    !consumedVoucherForUser &&
    (Boolean(pendingForUser) || (drawPendingPayout && isWinner));

  const showButton =
    winnerCanStillClaim &&
    claimEpochReached;

  const blockers: string[] = [];
  if (staleDrawPayoutPending && (drawPendingPayout || Boolean(pendingForUser) || isWinner)) {
    blockers.push("stale_payout");
  } else if (!claimEpochReached && drawPendingPayout && isWinner) {
    blockers.push("claim_epoch_not_reached");
  }
  else if (lotteryInsufficientTickets) blockers.push("insufficient_tickets");
  else if (awaitingKeeperCommits) blockers.push("awaiting_keeper_commits");
  else if (effectiveAwaitingKeeperDraw) blockers.push("awaiting_keeper_draw");
  else if (!drawPendingPayout) blockers.push("no_draw");
  else if (consumedVoucherForUser) blockers.push("already_paid");
  else if (accounting.lotteryPaid) blockers.push("already_paid");
  else if (payoutDelayRemainingSecs > 0 && !pendingForUser) {
    blockers.push("payout_delay");
  }
  else if (!participant) blockers.push("no_participant");
  else if (!isWinner && !pendingForUser) blockers.push("not_winner");

  const estimatedPayout =
    pendingForUser && pendingVoucher && !pendingVoucher.consumed
      ? pendingVoucher.amount
      : isWinner && !consumedVoucherForUser && drawPendingPayout
        ? LOTTERY_PRIZE_PER_DRAW
        : 0n;

  return {
    showButton,
    canExecute: showButton && blockers.length === 0,
    isWinner,
    hasPendingVoucher: Boolean(pendingForUser),
    claimedByConsumedVoucher: consumedVoucherForUser,
    pendingVoucher: pendingForUser ? pendingVoucher ?? undefined : undefined,
    estimatedPayout,
    blockReason: blockers[0],
    payoutDelayRemainingSecs,
    awaitingKeeperDraw: effectiveAwaitingKeeperDraw,
    awaitingKeeperCommits,
    protocolKeeperPending,
    lotteryCommitCount,
    lotteryMinCommits,
    hasTicketsInCurrentCycle,
    lotteryInsufficientTickets,
    globalTotalTickets,
    minTicketsForDraw,
  };
}

/** Collect draw epochs that may still hold an open payout voucher for this user. */
export function lotteryDrawEpochsToProbe(params: {
  accounting: AccountingLike;
  participant?: TradeBookParticipantSnapshot | null;
  extraDrawEpochs?: number[];
  /** Latch draw epoch — only probed when it matches the active cycle. */
  latchDrawEpoch?: number;
}): number[] {
  const epochs = new Set<number>();
  const { accounting, participant } = params;
  const cycleStart = accounting.redistributionCycleStartEpoch;

  const inActiveCycle = (drawEpoch: number): boolean => {
    if (drawEpoch < 0 || cycleStart < 0) return false;
    const poolStart = lotteryDrawPoolWindowStart({
      redistributionCycleStartEpoch: cycleStart,
      lotteryDrawEpoch: drawEpoch,
      lotteryTicketCycleStart: accounting.lotteryTicketCycleStart,
    });
    return poolStart >= cycleStart && poolStart < cycleStart + REDISTRIBUTION_CYCLE_EPOCHS;
  };

  if (accounting.lotteryDrawEpoch >= 0 && inActiveCycle(accounting.lotteryDrawEpoch)) {
    epochs.add(accounting.lotteryDrawEpoch);
  }
  if (cycleStart >= 0 && accounting.lotteryTicketCycleStart >= 0) {
    const ticketDraw = scheduledLotteryDrawEpoch(accounting.lotteryTicketCycleStart);
    if (
      accounting.lotteryTicketCycleStart >= cycleStart &&
      inActiveCycle(ticketDraw)
    ) {
      epochs.add(ticketDraw);
    }
    if (accounting.lotteryDrawEpoch >= 0) {
      const poolStart = lotteryDrawPoolWindowStart({
        redistributionCycleStartEpoch: cycleStart,
        lotteryDrawEpoch: accounting.lotteryDrawEpoch,
        lotteryTicketCycleStart: accounting.lotteryTicketCycleStart,
      });
      if (poolStart >= cycleStart) {
        const poolDraw = scheduledLotteryDrawEpoch(poolStart);
        if (inActiveCycle(poolDraw)) epochs.add(poolDraw);
      }
    }
  }
  if (participant && cycleStart >= 0) {
    for (const anchor of [participant.ticketEpoch, participant.lotteryCycleStart]) {
      if (anchor >= cycleStart && anchor < cycleStart + REDISTRIBUTION_CYCLE_EPOCHS) {
        const draw = scheduledLotteryDrawEpoch(anchor);
        if (inActiveCycle(draw)) epochs.add(draw);
        const prior = anchor - LOTTERY_DRAW_INTERVAL_EPOCHS;
        if (prior >= cycleStart) {
          const priorDraw = scheduledLotteryDrawEpoch(prior);
          if (inActiveCycle(priorDraw)) epochs.add(priorDraw);
        }
      }
    }
  }
  if (params.latchDrawEpoch != null && params.latchDrawEpoch >= 0 && inActiveCycle(params.latchDrawEpoch)) {
    epochs.add(params.latchDrawEpoch);
  }
  for (const e of params.extraDrawEpochs ?? []) {
    if (e >= 0 && inActiveCycle(e)) epochs.add(e);
  }
  return [...epochs];
}

/** True when an on-chain lottery voucher for this user was already consumed. */
export function userHasConsumedLotteryVoucher(params: {
  pendingVoucher?: PendingLotteryPayoutSnapshot | null;
  participant: TradeBookParticipantSnapshot | null;
  accounting: AccountingLike;
  currentEpoch?: number;
}): boolean {
  const { pendingVoucher, participant, accounting } = params;
  if (
    !pendingVoucher?.consumed ||
    !participant ||
    !pendingVoucher.winner.equals(participant.owner)
  ) {
    return false;
  }
  const cycleStart = accounting.redistributionCycleStartEpoch;
  if (cycleStart < 0) return pendingVoucher.drawEpoch === accounting.lotteryDrawEpoch;
  const poolStart = lotteryDrawPoolWindowStart({
    redistributionCycleStartEpoch: cycleStart,
    lotteryDrawEpoch: pendingVoucher.drawEpoch,
    lotteryTicketCycleStart: accounting.lotteryTicketCycleStart,
  });
  if (poolStart < cycleStart || poolStart >= cycleStart + REDISTRIBUTION_CYCLE_EPOCHS) {
    return false;
  }
  const currentEpoch = params.currentEpoch ?? -1;
  if (
    currentEpoch >= 0 &&
    isStaleLotteryPayoutPending({
      globalEpoch: currentEpoch,
      redistributionCycleStartEpoch: cycleStart,
      lotteryDrawn: true,
      lotteryPaid: false,
      lotteryDrawEpoch: pendingVoucher.drawEpoch,
      lotteryTicketCycleStart: poolStart,
    })
  ) {
    return false;
  }
  return (
    // Only the voucher for the *current* unpaid draw counts as "already claimed".
    // A consumed voucher from an earlier draw in the same cycle must not block the next win.
    pendingVoucher.drawEpoch === accounting.lotteryDrawEpoch
  );
}

export async function fetchConsumedLotteryPayoutForUser(params: {
  connection: {
    getAccountInfo: (pk: PublicKey) => Promise<{ data: Buffer } | null>;
    getMultipleAccountsInfo?: (
      pks: PublicKey[]
    ) => Promise<Array<{ data: Buffer | Uint8Array } | null>>;
  };
  program: {
    account: {
      pendingLotteryPayout: {
        fetch: (pda: PublicKey) => Promise<Record<string, unknown>>;
      };
    };
  };
  programId: PublicKey;
  user: PublicKey;
  drawEpochs: number[];
}): Promise<PendingLotteryPayoutSnapshot | null> {
  const epochs = [...new Set(params.drawEpochs.filter((e) => e >= 0))];
  if (epochs.length === 0) return null;
  const snapshots = await fetchLotteryPayoutSnapshotsBatched({
    connection: params.connection,
    programId: params.programId,
    drawEpochs: epochs,
  });
  for (const pending of snapshots) {
    if (
      pending?.consumed &&
      pending.amount > 0n &&
      pending.winner.equals(params.user)
    ) {
      return pending;
    }
  }
  return null;
}

export async function fetchPendingLotteryPayoutAny(params: {
  connection: {
    getAccountInfo: (pk: PublicKey) => Promise<{ data: Buffer } | null>;
    getMultipleAccountsInfo?: (
      pks: PublicKey[]
    ) => Promise<Array<{ data: Buffer | Uint8Array } | null>>;
  };
  program: {
    account: {
      pendingLotteryPayout: {
        fetch: (pda: PublicKey) => Promise<Record<string, unknown>>;
      };
    };
  };
  programId: PublicKey;
  drawEpochs: number[];
}): Promise<PendingLotteryPayoutSnapshot | null> {
  const epochs = [...new Set(params.drawEpochs.filter((e) => e >= 0))];
  if (epochs.length === 0) return null;
  const snapshots = await fetchLotteryPayoutSnapshotsBatched({
    connection: params.connection,
    programId: params.programId,
    drawEpochs: epochs,
  });
  for (const pending of snapshots) {
    if (pending && !pending.consumed && pending.amount > 0n) {
      return pending;
    }
  }
  return null;
}

/** [8 disc][32 mint][32 source][32 winner][8 draw][8 ticket][8 amount][8 prepared][1 consumed][1 bump] */
export function decodePendingLotteryPayoutRaw(
  address: PublicKey,
  data: Buffer
): PendingLotteryPayoutSnapshot | null {
  if (!data || data.length < 138) return null;
  try {
    const winner = new PublicKey(data.subarray(72, 104));
    const drawEpoch = Number(data.readBigInt64LE(104));
    const winningTicket = Number(data.readBigUInt64LE(112));
    const amount = data.readBigUInt64LE(120);
    const consumed = data[136] !== 0;
    return {
      address,
      amount,
      consumed,
      drawEpoch,
      winningTicket,
      winner,
    };
  } catch {
    return null;
  }
}

async function fetchLotteryPayoutSnapshotsBatched(params: {
  connection: {
    getAccountInfo: (pk: PublicKey) => Promise<{ data: Buffer } | null>;
    getMultipleAccountsInfo?: (
      pks: PublicKey[]
    ) => Promise<Array<{ data: Buffer | Uint8Array } | null>>;
  };
  programId: PublicKey;
  drawEpochs: number[];
}): Promise<Array<PendingLotteryPayoutSnapshot | null>> {
  const pdas = params.drawEpochs.map((lotteryDrawEpoch) =>
    derivePendingLotteryPayoutPda({
      programId: params.programId,
      lotteryDrawEpoch,
    })
  );
  let infos: Array<{ data: Buffer | Uint8Array } | null> = [];
  if (typeof params.connection.getMultipleAccountsInfo === "function") {
    try {
      infos = await params.connection.getMultipleAccountsInfo(pdas);
    } catch {
      infos = [];
    }
  }
  if (infos.length !== pdas.length) {
    infos = await Promise.all(
      pdas.map((pda) => params.connection.getAccountInfo(pda).catch(() => null))
    );
  }
  return pdas.map((pda, i) => {
    const info = infos[i];
    if (!info?.data) return null;
    return decodePendingLotteryPayoutRaw(pda, Buffer.from(info.data));
  });
}

export async function fetchPendingLotteryPayout(params: {
  connection: { getAccountInfo: (pk: PublicKey) => Promise<{ data: Buffer } | null> };
  program: {
    account: {
      pendingLotteryPayout: {
        fetch: (pda: PublicKey) => Promise<Record<string, unknown>>;
      };
    };
  };
  programId: PublicKey;
  lotteryDrawEpoch: number;
}): Promise<PendingLotteryPayoutSnapshot | null> {
  const pda = derivePendingLotteryPayoutPda({
    programId: params.programId,
    lotteryDrawEpoch: params.lotteryDrawEpoch,
  });

  try {
    const info = await params.connection.getAccountInfo(pda);
    if (!info?.data) return null;
    return decodePendingLotteryPayoutRaw(pda, Buffer.from(info.data));
  } catch {
    return null;
  }
}
