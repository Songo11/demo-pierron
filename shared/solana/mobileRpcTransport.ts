import { isJsonRpcRateLimitBody } from "./rpcEndpoint.ts";

/** Must match optional Worker `CLIENT_GATE` (wrangler / CF secrets). */
export const PIERRON_RPC_CLIENT_HEADER = "pierron-mobile-v1";

function pierronRpcHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Pierron-Client": PIERRON_RPC_CLIENT_HEADER,
  };
}

function isReactNativeRuntime(): boolean {
  return (
    typeof navigator !== "undefined" && navigator.product === "ReactNative"
  );
}

export type SolanaRpcPostResult = {
  status: number;
  statusText: string;
  bodyText: string;
};

function getXhrConstructor(): typeof XMLHttpRequest | null {
  const ctor = (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest;
  return typeof ctor === "function" ? ctor : null;
}

function isRateLimited(status: number, bodyText: string): boolean {
  return status === 429 || isJsonRpcRateLimitBody(bodyText);
}

async function postViaFetch(
  rpcUrl: string,
  bodyText: string,
  signal?: AbortSignal
): Promise<SolanaRpcPostResult> {
  const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("fetch unavailable");
  }

  const response = await fetchFn(rpcUrl, {
    method: "POST",
    headers: pierronRpcHeaders(),
    body: bodyText,
    signal,
  });
  const text = await response.text();
  if (isRateLimited(response.status, text)) {
    throw new Error("rate limit");
  }
  return {
    status: response.status,
    statusText: response.statusText,
    bodyText: text,
  };
}

async function postViaXhr(
  rpcUrl: string,
  bodyText: string,
  timeoutMs = 60_000
): Promise<SolanaRpcPostResult> {
  const Xhr = getXhrConstructor();
  if (!Xhr) {
    throw new Error("XMLHttpRequest unavailable");
  }

  return new Promise<SolanaRpcPostResult>((resolve, reject) => {
    const xhr = new Xhr();
    xhr.open("POST", rpcUrl, true);
    const headers = pierronRpcHeaders();
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      const text = xhr.responseText;
      if (isRateLimited(xhr.status, text)) {
        reject(new Error("rate limit"));
        return;
      }
      resolve({
        status: xhr.status,
        statusText: xhr.statusText,
        bodyText: text,
      });
    };
    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Network request timeout"));
    xhr.send(bodyText);
  });
}

/**
 * POST JSON-RPC to Solana RPC.
 * React Native: XMLHttpRequest first (fetch często pada na Helius ?api-key= i części RPC).
 */
export async function postSolanaRpcBody(
  rpcUrl: string,
  bodyText: string,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<SolanaRpcPostResult> {
  const errors: string[] = [];
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const attempts: Array<() => Promise<SolanaRpcPostResult>> = isReactNativeRuntime()
    ? [
        () => postViaXhr(rpcUrl, bodyText, timeoutMs),
        () => postViaFetch(rpcUrl, bodyText, options?.signal),
      ]
    : [
        () => postViaFetch(rpcUrl, bodyText, options?.signal),
        () => postViaXhr(rpcUrl, bodyText, timeoutMs),
      ];

  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      errors.push(String((error as Error)?.message ?? error));
    }
  }

  throw new Error(errors.join(" | "));
}
