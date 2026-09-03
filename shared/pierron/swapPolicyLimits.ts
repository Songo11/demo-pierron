import { userLimitFromClaimCount, epochTurnoverLimitFromTotalClaims } from "./claimTiers.ts";
import { effectiveEpochSellVolume } from "./assertDexSwapPolicy.ts";
import { MIN_FIRST_BUY_AMOUNT } from "./tokenomicsConstants.ts";
import type { TradeBookParticipantSnapshot } from "./tradeBookParticipant.ts";
import { calculateTradeTax, grossFromNet } from "./tradeTax.ts";

/** Mirrors on-chain `participant.txs_epoch < 0` (no prior DEX swap in trade book). */
export function isFirstProtocolSwap(
  participant: TradeBookParticipantSnapshot | null | undefined
): boolean {
  if (!participant) return true;
  return participant.txsEpoch < 0;
}

export function userSwapLimitBaseUnits(
  claimCount: number,
  programId?: string
): bigint {
  return userLimitFromClaimCount(claimCount, programId);
}

export function userSwapLimitUi(claimCount: number, programId?: string): number {
  return Number(userSwapLimitBaseUnits(claimCount, programId)) / 1_000_000;
}

export function minFirstSwapUi(): number {
  return Number(MIN_FIRST_BUY_AMOUNT) / 1_000_000;
}

