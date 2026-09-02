import { Connection } from "@solana/web3.js";

/** Hide Helius keys from user-visible errors and logs. */
export function sanitizeRpcUrlForDisplay(text: string): string {
  return text.replace(/([?&]api-key=)[^&\s)\]"']+/gi, "$1***");
}

export function isHeliusSecureRpcUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return normalized.includes("helius-rpc.com") && !normalized.includes("api-key=");
}

/** Helius RPC with ?api-key= — works on desktop, often fails on React Native. */
export function isHeliusApiKeyRpcUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return normalized.includes("helius-rpc.com") && normalized.includes("api-key=");
}

/** Any HTTPS RPC without ?api-key= — Secure URL, Cloudflare proxy, local Photon, etc. */
export function isMobileSafeCompressionRpcUrl(url: string): boolean {
  const normalized = url.trim();
  if (!normalized || isHeliusApiKeyRpcUrl(normalized)) return false;
  if (/[?&]api-key=/i.test(normalized)) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

type JsonRpcPayload = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown;
};

function getXhrConstructor(): typeof XMLHttpRequest | null {
  const ctor = (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest;
  return typeof ctor === "function" ? ctor : null;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCompressionRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("503") ||
    m.includes("too many requests") ||
    m.includes("rate limit") ||
    m.includes("rate-limit") ||
    m.includes("-32429") ||
    m.includes("-32005")
  );
}

export async function postCompressionJsonRpc<T = unknown>(params: {
  url: string;
  method: string;
  rpcParams: unknown;
  id?: number;
}): Promise<T> {
  const url = compressionRpcEndpointUrl(params.url);
  const body: JsonRpcPayload = {
    jsonrpc: "2.0",
    id: params.id ?? 1,
    method: params.method,
    params: params.rpcParams,
  };
  const bodyText = JSON.stringify(body);
  const maxAttempts = 5;
  const errors: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    errors.length = 0;
    try {
      return await postViaFetch<T>(url, bodyText, params.method);
    } catch (error) {
      errors.push(`fetch: ${sanitizeRpcUrlForDisplay(String((error as Error)?.message ?? error))}`);
    }

    try {
      return await postViaXhr<T>(url, bodyText, params.method);
    } catch (error) {
      errors.push(`xhr: ${sanitizeRpcUrlForDisplay(String((error as Error)?.message ?? error))}`);
    }

    try {
      return await postViaConnection<T>(params.url, params.method, params.rpcParams);
    } catch (error) {
      errors.push(
        `connection: ${sanitizeRpcUrlForDisplay(String((error as Error)?.message ?? error))}`
      );
    }

    const joined = errors.join(" | ");
    if (!isCompressionRateLimitError(joined) || attempt >= maxAttempts - 1) {
      break;
    }
    await sleepMs(Math.min(12_000, 1_000 * 2 ** attempt));
  }

  throw new Error(
    `${params.method}@${sanitizeRpcUrlForDisplay(url)} failed (${errors.join(" | ")})`
  );
}

export function compressionRpcEndpointUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function postViaFetch<T>(url: string, bodyText: string, method: string): Promise<T> {
  const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("fetch unavailable");
  }

  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: bodyText,
  });

  const text = await response.text();
  return parseJsonRpcResponse<T>(text, response.status, response.statusText, method);
}

async function postViaXhr<T>(url: string, bodyText: string, method: string): Promise<T> {
  const Xhr = getXhrConstructor();
  if (!Xhr) {
    throw new Error("XMLHttpRequest unavailable");
  }

  return new Promise<T>((resolve, reject) => {
    const xhr = new Xhr();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.timeout = 60_000;
    xhr.onload = () => {
      try {
        resolve(parseJsonRpcResponse<T>(xhr.responseText, xhr.status, xhr.statusText, method));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Network request timeout"));
    xhr.send(bodyText);
  });
}

async function postViaConnection<T>(
  rpcUrl: string,
  method: string,
  rpcParams: unknown
): Promise<T> {
  // disableRetryOnRateLimit: bez tego web3.js sam retry'uje 429 wewnętrznie
  // (własny exponential backoff), NIEZALEŻNIE od retry loop w postCompressionJsonRpc —
  // dwie zagnieżdżone pętle retry na 429 potrafią zalać RPC proxy setkami requestów.
  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
    // Never derive workers.dev → wss:// (RN LogBox "ws error: undefined").
    wsEndpoint: "wss://127.0.0.1:1",
  });
  try {
    const ws = (connection as unknown as { _rpcWebSocket?: { removeAllListeners?: (e: string) => void } })
      ._rpcWebSocket;
    ws?.removeAllListeners?.("error");
  } catch {
    // ignore
  }
  const result = await (
    connection as unknown as {
      _rpcRequest: (name: string, args: unknown) => Promise<unknown>;
    }
  )._rpcRequest(method, rpcParams);
  return result as T;
}

function parseJsonRpcResponse<T>(
  text: string,
  status: number,
  statusText: string,
  method: string
): T {
  let payload: { result?: T; error?: { code?: number; message?: string; data?: unknown } };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    throw new Error(
      `${method} returned non-JSON (${status} ${statusText}): ${text.slice(0, 240)}`
    );
  }

  if (status < 200 || status >= 300) {
    throw new Error(`${method} HTTP ${status} ${statusText}: ${text.slice(0, 240)}`);
  }

  if (payload.error) {
    throw new Error(
      `${method} RPC error ${payload.error.code ?? "?"}: ${payload.error.message ?? "unknown"}`
    );
  }

  return payload.result as T;
}
