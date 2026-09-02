import { PublicKey } from "@solana/web3.js";
import type { AppCluster } from "../core/config.ts";

/** Canonical devnet DLMM pool — copy exactly; chat/OCR corrupts O↔D, KX↔X, 0↔O. */
export const PIERRON_DEVNET_METEORA_POOL =
  "96RRWGfUZ1rpxnuF5xx5KXDBPhm9yej4RbJ6DVcYCg5W";

/** Common corrupted paste from screenshots / chat (invalid base58 — contains O). */
export const PIERRON_DEVNET_METEORA_POOL_CORRUPTED_EXAMPLE =
  "96RRWGFUZ1rpxnuF5xx5XDBPhm9ycj43bj6OVcYcg3W";

export function meteoraAgDlmmUrl(
  poolAddress: string = PIERRON_DEVNET_METEORA_POOL,
  cluster: AppCluster = "devnet"
): string {
  const base =
    cluster === "mainnet-beta"
      ? "https://app.meteora.ag/dlmm"
      : "https://devnet.meteora.ag/dlmm";
  return `${base}/${poolAddress}`;
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address.trim());
    return true;
  } catch {
    return false;
  }
}

export function isPierronDevnetMeteoraPool(address: string): boolean {
  return address.trim() === PIERRON_DEVNET_METEORA_POOL;
}

export function describePoolAddressProblem(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return "Brak adresu puli.";
  if (!isValidSolanaAddress(trimmed)) {
    return (
      "Adres w URL jest uszkodzony (np. litera O zamiast D, brak KX). " +
      "Meteora pokaże „No Pool Found”. Skopiuj adres przyciskiem poniżej — nie z czatu."
    );
  }
  if (!isPierronDevnetMeteoraPool(trimmed)) {
    return `To nie jest aktualna pula PIERRON. Oczekiwano: ${PIERRON_DEVNET_METEORA_POOL}`;
  }
  return null;
}

export function poolAddressDiffHint(wrong: string): string[] {
  const correct = PIERRON_DEVNET_METEORA_POOL;
  const hints: string[] = [];
  for (let i = 0; i < Math.max(correct.length, wrong.length); i++) {
    if (correct[i] !== wrong[i]) {
      hints.push(`poz. ${i}: „${wrong[i] ?? "∅"}” → „${correct[i] ?? "∅"}”`);
      if (hints.length >= 4) break;
    }
  }
  return hints;
}
