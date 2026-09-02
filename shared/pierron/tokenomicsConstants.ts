/**
 * Mirror of `programs/pierron/src/constants.rs` (base units, 6 decimals).
 * Keep in sync when changing on-chain tokenomics.
 */
export const TOKEN_DECIMALS = 6;

/** 150×10⁹ UI tokens */
export const TOTAL_SUPPLY = 150_000_000_000_000_000n;
export const MARKET_POOL_ALLOCATION = 60_000_000_000_000_000n;
export const DEV_WALLET_ALLOCATION = 21_000_000_000_000_000n;
export const LOTTERY_ALLOCATION = 7_000_000_000_000_000n;
/** +20B UI vs legacy 36B — extra allocation to burn vault */
export const BURN_ALLOCATION = 56_000_000_000_000_000n;
export const TREASURY_ALLOCATION = 6_000_000_000_000_000n;

export const TAX_TOTAL_PERCENT = 1n;
export const BASE_LIMIT = 13_000_000_000_000n;
export const MAX_LIMIT = 34_000_000_000_000n;

export const USER_LIMIT_BONUS_TIER_1 = 3_000_000_000_000n;
export const USER_LIMIT_BONUS_TIER_2 = 6_000_000_000_000n;
export const USER_LIMIT_BONUS_TIER_3 = 11_000_000_000_000n;
export const USER_LIMIT_BONUS_TIER_4 = 21_000_000_000_000n;

export const EPOCH_GLOBAL_SELL_VOLUME_LT_25_CLAIMS = 2_000_000_000_000_000n;
export const EPOCH_GLOBAL_SELL_VOLUME_LT_75_CLAIMS = 3_000_000_000_000_000n;
export const EPOCH_GLOBAL_SELL_VOLUME_LT_175_CLAIMS = 5_000_000_000_000_000n;
export const EPOCH_GLOBAL_SELL_VOLUME_LT_375_CLAIMS = 7_000_000_000_000_000n;
export const EPOCH_GLOBAL_SELL_VOLUME_GE_375_CLAIMS = 9_000_000_000_000_000n;

export const TX_COOLDOWN_TIER_0_SECS = 120;
export const TX_COOLDOWN_TIER_1_SECS = 90;
export const TX_COOLDOWN_TIER_2_SECS = 75;
export const TX_COOLDOWN_TIER_3_SECS = 60;
export const TX_COOLDOWN_TIER_4_SECS = 40;

/** Devnet QA absolute per-user swap caps (100 / 150 / 200 / 250 PIERRON UI). */
export const DEVNET_USER_LIMIT_TIERS = [
  100_000_000n,
  150_000_000n,
  200_000_000n,
  250_000_000n,
  250_000_000n,
] as const;

/** Devnet QA epoch global sell caps (200 / 300 / 400 / 500 PIERRON UI). */
export const DEVNET_EPOCH_SELL_VOLUME_TIERS = [
  200_000_000n,
  300_000_000n,
  400_000_000n,
  500_000_000n,
  500_000_000n,
] as const;

export const EPOCH_POOL_SALE_QUOTA_GENESIS = 5_000_000_000_000_000n;
export const EPOCH_POOL_SALE_QUOTA_STANDARD = 50_000_000_000_000n;
/**
 * Must match the **deployed** program `SECONDS_PER_EPOCH`.
 * Devnet QA (`cargo build-sbf --features devnet-low-claim-tiers`): **600** (10 min).
 * Production / build without that feature: 21600 (6 h).
 */
export const SECONDS_PER_EPOCH = 600;

/**
 * Infer SPE from on-chain accounting when genesis/start/current_epoch are consistent.
 * Avoids fake "keeper lag" when TS constants disagree with the deployed program.
 */
export function inferSecondsPerEpoch(params: {
  currentEpoch: number;
  epochStartTime: number;
  genesisEpochTimestamp: number;
  fallback?: number;
}): number {
  const {
    currentEpoch,
    epochStartTime,
    genesisEpochTimestamp,
    fallback = SECONDS_PER_EPOCH,
  } = params;
  if (
    currentEpoch <= 0 ||
    genesisEpochTimestamp <= 0 ||
    epochStartTime <= genesisEpochTimestamp
  ) {
    return fallback;
  }
  const inferred = Math.round(
    (epochStartTime - genesisEpochTimestamp) / currentEpoch
  );
  if (!Number.isFinite(inferred) || inferred < 60 || inferred > 86_400) {
    return fallback;
  }
  return inferred;
}

