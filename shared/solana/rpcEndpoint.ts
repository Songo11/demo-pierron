import type { AppCluster } from "../core/config.ts";
import { isHeliusApiKeyRpcUrl } from "../light/compressionRpcTransport.ts";

/** Solana Foundation public endpoints — rate-limited; unsuitable for production DEX. */
export const PUBLIC_CLUSTER_RPC: Record<AppCluster, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

export function normalizeRpcUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function isPublicSolanaClusterRpc(url: string): boolean {
  const normalized = normalizeRpcUrl(url).toLowerCase();
  return Object.values(PUBLIC_CLUSTER_RPC).some(
    (publicUrl) => normalizeRpcUrl(publicUrl).toLowerCase() === normalized
  );
}

export function isRateLimitRpcError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("too many requests") ||
    m.includes("rate limit") ||
    m.includes("rate-limit") ||
    m.includes("limit zapytań") ||
    m.includes("max usage reached") ||
    m.includes("-32429") ||
    m.includes("dex_rpc_rate_limit")
  );
}

/** Worker / Helius pool drained — not the same as client rate-limit spam. */
export function isRpcBackendExhaustedError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("dex_rpc_backend_exhausted") ||
    m.includes("all helius keys exhausted") ||
    m.includes("all pierron rpc backends failed") ||
    m.includes("helius keys exhausted for compression") ||
    (m.includes("-32004") && (m.includes("exhausted") || m.includes("backends failed")))
  );
}

/** Solana Foundation / CDN blocks many mobile carrier IPs (HTTP 403). */
export function isRpcEndpointBlockedError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /\b403\b/.test(m) ||
    m.includes("blocked from this endpoint") ||
    m.includes("your ip or provider is blocked") ||
    m.includes("access forbidden") ||
    (m.includes("cloudflare") && m.includes("blocked"))
  );
}

/** RPC endpoint blocks methods needed for swap (e.g. Tatum free tier + getBalance). */
export function isUnsupportedDexRpcError(message: string): boolean {
  return /paid plans only|upgrade your subscription|method.*not available|not supported on the free/i.test(
    message
  );
}

export function isJsonRpcBlockedBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  if (/blocked from this endpoint|your ip or provider is blocked/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { code?: number; message?: string };
    };
    const code = parsed?.error?.code;
    const msg = String(parsed?.error?.message ?? "");
    return code === 403 || isRpcEndpointBlockedError(msg);
  } catch {
    return false;
  }
}

/**
 * Auth / junk bodies that @solana/web3.js turns into StructError
 * ("Expected union… received: [object Object]") instead of a clean RPC error.
 *
 * Do NOT treat generic JSON-RPC `-32000` as auth — the Next `/api/solana-rpc`
 * proxy uses that code for transient "Upstream RPC unreachable", and Solana
 * nodes use it for many server errors. Misclassifying it as BAD_ENDPOINT
 * blocks retries and shows a false "brak klucza" message.
 */
export function isJsonRpcAuthOrMalformedBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  if (/unauthorized|api key|authenticate your request|invalid api key/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { code?: number; message?: string };
      result?: unknown;
    };
    const msg = String(parsed?.error?.message ?? "");
    if (/unauthorized|api key|authenticate/i.test(msg)) return true;
    // Only hard-fail auth codes that are unambiguously credentials — not -32000.
    if (parsed?.error && parsed.result === undefined && parsed.error.code === 401) {
      return true;
    }
  } catch {
    if (/<!doctype html|<html|cloudflare/i.test(trimmed)) return true;
  }
  return false;
}

/** Helius / Tatum often return HTTP 200/429 with non-standard JSON bodies. */
export function isJsonRpcRateLimitBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  if (isJsonRpcBackendExhaustedBody(trimmed)) return false;
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { code?: number; message?: string };
      statusCode?: number;
      message?: string;
    };
    if (parsed.statusCode === 429) return true;
    const err = parsed?.error;
    if (!err) {
      return isRateLimitRpcError(String(parsed.message ?? ""));
    }
    if (err.code === 429 || err.code === -32429 || err.code === -32005) return true;
    return isRateLimitRpcError(String(err.message ?? ""));
  } catch {
    return isRateLimitRpcError(trimmed);
  }
}

export function isJsonRpcBackendExhaustedBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { code?: number; message?: string };
    };
    const msg = String(parsed?.error?.message ?? "");
    if (isRpcBackendExhaustedError(msg)) return true;
    // -32004 from Pierron worker = backends exhausted (not per-IP rate limit).
    if (parsed?.error?.code === -32004) return true;
    return false;
  } catch {
    return isRpcBackendExhaustedError(trimmed);
  }
}

export type DexRpcGuardOptions = {
  /** When true, public cluster RPC is rejected (required for mainnet launch). */
  requireDedicatedRpc?: boolean;
  /** Human label for error messages, e.g. "swap Meteora". */
  operation?: string;
};

/**
 * Ensures DEX / pool reads do not rely on rate-limited public RPC in production.
 * Throws `DEX_RPC_PUBLIC` or `DEX_RPC_RATE_LIMIT` for UI mapping.
 */
