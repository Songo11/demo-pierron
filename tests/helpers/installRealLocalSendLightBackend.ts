import { PublicKey } from '@solana/web3.js';

import { setLightBackend, LIGHT_CANONICAL_EXTERNAL_INDEX, LightBackendResult } from '../../shared/light/lightClient.ts';
import { makeRealLocalSendLightBackend } from '../../shared/light/lightBackend.local.send.ts';
import {
  resetLocalSendResolverProvider,
  resolveLocalSendNewPaymentAddressParams,
  resolveLocalSendPackedAddressTreeInfo,
  resolveLocalSendRemainingAccounts,
  resolveLocalSendValidityProof,
  setLocalSendResolverProvider,
  type LocalSendResolverProvider,
} from '../../shared/light/lightSendResolver.ts';
import { fetchLiveRemainingAccountsForSend } from '../../shared/light/lightLiveLocalClient.ts';
import {
  buildSendBundleArtifactsViaStatelessRpc,
  pickRegisterAddressSeed,
  readPackedAddressTreeRootIndex,
  type SendBundleArtifacts,
} from '../../shared/light/registerNewAddressPacked.ts';
import type { SendProofParams } from '../../shared/light/lightClient.ts';
import {
  resolveLightLocalRuntimeConfig,
  type PartialLightLocalRuntimeConfig,
} from '../../shared/light/lightLocalRuntime.ts';

export type InstallRealLocalSendLightBackendOptions = {
  runtime?: PartialLightLocalRuntimeConfig;
  debug?: boolean;
  forcedSourceHashes?: string[];
};

type JsonRpcEnvelope =
  | {
      jsonrpc?: string;
      id?: number | string | null;
      result?: unknown;
      error?: {
        code?: number;
        message?: string;
        data?: unknown;
      };
    }
  | unknown;

let nextJsonRpcId = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getFetchOrThrow(): typeof fetch {
  const fetchFn = (globalThis as any).fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('global fetch is not available in this runtime');
  }
  return fetchFn;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function choosePhotonBaseUrl(runtime?: PartialLightLocalRuntimeConfig): string {
  const resolved = resolveLightLocalRuntimeConfig(runtime);
  return resolved.photonUrl ?? resolved.indexerUrl ?? resolved.rpcUrl;
}

function serializeRpcValue(value: unknown): unknown {
  if (value == null) return value;

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof PublicKey) {
    return value.toBase58();
  }

  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toBase58?: unknown }).toBase58 === 'function'
  ) {
    try {
      return (value as { toBase58: () => string }).toBase58();
    } catch {
      // ignore
    }
  }

  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return Array.from(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeRpcValue(item));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(record)) {
      out[key] = serializeRpcValue(inner);
    }
    return out;
  }

  return String(value);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(serializeRpcValue(value), null, 2);
  } catch {
    return String(value);
  }
}

function toBase58(value: PublicKey | string): string {
  if (typeof value === 'string') {
    return new PublicKey(value).toBase58();
  }
  return value.toBase58();
}

function toHexSeed(seed?: Uint8Array): string {
  if (!seed || seed.length === 0) return '';
  return Buffer.from(seed).toString('hex');
}

function buildSendRootCacheKey(input: {
  sender?: PublicKey | string;
  stealthAddress?: PublicKey | string;
  lightAddressSeed?: Uint8Array;
  outputTreeIndex?: number;
}): string {
  const sender = input.sender ? toBase58(input.sender) : '';
  const stealth = input.stealthAddress ? toBase58(input.stealthAddress) : '';
  const seedHex = toHexSeed(input.lightAddressSeed);
  const outputTreeIndex =
    typeof input.outputTreeIndex === 'number' && Number.isFinite(input.outputTreeIndex)
      ? String(input.outputTreeIndex)
      : '';
  return `${sender}|${stealth}|${seedHex}|${outputTreeIndex}`;
}

function readU16(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffff) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffff) {
      return parsed;
    }
  }
  return null;
}

function extractSendProofRootIndex(value: unknown, depth = 0): number | null {
  if (value == null || depth > 10) return null;

  const direct = readU16(value);
  if (direct != null) return direct;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractSendProofRootIndex(item, depth + 1);
      if (nested != null) return nested;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  const preferredKeys = [
    'rootIndex',
    'root_index',
    'selectedRootIndex',
    'selected_root_index',
    'rootIndices',
    'root_indices',
  ];
  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const nested = extractSendProofRootIndex(value[key], depth + 1);
    if (nested != null) return nested;
  }

  for (const nested of Object.values(value)) {
    const found = extractSendProofRootIndex(nested, depth + 1);
    if (found != null) return found;
  }
  return null;
}

