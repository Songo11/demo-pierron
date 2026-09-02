import {
  PIERRON_DEVNET_RPC_FAILOVER_DEFAULTS,
  PIERRON_DEVNET_RPC_PROXY_DEFAULT,
} from '../../../../shared/solana/devnetRpcProxyUrl.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same-origin JSON-RPC proxy for the browser.
 *
 * @solana/web3.js always sends header `solana-client`. The Cloudflare Worker
 * historically only allowed Content-Type / X-Pierron-Client, so browser
 * preflight failed with NetworkError. Proxying through Next avoids CORS.
 *
 * Node→Worker fetch is occasionally flaky (`fetch failed`); retry + failover
 * upstreams so the wallet UI does not surface a false "brak klucza" error.
 */
function resolvePrimaryUpstream(): string {
  const fromEnv =
    process.env.PIERRON_DEVNET_RPC_PROXY_URL?.trim() ||
    process.env.NEXT_PUBLIC_PIERRON_DEVNET_PROXY_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return PIERRON_DEVNET_RPC_PROXY_DEFAULT;
}

function resolveUpstreamCandidates(): string[] {
  const primary = resolvePrimaryUpstream();
  const seen = new Set<string>([primary]);
  const out = [primary];
  for (const url of PIERRON_DEVNET_RPC_FAILOVER_DEFAULTS) {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function postUpstream(
  upstream: string,
  body: string,
  solanaClient: string | null
): Promise<Response> {
  return fetch(upstream, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Do not forward solana-client — only needed for CORS on browser→Worker;
      // some upstreams are picky and Node already bypasses CORS.
      'X-Pierron-Client': 'dapp-next-proxy',
      ...(solanaClient ? { 'X-Solana-Client': solanaClient } : {}),
    },
    body,
    cache: 'no-store',
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const solanaClient = request.headers.get('solana-client');
  const candidates = resolveUpstreamCandidates();

  let lastError: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const upstream = candidates[i]!;
    // Primary: 3 attempts; failover URLs: 2.
    const attempts = i === 0 ? 3 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const upstreamRes = await postUpstream(upstream, body, solanaClient);
        const text = await upstreamRes.text();
        // Retry transient upstream HTTP failures on the same host.
        if (
          (upstreamRes.status === 502 ||
            upstreamRes.status === 503 ||
            upstreamRes.status === 504) &&
          attempt < attempts - 1
        ) {
          await sleep(150 * (attempt + 1));
          continue;
        }
        return new Response(text, {
          status: upstreamRes.status,
          headers: {
            'Content-Type':
              upstreamRes.headers.get('Content-Type') || 'application/json',
            'Cache-Control': 'no-store',
            'X-Pierron-Rpc-Upstream': upstream,
          },
        });
      } catch (cause) {
        lastError = cause;
        if (attempt < attempts - 1) {
          await sleep(150 * (attempt + 1));
          continue;
        }
      }
    }
  }

  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: `Upstream RPC unreachable (${candidates.join(' → ')}): ${String(
          (lastError as Error)?.message ?? lastError ?? 'unknown'
        )}`,
      },
      id: null,
    },
    { status: 502 }
  );
}

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    upstream: resolvePrimaryUpstream(),
    failover: PIERRON_DEVNET_RPC_FAILOVER_DEFAULTS,
    note: 'POST JSON-RPC body to this path from the browser.',
  });
}
