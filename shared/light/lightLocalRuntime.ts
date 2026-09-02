import statelessPkg from './statelessSdk.ts';

export type LightCommitment = 'processed' | 'confirmed' | 'finalized';

export type LightLocalRuntimeConfig = {
  rpcUrl: string;
  proverUrl?: string;
  indexerUrl?: string;
  photonUrl?: string;
  foresterUrl?: string;
  addressTreePubkey?: string;
  addressQueuePubkey?: string;
  connectionCommitment: LightCommitment;
};

export type PartialLightLocalRuntimeConfig = Partial<LightLocalRuntimeConfig>;

const { getDefaultAddressTreeInfo } = statelessPkg as {
  getDefaultAddressTreeInfo: () => {
    tree: { toBase58: () => string };
    queue: { toBase58: () => string };
  };
};

function resolveDefaultLocalAddressTreeConfig(): {
  addressTreePubkey?: string;
  addressQueuePubkey?: string;
} {
  try {
    const info = getDefaultAddressTreeInfo();
    return {
      addressTreePubkey: info?.tree?.toBase58?.(),
      addressQueuePubkey: info?.queue?.toBase58?.(),
    };
  } catch {
    return {
      addressTreePubkey: undefined,
      addressQueuePubkey: undefined,
    };
  }
}

const DEFAULT_LOCAL_ADDRESS_TREE_CONFIG = resolveDefaultLocalAddressTreeConfig();

const DEFAULT_LIGHT_LOCAL_RUNTIME_CONFIG: LightLocalRuntimeConfig = {
  rpcUrl: 'http://127.0.0.1:8899',
  proverUrl: 'http://127.0.0.1:3001',
  indexerUrl: 'http://127.0.0.1:8784',
  photonUrl: 'http://127.0.0.1:8784',
  foresterUrl: 'http://127.0.0.1:3004',
  addressTreePubkey: DEFAULT_LOCAL_ADDRESS_TREE_CONFIG.addressTreePubkey,
  addressQueuePubkey: DEFAULT_LOCAL_ADDRESS_TREE_CONFIG.addressQueuePubkey,
  connectionCommitment: 'confirmed',
};

let activeLightLocalRuntimeOverride: PartialLightLocalRuntimeConfig | null = null;

function readEnv(name: string): string | undefined {
  try {
    if (
      typeof process !== 'undefined' &&
      process &&
      process.env &&
      typeof process.env[name] === 'string' &&
      process.env[name]!.trim().length > 0
    ) {
      return process.env[name]!.trim();
    }
  } catch {
    // no-op
  }

  return undefined;
}

function normalizeUrl(value: string | undefined, label: string): string | undefined {
  if (value == null) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`${label} musi zaczynać się od http:// albo https://`);
  }

  return trimmed.replace(/\/+$/, '');
}

function normalizeOptionalPubkey(value: string | undefined): string | undefined {
  if (value == null) return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeCommitment(value: string | undefined): LightCommitment | undefined {
  if (!value) return undefined;

  if (value === 'processed' || value === 'confirmed' || value === 'finalized') {
    return value;
  }

  throw new Error(
    `Niepoprawne connectionCommitment="${value}". Dozwolone: processed | confirmed | finalized`
  );
}

function readEnvConfig(): PartialLightLocalRuntimeConfig {
  return {
    rpcUrl: normalizeUrl(readEnv('PIERRON_LIGHT_LOCAL_RPC_URL'), 'PIERRON_LIGHT_LOCAL_RPC_URL'),
    proverUrl: normalizeUrl(
      readEnv('PIERRON_LIGHT_LOCAL_PROVER_URL'),
      'PIERRON_LIGHT_LOCAL_PROVER_URL'
    ),
    indexerUrl: normalizeUrl(
      readEnv('PIERRON_LIGHT_LOCAL_INDEXER_URL'),
      'PIERRON_LIGHT_LOCAL_INDEXER_URL'
    ),
    photonUrl: normalizeUrl(
      readEnv('PIERRON_LIGHT_LOCAL_PHOTON_URL'),
      'PIERRON_LIGHT_LOCAL_PHOTON_URL'
    ),
    foresterUrl: normalizeUrl(
      readEnv('PIERRON_LIGHT_LOCAL_FORESTER_URL'),
      'PIERRON_LIGHT_LOCAL_FORESTER_URL'
    ),
    addressTreePubkey: normalizeOptionalPubkey(readEnv('PIERRON_LIGHT_LOCAL_ADDRESS_TREE')),
    addressQueuePubkey: normalizeOptionalPubkey(readEnv('PIERRON_LIGHT_LOCAL_ADDRESS_QUEUE')),
    connectionCommitment: normalizeCommitment(readEnv('PIERRON_LIGHT_LOCAL_COMMITMENT')),
  };
}

function mergeDefined<T extends object>(...parts: Array<Partial<T> | null | undefined>): Partial<T> {
  const out: Partial<T> = {};

  for (const part of parts) {
    if (!part) continue;

    for (const [key, value] of Object.entries(part)) {
      if (value !== undefined) {
        (out as Record<string, unknown>)[key] = value;
      }
    }
  }

  return out;
}

function isLoopbackHostname(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host === '::1'
    );
  } catch {
    return false;
  }
}

