export type LiveLocalMethodRoutingRuntime = {
  rpcUrl?: string | null;
  indexerUrl?: string | null;
  photonUrl?: string | null;
};

export type LiveLocalMethodRoute = {
  method: string;
  endpoint: string;
  category: 'solana' | 'light';
  candidates: string[];
};

function normalizeUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\/+$/, '') || '';
  return normalized.length > 0 ? normalized : null;
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
}

export const LIVE_LOCAL_SOLANA_METHODS = ['getHealth'] as const;

export const LIVE_LOCAL_LIGHT_METHODS = [
  'getIndexerHealth',
  'getCompressedAccountsByOwner',
  'getCompressedAccount',
  'getCompressedAccountProof',
  'getMultipleCompressedAccountProofs',
  'getMultipleNewAddressProofs',
  'getValidityProof',
] as const;

export function isLiveLocalLightMethod(method: string): boolean {
  return (LIVE_LOCAL_LIGHT_METHODS as readonly string[]).includes(method);
}

export function isLiveLocalSolanaMethod(method: string): boolean {
  return (LIVE_LOCAL_SOLANA_METHODS as readonly string[]).includes(method);
}

export function explainLiveLocalMethodRoute(
  runtime: LiveLocalMethodRoutingRuntime,
  method: string,
): LiveLocalMethodRoute {
  const rpcUrl = normalizeUrl(runtime.rpcUrl) || 'http://127.0.0.1:8899';
  const indexerUrl = normalizeUrl(runtime.indexerUrl);
  const photonUrl = normalizeUrl(runtime.photonUrl);

  if (isLiveLocalLightMethod(method)) {
    const candidates = unique([
      photonUrl || '',
      indexerUrl || '',
      rpcUrl,
    ]);

    return {
      method,
      endpoint: candidates[0] || rpcUrl,
      category: 'light',
      candidates,
    };
  }

  return {
    method,
    endpoint: rpcUrl,
    category: 'solana',
    candidates: [rpcUrl],
  };
}

export function resolveLiveLocalMethodEndpoint(
  runtime: LiveLocalMethodRoutingRuntime,
  method: string,
): string {
  return explainLiveLocalMethodRoute(runtime, method).endpoint;
}

export function buildLiveLocalRoutingMatrix(
  runtime: LiveLocalMethodRoutingRuntime,
): LiveLocalMethodRoute[] {
  const methods = [
    ...LIVE_LOCAL_SOLANA_METHODS,
    ...LIVE_LOCAL_LIGHT_METHODS,
  ];

  return methods.map((method) => explainLiveLocalMethodRoute(runtime, method));
}
