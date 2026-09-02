import { epochTransactionCooldownSeconds as cooldownFromTiers } from "./claimTiers";

/** Mirrors per-user `epoch_transaction_cooldown_from_claim_count` on-chain. */
export function epochTransactionCooldownSeconds(
  redistributionClaimCount: number,
  programId?: string
): number {
  return cooldownFromTiers(redistributionClaimCount, programId);
}

/** Extra seconds so wall-clock ahead of Solana Clock doesn't pass client preflight early. */
export const SWAP_COOLDOWN_CLIENT_SKEW_SECS = 2;

export function swapCooldownRemainingSeconds(params: {
  lastActivityUnix: number;
  redistributionClaimCount: number;
  /** @deprecated use redistributionClaimCount */
  totalRedistributionClaims?: number;
  nowSec?: number;
  programId?: string;
  /** Wait this many extra seconds past on-chain ready (default 0). */
  skewSecs?: number;
}): number {
  const { lastActivityUnix, programId } = params;
  const claimCount =
    params.redistributionClaimCount ?? params.totalRedistributionClaims ?? 0;
  if (lastActivityUnix <= 0) return 0;
  const now = params.nowSec ?? Math.floor(Date.now() / 1000);
  const cooldown = epochTransactionCooldownSeconds(claimCount, programId);
  const skew = Math.max(0, params.skewSecs ?? 0);
  const readyAt = lastActivityUnix + cooldown + skew;
  return Math.max(0, readyAt - now);
}

export function isTransactionCooldownError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  // Match on-chain / Anchor text only — never bare "cooldown" (false-positive on
  // timeouts like "Sprawdzanie cooldown timeout").
  return (
    msg.includes("transaction cooldown active") ||
    msg.includes("transactioncooldownactive") ||
    msg.includes("transaction_cooldown_active") ||
    msg.includes('"custom":6030') ||
    msg.includes("custom:6030") ||
    /0x178e\b/.test(msg)
  );
}
