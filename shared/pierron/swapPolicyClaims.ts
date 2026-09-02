/**
 * Effective swap tier = max(trade-book counter, verified consumed vouchers).
 * Mirrors on-chain `effective_redistribution_claim_count` in `assert_dex_swap_policy`.
 */
export function swapPolicyRedistributionClaimCount(
  tradeBookClaims: number,
  consumedVoucherCount: number
): number {
  return Math.max(Math.max(0, tradeBookClaims), Math.max(0, consumedVoucherCount));
}

/** Devnet program upgraded — voucher PDAs count in assert_dex_swap_policy. */
export function devnetDexPolicyHonorsVoucherAccounts(): boolean {
  const env =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_PIERRON_DEVNET_VOUCHER_TIER?.trim()
      : undefined;
  if (env === "1" || env === "true") return true;
  if (env === "0" || env === "false") return false;
  return true;
}

/**
 * Ledger `transfer_hook` honors consumed vouchers for tier (same as assert).
 * Flip on after the matching program upgrade is live on A9kNas….
 * Override: EXPO_PUBLIC_PIERRON_DEVNET_LEDGER_VOUCHER_TIER=0|1
 */
export function devnetLedgerHonorsVoucherAccounts(): boolean {
  const env =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_PIERRON_DEVNET_LEDGER_VOUCHER_TIER?.trim()
      : undefined;
  if (env === "1" || env === "true") return true;
  if (env === "0" || env === "false") return false;
  // Voucher-aware ledger live on A9kNas… (UPGRADE_OK 2026-07-20).
  return true;
}

/**
 * Tier used for swap limits / assert — matches **deployed** on-chain program.
 * Pre-upgrade devnet ignores voucher accounts (deserialize bug) → trade book only when lagging.
 */
export function swapPolicyClaimsForDexLimit(
  tradeBookClaims: number,
  consumedVoucherCount: number,
  programId?: string
): number {
  const effective = swapPolicyRedistributionClaimCount(
    tradeBookClaims,
    consumedVoucherCount
  );
  if (
    programId === "A9kNasYvn9ZqdEzHvRHqQFtouqdRzzE2udR8aUqbKb13" &&
    !devnetDexPolicyHonorsVoucherAccounts() &&
    consumedVoucherCount > tradeBookClaims
  ) {
    return Math.max(0, tradeBookClaims);
  }
  return effective;
}

/**
 * Tier for sell **amount sizing** / ledger path.
 * Old ledger ignored vouchers → when trade book lags, size by TB until ledger upgrade is live.
 */
export function swapPolicyClaimsForDexLedgerLimit(
  tradeBookClaims: number,
  consumedVoucherCount: number,
  programId?: string
): number {
  const forAssert = swapPolicyClaimsForDexLimit(
    tradeBookClaims,
    consumedVoucherCount,
    programId
  );
  if (
    programId === "A9kNasYvn9ZqdEzHvRHqQFtouqdRzzE2udR8aUqbKb13" &&
    !devnetLedgerHonorsVoucherAccounts() &&
    consumedVoucherCount > tradeBookClaims
  ) {
    return Math.max(0, tradeBookClaims);
  }
  return forAssert;
}

/** Ecosystem / badges — same effective count as swap policy. */
export function displayRedistributionClaimCount(
  tradeBookClaims: number,
  consumedVoucherCount: number
): number {
  return swapPolicyRedistributionClaimCount(tradeBookClaims, consumedVoucherCount);
}

export function tradeBookLagsConsumedVouchers(
  tradeBookClaims: number,
  consumedVoucherCount: number
): boolean {
  return consumedVoucherCount > tradeBookClaims;
}