function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function readLeU16At(value: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 1 >= value.length) return null;
  return value[offset] | (value[offset + 1] << 8);
}

function encodeCanonicalSendPackedAddressTreeInfo(rootIndex: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = LIGHT_CANONICAL_EXTERNAL_INDEX.send.merkleTree & 0xff;
  out[1] = LIGHT_CANONICAL_EXTERNAL_INDEX.send.addressQueue & 0xff;
  out[2] = rootIndex & 0xff;
  out[3] = (rootIndex >> 8) & 0xff;
  return out;
}

function collectRootIndices(value: unknown, out = new Set<number>(), depth = 0): Set<number> {
  if (value == null || depth > 8) return out;
  const direct = readU16(value);
  if (direct != null) {
    out.add(direct);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRootIndices(item, out, depth + 1);
    return out;
  }
  if (!isRecord(value)) return out;
  for (const key of ['rootIndices', 'root_indices', 'rootIndex', 'root_index']) {
    if (key in value) collectRootIndices(value[key], out, depth + 1);
  }
  return out;
}

function collectRootPreviewHex(value: unknown): string[] {
  const out: string[] = [];
  const roots = isRecord(value)
    ? (value.roots ?? (isRecord(value.result) ? value.result.roots : undefined))
    : undefined;
  if (!Array.isArray(roots)) return out;
  for (const item of roots.slice(0, 2)) {
    const bytes = toBytes(item);
    if (bytes && bytes.length > 0) {
      out.push(Buffer.from(bytes).toString('hex'));
    } else if (typeof item === 'string') {
      out.push(item);
    }
  }
  return out;
}