export function assertDexRpcReady(
  rpcUrl: string,
  cluster: AppCluster,
  options?: DexRpcGuardOptions
): void {
  const operation = options?.operation ?? "operacje DEX";
  const requireDedicated =
    options?.requireDedicatedRpc ?? cluster === "mainnet-beta";

  if (requireDedicated && isPublicSolanaClusterRpc(rpcUrl)) {
    throw new Error(
      `DEX_RPC_PUBLIC: ${operation} wymaga dedykowanego RPC (Helius Secure URL lub proxy), nie publicznego ${PUBLIC_CLUSTER_RPC[cluster]}.`
    );
  }

  // Devnet mobile dev build: Helius ?api-key= działa dla zwykłego JSON-RPC (Meteora, swap).
  // Na mainnet nie wkładaj klucza w URL — Secure URL lub Worker.
  if (isHeliusApiKeyRpcUrl(rpcUrl) && cluster === "mainnet-beta") {
    throw new Error(
      "DEX_RPC_HELIUS_KEY_URL: Na mainnet użyj Secure RPC URL lub Cloudflare Worker (bez ?api-key= w aplikacji)."
    );
  }
}

/** Map RPC failures to stable codes for mobile / dapp i18n. */
export function classifyDexRpcError(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("DEX_RPC_PUBLIC")) return "DEX_RPC_PUBLIC";
  if (message.includes("DEX_RPC_HELIUS_KEY_URL")) return "DEX_RPC_HELIUS_KEY_URL";
  if (message.includes("DEX_RPC_BACKEND_EXHAUSTED") || isRpcBackendExhaustedError(message)) {
    return "DEX_RPC_BACKEND_EXHAUSTED";
  }
  if (isRpcEndpointBlockedError(message)) return "DEX_RPC_BLOCKED";
  if (isRateLimitRpcError(message)) return "DEX_RPC_RATE_LIMIT";
  if (isUnsupportedDexRpcError(message)) return "DEX_RPC_UNSUPPORTED";
  return null;
}

export function dexRpcBlockedUserMessage(detail?: string): string {
  const which = detail?.trim()
    ? `\n\nSzczegół: ${detail.trim().slice(0, 220)}`
    : "";
  return (
    "RPC chwilowo niedostępny (HTTP 403/limit z proxy).\n\n" +
    "To zwykle NIE jest blokada Twojego IP — Worker Pierron czasem dostawał 403 od Heliusa i przekazywał je telefonowi.\n\n" +
    "1) Poczekaj 5–10 s i spróbuj ponownie\n" +
    "2) Ustawienia → wyczyść pole RPC (puste) → status swap-flow-40+\n" +
    "3) Dwa telefony naraz + keeper loterii obciążają proxy — zamknij Ekosystem na jednym podczas swapu" +
    which
  );
}

/** web3.js StructError when failover RPC returns Unauthorized / junk. */
export function dexRpcStructErrorUserMessage(): string {
  return (
    "RPC zwrócił złą odpowiedź przy odczycie mintu (StructError) — zwykle przeciążony Worker albo martwy failover.\n\n" +
    "To NIE jest blokada przez commity loterii. Poczekaj ~30 s i spróbuj ponownie.\n" +
    "Ustawienia → wyczyść pole RPC → status powinien pokazać swap-flow-40+."
  );
}

export function dexRpcRateLimitUserMessage(cluster: AppCluster): string {
  if (cluster === "mainnet-beta") {
    return "RPC mainnet zwrócił limit zapytań (429). Ustaw dedykowany Helius Secure URL w konfiguracji — publiczny api.mainnet-beta.solana.com nie obsłuży swapu przy ruchu użytkowników.";
  }
  return "Limit RPC devnet — proxy Pierron odrzucił zapytania (zbyt dużo odświeżeń naraz).\n\n1) Poczekaj ~1 minutę i spróbuj ponownie.\n\n2) Ustawienia → wyczyść pole RPC (domyślny Worker Pierron) — docs/devnet/HELIUS_MOBILE_RPC.md\n\n3) Dwa telefony w tej samej sieci Wi‑Fi dzielą limit — zamknij Ekosystem na jednym urządzeniu podczas swapu.";
}

export function dexRpcBackendExhaustedUserMessage(): string {
  return (
    "RPC Light/Photon wyczerpane (Helius compression — max usage / keys exhausted).\n\n" +
    "Claim i proofy Light NIE zadziałają, dopóki Photon nie wróci — Send on-chain może nadal przechodzić.\n\n" +
    "1) Poczekaj reset limitu Helius (często do rana / nowy cykl billing) albo wgraj świeże klucze:\n" +
    "   wrangler secret put HELIUS_API_KEY_1 --env devnet\n" +
    "2) Zamknij Safe Send / Ekosystem na drugim telefonie (wspólny Worker)\n" +
    "3) Potem Claim ponów BEZ nowego Send (jeśli Send wcześniej był SUKCES)"
  );
}
