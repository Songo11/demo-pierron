import { loadJson, saveJson } from "../core/storage.ts";

const STORAGE_KEY = "pierron_last_official_swap_v1";

type SwapCooldownStore = Record<string, number>;

/** Unix seconds of last successful official swap (per wallet), for UI cooldown before on-chain fix/deploy. */
export async function loadLastSwapUnix(wallet: string): Promise<number> {
  const map = await loadJson<SwapCooldownStore>(STORAGE_KEY, {});
  const ts = map[wallet];
  return typeof ts === "number" && Number.isFinite(ts) ? ts : 0;
}

export async function recordLastSwapUnix(wallet: string, unixSec?: number): Promise<void> {
  const map = await loadJson<SwapCooldownStore>(STORAGE_KEY, {});
  map[wallet] = unixSec ?? Math.floor(Date.now() / 1000);
  await saveJson(STORAGE_KEY, map);
}

/** Drop local UI timer when on-chain says the wallet is ready (failed swap must not lock UI). */
export async function clearLastSwapUnix(wallet: string): Promise<void> {
  const map = await loadJson<SwapCooldownStore>(STORAGE_KEY, {});
  if (!(wallet in map)) return;
  delete map[wallet];
  await saveJson(STORAGE_KEY, map);
}