/** Max gross sell (UI base units) whose net→gross round-trip stays within `limitBase`. */
export function maxSellGrossWithinUserLimit(
  limitBase: bigint,
  taxRemainder = 0n
): bigint {
  if (limitBase <= 0n) return 0n;
  let lo = 1n;
  let hi = limitBase;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const { net } = calculateTradeTax(mid, taxRemainder);
    const { gross } = grossFromNet(net, taxRemainder);
    if (gross <= limitBase) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

export function maxSellGrossUiWithinUserLimit(
  limitBase: bigint,
  taxRemainder = 0n
): number {
  return Number(maxSellGrossWithinUserLimit(limitBase, taxRemainder)) / 1_000_000;
}

/** Global per-epoch sell cap snapshot (all wallets combined). */
export function epochSellCapSnapshot(
  accounting: Record<string, unknown>,
  programId?: string
): {
  capBase: bigint;
  usedBase: bigint;
  remainingBase: bigint;
  capUi: number;
  usedUi: number;
  remainingUi: number;
} {
  const claims = Number(
    accounting.totalRedistributionClaims ??
      accounting.total_redistribution_claims ??
      0
  );
  const capBase = epochTurnoverLimitFromTotalClaims(claims, programId);
  const usedBase = effectiveEpochSellVolume(accounting);
  const remainingBase = capBase > usedBase ? capBase - usedBase : 0n;
  return {
    capBase,
    usedBase,
    remainingBase,
    capUi: Number(capBase) / 1_000_000,
    usedUi: Number(usedBase) / 1_000_000,
    remainingUi: Number(remainingBase) / 1_000_000,
  };
}

/** Map simulation / policy errors to short user-facing Polish hints. */
export function humanizeSwapPolicyError(
  detail: string,
  options?: { userLimitUi?: number; side?: "buy" | "sell"; tradeBookLagsVouchers?: boolean }
): string {
  const limitHint =
    options?.userLimitUi != null
      ? `${options.userLimitUi} PIERRON`
      : "100–250 PIERRON (devnet)";
  const sellSuggestUi =
    options?.userLimitUi != null && options.userLimitUi > 0
      ? Math.max(1, Math.floor(options.userLimitUi * 0.93))
      : 140;
  if (
    detail.includes("TRANSACTION_COOLDOWN_ACTIVE") ||
    detail.includes("TransactionCooldownActive") ||
    detail.includes('"Custom":6030') ||
    detail.includes("Custom\":6030") ||
    detail.includes("Custom:6030") ||
    /0x178e\b/i.test(detail)
  ) {
    const m = detail.match(/remaining=(\d+)/);
    const tier = detail.match(/tier=(\d+)/);
    const sec = m ? Number(m[1]) : undefined;
    const tierSec = tier ? Number(tier[1]) : 120;
    if (sec != null && sec > 0) {
      return `Hook Pierron wymaga ~${tierSec} s między transferami (zostało ~${sec} s). Poczekaj i spróbuj ponownie.`;
    }
    return `Hook Pierron wymaga jeszcze chwilę między swapami (cooldown 40–120 s wg liczby claimów). Poczekaj i spróbuj ponownie.`;
  }
  if (detail.includes("SWAP_LIMIT_EXCEEDED")) {
    const m = detail.match(/user=(\d+)/);
    const limitUi = m ? Number(m[1]) / 1_000_000 : options?.userLimitUi;
    const cap = limitUi != null ? `${limitUi} PIERRON` : limitHint;
    if (options?.tradeBookLagsVouchers) {
      return `Kwota przekracza aktualny limit ${cap} (trade book jeszcze dogania claimy). Odśwież Ekosystem / spróbuj za chwilę albo zmniejsz kwotę.`;
    }
    return `Kwota przekracza ${cap} na jedną transakcję. Zmniejsz kwotę.`;
  }
  if (
    detail.includes("FIRST_SWAP_TOO_SMALL") ||
    detail.includes("FirstBuyTooSmall") ||
    detail.includes('"Custom":6045') ||
    detail.includes("0x179d")
  ) {
    return `Pierwszy swap na koncie musi być co najmniej ${minFirstSwapUi()} PIERRON (kup lub sprzedaj).`;
  }
  if (
    detail.includes("InvalidAmount") ||
    detail.includes('"Custom":6000') ||
    detail.includes("0x1770")
  ) {
    if (options?.side === "sell") {
      return `Kwota sprzedaży przekracza ${limitHint} na jedną transakcję. Zmniejsz kwotę (spróbuj np. ${sellSuggestUi}).${
        options?.tradeBookLagsVouchers
          ? " Masz odebraną redystrybucję, ale trade book jeszcze nie dogonił vouchera — zaktualizuj apkę / spróbuj ponownie po upgrade programu (ledger czyta vouchery)."
          : ""
      }`;
    }
    if (options?.side === "buy") {
      return `Za dużo SOL — dostaniesz więcej niż ${limitHint} na jedną transakcję. Zmniejsz kwotę SOL (przy ~99 PIERRON za 0,1 SOL).`;
    }
    return `Kwota przekracza ${limitHint} na jedną transakcję. Zmniejsz kwotę.`;
  }
  if (
    /memory allocation failed|out of memory|SBF program panicked/i.test(detail)
  ) {
    return (
      "Swap wymaga więcej pamięci BPF (transfer hook). Odśwież stronę i spróbuj ponownie — " +
      "transakcja powinna iść z requestHeapFrame albo w 2 krokach. Jeśli wraca, zmniejsz kwotę."
    );
  }
  if (detail.includes("EPOCH_SELL_CAP_EXCEEDED")) {
    const m = detail.match(
      /EPOCH_SELL_CAP_EXCEEDED:cap=(\d+) current=(\d+) gross=(\d+)/
    );
    if (m) {
      const capUi = Number(m[1]) / 1_000_000;
      const usedUi = Number(m[2]) / 1_000_000;
      const grossUi = Number(m[3]) / 1_000_000;
      const leftUi = Math.max(0, capUi - usedUi);
      return `Przekroczono globalny limit sprzedaży w tej epoce (${usedUi.toFixed(1)} / ${capUi} PIERRON łącznie na devnecie). W tej epoce zostało max ~${leftUi.toFixed(1)} PIERRON — spróbuj mniejszą kwotą (np. ${Math.max(1, Math.floor(leftUi * 0.95))}) lub poczekaj na kolejną epokę (~10 min). Twoja kwota: ${grossUi} PIERRON.`;
    }
    return "Przekroczono globalny limit sprzedaży w tej epoce (łączny limit wszystkich portfeli). Spróbuj w następnej epoce (~10 min devnet) lub mniejszą kwotą.";
  }
  if (
    detail.includes("PriceFloorSolFeeInsufficient") ||
    detail.includes('"Custom":6098') ||
    detail.includes("Custom\":6098") ||
    detail.includes("Custom:6098") ||
    detail.includes("0x17d2")
  ) {
    return (
      "Brak opłaty SOL (price floor) w tej samej transakcji co swap. " +
      "Zaktualizuj aplikację / przeładuj Metro i spróbuj ponownie."
    );
  }
  if (
    detail.includes("AccountNotInitialized") ||
    detail.includes('"Custom":3012') ||
    detail.includes("Custom:3012") ||
    detail.includes("0xbc4") ||
    detail.includes("user_token_in")
  ) {
    return (
      "Konto tokena wejściowego (np. wSOL) nie jest jeszcze gotowe w tej symulacji — " +
      "to normalne przy kupnie w 2 krokach. Przeładuj apkę i zatwierdź obie transakcje w Phantom " +
      "(najpierw przygotowanie, potem swap). Nie trzeba „Inicjalizuj user trade”."
    );
  }
  return detail;
}