async function postJsonRpc(params: {
  baseUrl: string;
  path?: string;
  method: string;
  rpcParams: unknown[];
}): Promise<unknown> {
  const fetchFn = getFetchOrThrow();
  const response = await fetchFn(joinUrl(params.baseUrl, params.path ?? '/'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: nextJsonRpcId++,
      method: params.method,
      params: serializeRpcValue(params.rpcParams),
    }),
  });

  const text = await response.text();

  let payload: JsonRpcEnvelope;
  try {
    payload = JSON.parse(text) as JsonRpcEnvelope;
  } catch {
    throw new Error(
      `${params.method} returned non-JSON payload (${response.status} ${response.statusText}): ${text.slice(
        0,
        500
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `${params.method} request failed (${response.status} ${response.statusText}): ${text.slice(
        0,
        500
      )}`
    );
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    (payload as { error?: unknown }).error
  ) {
    const error = (payload as {
      error?: { code?: number; message?: string; data?: unknown };
    }).error!;

    throw new Error(
      `${params.method} RPC error ${String(error.code ?? 'unknown')}: ${String(
        error.message ?? 'unknown'
      )}${error.data !== undefined ? ` ${JSON.stringify(error.data)}` : ''}`
    );
  }

  if (payload && typeof payload === 'object' && 'result' in payload) {
    return (payload as { result?: unknown }).result;
  }

  return payload;
}

function collectHashLikeStrings(
  value: unknown,
  keyHint?: string,
  depth = 0,
  out = new Set<string>()
): Set<string> {
  if (value == null || depth > 10) {
    return out;
  }

  if (typeof value === 'string' && value.trim().length > 20) {
    const trimmed = value.trim();
    const hinted = (keyHint ?? '').toLowerCase();
    const looksHashField =
      hinted.includes('hash') ||
      hinted.includes('leaf') ||
      hinted.includes('nullifier') ||
      hinted.includes('root');

    if (looksHashField) {
      out.add(trimmed);
    }

    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectHashLikeStrings(item, keyHint, depth + 1, out);
    }
    return out;
  }

  if (isRecord(value)) {
    for (const [innerKey, inner] of Object.entries(value)) {
      collectHashLikeStrings(inner, innerKey, depth + 1, out);
    }
  }

  return out;
}

function collectCompressedAccountHashes(value: unknown): string[] {
  const hashes = new Set<string>();

  const visit = (node: unknown, depth = 0) => {
    if (node == null || depth > 12) {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth + 1);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    const directKeys = [
      'hash',
      'accountHash',
      'compressedAccountHash',
      'leafHash',
      'nullifierHash',
      'leaf',
      'root',
    ] as const;

    for (const key of directKeys) {
      const candidate = node[key];
      if (typeof candidate === 'string' && candidate.trim().length > 20) {
        hashes.add(candidate.trim());
      }
    }

    const nestedContainers = [
      'items',
      'value',
      'accounts',
      'compressedAccounts',
      'result',
      'data',
      'account',
      'compressedAccount',
    ] as const;

    for (const key of nestedContainers) {
      if (node[key] !== undefined) {
        visit(node[key], depth + 1);
      }
    }

    for (const inner of Object.values(node)) {
      visit(inner, depth + 1);
    }
  };

  visit(value);

  if (hashes.size === 0) {
    for (const hash of collectHashLikeStrings(value)) {
      hashes.add(hash);
    }
  }

  return Array.from(hashes);
}

function mergeHashes(...groups: Array<string[] | undefined>): string[] {
  return Array.from(
    new Set(
      groups.flatMap((group) =>
        (group ?? []).filter((item) => typeof item === 'string' && item.trim().length > 0)
      )
    )
  );
}

function buildSourceHashDiagnostics(input: {
  owner: string;
  sourceHashesRaw: unknown;
  sourceHashes: string[];
  remainingAccountsRaw?: unknown;
  newPaymentAddressRaw?: unknown;
  packedTreeInfoRaw?: unknown;
  forcedSourceHashes?: string[];
}): Record<string, unknown> {
  return {
    owner: input.owner,
    sourceHashesCount: input.sourceHashes.length,
    sourceHashes: input.sourceHashes,
    forcedSourceHashes: input.forcedSourceHashes ?? [],
    sourceHashesRawPreview: input.sourceHashesRaw,
    remainingAccountsHashCount: collectCompressedAccountHashes(input.remainingAccountsRaw).length,
    newPaymentAddressHashCount: collectCompressedAccountHashes(input.newPaymentAddressRaw).length,
    packedTreeInfoHashCount: collectCompressedAccountHashes(input.packedTreeInfoRaw).length,
    canonicalExternalIndexContract: {
      merkleTree: LIGHT_CANONICAL_EXTERNAL_INDEX.send.merkleTree,
      addressQueue: LIGHT_CANONICAL_EXTERNAL_INDEX.send.addressQueue,
      stateQueue: LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateQueue,
      stateTree: LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateTree,
      address: LIGHT_CANONICAL_EXTERNAL_INDEX.send.address,
    },
  };
}

export async function discoverLiveLocalSendSourceHashes(params: {
  sender: PublicKey | string;
  runtime?: PartialLightLocalRuntimeConfig;
}): Promise<{
  owner: string;
  hashes: string[];
  raw: unknown | null;
}> {
  const owner = toBase58(params.sender);
  const baseUrl = choosePhotonBaseUrl(params.runtime);

  const candidates: unknown[][] = [
    [owner],
    [{ owner }],
    [{ owner, limit: 50 }],
    [{ owner, limit: 100 }],
  ];

  const errors: string[] = [];

  for (const rpcParams of candidates) {
    try {
      const raw = await postJsonRpc({
        baseUrl,
        path: '/',
        method: 'getCompressedAccountsByOwner',
        rpcParams,
      });

      const hashes = collectCompressedAccountHashes(raw);
      return {
        owner,
        hashes,
        raw,
      };
    } catch (error) {
      errors.push(String((error as Error)?.message ?? error));
    }
  }

  return {
    owner,
    hashes: [],
    raw: {
      kind: 'owner-compressed-accounts-unavailable',
      errors,
    },
  };
}

let sendArtifactsCache: {
  key: string;
  promise: Promise<SendBundleArtifacts>;
} | null = null;

function sendArtifactsCacheKey(params?: SendProofParams): string | null {
  const seed = pickRegisterAddressSeed(
    params?.lightAddressSeed,
    (params as SendProofParams & { lightAddressSeedBytes?: Uint8Array })
      ?.lightAddressSeedBytes
  );
  if (!seed) {
    return null;
  }
  const sender = params?.sender?.toBase58?.() ?? 'no-sender';
  return `${sender}:${Buffer.from(seed).toString('hex')}`;
}

function toSendProofParams(
  params?: SendProofParams | {
    sender?: PublicKey;
    owner?: PublicKey;
    stealthAddress?: PublicKey;
    address?: PublicKey;
    lightAddressSeed?: Uint8Array;
    lightAddressSeedBytes?: Uint8Array;
    cluster?: unknown;
    outputTreeIndex?: number;
  }
): SendProofParams {
  return {
    sender: params?.sender ?? (params as { owner?: PublicKey })?.owner,
    stealthAddress:
      params?.stealthAddress ?? (params as { address?: PublicKey })?.address,
    lightAddressSeed: pickRegisterAddressSeed(
      params?.lightAddressSeed,
      params?.lightAddressSeedBytes
    ) ?? params?.lightAddressSeed,
    cluster: params?.cluster as SendProofParams['cluster'],
    outputTreeIndex: params?.outputTreeIndex,
  };
}

export function installRealLocalSendLightBackend(
  provider?: Partial<LocalSendResolverProvider>,
  options?: InstallRealLocalSendLightBackendOptions
) {
  resetLocalSendResolverProvider();
  sendArtifactsCache = null;

  const loadSendArtifactsViaStateless = async (
    params?: SendProofParams | Parameters<typeof toSendProofParams>[0]
  ): Promise<SendBundleArtifacts> => {
    const request = toSendProofParams(params);
    const key = sendArtifactsCacheKey(request);
    if (!key) {
      throw new Error(
        'send stateless artifacts require 32-byte lightAddressSeed (or lightAddressSeedBytes)'
      );
    }

    if (!sendArtifactsCache || sendArtifactsCache.key !== key) {
      sendArtifactsCache = {
        key,
        promise: buildSendBundleArtifactsViaStatelessRpc({
          request,
          runtime: options?.runtime,
        }),
      };
    }

    return sendArtifactsCache.promise;
  };

  setLocalSendResolverProvider({
    async getPackedAddressTreeInfo(params) {
      const artifacts = await loadSendArtifactsViaStateless(params);
      if (options?.debug) {
        const packed = artifacts.packedAddressTreeInfo;
        console.log(
          `[send packed debug] len=${packed.length} treeIdx=${readLeU16At(packed, 0)} rootIdx=${readLeU16At(packed, 2)} source=stateless-rpc`
        );
      }
      return artifacts.packedAddressTreeInfo;
    },

    async getValidityProofForSend(params) {
      const artifacts = await loadSendArtifactsViaStateless(toSendProofParams(params));
      if (options?.debug) {
        const rootIdx = readPackedAddressTreeRootIndex(artifacts.packedAddressTreeInfo);
        console.log(
          '[send validity proof debug]',
          safeJson({
            selectedRootIndex: rootIdx,
            derivedAddress: artifacts.derivedAddress.toBase58(),
            source: 'stateless-rpc',
          })
        );
      }
      return LightBackendResult.ready(
        artifacts.validityProof,
        'local send validityProof (stateless getValidityProofV0)',
        {
          derivedAddress: artifacts.derivedAddress.toBase58(),
          addressTree: artifacts.addressTree.toBase58(),
          addressQueue: artifacts.addressQueue.toBase58(),
        }
      );
    },

    async getNewPaymentAddressParams(params) {
      const artifacts = await loadSendArtifactsViaStateless(toSendProofParams(params));
      if (options?.debug) {
        const value = artifacts.newPaymentAddress;
        console.log(
          `[send newPayment debug] len=${value.length} treeIdx=${readLeU16At(value, 33)} queueIdx=${readLeU16At(value, 32)} rootIdx=${readLeU16At(value, 34)} source=stateless-rpc`
        );
      }
      return artifacts.newPaymentAddress;
    },

    async getRemainingAccountsForSend(params) {
      const artifacts = await loadSendArtifactsViaStateless(toSendProofParams(params));
      const requestWithHints: Record<string, unknown> = {
        ...((params as Record<string, unknown> | undefined) ?? {}),
        __liveLocalSendHintNewPaymentAddressRaw: artifacts.newPaymentAddress,
        __liveLocalSendHintPackedAddressTreeInfoRaw: artifacts.packedAddressTreeInfo,
        __liveLocalSendHintCanonicalExternalIndexContract:
          LIGHT_CANONICAL_EXTERNAL_INDEX.send,
      };

      return await fetchLiveRemainingAccountsForSend({
        runtime: options?.runtime,
        request: requestWithHints as any,
      });
    },

    ...provider,
  });

  setLightBackend(
    makeRealLocalSendLightBackend({
      label: 'local-send-real-backend',
      resolvePackedAddressTreeInfo: resolveLocalSendPackedAddressTreeInfo,
      resolveValidityProofForSend: resolveLocalSendValidityProof,
      resolveNewPaymentAddressParams: resolveLocalSendNewPaymentAddressParams,
      resolveRemainingAccountsForSend: resolveLocalSendRemainingAccounts,
    })
  );
}
