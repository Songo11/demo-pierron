import type { AppSettings } from "../core/config.ts";
import {
  isHeliusApiKeyRpcUrl,
  isMobileSafeCompressionRpcUrl,
} from "../light/compressionRpcTransport.ts";
import { resolveFirstHealthyRpcFromCandidates } from "./resilientConnection.ts";
import { isPublicSolanaClusterRpc, PUBLIC_CLUSTER_RPC } from "./rpcEndpoint.ts";
import {
  PIERRON_DEVNET_HELIUS_PROXY_URL,
  PIERRON_DEVNET_RPC_PROXY_DEFAULT,
  PIERRON_DEVNET_RPC_FAILOVER_DEFAULTS,
} from "./devnetRpcProxyUrl.ts";

export {
  PIERRON_DEVNET_HELIUS_PROXY_URL,
  PIERRON_DEVNET_RPC_PROXY_DEFAULT,
  PIERRON_DEVNET_RPC_FAILOVER_DEFAULTS,
} from "./devnetRpcProxyUrl.ts";

export type DevnetRpcSettings = Pick<
  AppSettings,
  "solanaRpcUrl" | "lightPhotonUrl"
>;

const BLOCKED_DEVNET_RPC_MARKERS = [
  "pierron-helius-devnet",
  "rpc.ankr.com",
] as const;

/** Współdzielony / wyczerpany proxy + publiczny Solana (403 na wielu sieciach mobilnych). */
export function isBlockedDevnetRpcUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  if (!normalized) return false;
  if (BLOCKED_DEVNET_RPC_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }
  // Publiczny Foundation RPC — telefony często dostają 403 „IP or provider is blocked”.
  if (isPublicSolanaClusterRpc(normalized) || normalized.includes("api.devnet.solana.com")) {
    return true;
  }
  return false;
}

const DEVNET_RPC_MISSING =
  "DEX_RPC_PUBLIC: Brak RPC na devnet. Cloudflare Worker Pierron (domyślny) lub własny URL w ustawieniach. Nie wklejaj ?api-key= na telefonie.";

/** Build-time proxy URL lub domyślny worker projektu (bez kluczy w APK). */
export function readDevnetHeliusProxyUrlFromEnv(): string | undefined {
  const fromProcess =
    process.env.EXPO_PUBLIC_PIERRON_DEVNET_PROXY_URL?.trim() ||
    process.env.EXPO_PUBLIC_HELIUS_DEVNET_PROXY_URL?.trim();
  const candidate = fromProcess || PIERRON_DEVNET_RPC_PROXY_DEFAULT;
  if (
    candidate &&
    isMobileSafeCompressionRpcUrl(candidate) &&
    !isBlockedDevnetRpcUrl(candidate)
  ) {
    return candidate;
  }
  return undefined;
}

/** Devnet RPC/Photon gotowe (proxy lub override w ustawieniach). */
export function isDevnetRpcConfigured(settings: DevnetRpcSettings): boolean {
  if (readDevnetHeliusProxyUrlFromEnv()) return true;
  return Boolean(firstMobileSafeUrl(settings.lightPhotonUrl, settings.solanaRpcUrl));
}

/** Mainnet build proxy (future production). */
export function readMainnetHeliusProxyUrlFromEnv(): string | undefined {
  const fromProcess = process.env.EXPO_PUBLIC_PIERRON_MAINNET_PROXY_URL?.trim();
  if (fromProcess && isMobileSafeCompressionRpcUrl(fromProcess)) {
    return fromProcess;
  }
  return undefined;
}

/**
 * Helius API key from env — wyłącznie skrypty CLI (ANCHOR / tsx).
 * Mobile NIE czyta kluczy Helius z bundla.
 */
export function readDevnetHeliusApiKeyFromEnv(): string | undefined {
  const fromProcess =
    process.env.HELIUS_API_KEY?.trim() ||
    process.env.HELIUS_DEVNET_API_KEY?.trim();
  if (fromProcess) return fromProcess;
  return undefined;
}

export function assertDevnetRpcConfigured(settings: DevnetRpcSettings): void {
  resolvePierronDevnetRpcUrl(settings);
}

