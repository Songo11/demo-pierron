import { Connection, type ConnectionConfig } from "@solana/web3.js";
import { postSolanaRpcBody } from "./mobileRpcTransport.ts";
import {
  dexRpcBackendExhaustedUserMessage,
  dexRpcRateLimitUserMessage,
  isJsonRpcAuthOrMalformedBody,
  isJsonRpcBackendExhaustedBody,
  isJsonRpcBlockedBody,
  isJsonRpcRateLimitBody,
  isRateLimitRpcError,
  isRpcBackendExhaustedError,
  isRpcEndpointBlockedError,
  isUnsupportedDexRpcError,
} from "./rpcEndpoint.ts";
import { sanitizeRpcUrlForDisplay } from "../light/compressionRpcTransport.ts";

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 500;
const PIERRON_PROXY_RATE_LIMIT_DELAY_MS = 4_000;
/** Cap so a single RPC call cannot sit in "retry sleep" for minutes. */
const PIERRON_BACKEND_EXHAUSTED_DELAY_MS = 400;
/** 0 = natychmiast failover na kolejny URL (connect puli nie czeka 1.5–5 s na martwym Workerze). */
const PIERRON_BACKEND_EXHAUSTED_MAX_RETRIES = 0;

function isPierronProxyRateLimitBody(bodyText: string): boolean {
  return (
    bodyText.includes("Pierron RPC proxy rate limit") ||
    bodyText.includes('"code":-32005') ||
    bodyText.includes('"code": -32005')
  );
}

type FetchInit = RequestInit & { timeout?: number };

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    isRateLimitRpcError(message) ||
    isRpcEndpointBlockedError(message) ||
    isUnsupportedDexRpcError(message) ||
    message.includes("DEX_RPC_BAD_ENDPOINT") ||
    /network request failed|failed to fetch|fetch failed|econnreset|etimedout|socket hang up|network error/i.test(
      message
    )
  );
}

