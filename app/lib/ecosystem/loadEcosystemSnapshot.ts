import { Program } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

import type { SupportedCluster } from '../../../shared/core/programIds.ts';
import {
  buildLiveRedistributionActivityMarkers,
  buildRedistributionClaimCycleMarkers,
  countActiveEpochsInRedistributionWindow,
  shouldWarnLotteryPoolDesync,
  lotteryAwaitingDrawMarker,
  lotteryTicketsFromCycleVolume,
  nextLotteryDrawEpochInCycle,
  participantMetricsInDisplayedEpoch,
  participantTicketsInGlobalPool,
  MIN_ACTIVE_EPOCHS,
  protocolLedgerEpoch,
  resolveEcosystemEpochViews,
  activeLotteryTicketCycleStart,
  isLotteryClaimEpochReached,
  lotteryDrawMarkerEpochInCycle,
  lotteryDrawPoolWindowStart,
  resolveDisplayedGlobalLotteryTickets,
  resolveParticipantLotteryTicketsForDisplay,
  resolveLiveCycleLotteryTicketsWhilePayoutPending,
  participantLotteryTicketsFromVolumeFallback,
  participantLotteryWindowDrawSettled,
  REDISTRIBUTION_CYCLE_EPOCHS,
  LOTTERY_DRAW_INTERVAL_EPOCHS,
  isParticipantInActiveRedistributionWindow,
  lotterySubWindowStart,
  lotterySubWindowEnd,
  scheduledLotteryDrawMarkerInCycle,
  isRedistributionClaimCycleComplete,
  globalCycleIndex,
  type EpochMarker,
} from '../../../shared/pierron/ecosystemCycle.ts';
import {
  evaluateLotteryClaimEligibility,
  effectiveLotteryTicketCycleStart,
  fetchConsumedLotteryPayoutForUser,
  fetchPendingLotteryPayout,
  fetchPendingLotteryPayoutAny,
  lotteryDrawEpochsToProbe,
  participantHoldsPendingLotteryWin,
  participantTicketsInDrawWindow,
  readLotteryAccountingFields,
  type PendingLotteryPayoutSnapshot,
} from '../../../shared/pierron/lotteryClaimEligibility.ts';
import {
  countConsumedRedistributionClaimsForUser,
  evaluateRedistributionClaimEligibility,
  fetchPendingRedistributionClaim,
  fetchPendingRedistributionClaimAny,
  effectiveRedistributionActiveEpochs,
  effectiveRedistributionActivityBitmap,
  liveRedistributionActivityBitmap,
  effectiveLiveActivityCycleEpoch,
  hasClaimableUnclaimedRedistributionSnapshot,
  hasStaleTradeBookAfterClaim,
  hasUnclaimedRedistributionSnapshot,
  participantHasLiveSwapThisEpoch,
  readAccountingFields,
  resolveRedistributionClaimActivityCycleEpoch,
  type PendingRedistributionClaimSnapshot,
} from '../../../shared/pierron/redistributionClaimEligibility.ts';
import { formatRedistributionPoolQualificationLines } from '../../../shared/pierron/redistributionPoolQualificationUi.ts';
import {
  fetchTradeBookParticipant,
  fetchTradeBookLotteryCycleTicketTotal,
  type TradeBookParticipantSnapshot,
} from '../../../shared/pierron/tradeBookParticipant.ts';
import {
  baseUnitsToUi,
  inferSecondsPerEpoch,
  LOTTERY_TICKET_PER_VOLUME,
  SECONDS_PER_EPOCH,
} from '../../../shared/pierron/tokenomicsConstants';
import {
  onChainEpochOverdueSeconds,
  secondsUntilOnChainEpochEnd,
} from '../../../shared/pierron/epochTimeDisplay.ts';
import type { Translations } from '../../i18n/pl';
import { formatMessage } from '../formatMessage';
import { TOKEN_2022_PROGRAM_ID } from '../pierronDevnet';
import { mapClaimBlockReasonToMessage } from './claimBlockMessages';
import { fetchDeflationSnapshot } from './deflationSnapshot';
import type { DeflationSnapshot, EcosystemSnapshot } from './types';

const ECOSYSTEM_RPC_TIMEOUT_MS = 20_000;
const TRADE_BOOK_POOL_SCAN_TIMEOUT_MS = 8_000;

function rpcWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  _label?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('rpc_timeout')), ms);
    }),
  ]);
}

function toNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object' && value && 'toString' in value) {
    const parsed = Number((value as { toString(): string }).toString());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function read(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj && key in obj) return obj[key];
  }
  return undefined;
}