function normalizeResolvedConfig(input: PartialLightLocalRuntimeConfig): LightLocalRuntimeConfig {
  const rpcUrl = normalizeUrl(input.rpcUrl, 'rpcUrl');
  const proverUrl = normalizeUrl(input.proverUrl, 'proverUrl');
  const indexerUrl = normalizeUrl(input.indexerUrl, 'indexerUrl');
  const photonUrl = normalizeUrl(input.photonUrl, 'photonUrl');
  const foresterUrl = normalizeUrl(input.foresterUrl, 'foresterUrl');

  const connectionCommitment =
    input.connectionCommitment ?? DEFAULT_LIGHT_LOCAL_RUNTIME_CONFIG.connectionCommitment;

  if (!rpcUrl) {
    throw new Error('Light local runtime wymaga rpcUrl.');
  }

  // Prefer non-loopback endpoints. Defaults are 127.0.0.1 — a truthy loopback photonUrl
  // must not beat a Worker rpcUrl from the override.
  const preferredRemote =
    [photonUrl, indexerUrl, rpcUrl].find((url) => url && !isLoopbackHostname(url)) ||
    photonUrl ||
    indexerUrl ||
    rpcUrl;
  let resolvedRpcUrl = rpcUrl;
  let resolvedIndexerUrl = indexerUrl;
  let resolvedProverUrl = proverUrl;
  let resolvedPhotonUrl = photonUrl;

  if (
    preferredRemote &&
    (!resolvedIndexerUrl ||
      (isLoopbackHostname(resolvedIndexerUrl) && !isLoopbackHostname(preferredRemote)))
  ) {
    resolvedIndexerUrl = preferredRemote;
  }

  if (
    preferredRemote &&
    resolvedPhotonUrl &&
    isLoopbackHostname(resolvedPhotonUrl) &&
    !isLoopbackHostname(preferredRemote)
  ) {
    resolvedPhotonUrl = preferredRemote;
  }

  // Same for rpcUrl: DEFAULT is 127.0.0.1:8899 — browser cannot fetch loopback from a
  // non-local page (Firefox: "NetworkError when attempting to fetch resource").
  if (
    preferredRemote &&
    isLoopbackHostname(resolvedRpcUrl) &&
    !isLoopbackHostname(preferredRemote)
  ) {
    resolvedRpcUrl = preferredRemote;
  }

  if (
    preferredRemote &&
    resolvedProverUrl &&
    isLoopbackHostname(resolvedProverUrl) &&
    !isLoopbackHostname(preferredRemote)
  ) {
    resolvedProverUrl = preferredRemote;
  }

  return {
    rpcUrl: resolvedRpcUrl,
    proverUrl: resolvedProverUrl,
    indexerUrl: resolvedIndexerUrl,
    photonUrl: resolvedPhotonUrl,
    foresterUrl,
    addressTreePubkey:
      normalizeOptionalPubkey(input.addressTreePubkey) ??
      DEFAULT_LOCAL_ADDRESS_TREE_CONFIG.addressTreePubkey,
    addressQueuePubkey:
      normalizeOptionalPubkey(input.addressQueuePubkey) ??
      DEFAULT_LOCAL_ADDRESS_TREE_CONFIG.addressQueuePubkey,
    connectionCommitment,
  };
}

export function getDefaultLightLocalRuntimeConfig(): LightLocalRuntimeConfig {
  return {
    ...DEFAULT_LIGHT_LOCAL_RUNTIME_CONFIG,
  };
}

export function getLightLocalRuntimeOverride(): PartialLightLocalRuntimeConfig | null {
  return activeLightLocalRuntimeOverride
    ? { ...activeLightLocalRuntimeOverride }
    : null;
}

export function setLightLocalRuntimeOverride(
  override: PartialLightLocalRuntimeConfig | null
): void {
  activeLightLocalRuntimeOverride = override ? { ...override } : null;
}

export function resetLightLocalRuntimeOverride(): void {
  activeLightLocalRuntimeOverride = null;
}

export function resolveLightLocalRuntimeConfig(
  override?: PartialLightLocalRuntimeConfig
): LightLocalRuntimeConfig {
  const envConfig = readEnvConfig();

  const merged = mergeDefined<LightLocalRuntimeConfig>(
    DEFAULT_LIGHT_LOCAL_RUNTIME_CONFIG,
    envConfig,
    activeLightLocalRuntimeOverride,
    override
  );

  return normalizeResolvedConfig(merged);
}

export function getLightLocalRuntimeSummary(
  override?: PartialLightLocalRuntimeConfig
): string[] {
  const resolved = resolveLightLocalRuntimeConfig(override);

  return [
    `rpcUrl: ${resolved.rpcUrl}`,
    `proverUrl: ${resolved.proverUrl ?? 'unset'}`,
    `indexerUrl: ${resolved.indexerUrl ?? 'unset'}`,
    `photonUrl: ${resolved.photonUrl ?? 'unset'}`,
    `foresterUrl: ${resolved.foresterUrl ?? 'unset'}`,
    `addressTreePubkey: ${resolved.addressTreePubkey ?? 'unset'}`,
    `addressQueuePubkey: ${resolved.addressQueuePubkey ?? 'unset'}`,
    `connectionCommitment: ${resolved.connectionCommitment}`,
  ];
}