function rpcUrlFromInput(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function rebuildResponse(status: number, statusText: string, bodyText: string): Response {
  return new Response(bodyText, {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * fetch wrapper: retries HTTP/JSON-RPC rate limits with exponential backoff.
 * Uses XMLHttpRequest fallback for Helius ?api-key= URLs on React Native.
 */
export async function fetchWithRpcRetry(
  input: RequestInfo | URL,
  init?: FetchInit,
  maxRetries = DEFAULT_MAX_RETRIES
): Promise<Response> {
  const rpcUrl = rpcUrlFromInput(input);
  const bodyText = typeof init?.body === "string" ? init.body : "";
  const isPierronWorker = /pierron-rpc-.*\.workers\.dev/i.test(rpcUrl);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await postSolanaRpcBody(rpcUrl, bodyText, {
        signal: init?.signal ?? undefined,
        timeoutMs: init?.timeout ?? 60_000,
      });
      // Worker sometimes proxied upstream 403 — retry same URL a few times before failover.
      if (
        (result.status === 403 || isJsonRpcBlockedBody(result.bodyText)) &&
        isPierronWorker &&
        attempt < maxRetries
      ) {
        await sleep(DEFAULT_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      if (
        result.status === 403 ||
        isJsonRpcBlockedBody(result.bodyText)
      ) {
        throw new Error(
          `DEX_RPC_BLOCKED: RPC ${sanitizeRpcUrlForDisplay(rpcUrl)} zwrócił 403 (IP zablokowane).`
        );
      }
      if (isJsonRpcAuthOrMalformedBody(result.bodyText)) {
        throw new Error(
          `DEX_RPC_BAD_ENDPOINT: RPC ${sanitizeRpcUrlForDisplay(rpcUrl)} odrzucił żądanie (brak klucza / zła odpowiedź).`
        );
      }
      if (isJsonRpcBackendExhaustedBody(result.bodyText)) {
        // Worker all-exhausted: od razu rzuć → createFailoverFetch bierze OnFinality.
        throw new Error(
          `DEX_RPC_BACKEND_EXHAUSTED: ${dexRpcBackendExhaustedUserMessage()}`
        );
      }
      if (result.status === 429 || isJsonRpcRateLimitBody(result.bodyText)) {
        if (attempt >= maxRetries) {
          throw new Error(`DEX_RPC_RATE_LIMIT: ${dexRpcRateLimitUserMessage("devnet")}`);
        }
        const delayMs = isPierronProxyRateLimitBody(result.bodyText)
          ? PIERRON_PROXY_RATE_LIMIT_DELAY_MS * (attempt + 1)
          : DEFAULT_BASE_DELAY_MS * 2 ** attempt;
        await sleep(delayMs);
        continue;
      }
      // Next same-origin proxy / CF edge: transient upstream blip — retry, don't surface as auth.
      const upstreamUnreachable =
        result.status === 502 ||
        /Upstream RPC unreachable|fetch failed/i.test(result.bodyText);
      if (upstreamUnreachable && attempt < maxRetries) {
        await sleep(DEFAULT_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      // Generic 503 na Workerze Pierron = od razu failover (nie mylić z rate-limitem OnFinality).
      if (result.status === 503) {
        if (isPierronWorker || attempt >= PIERRON_BACKEND_EXHAUSTED_MAX_RETRIES) {
          throw new Error(
            `DEX_RPC_BACKEND_EXHAUSTED: ${dexRpcBackendExhaustedUserMessage()}`
          );
        }
        await sleep(PIERRON_BACKEND_EXHAUSTED_DELAY_MS * (attempt + 1));
        continue;
      }
      return rebuildResponse(result.status, result.statusText, result.bodyText);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      // 403 / bad endpoint: nie retry'uj tego samego URL — failover (po lokalnych retry Worker).
      if (
        isRpcEndpointBlockedError(message) ||
        message.includes("DEX_RPC_BLOCKED") ||
        message.includes("DEX_RPC_BAD_ENDPOINT")
      ) {
        throw error;
      }
      if (message.includes("DEX_RPC_BACKEND_EXHAUSTED") || isRpcBackendExhaustedError(message)) {
        // Natychmiastowy failover — bez sleep na tym samym URL.
        throw error;
      }
      if (!isTransientFetchError(error) && !isRateLimitRpcError(message)) {
        throw error;
      }
      if (attempt >= maxRetries) {
        if (isRateLimitRpcError(message)) {
          throw new Error(`DEX_RPC_RATE_LIMIT: ${dexRpcRateLimitUserMessage("devnet")}`);
        }
        throw error;
      }
      await sleep(DEFAULT_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Probes getAccountInfo + getBalance — Tatum passes the former but blocks the latter on free tier. */
export async function probeDexRpcForPoolAccount(
  rpcUrl: string,
  probeAccount: string,
  timeoutMs = 10_000
): Promise<void> {
  const accountBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "getAccountInfo",
    params: [probeAccount, { encoding: "base64" }],
  });
  const accountResult = await postSolanaRpcBody(rpcUrl, accountBody, { timeoutMs });
  if (accountResult.status === 429 || isJsonRpcRateLimitBody(accountResult.bodyText)) {
    throw new Error("rate limit");
  }
  if (
    accountResult.status === 403 ||
    isJsonRpcBlockedBody(accountResult.bodyText)
  ) {
    throw new Error("rpc blocked 403");
  }
  if (accountResult.status < 200 || accountResult.status >= 300) {
    throw new Error(`http ${accountResult.status}`);
  }
  const accountParsed = JSON.parse(accountResult.bodyText) as {
    error?: { message?: string };
    result?: { value?: unknown };
    statusCode?: number;
  };
  if (accountParsed.statusCode === 429) {
    throw new Error("rate limit");
  }
  if (accountParsed.error) {
    const msg = String(accountParsed.error.message ?? "rpc error");
    if (isUnsupportedDexRpcError(msg)) {
      throw new Error(msg);
    }
    throw new Error(msg);
  }
  if (!accountParsed.result?.value) {
    throw new Error("account not found");
  }

  const balanceBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "getBalance",
    params: [probeAccount],
  });
  const balanceResult = await postSolanaRpcBody(rpcUrl, balanceBody, { timeoutMs });
  if (balanceResult.status === 429 || isJsonRpcRateLimitBody(balanceResult.bodyText)) {
    throw new Error("rate limit");
  }
  if (
    balanceResult.status === 403 ||
    isJsonRpcBlockedBody(balanceResult.bodyText)
  ) {
    throw new Error("rpc blocked 403");
  }
  const balanceParsed = JSON.parse(balanceResult.bodyText) as {
    error?: { message?: string };
    result?: { value?: number };
  };
  if (balanceParsed.error) {
    const msg = String(balanceParsed.error.message ?? "getBalance failed");
    if (isUnsupportedDexRpcError(msg)) {
      throw new Error(msg);
    }
    throw new Error(msg);
  }
  if (balanceParsed.result?.value == null) {
    throw new Error("getBalance missing result");
  }
}

export async function resolveFirstHealthyRpcFromCandidates(
  candidates: string[],
  probeAccount: string
): Promise<string> {
  const urls = uniqueRpcUrls(candidates);
  const tried: string[] = [];
  let lastError: unknown;
  // 429 na probe = endpoint ODPOWIADA (jest osiągalny), tylko chwilowo przeciążony
  // (np. dwa telefony na 1 Wi-Fi). NIE failuj wtedy połączenia — realne zapytania i tak
  // idą przez createResilientConnection, które ma własny backoff/retry na 429.
  let rateLimitedButReachable: string | null = null;
  for (const rpcUrl of urls) {
    tried.push(rpcUrl);
    try {
      await probeDexRpcForPoolAccount(rpcUrl, probeAccount);
      return rpcUrl;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (isRateLimitRpcError(message) && rateLimitedButReachable == null) {
        rateLimitedButReachable = rpcUrl;
      }
    }
  }
  if (rateLimitedButReachable != null) {
    return rateLimitedButReachable;
  }
  const triedLabel = tried.map((url) => sanitizeRpcUrlForDisplay(url)).join(" → ");
  const suffix = tried.length > 0 ? `\n\nPróbowano: ${triedLabel}` : "";
  throw new Error(`DEX_RPC_RATE_LIMIT: ${dexRpcRateLimitUserMessage("devnet")}${suffix}`);
}

type ResilientConnectionOptions = {
  commitment?: ConnectionConfig["commitment"];
  /** When set, retries 429 on the next URL (mobile devnet failover). */
  fallbackRpcUrls?: string[];
};

function uniqueRpcUrls(urls: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const trimmed = url?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function createFailoverFetch(rpcUrls: string[]): typeof fetch {
  const urls = uniqueRpcUrls(rpcUrls);

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let lastError: unknown;
    for (const rpcUrl of urls) {
      try {
        // Worker: 0 lokalnych retry (od razu kolejny URL). Inne RPC: lekkie retry na 429.
        const isPierronWorker = /pierron-rpc-.*\.workers\.dev/i.test(rpcUrl);
        const maxRetriesPerUrl = isPierronWorker ? 0 : 2;
        return await fetchWithRpcRetry(rpcUrl, init as FetchInit, maxRetriesPerUrl);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const shouldFailover =
          isRateLimitRpcError(message) ||
          isRpcBackendExhaustedError(message) ||
          message.includes("DEX_RPC_BACKEND_EXHAUSTED") ||
          isRpcEndpointBlockedError(message) ||
          message.includes("DEX_RPC_BLOCKED") ||
          message.includes("DEX_RPC_BAD_ENDPOINT") ||
          isTransientFetchError(error);
        if (!shouldFailover) {
          throw error;
        }
      }
    }
    const lastMsg = lastError instanceof Error ? lastError.message : String(lastError ?? "");
    if (isRpcEndpointBlockedError(lastMsg) || lastMsg.includes("DEX_RPC_BLOCKED")) {
      throw new Error(
        `DEX_RPC_BLOCKED: Wszystkie RPC zwróciły 403. Wyczyść pole RPC w Ustawieniach (Worker Pierron).`
      );
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`DEX_RPC_RATE_LIMIT: ${dexRpcRateLimitUserMessage("devnet")}`);
  };
}

const DISABLED_WS_ENDPOINT = "wss://127.0.0.1:1";

function silenceDeadWebsocketErrors(connection: Connection): Connection {
  // web3.js logs `console.error('ws error:', …)` on every WSS failure — Worker has no WSS.
  const anyConn = connection as unknown as {
    _rpcWebSocket?: {
      removeAllListeners?: (event: string) => void;
      on: (event: string, fn: (...args: unknown[]) => void) => void;
    };
    _rpcWebSocketConnected?: boolean;
    _wsOnError?: (err: unknown) => void;
  };
  anyConn._wsOnError = () => {
    anyConn._rpcWebSocketConnected = false;
  };
  const ws = anyConn._rpcWebSocket;
  if (ws?.removeAllListeners) {
    ws.removeAllListeners("error");
    ws.on("error", () => {
      anyConn._rpcWebSocketConnected = false;
    });
  }
  return connection;
}

/** Connection with 429-aware fetch — use for dapp and keeper when public RPC is unavoidable. */
export function createResilientConnection(
  rpcUrl: string,
  commitment: ConnectionConfig["commitment"] = "confirmed",
  options?: Omit<ResilientConnectionOptions, "commitment">
): Connection {
  const urls = uniqueRpcUrls([rpcUrl, ...(options?.fallbackRpcUrls ?? [])]);
  return silenceDeadWebsocketErrors(
    new Connection(urls[0]!, {
      commitment,
      fetch: (urls.length > 1 ? createFailoverFetch(urls) : fetchWithRpcRetry) as typeof fetch,
      disableRetryOnRateLimit: true,
      // Mobile / Worker: real WSS is unavailable → avoid deriving wss:// from workers.dev.
      wsEndpoint: DISABLED_WS_ENDPOINT,
    })
  );
}