function formatDuration(seconds: number, t: Translations): string {
  const sec = Math.max(0, Math.floor(seconds));
  if (sec <= 0) return t.common.mniejNizMin;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function formatEpochTimeLeft(
  now: number,
  epochStartTime: number,
  epochSyncLag: number,
  genesisElapsed: number,
  t: Translations,
  secondsPerEpoch: number = SECONDS_PER_EPOCH
): string {
  const onChainLeft = secondsUntilOnChainEpochEnd({
    now,
    epochStartTime,
    secondsPerEpoch,
  });
  const onChainOverdue = onChainEpochOverdueSeconds({
    now,
    epochStartTime,
    secondsPerEpoch,
  });
  if (epochSyncLag > 1) {
    return formatMessage(t.ecosystem.epochKeeperLag, { n: epochSyncLag });
  }
  if (epochSyncLag > 0 || onChainOverdue > 0) {
    if (onChainOverdue > 0) {
      return formatMessage(t.ecosystem.epochOnChainOverdue, {
        duration: formatDuration(onChainOverdue, t),
      });
    }
    return formatMessage(t.ecosystem.epochKeeperLag, { n: epochSyncLag });
  }
  if (Number.isFinite(onChainLeft)) {
    if (onChainLeft <= 0) {
      return formatMessage(t.ecosystem.epochOnChainOverdue, {
        duration: formatDuration(onChainOverdue, t),
      });
    }
    return formatDuration(onChainLeft, t);
  }
  return formatDuration(secondsPerEpoch - (genesisElapsed % secondsPerEpoch), t);
}

async function fetchPierronTokenBalanceRaw(params: {
  connection: Connection;
  owner: PublicKey;
  mint: PublicKey;
}): Promise<bigint> {
  try {
    const ata = getAssociatedTokenAddressSync(
      params.mint,
      params.owner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const acc = await getAccount(
      params.connection,
      ata,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    return acc.amount;
  } catch {
    return 0n;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PierronProgram = Program<any>;

export async function loadEcosystemSnapshot(params: {
  connection: Connection;
  program: PierronProgram;
  wallet: PublicKey | null;
  cluster: SupportedCluster;
  tokenMint: PublicKey;
  programId: PublicKey;
  t: Translations;
}): Promise<{
  snapshot: EcosystemSnapshot;
  deflation: DeflationSnapshot;
  participant: TradeBookParticipantSnapshot | null;
  liveRedistributionMarkers: EpochMarker[];
  claimRedistributionMarkers: EpochMarker[] | null;
  redistributionQualLines: string[];
}> {
  const { connection, program, wallet, cluster, tokenMint, programId, t } = params;
  const programAny = program as any;
  const connectionAny = connection as any;

  const [accountingStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('accounting')],
    program.programId
  );
  const accounting = (await rpcWithTimeout(
    programAny.account.accountingState.fetch(accountingStatePda),
    ECOSYSTEM_RPC_TIMEOUT_MS,
    'accountingState'
  )) as Record<string, unknown>;

  const deflationPromise = fetchDeflationSnapshot({
    connection,
    program: program as unknown as {
      programId: PublicKey;
      account: { burnState: { fetch: (pda: PublicKey) => Promise<unknown> } };
    },
    accounting,
  });

  const currentEpoch = toNumber(read(accounting, 'currentEpoch', 'current_epoch'));
  const epochStart = toNumber(read(accounting, 'epochStartTime', 'epoch_start_time'));
  const genesisEpoch = toNumber(
    read(accounting, 'genesisEpochTimestamp', 'genesis_epoch_timestamp')
  );
  const now = Math.floor(Date.now() / 1000);
  const secondsPerEpoch = inferSecondsPerEpoch({
    currentEpoch,
    epochStartTime: epochStart,
    genesisEpochTimestamp: genesisEpoch,
    fallback: SECONDS_PER_EPOCH,
  });
  const elapsedFromGenesis =
    genesisEpoch > 0 ? Math.max(0, now - genesisEpoch) : Math.max(0, now - epochStart);
  const effectiveEpoch = Math.floor(elapsedFromGenesis / secondsPerEpoch);
  const epochSyncLag = Math.max(0, effectiveEpoch - currentEpoch);
  const ledgerEpoch = protocolLedgerEpoch(currentEpoch, effectiveEpoch);
  const epochTimeLeft = formatEpochTimeLeft(
    now,
    epochStart,
    epochSyncLag,
    elapsedFromGenesis,
    t,
    secondsPerEpoch
  );
  const cycleStart = toNumber(
    read(accounting, 'redistributionCycleStartEpoch', 'redistribution_cycle_start_epoch')
  );
  const redistributionCycleLength = REDISTRIBUTION_CYCLE_EPOCHS;
  const secondsIntoEpoch = elapsedFromGenesis % secondsPerEpoch;
  const loyaltyCycleLength = LOTTERY_DRAW_INTERVAL_EPOCHS;
  const lotteryTicketCycleStart = toNumber(
    read(accounting, 'lotteryTicketCycleStart', 'lottery_ticket_cycle_start')
  );
  const lotteryDrawEpoch = toNumber(read(accounting, 'lotteryDrawEpoch', 'lottery_draw_epoch'));
  const lotteryDrawn = Boolean(read(accounting, 'lotteryDrawn', 'lottery_drawn'));
  const lotteryPaid = Boolean(read(accounting, 'lotteryPaid', 'lottery_paid'));
  const globalTotalTickets = toNumber(read(accounting, 'totalTickets', 'total_tickets'));

  let participant: TradeBookParticipantSnapshot | null = null;
  let participantFetchFailed = false;
  if (wallet) {
    participant = await rpcWithTimeout(
      fetchTradeBookParticipant({
        program: programAny,
        mint: tokenMint,
        owner: wallet,
        programId,
        cluster,
        connection,
      }),
      ECOSYSTEM_RPC_TIMEOUT_MS,
      'tradeBook'
    ).catch(() => {
      participantFetchFailed = true;
      return null;
    });
  }

  const participantDataFresh = !participantFetchFailed;
  const txsEpoch = participant?.txsEpoch ?? -1;
  const txsThisEpoch = participant?.txsThisEpoch ?? 0;
  const txsInDisplayedEpoch = participantMetricsInDisplayedEpoch({
    participantEpoch: txsEpoch,
    currentEpoch,
    effectiveEpoch,
  });
  const epochVolumeEpoch = participant?.epochVolumeEpoch ?? -1;
  const epochVolumeRaw = participant?.epochVolume ?? 0;
  const ticketEpoch = participant?.ticketEpoch ?? -1;
  const ticketStart = participant?.ticketStart ?? 0;
  const rawTicketCount = participant?.ticketCount ?? 0;
  const lotteryCycleStart = participant?.lotteryCycleStart ?? -1;
  const rawLotteryCycleVolume = participant?.lotteryCycleVolume ?? 0;
  const effectiveTicketCycleStart = effectiveLotteryTicketCycleStart(
    {
      lotteryTicketCycleStart,
      lotteryDrawEpoch,
      redistributionCycleStartEpoch: cycleStart,
      lotteryDrawn,
      totalTickets: globalTotalTickets,
    },
    Math.max(currentEpoch, ledgerEpoch),
    lotteryCycleStart
  );
  const drawSettledForParticipantWindow = participantLotteryWindowDrawSettled({
    windowStart: lotteryCycleStart,
    lotteryDrawEpoch,
    redistributionCycleStartEpoch: cycleStart,
    lotteryTicketCycleStart:
      lotteryTicketCycleStart >= 0 ? lotteryTicketCycleStart : lotteryCycleStart,
    lotteryDrawn,
    lotteryPaid,
  });
  const drawPendingPayoutForTickets = lotteryDrawn && !lotteryPaid;
  const liveTicketCycleStartForUi = drawPendingPayoutForTickets
    ? lotterySubWindowStart(cycleStart, Math.max(currentEpoch, ledgerEpoch))
    : effectiveTicketCycleStart;
  const activeSwapTicketCycleStart = activeLotteryTicketCycleStart({
    globalEpoch: Math.max(currentEpoch, ledgerEpoch),
    redistributionCycleStartEpoch: cycleStart,
    lotteryTicketCycleStart,
    lotteryDrawn,
    lotteryDrawEpoch,
    totalTickets: globalTotalTickets,
  });
  const ticketCount =
    lotteryCycleStart >= 0 &&
    activeSwapTicketCycleStart >= 0 &&
    lotteryCycleStart < activeSwapTicketCycleStart &&
    !drawPendingPayoutForTickets
      ? 0
      : rawTicketCount;
  const lotteryCycleVolumeRaw = rawLotteryCycleVolume;

  const epochViews = resolveEcosystemEpochViews({
    currentEpoch,
    protocolEpoch: currentEpoch,
    effectiveEpoch,
    redistributionCycleStartEpoch: cycleStart,
    lotteryDrawEpoch,
    lotteryTicketCycleStart:
      lotteryTicketCycleStart >= 0 ? lotteryTicketCycleStart : effectiveTicketCycleStart,
    lotteryDrawn,
    lotteryPaid,
    activityCycleEpoch: participant?.activityCycleEpoch ?? -1,
    totalTickets: globalTotalTickets,
  });

  const lotteryDrawOverdue = epochViews.lotteryClock.drawOverdue;
  const liveWindowAnchor = epochViews.lotteryClock.liveWindowAnchor;
  const pendingWindowAnchor = epochViews.lotteryClock.drawWindowAnchor;

  let liveWindowTradeBookTotal = 0;
  let pendingWindowTradeBookTotal = 0;
  if (wallet && liveWindowAnchor >= 0) {
    liveWindowTradeBookTotal = await rpcWithTimeout(
      fetchTradeBookLotteryCycleTicketTotal({
        program: programAny,
        mint: tokenMint,
        programId,
        cluster,
        connection: connectionAny,
        cycleStart: liveWindowAnchor,
        cycleFloor: cycleStart,
      }),
      TRADE_BOOK_POOL_SCAN_TIMEOUT_MS,
      'tradeBookLotteryLivePool'
    ).catch(() => 0);
  }
  if (
    wallet &&
    lotteryDrawOverdue &&
    pendingWindowAnchor >= 0 &&
    pendingWindowAnchor !== liveWindowAnchor
  ) {
    pendingWindowTradeBookTotal = await rpcWithTimeout(
      fetchTradeBookLotteryCycleTicketTotal({
        program: programAny,
        mint: tokenMint,
        programId,
        cluster,
        connection: connectionAny,
        cycleStart: pendingWindowAnchor,
        cycleFloor: cycleStart,
      }),
      TRADE_BOOK_POOL_SCAN_TIMEOUT_MS,
      'tradeBookLotteryPendingPool'
    ).catch(() => 0);
  }

  const inCurrentTicketCycle =
    participant != null &&
    (lotteryCycleStart === activeSwapTicketCycleStart ||
      lotteryCycleStart === liveTicketCycleStartForUi ||
      (!drawPendingPayoutForTickets &&
        txsInDisplayedEpoch &&
        txsEpoch === currentEpoch &&
        lotteryCycleVolumeRaw > 0 &&
        lotteryCycleStart === effectiveTicketCycleStart &&
        effectiveTicketCycleStart === activeSwapTicketCycleStart));
  const onChainGlobalTotalTickets = globalTotalTickets;
  const liveTicketsWhilePayoutPending = drawPendingPayoutForTickets
    ? resolveLiveCycleLotteryTicketsWhilePayoutPending({
        ticketCount: rawTicketCount,
        ticketEpoch,
        lotteryCycleStart,
        liveCycleStart: liveTicketCycleStartForUi,
        lotteryCycleVolumeRaw,
        drawPoolStart:
          lotteryDrawEpoch >= 0
            ? lotteryDrawPoolWindowStart({
                redistributionCycleStartEpoch: cycleStart,
                lotteryDrawEpoch,
                lotteryTicketCycleStart:
                  lotteryTicketCycleStart >= 0
                    ? lotteryTicketCycleStart
                    : effectiveTicketCycleStart,
              })
            : -1,
        lotteryDrawEpoch,
      })
    : 0;
  const ticketsFromVolume = inCurrentTicketCycle
    ? lotteryTicketsFromCycleVolume(lotteryCycleVolumeRaw)
    : liveTicketsWhilePayoutPending;
  const ticketCycleRollPending =
    participant != null &&
    txsEpoch === currentEpoch &&
    txsThisEpoch > 0 &&
    lotteryCycleStart !== activeSwapTicketCycleStart &&
    !drawSettledForParticipantWindow &&
    !drawPendingPayoutForTickets &&
    epochVolumeRaw > 0;
  const ticketsCurrentCycle = drawPendingPayoutForTickets
    ? liveTicketsWhilePayoutPending
    : inCurrentTicketCycle
      ? Math.max(ticketCount, lotteryTicketsFromCycleVolume(lotteryCycleVolumeRaw))
      : ticketCycleRollPending
        ? Math.max(ticketCount, lotteryTicketsFromCycleVolume(lotteryCycleVolumeRaw))
        : 0;
  const lotteryStaleTickets =
    participantDataFresh &&
    participant &&
    !inCurrentTicketCycle &&
    !ticketCycleRollPending &&
    ticketCount > 0 &&
    !drawSettledForParticipantWindow &&
    !(
      lotteryDrawOverdue &&
      lotteryCycleStart >= 0 &&
      pendingWindowAnchor >= 0 &&
      lotteryCycleStart === pendingWindowAnchor
    )
      ? ticketCount
      : 0;
  const lotteryStaleCycleStart = lotteryStaleTickets > 0 ? lotteryCycleStart : -1;
  const lotteryCycleVolumeUi = drawPendingPayoutForTickets
    ? liveTicketsWhilePayoutPending > 0 || lotteryCycleStart === liveTicketCycleStartForUi
      ? `${Math.floor(lotteryCycleVolumeRaw / 1_000_000)} PIERRON`
      : '—'
    : inCurrentTicketCycle
      ? `${Math.floor(lotteryCycleVolumeRaw / 1_000_000)} PIERRON`
      : ticketCycleRollPending
        ? `${Math.floor(epochVolumeRaw / 1_000_000)} PIERRON`
        : '—';
  const showLotteryVolumeProgress = drawPendingPayoutForTickets
    ? lotteryCycleStart === liveTicketCycleStartForUi
    : inCurrentTicketCycle || ticketCycleRollPending;
  const volumeToNextBase =
    showLotteryVolumeProgress && ticketsCurrentCycle < 50
      ? Math.max(
          0,
          (ticketsCurrentCycle + 1) * Number(LOTTERY_TICKET_PER_VOLUME) -
            (drawPendingPayoutForTickets || inCurrentTicketCycle
              ? lotteryCycleVolumeRaw
              : epochVolumeRaw)
        )
      : 0;
  const lotteryVolumeToNextTicketUi =
    showLotteryVolumeProgress && ticketsCurrentCycle < 50
      ? `${Math.ceil(volumeToNextBase / 1_000_000)} PIERRON`
      : '—';

  const activityBitmap = participant?.activityBitmap ?? 0;
  const liveActivityBitmap =
    participant != null
      ? liveRedistributionActivityBitmap(participant, cycleStart)
      : 0;
  let claimActivityBitmap =
    participant != null ? effectiveRedistributionActivityBitmap(participant, 0) : activityBitmap;
  const activityCycleEpoch = participant?.activityCycleEpoch ?? -1;
  const participantInCurrentCycle = epochViews.participantInCurrentCycle;
  const participantInActiveWindow = isParticipantInActiveRedistributionWindow({
    activityCycleEpoch,
    redistributionCycleStartEpoch: cycleStart,
    globalEpoch: currentEpoch,
  });
  const displayEpoch = epochViews.redistributionEpochInCycle;
  const completedEpochsInRedistributionCycle = epochViews.redistributionEpochInCycle;
  const claimActivityCycleEpoch =
    participant != null
      ? resolveRedistributionClaimActivityCycleEpoch(participant, currentEpoch, 0)
      : activityCycleEpoch;
  const redistributionSettlementIn = isRedistributionClaimCycleComplete({
    protocolEpoch: currentEpoch,
    activityCycleEpoch: claimActivityCycleEpoch,
  })
    ? t.ecosystem.redistributionSettlementNow
    : displayEpoch >= redistributionCycleLength
      ? t.ecosystem.redistributionSettlementAfterRollover
      : formatMessage(t.common.zaEpok, {
          n: redistributionCycleLength - completedEpochsInRedistributionCycle,
        });
  const lotteryDrawPendingPayout = epochViews.lotteryClock.drawPendingPayout;
  const lotteryPoolDesync = shouldWarnLotteryPoolDesync({
    inCurrentTicketCycle,
    ticketStart,
    ticketCount,
    onChainGlobalTotalTickets,
    drawOverdue: lotteryDrawOverdue,
    drawPendingPayout: lotteryDrawPendingPayout,
  });
  const lotteryTicketsInPool = drawPendingPayoutForTickets
    ? liveTicketsWhilePayoutPending > 0
      ? Math.min(
          liveTicketsWhilePayoutPending,
          participantTicketsInGlobalPool({
            ticketStart,
            ticketCount: liveTicketsWhilePayoutPending,
            globalTotalTickets: Math.max(onChainGlobalTotalTickets, liveWindowTradeBookTotal),
          })
        )
      : 0
    : inCurrentTicketCycle
      ? participantTicketsInGlobalPool({
          ticketStart,
          ticketCount,
          globalTotalTickets: onChainGlobalTotalTickets,
        })
      : 0;
  const completedEpochsInLoyaltyCycle = epochViews.lotteryClock.epochInCycle;
  const liveTicketWindowStart = lotterySubWindowStart(cycleStart, ledgerEpoch);
  const awaitingDrawMarker = lotteryAwaitingDrawMarker({
    globalEpoch: ledgerEpoch,
    redistributionCycleStartEpoch: cycleStart,
    lotteryDrawn,
  });
  const scheduledDrawMarkerInCycle = scheduledLotteryDrawMarkerInCycle({
    redistributionCycleStartEpoch: cycleStart,
    ticketWindowStart: liveTicketWindowStart,
  });
  const loyaltyDrawIn = epochViews.lotteryClock.staleDrawPayoutPending
    ? epochViews.lotteryClock.drawOverdue
      ? t.ecosystem.lotteryDrawPending
      : formatMessage(t.ecosystem.lotteryNextDrawEpoch, {
          n: nextLotteryDrawEpochInCycle(displayEpoch),
        })
    : awaitingDrawMarker.awaiting
      ? formatMessage(t.ecosystem.lotteryNextDrawEpoch, {
          n: awaitingDrawMarker.markerEpochInCycle,
        })
      : epochViews.lotteryClock.drawPendingPayout
        ? t.ecosystem.lotteryPayoutPending
        : lotteryDrawOverdue
          ? t.ecosystem.lotteryDrawPending
          : formatMessage(t.ecosystem.lotteryNextDrawEpoch, {
              n: nextLotteryDrawEpochInCycle(displayEpoch),
            });
  const minActiveEpochsRequired = MIN_ACTIVE_EPOCHS;
  const claimsCount = participant?.redistributionClaimCount ?? 0;
  const lastClaimTime = participant?.lastClaimTime ?? 0;
  const lastActiveEpoch = participant?.lastActiveEpoch ?? -1;

  let pending: PendingRedistributionClaimSnapshot | null = null;
  let currentCycleVoucher: PendingRedistributionClaimSnapshot | null = null;
  let consumedRedistributionClaimsCount = 0;
  let userBalance = 0n;
  if (wallet) {
    pending = await rpcWithTimeout(
      fetchPendingRedistributionClaimAny({
        connection: connectionAny,
        program: programAny,
        programId,
        user: wallet,
        redistributionCycleStartEpoch: cycleStart,
        extraCycleStarts: [
          participant?.unclaimedRedistributionCycleStart ?? -1,
          participant?.activityCycleEpoch ?? -1,
          cycleStart - redistributionCycleLength,
        ],
        maxPreviousCyclesToProbe: 8,
      }),
      ECOSYSTEM_RPC_TIMEOUT_MS,
      'pendingRedistribution'
    ).catch(() => null);
    currentCycleVoucher = await rpcWithTimeout(
      fetchPendingRedistributionClaim({
        connection: connectionAny,
        program: programAny,
        programId,
        user: wallet,
        redistributionCycleStartEpoch: cycleStart,
      }),
      ECOSYSTEM_RPC_TIMEOUT_MS,
      'pendingRedistributionCurrentCycle'
    ).catch(() => null);
    consumedRedistributionClaimsCount = await rpcWithTimeout(
      countConsumedRedistributionClaimsForUser({
        connection,
        programId,
        user: wallet,
      }),
      ECOSYSTEM_RPC_TIMEOUT_MS,
      'consumedRedistributionClaimsCount'
    ).catch(() => 0);
    if (participant != null) {
      claimActivityBitmap = effectiveRedistributionActivityBitmap(
        participant,
        consumedRedistributionClaimsCount,
        currentEpoch
      );
    }
    userBalance = await rpcWithTimeout(
      fetchPierronTokenBalanceRaw({ connection, owner: wallet, mint: tokenMint }),
      ECOSYSTEM_RPC_TIMEOUT_MS,
      'tokenBalance'
    ).catch(() => 0n);
  }
  // Prefer open voucher; otherwise keep a *consumed* current-cycle PDA so the claim
  // panel hides after settle (open-only GPA scan returns null post-claim).
  let pendingForEligibility = pending ?? currentCycleVoucher ?? null;
  if (
    wallet &&
    (!pendingForEligibility ||
      (!pendingForEligibility.consumed && pendingForEligibility.amount <= 0n))
  ) {
    const probeStarts = Array.from(
      new Set(
        [
          cycleStart,
          participant?.activityCycleEpoch ?? -1,
          participant?.unclaimedRedistributionCycleStart ?? -1,
          cycleStart - redistributionCycleLength,
        ].filter((e) => e >= 0)
      )
    );
    for (const start of probeStarts) {
      if (start === cycleStart && currentCycleVoucher) {
        if (currentCycleVoucher.consumed) {
          pendingForEligibility = currentCycleVoucher;
          break;
        }
        continue;
      }
      const probed = await rpcWithTimeout(
        fetchPendingRedistributionClaim({
          connection: connectionAny,
          program: programAny,
          programId,
          user: wallet,
          redistributionCycleStartEpoch: start,
        }),
        ECOSYSTEM_RPC_TIMEOUT_MS,
        `pendingRedistributionProbe:${start}`
      ).catch(() => null);
      if (probed?.consumed && probed.amount > 0n) {
        pendingForEligibility = probed;
        break;
      }
    }
  }

  const lotteryAccounting = readLotteryAccountingFields(accounting);
  let pendingLottery: PendingLotteryPayoutSnapshot | null = null;
  let consumedLotteryForUser: PendingLotteryPayoutSnapshot | null = null;
  if (wallet) {
    const drawEpochsToProbe = lotteryDrawEpochsToProbe({
      accounting: {
        ...lotteryAccounting,
        redistributionCycleStartEpoch: cycleStart,
      },
      participant,
      latchDrawEpoch: -1,
    });
    pendingLottery = await rpcWithTimeout(
      fetchPendingLotteryPayoutAny({
        connection: connectionAny,
        program: programAny,
        programId,
        drawEpochs: drawEpochsToProbe,
      }),
      ECOSYSTEM_RPC_TIMEOUT_MS,
      'pendingLottery'
    ).catch(() => null);
    if (!pendingLottery && wallet) {
      consumedLotteryForUser = await rpcWithTimeout(
        fetchConsumedLotteryPayoutForUser({
          connection: connectionAny,
          program: programAny,
          programId,
          user: wallet,
          drawEpochs: drawEpochsToProbe,
        }),
        ECOSYSTEM_RPC_TIMEOUT_MS,
        'consumedLotteryPayout'
      ).catch(() => null);
    }
    if (!pendingLottery && lotteryAccounting.lotteryDrawEpoch >= 0) {
      pendingLottery = await rpcWithTimeout(
        fetchPendingLotteryPayout({
          connection: connectionAny,
          program: programAny,
          programId,
          lotteryDrawEpoch: lotteryAccounting.lotteryDrawEpoch,
        }),
        ECOSYSTEM_RPC_TIMEOUT_MS,
        'pendingLotteryCurrentDraw'
      ).catch(() => null);
      if (pendingLottery?.consumed) {
        consumedLotteryForUser = pendingLottery;
        pendingLottery = null;
      }
    }
  }

  const lotteryEligibility = evaluateLotteryClaimEligibility({
    accounting: {
      ...lotteryAccounting,
      redistributionCycleStartEpoch: cycleStart,
    },
    participant,
    pendingVoucher: pendingLottery ?? consumedLotteryForUser,
    currentEpoch,
  });
  const drawPendingPayoutOnChain =
    lotteryDrawn && !lotteryPaid && lotteryAccounting.lotteryDrawEpoch >= 0;
  const lotteryDisplayDrawOverdue =
    lotteryDrawOverdue &&
    !lotteryEligibility.lotteryInsufficientTickets &&
    !drawPendingPayoutOnChain;

  const drawPoolWindowStart =
    lotteryAccounting.lotteryDrawEpoch >= 0
      ? lotteryDrawPoolWindowStart({
          redistributionCycleStartEpoch: cycleStart,
          lotteryDrawEpoch: lotteryAccounting.lotteryDrawEpoch,
          lotteryTicketCycleStart: lotteryAccounting.lotteryTicketCycleStart,
        })
      : -1;
  const drawMarkerEpochInCycle =
    drawPoolWindowStart >= 0
      ? scheduledLotteryDrawMarkerInCycle({
          redistributionCycleStartEpoch: cycleStart,
          ticketWindowStart: drawPoolWindowStart,
        })
      : lotteryAccounting.lotteryDrawEpoch >= 0
        ? lotteryDrawMarkerEpochInCycle(cycleStart, lotteryAccounting.lotteryDrawEpoch)
        : -1;
  const lotteryClaimEpochReached =
    lotteryAccounting.lotteryDrawEpoch < 0 ||
    isLotteryClaimEpochReached({
      globalEpoch: currentEpoch,
      lotteryDrawEpoch: lotteryAccounting.lotteryDrawEpoch,
      redistributionCycleStartEpoch: cycleStart,
      lotteryTicketCycleStart: lotteryAccounting.lotteryTicketCycleStart,
    });
  const lotteryAwaitingClaimMarker =
    drawPendingPayoutOnChain && lotteryEligibility.isWinner && !lotteryClaimEpochReached;

  let showLotteryClaimButton = lotteryEligibility.showButton;
  let canExecuteLotteryClaim = lotteryEligibility.canExecute;
  let lotteryClaimBlockReason = lotteryEligibility.blockReason;
  const lotteryClaimedByConsumedVoucher = lotteryEligibility.claimedByConsumedVoucher;
  const lotteryAlreadyClaimed =
    lotteryClaimedByConsumedVoucher || lotteryClaimBlockReason === 'already_paid';

  const displayedGlobalLotteryTickets = resolveDisplayedGlobalLotteryTickets({
    onChainTotalTickets: onChainGlobalTotalTickets,
    liveWindowTradeBookTotal,
    pendingWindowTradeBookTotal,
    globalEpoch: Math.max(currentEpoch, ledgerEpoch),
    redistributionCycleStartEpoch: cycleStart,
    lotteryDrawEpoch,
    lotteryTicketCycleStart:
      lotteryTicketCycleStart >= 0 ? lotteryTicketCycleStart : effectiveTicketCycleStart,
    lotteryDrawn,
    lotteryPaid,
    lotteryClock: epochViews.lotteryClock,
    activeSwapTicketCycleStart,
    lotteryClaimConsumed: lotteryAlreadyClaimed,
  });

  const latchWinningTicket =
    lotteryAccounting.winningTicket > 0
      ? lotteryAccounting.winningTicket
      : pendingLottery?.winningTicket ?? 0;

  const lotteryStaleDrawPayoutPending = epochViews.lotteryClock.staleDrawPayoutPending;

  let lotteryUserHasStake = false;
  let participantPendingLotteryWin = false;
  let claimMarkerEpochInCycle = drawMarkerEpochInCycle > 0 ? drawMarkerEpochInCycle : -1;
  let claimPoolWindowStart = drawPoolWindowStart >= 0 ? drawPoolWindowStart : -1;
  let effectiveDrawPoolWindowStart = drawPoolWindowStart >= 0 ? drawPoolWindowStart : -1;

  if (!lotteryAlreadyClaimed) {
    const pendingLotteryForUser =
      pendingLottery &&
      wallet &&
      pendingLottery.winner.equals(wallet) &&
      !pendingLottery.consumed;

    const participantInDrawPool =
      participant != null &&
      lotteryAccounting.lotteryDrawEpoch >= 0 &&
      participantTicketsInDrawWindow({
        participant,
        lotteryTicketCycleStart: lotteryAccounting.lotteryTicketCycleStart,
        lotteryDrawEpoch: lotteryAccounting.lotteryDrawEpoch,
        redistributionCycleStartEpoch: cycleStart,
      });

    participantPendingLotteryWin =
      participant != null &&
      drawPendingPayoutOnChain &&
      latchWinningTicket >= 0 &&
      participantHoldsPendingLotteryWin({
        participant,
        winningTicket: latchWinningTicket,
        lotteryTicketCycleStart: lotteryAccounting.lotteryTicketCycleStart,
        lotteryDrawEpoch: lotteryAccounting.lotteryDrawEpoch,
        redistributionCycleStartEpoch: cycleStart,
        lotteryDrawn,
        lotteryPaid,
        globalEpoch: currentEpoch,
        lotteryWinner: lotteryAccounting.lotteryWinner,
        globalTotalTickets: lotteryAccounting.totalTickets,
      });

    if (participantPendingLotteryWin && lotteryClaimEpochReached && !lotteryStaleDrawPayoutPending) {
      showLotteryClaimButton = true;
      if (lotteryEligibility.canExecute) {
        canExecuteLotteryClaim = true;
        lotteryClaimBlockReason = undefined;
      }
    }

    const accountingNamesWinner =
      wallet != null &&
      lotteryAccounting.lotteryWinner != null &&
      lotteryAccounting.lotteryWinner.equals(wallet);

    const participantTicketWindow =
      participant != null
        ? [participant.ticketEpoch, participant.lotteryCycleStart]
            .filter((v): v is number => v != null && v >= 0)
            .reduce((min, v) => (min < 0 ? v : Math.min(min, v)), -1)
        : -1;
    const participantHoldsDrawnTicket =
      participant != null &&
      participant.ticketCount > 0 &&
      latchWinningTicket >= participant.ticketStart &&
      latchWinningTicket < participant.ticketStart + participant.ticketCount;
    const staleKeeperDrawMismatch =
      participantTicketWindow >= 0 && effectiveDrawPoolWindowStart > participantTicketWindow;
    const claimFromParticipantWindow =
      drawPendingPayoutOnChain &&
      staleKeeperDrawMismatch &&
      participantTicketWindow >= cycleStart &&
      participantTicketWindow < cycleStart + redistributionCycleLength &&
      (lotteryEligibility.isWinner || participantPendingLotteryWin);
    claimMarkerEpochInCycle =
      claimFromParticipantWindow && cycleStart >= 0
        ? scheduledLotteryDrawMarkerInCycle({
            redistributionCycleStartEpoch: cycleStart,
            ticketWindowStart: participantTicketWindow,
          })
        : drawMarkerEpochInCycle > 0
          ? drawMarkerEpochInCycle
          : -1;
    claimPoolWindowStart = claimFromParticipantWindow
      ? participantTicketWindow
      : effectiveDrawPoolWindowStart;

    if (lotteryStaleDrawPayoutPending) {
      showLotteryClaimButton = false;
      canExecuteLotteryClaim = false;
      lotteryClaimBlockReason = 'stale_payout';
    }

    if (
      drawPendingPayoutOnChain &&
      !pendingLotteryForUser &&
      participant != null &&
      !participantInDrawPool &&
      !lotteryEligibility.isWinner &&
      !participantPendingLotteryWin &&
      !accountingNamesWinner
    ) {
      showLotteryClaimButton = false;
      canExecuteLotteryClaim = false;
      lotteryClaimBlockReason = 'not_winner';
    }

    if (
      accountingNamesWinner &&
      drawPendingPayoutOnChain &&
      !lotteryAlreadyClaimed &&
      !lotteryStaleDrawPayoutPending
    ) {
      showLotteryClaimButton = true;
      if (lotteryClaimEpochReached && lotteryEligibility.payoutDelayRemainingSecs <= 0) {
        canExecuteLotteryClaim = true;
        lotteryClaimBlockReason = undefined;
      } else if (!lotteryClaimEpochReached) {
        lotteryClaimBlockReason = 'claim_epoch_not_reached';
      } else if (lotteryEligibility.payoutDelayRemainingSecs > 0) {
        lotteryClaimBlockReason = 'payout_delay';
      }
    }

    lotteryUserHasStake = Boolean(
      lotteryEligibility.isWinner ||
        lotteryEligibility.hasPendingVoucher ||
        participantPendingLotteryWin ||
        pendingLotteryForUser ||
        accountingNamesWinner ||
        (participantHoldsDrawnTicket && participantInDrawPool)
    );

    const liveLotteryClaimAllowed =
      !lotteryStaleDrawPayoutPending &&
      (Boolean(pendingLotteryForUser) ||
        lotteryEligibility.hasPendingVoucher ||
        (drawPendingPayoutOnChain &&
          (lotteryEligibility.isWinner ||
            lotteryEligibility.canExecute ||
            lotteryEligibility.showButton ||
            participantPendingLotteryWin ||
            accountingNamesWinner)));
    if (!liveLotteryClaimAllowed) {
      showLotteryClaimButton = false;
      canExecuteLotteryClaim = false;
      if (
        lotteryEligibility.blockReason === 'awaiting_keeper_draw' ||
        lotteryEligibility.blockReason === 'awaiting_keeper_commits' ||
        lotteryEligibility.protocolKeeperPending
      ) {
        lotteryClaimBlockReason = lotteryEligibility.blockReason;
      }
    }

    if (lotteryClaimBlockReason === 'already_paid') {
      showLotteryClaimButton = false;
      canExecuteLotteryClaim = false;
    }
  }

  if (lotteryAlreadyClaimed) {
    showLotteryClaimButton = false;
    canExecuteLotteryClaim = false;
    lotteryClaimBlockReason = 'already_paid';
  }

  const eligibility = evaluateRedistributionClaimEligibility({
    accounting: readAccountingFields(accounting),
    participant,
    pendingVoucher: pendingForEligibility,
    userTokenBalance: userBalance,
    consumedVoucherCount: consumedRedistributionClaimsCount,
  });
  const redistributionAccountingFields = readAccountingFields(accounting);
  const redistributionQualLines = formatRedistributionPoolQualificationLines({
    participant,
    tokenBalance: userBalance,
    blockReason: eligibility.blockReason,
    protocolCycleIndex: globalCycleIndex(currentEpoch),
    accounting: {
      genesisEpochTimestamp: genesisEpoch > 0 ? genesisEpoch : epochStart,
      redistributionCycleStartEpoch: cycleStart,
      redistributionShare: redistributionAccountingFields.redistributionShare,
      redistributionPoolPrevious: redistributionAccountingFields.redistributionPoolPrevious,
      redistributionClaimedFromPrevious:
        redistributionAccountingFields.redistributionClaimedFromPrevious,
      eligibleUsersPreviousCycle: redistributionAccountingFields.eligibleUsersPreviousCycle,
    },
    labels: {
      activityOk: t.ecosystem.redistributionQualActivityOk,
      activityMissing: t.ecosystem.redistributionQualActivityMissing,
      balanceOk: t.ecosystem.redistributionQualBalanceOk,
      balanceMissing: t.ecosystem.redistributionQualBalanceMissing,
      ageOk: t.ecosystem.redistributionQualAgeOk,
      ageMissing: t.ecosystem.redistributionQualAgeMissing,
      ageAtRolloverOk: t.ecosystem.redistributionQualAgeAtRolloverOk,
      ageAtRolloverMissing: t.ecosystem.redistributionQualAgeAtRolloverMissing,
      poolZeroAtRollover: t.ecosystem.redistributionQualPoolZeroAtRollover,
      poolAlreadyClaimed: t.ecosystem.redistributionQualPoolAlreadyClaimed,
      eligibleUsersAtRollover: t.ecosystem.redistributionQualEligibleUsersAtRollover,
      pastCycleClaimMissed: t.ecosystem.redistributionQualPastCycleClaimMissed,
    },
  });
  const displayedRedistributionClaimsCount = Math.max(
    claimsCount,
    consumedRedistributionClaimsCount,
    eligibility.claimedByConsumedVoucher ? 1 : 0
  );

  const resolvedClaimCycleEpoch =
    participant != null
      ? resolveRedistributionClaimActivityCycleEpoch(
          participant,
          currentEpoch,
          consumedRedistributionClaimsCount
        )
      : -1;
  const claimingResolvedLiveCycle =
    participant != null &&
    resolvedClaimCycleEpoch === participant.activityCycleEpoch &&
    resolvedClaimCycleEpoch !== (participant.unclaimedRedistributionCycleStart ?? -2);
  const claimCycleActiveEpochs =
    participant != null
      ? claimingResolvedLiveCycle
        ? Math.max(0, participant.activeEpochsCount)
        : effectiveRedistributionActiveEpochs(
            participant,
            consumedRedistributionClaimsCount,
            currentEpoch
          )
      : 0;

  const effectiveActivityCycleEpoch =
    participant != null
      ? effectiveLiveActivityCycleEpoch(
          participant,
          cycleStart,
          currentEpoch,
          consumedRedistributionClaimsCount
        )
      : activityCycleEpoch;

  const participantInActiveWindowResolved = isParticipantInActiveRedistributionWindow({
    activityCycleEpoch: effectiveActivityCycleEpoch,
    redistributionCycleStartEpoch: cycleStart,
    globalEpoch: currentEpoch,
  });

  const activeEpochsInLiveWindow = participantInActiveWindowResolved
    ? countActiveEpochsInRedistributionWindow({
        activityBitmap: liveActivityBitmap,
        redistributionCycleStartEpoch: cycleStart,
        epochInCycle: epochViews.redistributionEpochInCycle,
      })
    : 0;

  // Badge / status: live cycle activity (≥9), not the lagging on-chain eligible flag
  // (flag can stay false until the next swap or while a prior-cycle claim is open).
  const redistributionEligible =
    activeEpochsInLiveWindow >= minActiveEpochsRequired;

  const staleTradeBookAfterClaim =
    participant != null &&
    hasStaleTradeBookAfterClaim(participant, consumedRedistributionClaimsCount);
  const resolvedParticipantTickets = resolveParticipantLotteryTicketsForDisplay({
    ticketCount,
    lotteryCycleStart,
    ticketEpoch,
    activeTicketCycleStart: activeSwapTicketCycleStart,
    redistributionCycleStartEpoch: cycleStart,
    lotteryDrawEpoch,
    lotteryTicketCycleStart:
      lotteryAccounting.lotteryTicketCycleStart >= 0
        ? lotteryAccounting.lotteryTicketCycleStart
        : effectiveTicketCycleStart,
    lotteryDrawn,
    lotteryPaid,
    drawPendingPayout: drawPendingPayoutOnChain,
    lotteryClaimConsumed: lotteryClaimedByConsumedVoucher,
    preserveForPendingClaim:
      drawPendingPayoutOnChain &&
      (lotteryEligibility.isWinner || participantPendingLotteryWin),
    pendingDrawWindowStart: epochViews.lotteryClock.drawWindowAnchor,
    drawOverdue: lotteryDrawOverdue,
    lotteryCycleVolumeRaw,
    epochVolumeRaw,
    txsThisEpoch,
  });
  const hasLiveLotteryAccrual =
    participant != null &&
    (inCurrentTicketCycle ||
      ticketCycleRollPending ||
      (drawPendingPayoutOnChain && liveTicketsWhilePayoutPending > 0)) &&
    participantHasLiveSwapThisEpoch(participant, currentEpoch) &&
    (lotteryCycleVolumeRaw > 0 || epochVolumeRaw > 0) &&
    !(drawSettledForParticipantWindow && !inCurrentTicketCycle && !drawPendingPayoutOnChain);
  const liveTicketsFromSwapVolume = hasLiveLotteryAccrual
    ? lotteryTicketsFromCycleVolume(lotteryCycleVolumeRaw)
    : 0;
  const volumeFallbackTickets = participantLotteryTicketsFromVolumeFallback({
    ticketCount,
    lotteryCycleVolumeRaw,
    epochVolumeRaw,
    lotteryCycleStart,
    activeTicketCycleStart: activeSwapTicketCycleStart,
    ticketCycleRollPending,
  });
  const displayTicketsCurrentCycle = drawPendingPayoutOnChain
    ? liveTicketsWhilePayoutPending
    : staleTradeBookAfterClaim &&
        !inCurrentTicketCycle &&
        !ticketCycleRollPending &&
        !hasLiveLotteryAccrual
      ? 0
      : inCurrentTicketCycle || ticketCycleRollPending
        ? resolvedParticipantTickets > 0
          ? resolvedParticipantTickets
          : Math.max(liveTicketsFromSwapVolume, volumeFallbackTickets)
        : 0;
  const displayLotteryTicketsInPool = drawPendingPayoutOnChain
    ? liveTicketsWhilePayoutPending > 0
      ? Math.min(liveTicketsWhilePayoutPending, lotteryTicketsInPool)
      : 0
    : staleTradeBookAfterClaim &&
        !inCurrentTicketCycle &&
        !ticketCycleRollPending &&
        !hasLiveLotteryAccrual
      ? 0
      : Math.max(
          lotteryTicketsInPool,
          inCurrentTicketCycle || ticketCycleRollPending ? volumeFallbackTickets : 0
        );

  let adjustedGlobalLotteryTickets = Math.max(0, displayedGlobalLotteryTickets);
  if (
    adjustedGlobalLotteryTickets === 0 &&
    onChainGlobalTotalTickets > 0 &&
    !lotteryPaid &&
    !lotteryAlreadyClaimed &&
    !drawPendingPayoutOnChain
  ) {
    adjustedGlobalLotteryTickets = Math.max(
      onChainGlobalTotalTickets,
      liveWindowTradeBookTotal,
      pendingWindowTradeBookTotal
    );
  }

  const redistributionPastCycleClaimWindow =
    eligibility.cycleCompleteOnChain &&
    claimCycleActiveEpochs >= minActiveEpochsRequired &&
    (participant != null &&
    hasClaimableUnclaimedRedistributionSnapshot(participant, currentEpoch)
      ? true
      : !participantInCurrentCycle || eligibility.showButton);

  const lotteryClaimUiPriority =
    drawPendingPayoutOnChain &&
    !lotteryStaleDrawPayoutPending &&
    (showLotteryClaimButton || lotteryEligibility.isWinner);

  const snapshot: EcosystemSnapshot = {
    displayEpoch,
    currentEpoch,
    effectiveEpoch,
    genesisEpochTimestamp: genesisEpoch > 0 ? genesisEpoch : epochStart,
    epochStartTime: epochStart,
    epochSyncLag,
    transactionsThisEpoch: txsInDisplayedEpoch ? txsThisEpoch : 0,
    epochVolume:
      txsInDisplayedEpoch &&
      (epochVolumeEpoch === currentEpoch || epochVolumeEpoch === ledgerEpoch)
        ? Math.floor(epochVolumeRaw / 1_000_000)
        : txsInDisplayedEpoch && epochVolumeEpoch === effectiveEpoch
          ? Math.floor(epochVolumeRaw / 1_000_000)
          : 0,
    epochTimeLeft,
    redistributionCycleLength,
    redistributionCycleStartEpoch: cycleStart,
    completedEpochsInRedistributionCycle,
    activeEpochsInRedistributionCycle: activeEpochsInLiveWindow,
    claimCycleActiveEpochs,
    redistributionMarkerEpochInCycle: epochViews.lotteryMarkerEpoch,
    redistributionMarkerInCycle: epochViews.lotteryMarkerEpoch > 0,
    minActiveEpochsRequired,
    redistributionEligible,
    activityBitmap: liveActivityBitmap,
    effectiveActivityCycleEpoch,
    participantInCurrentCycle,
    redistributionPastCycleClaimWindow,
    cycleCompleteOnChain: eligibility.cycleCompleteOnChain,
    showClaimButton: eligibility.showButton,
    canExecuteClaim: eligibility.canExecute,
    claimBlockReason: eligibility.blockReason,
    claimOpensInSecs: eligibility.claimOpensInSecs ?? 0,
    claimExpiresInEpochs: eligibility.claimExpiresInEpochs ?? 0,
    estimatedNetPayoutUi:
      eligibility.estimatedNetPayout > 0n ? baseUnitsToUi(eligibility.estimatedNetPayout) : '—',
    hasPendingVoucher: eligibility.hasPendingVoucher,
    pendingRedistributionVoucher:
      eligibility.hasPendingVoucher && eligibility.pendingVoucher
        ? {
            address: eligibility.pendingVoucher.address.toBase58(),
            amount: eligibility.pendingVoucher.amount.toString(),
            cycleStartEpoch: eligibility.pendingVoucher.cycleStartEpoch,
            preparedAt: Number(eligibility.pendingVoucher.preparedAt ?? 0),
            consumed: Boolean(eligibility.pendingVoucher.consumed),
          }
        : null,
    secondsIntoEpoch,
    redistributionStatusText: wallet
      ? redistributionPastCycleClaimWindow
        ? eligibility.showButton
          ? eligibility.canExecute
            ? t.ecosystem.redistributionClaimReadyPastCycle
            : eligibility.blockReason === 'pool_already_claimed'
              ? mapClaimBlockReasonToMessage('pool_already_claimed', t.ecosystem)
              : eligibility.blockReason === 'no_pool_share'
                ? t.ecosystem.redistributionPastCycleNoPoolShare
                : eligibility.blockReason === 'stale_redistribution_claim'
                  ? mapClaimBlockReasonToMessage('stale_redistribution_claim', t.ecosystem)
                  : mapClaimBlockReasonToMessage(eligibility.blockReason, t.ecosystem)
          : eligibility.blockReason === 'stale_redistribution_claim'
            ? mapClaimBlockReasonToMessage('stale_redistribution_claim', t.ecosystem)
            : t.ecosystem.redistributionPastCycleMissedClaim
        : redistributionEligible
          ? t.ecosystem.redistributionEligible
          : participantInActiveWindow
            ? formatMessage(t.ecosystem.redistributionMissingEpochs, {
                n: Math.max(0, minActiveEpochsRequired - activeEpochsInLiveWindow),
              })
            : formatMessage(t.ecosystem.redistributionMissingEpochs, {
                n: minActiveEpochsRequired,
              })
      : t.ecosystem.connectForRedistribution,
    redistributionSettlementIn,
    loyaltyCycleLength,
    lotteryTicketCycleStart:
      lotteryTicketCycleStart >= 0 ? lotteryTicketCycleStart : effectiveTicketCycleStart,
    completedEpochsInLoyaltyCycle,
    ticketsCurrentCycle: displayTicketsCurrentCycle,
    loyaltyActive: wallet ? displayTicketsCurrentCycle > 0 : false,
    loyaltyStatusText: wallet
      ? displayTicketsCurrentCycle > 0
        ? t.ecosystem.loyaltyParticipating
        : t.ecosystem.loyaltyNoTickets
      : t.ecosystem.connectForLoyalty,
    loyaltyDrawIn,
    lotteryDrawOverdue: lotteryDisplayDrawOverdue,
    lotteryDrawn,
    lotteryPaid,
    globalTotalTickets: adjustedGlobalLotteryTickets,
    onChainGlobalTotalTickets,
    lotteryTicketsInPool: displayLotteryTicketsInPool,
    lotteryTicketsFromVolume: ticketsFromVolume,
    lotteryPoolDesync,
    lotteryCycleVolumeUi,
    lotteryVolumeToNextTicketUi,
    lotteryStaleTickets,
    lotteryStaleCycleStart,
    showLotteryClaimButton,
    canExecuteLotteryClaim,
    lotteryUserHasStake,
    lotteryClaimBlockReason,
    lotteryClaimedByConsumedVoucher: lotteryAlreadyClaimed,
    lotteryPrizeUi:
      lotteryEligibility.estimatedPayout > 0n
        ? baseUnitsToUi(lotteryEligibility.estimatedPayout)
        : '—',
    hasPendingLotteryVoucher: lotteryEligibility.hasPendingVoucher,
    lotteryPayoutDelayRemainingSecs: lotteryEligibility.payoutDelayRemainingSecs,
    lotteryDrawPendingPayout:
      !lotteryAlreadyClaimed && epochViews.lotteryClock.drawPendingPayout,
    lotteryClaimUiPriority,
    lotteryClaimLatchActive: false,
    lotteryStaleDrawPayoutPending: epochViews.lotteryClock.staleDrawPayoutPending,
    loyaltyCycleWindowCompleted:
      (epochViews.lotteryClock.drawPendingPayout || lotteryClaimUiPriority) &&
      !epochViews.lotteryClock.staleDrawPayoutPending &&
      lotteryClaimEpochReached,
    lotteryAwaitingDrawMarker: awaitingDrawMarker.awaiting,
    lotteryScheduledDrawMarkerInCycle: scheduledDrawMarkerInCycle,
    lotteryDrawEpoch: lotteryAccounting.lotteryDrawEpoch >= 0 ? lotteryAccounting.lotteryDrawEpoch : -1,
    lotteryDrawMarkerEpochInCycle: drawMarkerEpochInCycle > 0 ? drawMarkerEpochInCycle : -1,
    lotteryDrawPoolWindowStart: effectiveDrawPoolWindowStart,
    lotteryClaimMarkerEpochInCycle: claimMarkerEpochInCycle,
    lotteryClaimPoolWindowStart: claimPoolWindowStart,
    lotteryClaimEpochReached,
    lotteryAwaitingClaimMarker,
    lotteryAwaitingKeeperCommits: lotteryEligibility.awaitingKeeperCommits,
    lotteryAwaitingKeeperDraw: lotteryEligibility.awaitingKeeperDraw,
    lotteryProtocolKeeperPending: lotteryEligibility.protocolKeeperPending,
    participantLoadFailed: Boolean(wallet && participantFetchFailed),
    lotteryCommitCount: lotteryEligibility.lotteryCommitCount,
    lotteryMinCommits: lotteryEligibility.lotteryMinCommits,
    lotteryInsufficientTickets: lotteryEligibility.lotteryInsufficientTickets,
    minTicketsForDraw: lotteryEligibility.minTicketsForDraw,
    lotteryEpochsOverdue: epochViews.lotteryEpochsOverdue,
    lotteryPendingWindowStart:
      lotteryDisplayDrawOverdue || lotteryStaleDrawPayoutPending
        ? epochViews.lotteryClock.drawWindowAnchor
        : -1,
    lotteryPendingWindowEnd:
      (lotteryDisplayDrawOverdue || lotteryStaleDrawPayoutPending) &&
      epochViews.lotteryClock.drawWindowAnchor >= 0
        ? lotterySubWindowEnd(epochViews.lotteryClock.drawWindowAnchor)
        : -1,
    lotteryPendingDrawMarkerInCycle:
      (lotteryDisplayDrawOverdue || lotteryStaleDrawPayoutPending) &&
      epochViews.lotteryClock.drawWindowAnchor >= 0
        ? scheduledLotteryDrawMarkerInCycle({
            redistributionCycleStartEpoch: cycleStart,
            ticketWindowStart: epochViews.lotteryClock.drawWindowAnchor,
          })
        : -1,
    lotteryKeeperBacklog:
      (lotteryDisplayDrawOverdue || lotteryStaleDrawPayoutPending) &&
      epochViews.lotteryClock.drawWindowAnchor !== epochViews.lotteryClock.liveWindowAnchor,
    redistributionClaimsCount: displayedRedistributionClaimsCount,
    lastClaimText:
      lastClaimTime > 0
        ? `${t.ecosystem.lastClaim}: ${new Date(lastClaimTime * 1000).toLocaleString()}`
        : t.ecosystem.noClaims,
    lastActiveEpoch,
  };

  const liveRedistributionMarkers = buildLiveRedistributionActivityMarkers({
    currentEpoch: snapshot.currentEpoch,
    redistributionCycleStartEpoch: snapshot.redistributionCycleStartEpoch,
    activityCycleEpoch:
      snapshot.effectiveActivityCycleEpoch >= 0
        ? snapshot.effectiveActivityCycleEpoch
        : participant?.activityCycleEpoch ?? -1,
    activityBitmap: liveActivityBitmap,
    cycleLength: snapshot.redistributionCycleLength,
  });

  let claimRedistributionMarkers: EpochMarker[] | null = null;
  if (
    participant &&
    (snapshot.showClaimButton ||
      snapshot.hasPendingVoucher ||
      snapshot.redistributionPastCycleClaimWindow)
  ) {
    const claimCycleStart = resolveRedistributionClaimActivityCycleEpoch(
      participant,
      currentEpoch,
      consumedRedistributionClaimsCount
    );
    const claimBitmapForPanel =
      claimCycleStart === participant.activityCycleEpoch &&
      claimCycleStart !== (participant.unclaimedRedistributionCycleStart ?? -2)
        ? participant.activityBitmap
        : claimActivityBitmap;
    if (claimCycleStart >= 0) {
      claimRedistributionMarkers = buildRedistributionClaimCycleMarkers({
        activityCycleStartEpoch: claimCycleStart,
        activityBitmap: claimBitmapForPanel,
        cycleLength: snapshot.redistributionCycleLength,
      });
    }
  }

  const deflation = await deflationPromise;

  return {
    snapshot,
    deflation,
    participant,
    liveRedistributionMarkers,
    claimRedistributionMarkers,
    redistributionQualLines,
  };
}