export function buildHeliusDevnetRpcUrl(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("Helius API key is empty.");
  }
  return `https://devnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;
}

function firstMobileSafeUrl(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (
      trimmed &&
      isMobileSafeCompressionRpcUrl(trimmed) &&
      !isBlockedDevnetRpcUrl(trimmed)
    ) {
      return trimmed;
    }
  }
  return undefined;
}

/** Ordered devnet RPC candidates for DEX / Meteora reads (first wins; failover on 429/403). */
export function resolvePierronDevnetDexRpcCandidates(
  settings: DevnetRpcSettings
): string[] {
  const envProxy = readDevnetHeliusProxyUrlFromEnv();
  const fromSettings = firstMobileSafeUrl(settings.solanaRpcUrl);
  const dedicatedSettings =
    fromSettings &&
    !isPublicSolanaClusterRpc(fromSettings) &&
    !isBlockedDevnetRpcUrl(fromSettings)
      ? fromSettings
      : undefined;

  const envFallbacks =
    process.env.EXPO_PUBLIC_PIERRON_DEVNET_RPC_FALLBACKS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  // Szybki DEX: OnFinality / własne fallbacki NAJPIERW.
  // Worker Pierron na końcu — standardowe getAccountInfo/getBalance często
  // padają na all-exhausted i kosztują 3–8 s zanim resilientConnection przełączy.
  // Stealth/Photon nadal bierze Worker przez resolveStealth* (osobna ścieżka).
  const candidates = [
    dedicatedSettings,
    ...envFallbacks,
    ...PIERRON_DEVNET_RPC_FAILOVER_DEFAULTS,
    envProxy,
  ];
  return [
    ...new Set(
      (candidates.filter(Boolean) as string[]).filter(
        (url) => !isBlockedDevnetRpcUrl(url)
      )
    ),
  ];
}

/** Probes DEX RPC with getAccountInfo on the Meteora pool (getHealth is unreliable). */
export async function resolveFirstHealthyPierronDevnetDexRpcUrl(
  settings: DevnetRpcSettings,
  probeAccount: string
): Promise<string> {
  const candidates = resolvePierronDevnetDexRpcCandidates(settings);
  if (candidates.length === 0) {
    throw new Error(DEVNET_RPC_MISSING);
  }
  return resolveFirstHealthyRpcFromCandidates(candidates, probeAccount);
}

/**
 * Devnet RPC for mobile / dapp reads.
 * Prefers Cloudflare proxy over rate-limited api.devnet.solana.com.
 */
export function resolvePierronDevnetRpcUrl(settings: DevnetRpcSettings): string {
  const candidates = resolvePierronDevnetDexRpcCandidates(settings);
  if (candidates.length > 0) return candidates[0];
  throw new Error(DEVNET_RPC_MISSING);
}

/** Stealth / Light compression endpoint on devnet (Photon + RPC) — ten sam Worker co DEX. */
export function resolvePierronDevnetCompressionEndpoint(
  settings: DevnetRpcSettings
): string {
  const fromSettings = firstMobileSafeUrl(
    settings.lightPhotonUrl,
    settings.solanaRpcUrl
  );
  if (fromSettings) return fromSettings;

  const envProxy = readDevnetHeliusProxyUrlFromEnv();
  if (envProxy) return envProxy;

  throw new Error(DEVNET_RPC_MISSING);
}

export function resolveDexRpcEndpointForSettings(settings: AppSettings): string {
  if (settings.cluster === "localnet") {
    const custom = settings.solanaRpcUrl?.trim();
    return custom || PUBLIC_CLUSTER_RPC.localnet;
  }

  if (settings.cluster === "devnet") {
    return resolvePierronDevnetRpcUrl(settings);
  }

  if (settings.cluster === "mainnet-beta") {
    const mainnetProxy = readMainnetHeliusProxyUrlFromEnv();
    if (mainnetProxy) return mainnetProxy;
  }

  const custom = settings.solanaRpcUrl?.trim();
  if (custom && !isHeliusApiKeyRpcUrl(custom)) {
    return custom;
  }

  return PUBLIC_CLUSTER_RPC[settings.cluster] ?? PUBLIC_CLUSTER_RPC.devnet;
}