export const LOTTERY_PRIZE_PER_DRAW = 2_000_000_000_000n;
export const LOTTERY_PAYOUT_DELAY_SECS = 600;
export const LOTTERY_DRAW_INTERVAL_EPOCHS = 7;
/** First epoch after 7/7 window — keeper may draw after this many seconds (start of epoch). */
export const LOTTERY_POST_WINDOW_DRAW_DELAY_SECS = 30;
/** Draw epochs in the 28-epoch activity grid (1-based). Draw runs at the start of each. */
export const LOTTERY_DRAW_EPOCH_MARKERS = [1, 8, 15, 22] as const;
export const LOTTERY_MIN_COMMITS_FLOOR = 3;
export const LOTTERY_MIN_COMMITS_PERCENT = 10;
export const LOTTERY_DRAW_DELAY_SLOTS = 50;
/** Global ticket pool minimum to run draw at end of 7-epoch window (on-chain). */
export const LOTTERY_MIN_TICKETS_FOR_DRAW = 2n;
export const TOTAL_BURN_CAP = BURN_ALLOCATION;
export const BURN_SCHEDULE_YEARS = 20;
export const EPOCHS_PER_DAY = (24 * 60 * 60) / SECONDS_PER_EPOCH;
export const BURN_SCHEDULE_EPOCHS = BURN_SCHEDULE_YEARS * 365 * EPOCHS_PER_DAY;
export const BURN_PER_EPOCH = BURN_ALLOCATION / BigInt(BURN_SCHEDULE_EPOCHS);

export const TICK_FEE = 1_000_000n;
/** Keeper reward per epoch (lottery vault). 10 PIERRON (6 decimals). */
export const KEEPER_REWARD = 10_000_000n;
/** Optional claimant ATA debit on settle (0 = disabled). SOL tx fee still paid by claimant. */
export const REDISTRIBUTION_CLAIM_FEE = 0n;

export const MIN_FIRST_BUY_AMOUNT = 2_000_000n;
export const LOTTERY_TICKET_PER_VOLUME = 10_000_000n;
export const MAX_LOTTERY_TICKETS = 50n;
export const MIN_BALANCE_FOR_REDISTRIBUTION = 10_000_000n;
/** Account-age gate for redistribution pool qualification. `0` = disabled (was 24h). */
export const MIN_ACCOUNT_AGE_SECONDS = 0;
export const MIN_EPOCH_VOLUME_FOR_REDISTRIBUTION = 100_000_000n;

export const REDISTRIBUTION_CYCLE_EPOCHS = 28;
export const REDISTRIBUTION_VOUCHER_EXPIRY_EPOCHS = 28;
export const MIN_ACTIVE_EPOCHS = 9;

/** Mirror `programs/pierron/src/constants.rs` — per-epoch claim throttle (NOT eligible/2). */
export const MAX_REDISTRIBUTION_CLAIMS_FLOOR = 10_000;
export const MAX_REDISTRIBUTION_CLAIMS_DIVISOR = 5;
export const MAX_REDISTRIBUTION_CLAIMS_CAP = 1_000_000;

export const GENESIS_VAULT_TARGETS = {
  lotteryVault: LOTTERY_ALLOCATION,
  escrowVault: MARKET_POOL_ALLOCATION,
  burnVault: BURN_ALLOCATION,
  devWallet: DEV_WALLET_ALLOCATION,
  treasury: TREASURY_ALLOCATION,
} as const;

export function assertAllocationSum(): void {
  const sum =
    MARKET_POOL_ALLOCATION +
    DEV_WALLET_ALLOCATION +
    LOTTERY_ALLOCATION +
    BURN_ALLOCATION +
    TREASURY_ALLOCATION;
  if (sum !== TOTAL_SUPPLY) {
    throw new Error(`allocation sum ${sum} !== TOTAL_SUPPLY ${TOTAL_SUPPLY}`);
  }
}

assertAllocationSum();

export function baseUnitsToUi(amount: bigint): string {
  const scale = 10n ** BigInt(TOKEN_DECIMALS);
  const whole = amount / scale;
  const frac = amount % scale;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
