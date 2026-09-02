import type { Translations } from '../../i18n/pl';

type EcosystemT = Translations['ecosystem'];

export function mapClaimBlockReasonToMessage(
  reason: string | undefined,
  t: EcosystemT
): string {
  switch (reason) {
    case 'no_participant':
      return t.claimRedistributionNoParticipant;
    case 'insufficient_activity':
      return t.claimRedistributionInsufficientActivity;
    case 'cycle_not_complete':
      return t.claimRedistributionCycleNotComplete;
    case 'already_claimed':
      return t.claimRedistributionAlreadyClaimed;
    case 'no_prize':
      return t.claimRedistributionNoPrize;
    case 'no_pool_share':
      return t.claimRedistributionNoPoolShare;
    case 'past_cycle_claim_missed':
      return t.claimRedistributionPastCycleMissed ?? t.redistributionPastCycleMissedClaim;
    case 'stale_redistribution_claim':
      return t.claimRedistributionStaleClaim ?? t.redistributionQualPastCycleClaimMissed;
    case 'too_early_after_rollover':
      return t.claimRedistributionTooEarly;
    case 'claims_limit_reached':
      return t.claimRedistributionLimitReached;
    case 'claim_cooldown':
      return t.claimRedistributionCooldown;
    case 'insufficient_fee_balance':
      return t.claimRedistributionInsufficientFee;
    case 'pool_already_claimed':
      return t.claimRedistributionPoolAlreadyClaimed ?? t.redistributionQualPoolAlreadyClaimed;
    default:
      return t.claimRedistributionGenericError;
  }
}

export function mapLotteryClaimBlockReasonToMessage(
  reason: string | undefined,
  t: EcosystemT,
  payoutDelayRemainingSecs = 0
): string {
  switch (reason) {
    case 'stale_payout':
      return t.lotteryStalePayoutKeeperHint;
    case 'insufficient_tickets':
      return t.lotteryInsufficientTicketsHint ?? t.claimLotteryNoDraw;
    case 'awaiting_keeper_commits':
      return t.lotteryCommitsPendingHint ?? t.lotteryDrawPendingHint ?? t.claimLotteryNoDraw;
    case 'awaiting_keeper_draw':
      return t.lotteryDrawPendingHint ?? t.claimLotteryNoDraw;
    case 'not_winner':
      return t.claimLotteryNotWinner;
    case 'payout_delay':
      if (payoutDelayRemainingSecs > 0) {
        const mm = Math.floor(payoutDelayRemainingSecs / 60);
        const ss = payoutDelayRemainingSecs % 60;
        return `${t.claimLotteryPayoutDelay} (${mm}:${String(ss).padStart(2, '0')})`;
      }
      return t.claimLotteryPayoutDelay;
    case 'claim_epoch_not_reached':
      return t.lotteryClaimOpensAtMarker ?? t.claimLotteryPayoutDelay;
    case 'already_paid':
      return t.claimLotteryAlreadyPaid;
    case 'no_draw':
      return t.claimLotteryNoDraw;
    case 'no_participant':
      return t.claimLotteryNoParticipant;
    default:
      return t.claimLotteryGenericError;
  }
}
