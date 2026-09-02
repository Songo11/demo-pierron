import { PublicKey } from '@solana/web3.js';

import {
  compressionRpcEndpointUrl,
  postCompressionJsonRpc,
  sanitizeRpcUrlForDisplay,
} from './compressionRpcTransport.ts';

import type {
  ClaimProofParams,
  ClaimRemainingAccountsParams,
  ClaimerCompressedMetaParams,
  LightRemainingAccountMeta,
  NewPaymentAddressParams,
  NewRegisterAddressParams,
  PackedAddressTreeInfoParams,
  PaymentCompressedMetaParams,
  RegisterCompressedMetaParams,
  RegisterProofParams,
  SendProofParams,
  SendRemainingAccountsParams,
} from './lightClient.ts';
import { PIERRON_STEALTH_PROGRAM_ID } from '../core/programIds.ts';
import { discoveryHashForPhotonRpc, discoveryHashesForPhotonRpc } from './discoveryHashRpc.ts';
import {
  normalizeLiveClaimerMetaToBytes,
  normalizeLivePaymentMetaToBytes,
} from './lightLiveLocalNormalization.ts';
import {
  resolveLightLocalRuntimeConfig,
  type LightLocalRuntimeConfig,
  type PartialLightLocalRuntimeConfig,
} from './lightLocalRuntime.ts';

type LiveLocalRequestParams = Record<string, unknown> | undefined;
type JsonRpcParams = unknown[];
type JsonRpcId = number;

type JsonRpcSuccess<T = unknown> = {
  jsonrpc: '2.0';
  id: JsonRpcId | string | null;
  result: T;
};

type JsonRpcFailure = {
  jsonrpc: '2.0';
  id: JsonRpcId | string | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcFailure;

type RawRemainingAccountLike =
  | LightRemainingAccountMeta
  | {
      pubkey?: string | PublicKey;
      address?: string | PublicKey;
      key?: string | PublicKey;
      hash?: string | PublicKey;
      tree?: string | PublicKey;
      queue?: string | PublicKey;
      addressTree?: string | PublicKey;
      addressQueue?: string | PublicKey;
      merkleTree?: string | PublicKey;
      nullifierQueue?: string | PublicKey;
      isSigner?: boolean;
      signer?: boolean;
      isWritable?: boolean;
      writable?: boolean;
      role?: string;
    };

type RegisterProofAddressDescriptor = {
  address: string;
  tree: string;
};

export type LightLiveLocalEndpointConfig = {
  jsonRpcPath: string;
  getCompressedAccountsByOwnerMethod: string;
  getCompressedAccountMethod: string;
  getCompressedAccountProofMethod: string;
  getMultipleCompressedAccountsMethod: string;
  getMultipleCompressedAccountProofsMethod: string;
  getMultipleNewAddressProofsMethod: string;
  getValidityProofMethod: string;
  getIndexerHealthMethod: string;
};

const DEFAULT_LIVE_LOCAL_ENDPOINTS: LightLiveLocalEndpointConfig = {
  jsonRpcPath: '/',
  getCompressedAccountsByOwnerMethod: 'getCompressedAccountsByOwner',
  getCompressedAccountMethod: 'getCompressedAccount',
  getCompressedAccountProofMethod: 'getCompressedAccountProof',
  getMultipleCompressedAccountsMethod: 'getMultipleCompressedAccounts',
  getMultipleCompressedAccountProofsMethod: 'getMultipleCompressedAccountProofs',
  getMultipleNewAddressProofsMethod: 'getMultipleNewAddressProofs',
  getValidityProofMethod: 'getValidityProof',
  getIndexerHealthMethod: 'getIndexerHealth',
};

let activeEndpointOverride: Partial<LightLiveLocalEndpointConfig> | null = null;
let nextJsonRpcId = 1;

export function getDefaultLightLiveLocalEndpointConfig(): LightLiveLocalEndpointConfig {
  return { ...DEFAULT_LIVE_LOCAL_ENDPOINTS };
}

export function setLightLiveLocalEndpointOverride(
  override: Partial<LightLiveLocalEndpointConfig> | null
): void {
  activeEndpointOverride = override ? { ...override } : null;
}

export function resetLightLiveLocalEndpointOverride(): void {
  activeEndpointOverride = null;
}

export function resolveLightLiveLocalEndpointConfig(
  override?: Partial<LightLiveLocalEndpointConfig>
): LightLiveLocalEndpointConfig {
  return {
    ...DEFAULT_LIVE_LOCAL_ENDPOINTS,
    ...(activeEndpointOverride ?? {}),
    ...(override ?? {}),
  };
}

function getFetchOrThrow(): typeof fetch {
  const fetchFn = (globalThis as any).fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('global fetch is not available in this runtime');
  }
  return fetchFn;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedPath =
    path && path !== '/' ? (path.startsWith('/') ? path : `/${path}`) : '';

  try {
    const url = new URL(baseUrl);
    if (normalizedPath) {
      const basePath = url.pathname.replace(/\/+$/, '') || '';
      url.pathname = `${basePath}${normalizedPath}`;
    }
    return url.toString();
  } catch {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    return `${normalizedBase}${normalizedPath}`;
  }
}

function choosePhotonBaseUrl(config: LightLocalRuntimeConfig): string {
  return config.photonUrl ?? config.indexerUrl ?? config.rpcUrl;
}

function nextId(): number {
  return nextJsonRpcId++;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPublicKeyLike(value: unknown): value is { toBase58: () => string } {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { toBase58?: unknown }).toBase58 === 'function'
  );
}

function encodeJsonBytes(value: unknown): Uint8Array {
  const text = JSON.stringify(serializeRequestValue(value));
  return new TextEncoder().encode(text);
}

function encodeOpaqueStructuredBytes(label: string, value: unknown): Uint8Array {
  const encoder = new TextEncoder();
  const payload = encoder.encode(JSON.stringify(serializeRequestValue(value)));
  const labelBytes = encoder.encode(label);
  const out = new Uint8Array(8 + labelBytes.length + payload.length);

  out[0] = 0x4c;
  out[1] = 0x4c;
  out[2] = 0x52;
  out[3] = 0x42;

  const view = new DataView(out.buffer);
  view.setUint32(4, labelBytes.length, true);

  out.set(labelBytes, 8);
  out.set(payload, 8 + labelBytes.length);

  return out;
}

function toBase58IfPresent(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const trimmed = value.trim();
    try {
      return new PublicKey(trimmed).toBase58();
    } catch {
      return undefined;
    }
  }

  if (value instanceof PublicKey) {
    return value.toBase58();
  }

  if (isPublicKeyLike(value)) {
    try {
      const out = value.toBase58();
      if (typeof out === 'string' && out.trim().length > 0) {
        return out.trim();
      }
    } catch {
      // ignore
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    try {
      return new PublicKey(value as any).toBase58();
    } catch {
      // ignore
    }
  }

  return undefined;
}

function serializeRequestValue(value: unknown): unknown {
  if (value == null) return value;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return Array.from(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeRequestValue(item));
  }

  const base58 = toBase58IfPresent(value);
  if (base58) {
    return base58;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'object') {
    const maybeBn = value as { _bn?: { toString?: (base?: number) => string } };
    if (maybeBn?._bn && typeof maybeBn._bn.toString === 'function') {
      return maybeBn._bn.toString(10);
    }

    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeRequestValue(inner);
    }
    return out;
  }

  return String(value);
}

function stripInternalLiveLocalHints<T>(value: T): T {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map((item) => stripInternalLiveLocalHints(item)) as unknown as T;
  }

  if (typeof value !== 'object') {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('__liveLocal')) continue;
    out[key] = stripInternalLiveLocalHints(inner);
  }
  return out as T;
}

function toPublicKey(value: unknown, label: string): PublicKey {
  if (value instanceof PublicKey) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return new PublicKey(value.trim());
  }

  if (isPublicKeyLike(value)) {
    try {
      return new PublicKey(value.toBase58());
    } catch {
      // ignore
    }
  }

  if (value && typeof value === 'object') {
    try {
      return new PublicKey(value as any);
    } catch {
      // ignore
    }
  }

  throw new Error(`Could not decode ${label} to PublicKey`);
}

function looksLikeHexString(input: string): boolean {
  const normalized = input.startsWith('0x') ? input.slice(2) : input;
  return normalized.length > 0 && normalized.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(normalized);
}

function looksLikeBase64String(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length < 8 || trimmed.length % 4 !== 0) {
    return false;
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return false;
  }

  if (!/[0OIl+/=]/.test(trimmed)) {
    return false;
  }

  return true;
}

function isByteArrayLike(value: unknown): boolean {
  return (
    (value instanceof Uint8Array && value.length > 0) ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(value) && value.length > 0) ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 255
      ))
  );
}

function extractFirstByteLike(
  value: unknown,
  visited = new Set<unknown>(),
  depth = 0
): unknown | null {
  if (value == null || depth > 8) {
    return null;
  }

  if (isByteArrayLike(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (looksLikeHexString(trimmed) || looksLikeBase64String(trimmed)) {
      return trimmed;
    }
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  if (visited.has(value)) {
    return null;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstByteLike(item, visited, depth + 1);
      if (found != null) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;

  const preferredKeys = [
    'proof',
    'compressedProof',
    'proofBytes',
    'data',
    'bytes',
    'serialized',
    'payload',
    'value',
    'meta',
    'merkleContext',
    'packedAddressTreeInfo',
    'addressTreeInfo',
    'seed',
    'lightAddressSeed',
    'lightAddressSeedBytes',
  ];

  for (const key of preferredKeys) {
    if (record[key] !== undefined) {
      const found = extractFirstByteLike(record[key], visited, depth + 1);
      if (found != null) return found;
    }
  }

  for (const inner of Object.values(record)) {
    const found = extractFirstByteLike(inner, visited, depth + 1);
    if (found != null) return found;
  }

  return null;
}

function extractResultValue(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return raw;
  }
  const result = raw.result;
  if (isRecord(result)) {
    return result.value !== undefined ? result.value : result;
  }
  return raw.value !== undefined ? raw.value : raw;
}

/** Force compressed-account pubkey in meta bytes (not leaf hash). */
function enrichPhotonCompressedAccountAddress(
  raw: unknown,
  addressB58: string | null | undefined
): unknown {
  const override = addressB58?.trim();
  if (!override) {
    return raw;
  }
  const value = extractResultValue(raw);
  if (!isRecord(value)) {
    return raw;
  }
  const merged: Record<string, unknown> = {
    ...value,
    address: override,
    _pierronAddressOverride: override,
  };
  if (isRecord(value.account)) {
    merged.account = { ...(value.account as Record<string, unknown>), address: override };
  }
  if (isRecord(value.compressedAccount)) {
    merged.compressedAccount = {
      ...(value.compressedAccount as Record<string, unknown>),
      address: override,
    };
  }
  if (isRecord(raw) && 'value' in raw) {
    return { ...raw, value: merged };
  }
  return merged;
}

function toUint8ArrayFromByteLike(value: unknown, label: string): Uint8Array {
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return Uint8Array.from(value);
  }

  if (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 255
    )
  ) {
    return Uint8Array.from(value);
  }

  if (isRecord(value)) {
    const numericKeys = Object.keys(value)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));

    if (
      numericKeys.length > 0 &&
      numericKeys.every((key) => {
        const item = value[key];
        return typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 255;
      })
    ) {
      return Uint8Array.from(numericKeys.map((key) => Number(value[key])));
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (looksLikeHexString(trimmed)) {
      const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
      const out = new Uint8Array(normalized.length / 2);

      for (let i = 0; i < normalized.length; i += 2) {
        out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
      }

      return out;
    }

    if (looksLikeBase64String(trimmed)) {
      if (typeof Buffer !== 'undefined') {
        return Uint8Array.from(Buffer.from(trimmed, 'base64'));
      }

      const binary = atob(trimmed);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
      }
      return out;
    }
  }

  throw new Error(`${label} is not byte-like`);
}

function wrapByteLikeResult(raw: unknown, label: string): { value: Uint8Array; raw: unknown } {
  const extracted = extractFirstByteLike(raw);

  if (extracted != null) {
    try {
      return {
        value: toUint8ArrayFromByteLike(extracted, label),
        raw,
      };
    } catch {
      // ignore
    }
  }

  return {
    value: encodeJsonBytes({
      kind: 'live-local-json-fallback',
      label,
      payload: serializeRequestValue(raw),
    }),
    raw,
  };
}

/**
 * Wyciąga bity meta z odpowiedzi JSON-RPC zanim wpadniemy w json-fallback (funkcja zwykłego
 * `wrapByteLikeResult` bywa za mało agresywna wobec kształtu Photona).
 */
function wrapCompressedMetaByteLikeResult(
  raw: unknown,
  label: 'fetchLiveClaimerMeta' | 'fetchLivePaymentMeta',
  normalize: (input: unknown) => Uint8Array
): { value: Uint8Array; raw: unknown } {
  try {
    return { value: normalize(raw), raw };
  } catch {
    // ignore
  }
  return {
    value: encodeJsonBytes({
      kind: 'live-local-json-fallback',
      label,
      payload: serializeRequestValue(raw),
    }),
    raw,
  };
}

function wrapJsonFallback(
  label: string,
  payload: Record<string, unknown>
): { value: Uint8Array; raw: unknown } {
  const raw = {
    kind: 'live-local-json-fallback',
    label,
    ...payload,
  };

  return {
    value: encodeJsonBytes(raw),
    raw,
  };
}

function wrapOpaqueStructuredResult(
  raw: unknown,
  label: string
): { value: Uint8Array; raw: unknown } {
  const direct =
    isByteArrayLike(raw) || typeof raw === 'string'
      ? raw
      : isRecord(raw) && raw.value !== undefined && isByteArrayLike(raw.value)
        ? raw.value
        : null;

  if (direct != null) {
    return {
      value: toUint8ArrayFromByteLike(direct, label),
      raw,
    };
  }

  return {
    value: encodeOpaqueStructuredBytes(label, raw),
    raw,
  };
}

function extractSeedBytesFromRequest(
  request: LiveLocalRequestParams
): Uint8Array | null {
  if (!isRecord(request)) return null;

  const candidates = [
    request.lightAddressSeed,
    request.lightAddressSeedBytes,
    request.seed,
    request.addressSeed,
    request.newAddressSeed,
    request.registerSeed,
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;
    try {
      const bytes = toUint8ArrayFromByteLike(candidate, 'extractSeedBytesFromRequest');
      if (bytes.length === 32) {
        return bytes;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function wrapOpaqueStructuredNewRegisterAddressResult(
  raw: unknown,
  request?: NewRegisterAddressParams
): { value: Uint8Array; raw: unknown } {
  const seed = extractSeedBytesFromRequest(request as LiveLocalRequestParams);

  const enrichedRaw = isRecord(raw)
    ? {
        ...raw,
        value: isRecord(raw.value)
          ? {
              ...raw.value,
              ...(seed ? { seed: Array.from(seed) } : {}),
            }
          : {
              value: serializeRequestValue(raw.value),
              ...(seed ? { seed: Array.from(seed) } : {}),
            },
        ...(seed ? { seed: Array.from(seed) } : {}),
      }
    : {
        value: serializeRequestValue(raw),
        ...(seed ? { seed: Array.from(seed) } : {}),
      };

  return {
    value: encodeOpaqueStructuredBytes('fetchLiveNewRegisterAddress', enrichedRaw),
    raw: enrichedRaw,
  };
}

function dedupeRemainingAccounts(
  accounts: LightRemainingAccountMeta[]
): LightRemainingAccountMeta[] {
  const merged = new Map<string, LightRemainingAccountMeta>();

  for (const account of accounts) {
    const key = account.pubkey.toBase58();
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        pubkey: account.pubkey,
        isSigner: account.isSigner,
        isWritable: account.isWritable,
        role: account.role,
      });
      continue;
    }

    existing.isSigner = existing.isSigner || account.isSigner;
    existing.isWritable = existing.isWritable || account.isWritable;
    if (!existing.role && account.role) {
      existing.role = account.role;
    }
  }

  return Array.from(merged.values());
}

function extractPublicKeyCandidates(
  value: unknown,
  visited = new Set<unknown>(),
  depth = 0
): Array<{ pubkey: PublicKey; role?: string }> {
  if (value == null || depth > 8) {
    return [];
  }

  if (typeof value !== 'object') {
    return [];
  }

  if (visited.has(value)) {
    return [];
  }
  visited.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractPublicKeyCandidates(item, visited, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const out: Array<{ pubkey: PublicKey; role?: string }> = [];

  const keyMap: Array<[string, string]> = [
    ['pubkey', 'pubkey'],
    ['address', 'address'],
    ['key', 'key'],
    ['tree', 'tree'],
    ['queue', 'queue'],
    ['addressTree', 'address-tree'],
    ['addressQueue', 'address-queue'],
    ['merkleTree', 'merkle-tree'],
    ['nullifierQueue', 'nullifier-queue'],
  ];

  for (const [field, role] of keyMap) {
    const candidate = record[field];
    if (candidate !== undefined) {
      try {
        out.push({
          pubkey: toPublicKey(candidate, field),
          role,
        });
      } catch {
        // ignore
      }
    }
  }

  for (const inner of Object.values(record)) {
    out.push(...extractPublicKeyCandidates(inner, visited, depth + 1));
  }

  return out;
}

function extractPublicKeyForRoles(value: unknown, roles: string[]): string | undefined {
  const wanted = new Set(roles.map((item) => item.trim().toLowerCase()));
  for (const candidate of extractPublicKeyCandidates(value)) {
    const role = (candidate.role ?? '').trim().toLowerCase();
    if (wanted.has(role)) {
      return candidate.pubkey.toBase58();
    }
  }
  return undefined;
}

function extractFirstPublicKeyFromUnknown(value: unknown): string | undefined {
  const first = extractPublicKeyCandidates(value)[0];
  return first?.pubkey.toBase58();
}

function getHintedAddressFromSources(sources: unknown[]): string | undefined {
  for (const source of sources) {
    if (!source) {
      continue;
    }

    if (isRecord(source)) {
      const raw = source.raw;
      if (isRecord(raw)) {
        const rawValue = raw.value;

        if (Array.isArray(rawValue)) {
          for (const item of rawValue) {
            if (isRecord(item)) {
              const fromAddress =
                toBase58IfPresent(item.address) ??
                toBase58IfPresent(item.newAddress) ??
                toBase58IfPresent(item.registerAddress) ??
                toBase58IfPresent(item.paymentAddress);
              if (fromAddress) {
                return fromAddress;
              }
            }
          }
        }

        if (isRecord(rawValue)) {
          const fromRawValue =
            toBase58IfPresent(rawValue.address) ??
            toBase58IfPresent(rawValue.newAddress) ??
            toBase58IfPresent(rawValue.registerAddress) ??
            toBase58IfPresent(rawValue.paymentAddress);
          if (fromRawValue) {
            return fromRawValue;
          }
        }
      }

      const directStructured =
        toBase58IfPresent(source.address) ??
        toBase58IfPresent(source.newAddress) ??
        toBase58IfPresent(source.registerAddress) ??
        toBase58IfPresent(source.paymentAddress);

      if (directStructured) {
        return directStructured;
      }

      const fromNested =
        extractPublicKeyForRoles(source, ['address']) ??
        extractFirstPublicKeyFromUnknown(source.address) ??
        extractFirstPublicKeyFromUnknown(source.newAddress) ??
        extractFirstPublicKeyFromUnknown(source.registerAddress) ??
        extractFirstPublicKeyFromUnknown(source.paymentAddress);

      if (fromNested) {
        return fromNested;
      }

      const fromValueField =
        isRecord(source.value)
          ? toBase58IfPresent(source.value.address) ??
            toBase58IfPresent(source.value.newAddress) ??
            toBase58IfPresent(source.value.registerAddress) ??
            toBase58IfPresent(source.value.paymentAddress)
          : undefined;

      if (fromValueField) {
        return fromValueField;
      }
    }

    const direct = toBase58IfPresent(source);
    if (direct) {
      return direct;
    }
  }

  return undefined;
}

function getHintedTreeFromSources(sources: unknown[]): string | undefined {
  for (const source of sources) {
    if (!source) {
      continue;
    }

    if (isRecord(source)) {
      const raw = source.raw;
      if (isRecord(raw)) {
        const rawValue = raw.value;

        if (Array.isArray(rawValue)) {
          for (const item of rawValue) {
            if (isRecord(item)) {
              const fromTree =
                toBase58IfPresent(item.tree) ??
                toBase58IfPresent(item.addressTree) ??
                toBase58IfPresent(item.merkleTree);
              if (fromTree) {
                return fromTree;
              }
            }
          }
        }

        if (isRecord(rawValue)) {
          const fromRawValue =
            toBase58IfPresent(rawValue.tree) ??
            toBase58IfPresent(rawValue.addressTree) ??
            toBase58IfPresent(rawValue.merkleTree);
          if (fromRawValue) {
            return fromRawValue;
          }
        }
      }

      const directStructured =
        toBase58IfPresent(source.tree) ??
        toBase58IfPresent(source.addressTree) ??
        toBase58IfPresent(source.merkleTree);

      if (directStructured) {
        return directStructured;
      }

      const fromNested = extractPublicKeyForRoles(source, ['tree', 'address-tree', 'merkle-tree']);
      if (fromNested) {
        return fromNested;
      }

      const fromValueField =
        isRecord(source.value)
          ? toBase58IfPresent(source.value.tree) ??
            toBase58IfPresent(source.value.addressTree) ??
            toBase58IfPresent(source.value.merkleTree)
          : undefined;

      if (fromValueField) {
        return fromValueField;
      }
    }

    const nested = extractPublicKeyForRoles(source, ['tree', 'address-tree', 'merkle-tree']);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function getRegisterHintSources(request: Record<string, unknown>): unknown[] {
  return [
    request.__liveLocalRegisterHintAddressRaw,
    request.__liveLocalRegisterHintNewAddressRaw,
    request.__liveLocalRegisterHintAddressBytes,
    request.__liveLocalRegisterHintTreeInfoRaw,
    request.__liveLocalRegisterHintRemainingAccounts,
  ];
}

function getSendHintSources(request: Record<string, unknown>): unknown[] {
  return [
    request.__liveLocalSendHintNewPaymentAddressRaw,
    request.__liveLocalSendHintPackedAddressTreeInfoRaw,
    request.__liveLocalSendHintRemainingAccounts,
    request.__liveLocalSendHintNewPaymentAddressBytes,
    request.__liveLocalSendHintPackedAddressTreeInfoBytes,
    request.__liveLocalSendHintAddressRaw,
    request.__liveLocalSendHintNewAddressRaw,
    request.__liveLocalSendHintPaymentAddressRaw,
    request.__liveLocalSendHintProofRaw,
    request.__liveLocalSendHintSourceCompressedAccountsRaw,
    request.__liveLocalSendHintSourceHashes,
  ];
}

function getHintedRegisterAddress(request: Record<string, unknown>): string | undefined {
  return getHintedAddressFromSources(getRegisterHintSources(request));
}

function getHintedSendAddress(request: Record<string, unknown>): string | undefined {
  return getHintedAddressFromSources(getSendHintSources(request));
}

function getHintedSendTree(request: Record<string, unknown>): string | undefined {
  return getHintedTreeFromSources(getSendHintSources(request));
}

function requireConfiguredRegisterRuntime(runtime: LightLocalRuntimeConfig): void {
  if (!runtime.addressTreePubkey || !runtime.addressQueuePubkey) {
    throw new Error(
      [
        'Register flow requires explicit Light local runtime configuration.',
        `addressTreePubkey=${runtime.addressTreePubkey ?? 'unset'}`,
        `addressQueuePubkey=${runtime.addressQueuePubkey ?? 'unset'}`,
        'Set PIERRON_LIGHT_LOCAL_ADDRESS_TREE and PIERRON_LIGHT_LOCAL_ADDRESS_QUEUE',
        'or provide equivalent runtime override before building register remaining accounts.',
      ].join(' ')
    );
  }
}

function toRemainingAccountsFromUnknown(
  value: unknown,
  label: string
): LightRemainingAccountMeta[] {
  let rawAccounts: unknown = value;

  if (isRecord(rawAccounts)) {
    for (const key of ['remainingAccounts', 'accounts', 'items', 'value', 'data', 'result']) {
      if (rawAccounts[key] !== undefined) {
        rawAccounts = rawAccounts[key];
        break;
      }
    }
  }

  let normalized: LightRemainingAccountMeta[] = [];

  if (Array.isArray(rawAccounts)) {
    normalized = rawAccounts
      .map((item, index) => {
        const account = item as RawRemainingAccountLike;

        try {
          return {
            pubkey: toPublicKey(
              account.pubkey ??
                account.address ??
                account.key ??
                account.tree ??
                account.queue ??
                account.addressTree ??
                account.addressQueue ??
                account.merkleTree ??
                account.nullifierQueue ??
                account.hash,
              `${label}[${index}].pubkey`
            ),
            isSigner: Boolean(account.isSigner ?? account.signer ?? false),
            isWritable: Boolean(account.isWritable ?? account.writable ?? true),
            role: typeof account.role === 'string' ? account.role : undefined,
          } satisfies LightRemainingAccountMeta;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as LightRemainingAccountMeta[];
  }

  if (normalized.length === 0) {
    normalized = extractPublicKeyCandidates(value).map((item) => ({
      pubkey: item.pubkey,
      isSigner: false,
      isWritable: true,
      role: item.role,
    }));
  }

  normalized = dedupeRemainingAccounts(normalized);

  if (normalized.length === 0) {
    throw new Error(`${label} does not contain an account array`);
  }

  return normalized;
}

function filterOwnerAsAddress(
  accounts: LightRemainingAccountMeta[],
  owner?: string
): LightRemainingAccountMeta[] {
  if (!owner) {
    return dedupeRemainingAccounts(accounts);
  }

  return dedupeRemainingAccounts(
    accounts.filter((account) => {
      if (account.role !== 'address') {
        return true;
      }
      return account.pubkey.toBase58() !== owner;
    })
  );
}

function toPhotonNamedParams(
  method: string,
  rpcParams: JsonRpcParams
): ReturnType<typeof serializeRequestValue> {
  // Photon (jsonrpsee) deserializes getValidityProof* `params` as a single
  // `GetValidityProofRequest` object — same as @lightprotocol/stateless.js
  // (params: { hashes, newAddressesWithTrees }). Do not wrap as [object].
  if (
    (method === 'getValidityProof' || method === 'getValidityProofV2') &&
    Array.isArray(rpcParams) &&
    rpcParams.length === 1 &&
    rpcParams[0] != null &&
    typeof rpcParams[0] === 'object' &&
    !Array.isArray(rpcParams[0])
  ) {
    return serializeRequestValue(rpcParams[0]);
  }
  return serializeRequestValue(rpcParams);
}

function compressionJsonRpcBaseUrls(runtime: LightLocalRuntimeConfig): string[] {
  return Array.from(
    new Set(
      [runtime.photonUrl, runtime.indexerUrl, runtime.proverUrl, runtime.rpcUrl].filter(
        (url): url is string => typeof url === "string" && url.length > 0
      )
    )
  );
}

function photonEndpointUrl(baseUrl: string, path: string): string {
  if (!path || path === '/') {
    return compressionRpcEndpointUrl(baseUrl);
  }
  return joinUrl(baseUrl, path);
}

async function postJsonRpc<T = unknown>(params: {
  baseUrl: string;
  path: string;
  method: string;
  rpcParams: JsonRpcParams;
}): Promise<T> {
  return postCompressionJsonRpc<T>({
    url: photonEndpointUrl(params.baseUrl, params.path),
    method: params.method,
    rpcParams: toPhotonNamedParams(params.method, params.rpcParams),
    id: nextId(),
  });
}

async function callJsonRpcWithCandidates<T = unknown>(params: {
  baseUrl: string;
  path: string;
  method: string;
  candidates: JsonRpcParams[];
  label: string;
}): Promise<T> {
  const errors: string[] = [];

  for (const candidate of params.candidates) {
    try {
      return await postJsonRpc<T>({
        baseUrl: params.baseUrl,
        path: params.path,
        method: params.method,
        rpcParams: candidate,
      });
    } catch (err) {
      errors.push(
        `${params.method}(${JSON.stringify(serializeRequestValue(candidate))}): ${sanitizeRpcUrlForDisplay(
          String((err as Error)?.message ?? err)
        )}`
      );
    }
  }

  throw new Error(
    `${sanitizeRpcUrlForDisplay(params.label)} failed for all candidate params:\n${errors.join('\n')}`
  );
}

function dedupeCandidateParams(candidates: JsonRpcParams[]): JsonRpcParams[] {
  const seen = new Set<string>();
  const out: JsonRpcParams[] = [];

  for (const candidate of candidates) {
    const key = JSON.stringify(serializeRequestValue(candidate));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }

  return out;
}

function collectAddressLikeStrings(request: LiveLocalRequestParams): string[] {
  if (!request) return [];

  const out = new Set<string>();

  const visit = (value: unknown, depth = 0) => {
    if (value == null || depth > 6) return;

    const direct = toBase58IfPresent(value);
    if (direct) {
      out.add(direct);
      return;
    }

    if (value instanceof PublicKey) {
      out.add(value.toBase58());
      return;
    }

    if (isPublicKeyLike(value)) {
      try {
        out.add(value.toBase58());
        return;
      } catch {
        // ignore
      }
    }

    if (typeof value === 'string' && value.trim().length > 20) {
      const trimmed = value.trim();
      try {
        out.add(new PublicKey(trimmed).toBase58());
      } catch {
        // ignore
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    if (typeof value === 'object') {
      for (const inner of Object.values(value as Record<string, unknown>)) {
        visit(inner, depth + 1);
      }
    }
  };

  visit(request);

  for (const candidate of extractPublicKeyCandidates(request)) {
    out.add(candidate.pubkey.toBase58());
  }

  return Array.from(out);
}

function collectHashLikeStrings(request: LiveLocalRequestParams): string[] {
  if (!request) return [];

  const out = new Set<string>();

  const visit = (value: unknown, keyHint?: string, depth = 0) => {
    if (value == null || depth > 6) return;

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
        return;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, keyHint, depth + 1);
      return;
    }

    if (typeof value === 'object') {
      for (const [innerKey, inner] of Object.entries(value as Record<string, unknown>)) {
        visit(inner, innerKey, depth + 1);
      }
    }
  };

  visit(request);
  return Array.from(out);
}

function buildOwnerCandidates(owner: string): JsonRpcParams[] {
  return [[owner], [{ owner }], [{ owner, limit: 50 }], [{ owner, limit: 100 }]];
}

export async function fetchCompressedAccountsByOwnerOverRpc(params: {
  owner: PublicKey | string;
  runtime?: PartialLightLocalRuntimeConfig;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
  limit?: number;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const owner =
    typeof params.owner === "string" ? params.owner : params.owner.toBase58();
  const limit = params.limit ?? 100;

  const candidates: JsonRpcParams[] = [
    [owner],
    [{ owner }],
    [{ owner, limit }],
    [{ owner, limit: limit }],
  ];

  const errors: string[] = [];
  for (const baseUrl of compressionJsonRpcBaseUrls(runtime)) {
    try {
      return await callJsonRpcWithCandidates({
        baseUrl,
        path: endpoints.jsonRpcPath,
        method: endpoints.getCompressedAccountsByOwnerMethod,
        candidates,
        label: `fetchCompressedAccountsByOwnerOverRpc@${baseUrl}`,
      });
    } catch (err) {
      errors.push(String((err as Error)?.message ?? err).slice(0, 240));
    }
  }

  throw new Error(
    `fetchCompressedAccountsByOwnerOverRpc failed for all endpoints:\n${errors
      .map((line) => sanitizeRpcUrlForDisplay(line))
      .join('\n')}`
  );
}

function buildCompressedAccountCandidates(address: string): JsonRpcParams[] {
  return [[address], [{ address }], [{ hash: address }]];
}

function buildMultipleCompressedAccountsCandidates(hashes: string[]): JsonRpcParams[] {
  return [[hashes], [{ hashes }], [{ accounts: hashes }]];
}

/**
 * Batch fetch compressed accounts by hash — often returns leaf `data` when
 * `getCompressedAccount` by hash alone returns `data: null` (Helius devnet).
 */
export async function fetchPhotonCompressedAccountsByHashes(params: {
  hashes: string[];
  runtime?: PartialLightLocalRuntimeConfig;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);
  const hashes = discoveryHashesForPhotonRpc(
    params.hashes.map((item) => item.trim()).filter((item) => item.length > 0)
  );

  if (hashes.length === 0) {
    throw new Error('fetchPhotonCompressedAccountsByHashes requires at least one hash');
  }

  return callJsonRpcWithCandidates({
    baseUrl: photonBaseUrl,
    path: endpoints.jsonRpcPath,
    method: endpoints.getMultipleCompressedAccountsMethod,
    candidates: buildMultipleCompressedAccountsCandidates(hashes),
    label: 'fetchPhotonCompressedAccountsByHashes',
  });
}

function buildNewAddressProofCandidates(params: {
  runtime: LightLocalRuntimeConfig;
  request?: LiveLocalRequestParams;
}): JsonRpcParams[] {
  const request = params.request;
  const record = isRecord(request) ? request : undefined;

  const tree =
    toBase58IfPresent(record?.tree) ??
    toBase58IfPresent(record?.addressTree) ??
    toBase58IfPresent(record?.addressTreePubkey) ??
    getHintedTreeFromSources(
      record ? [...getRegisterHintSources(record), ...getSendHintSources(record)] : []
    ) ??
    params.runtime.addressTreePubkey;

  const queue =
    toBase58IfPresent(record?.queue) ??
    toBase58IfPresent(record?.addressQueue) ??
    toBase58IfPresent(record?.addressQueuePubkey) ??
    params.runtime.addressQueuePubkey;

  const directTargets = [
    record ? getHintedRegisterAddress(record) : undefined,
    record ? getHintedSendAddress(record) : undefined,
    toBase58IfPresent(record?.address),
    toBase58IfPresent(record?.stealthAddress),
    toBase58IfPresent(record?.newAddress),
    toBase58IfPresent(record?.newPaymentAddress),
    toBase58IfPresent(record?.paymentAddress),
    toBase58IfPresent(record?.registerAddress),
    toBase58IfPresent(record?.compressedAddress),
    record ? extractFirstPublicKeyFromUnknown(record?.stealthAddress) : undefined,
    record ? extractFirstPublicKeyFromUnknown(record?.newPaymentAddress) : undefined,
    record ? extractFirstPublicKeyFromUnknown(record?.paymentAddress) : undefined,
    record ? extractFirstPublicKeyFromUnknown(record?.address) : undefined,
  ].filter((item): item is string => !!item);

  const discoveredTargets = collectAddressLikeStrings(request).filter(
    (item) => item !== 'localnet'
  );
  const targets = Array.from(new Set([...directTargets, ...discoveredTargets]));

  const owners = Array.from(
    new Set(
      [
        toBase58IfPresent(record?.owner),
        toBase58IfPresent(record?.metaOwner),
        toBase58IfPresent(record?.registerOwner),
        toBase58IfPresent(record?.payer),
        toBase58IfPresent(record?.sender),
        record ? extractFirstPublicKeyFromUnknown(record?.owner) : undefined,
        record ? extractFirstPublicKeyFromUnknown(record?.sender) : undefined,
      ]
        .filter((item): item is string => !!item)
        .filter((item) => item !== 'localnet')
    )
  );

  const seeds: Uint8Array[] = [];
  const seedCandidates = [
    record?.lightAddressSeed,
    record?.lightAddressSeedBytes,
    record?.addressSeed,
    record?.seed,
    record?.newAddressSeed,
    record?.registerSeed,
    record?.__liveLocalRegisterHintAddressBytes,
    record?.__liveLocalSendHintNewPaymentAddressBytes,
    record?.__liveLocalSendHintPackedAddressTreeInfoBytes,
  ];

  for (const candidate of seedCandidates) {
    if (candidate == null) continue;
    try {
      const bytes = toUint8ArrayFromByteLike(candidate, 'buildNewAddressProofCandidates.seed');
      if (bytes.length === 0) continue;

      const alreadySeen = seeds.some(
        (existing) =>
          existing.length === bytes.length &&
          existing.every((value, index) => value === bytes[index])
      );

      if (!alreadySeen) {
        seeds.push(bytes);
      }
    } catch {
      // ignore
    }
  }

  const candidates: JsonRpcParams[] = [];

  for (const target of targets) {
    candidates.push([target]);
    candidates.push([{ address: target }]);

    if (tree) {
      candidates.push([{ address: target, tree }]);
      candidates.push([target, tree]);
    }
  }

  for (const owner of owners) {
    for (const seed of seeds) {
      const lightAddressSeed = Array.from(seed);

      const structuredVariants: Record<string, unknown>[] = [
        {
          owner,
          lightAddressSeed,
          ...(tree ? { addressTree: tree, tree } : {}),
          ...(queue ? { addressQueue: queue, queue } : {}),
        },
        {
          owner,
          lightAddressSeedBytes: lightAddressSeed,
          ...(tree ? { addressTree: tree, tree } : {}),
          ...(queue ? { addressQueue: queue, queue } : {}),
        },
        {
          owner,
          seed: lightAddressSeed,
          ...(tree ? { addressTree: tree, tree } : {}),
          ...(queue ? { addressQueue: queue, queue } : {}),
        },
        {
          owner,
          lightAddressSeed,
        },
        {
          owner,
          lightAddressSeedBytes: lightAddressSeed,
        },
        {
          owner,
          seed: lightAddressSeed,
        },
      ];

      for (const variant of structuredVariants) {
        candidates.push([variant]);
      }

      candidates.push([owner, lightAddressSeed]);
      candidates.push([owner, { lightAddressSeed }]);
      candidates.push([owner, { lightAddressSeedBytes: lightAddressSeed }]);
      candidates.push([owner, { seed: lightAddressSeed }]);
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      'buildNewAddressProofCandidates requires at least one address-like target or owner/lightAddressSeed pair'
    );
  }

  return dedupeCandidateParams(candidates);
}

function buildClaimValidityProofCandidates(request?: LiveLocalRequestParams): JsonRpcParams[] {
  const record = isRecord(request) ? request : undefined;

  const hintedSourceHashes = Array.isArray(record?.__liveLocalClaimHintSourceHashes)
    ? record.__liveLocalClaimHintSourceHashes
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item): item is string => item.length > 0)
    : [];

  if (hintedSourceHashes.length > 0) {
    const inclusionRequest = {
      hashes: hintedSourceHashes,
      newAddressesWithTrees: [] as unknown[],
    };
    return dedupeCandidateParams([
      [inclusionRequest],
      [{ hashes: hintedSourceHashes, newAddressesWithTrees: [] }],
    ]);
  }

  return buildGenericValidityProofCandidates(request);
}

const INCLUSION_VALIDITY_PROOF_METHODS = [
  'getValidityProofV0',
  'getValidityProof',
  'getValidityProofV2',
] as const;

function inclusionValidityProofBaseUrls(runtime: LightLocalRuntimeConfig): string[] {
  return compressionJsonRpcBaseUrls(runtime);
}

/**
 * Inclusion proof for claim (StealthMeta + StealthPayment hashes) via raw JSON-RPC.
 * Avoids @lightprotocol/stateless.js on React Native (Hermes: toString of undefined in SDK).
 */
export async function fetchInclusionValidityProofOverRpc(params: {
  hashes: string[];
  runtime?: PartialLightLocalRuntimeConfig;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const hashes = discoveryHashesForPhotonRpc(
    params.hashes.map((item) => item.trim()).filter((item) => item.length > 0)
  );

  if (hashes.length < 2) {
    throw new Error(
      `fetchInclusionValidityProofOverRpc requires at least two hashes, got ${hashes.length}`
    );
  }

  const candidates = buildClaimValidityProofCandidates({
    __liveLocalClaimHintSourceHashes: hashes,
  } as LiveLocalRequestParams);

  const errors: string[] = [];

  for (const baseUrl of inclusionValidityProofBaseUrls(runtime)) {
    for (const method of INCLUSION_VALIDITY_PROOF_METHODS) {
      try {
        return await callJsonRpcWithCandidates({
          baseUrl,
          path: endpoints.jsonRpcPath,
          method,
          candidates,
          label: `fetchInclusionValidityProofOverRpc@${baseUrl}`,
        });
      } catch (err) {
        errors.push(
          `${method}@${baseUrl}: ${String((err as Error)?.message ?? err).slice(0, 200)}`
        );
      }
    }
  }

  throw new Error(
    `fetchInclusionValidityProofOverRpc failed for all URLs/methods:\n${errors.slice(0, 8).join('\n')}`
  );
}

/**
 * Non-inclusion proof for new compressed addresses via raw JSON-RPC.
 * RN-safe (no @lightprotocol/stateless.js).
 */
export async function fetchNewAddressValidityProofOverRpc(params: {
  addressesWithTrees: Array<{ address: string; tree: string }>;
  runtime?: PartialLightLocalRuntimeConfig;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);

  const pairs = params.addressesWithTrees
    .map((row) => ({
      address: row.address.trim(),
      tree: row.tree.trim(),
    }))
    .filter((row) => row.address.length > 0 && row.tree.length > 0);

  if (pairs.length === 0) {
    throw new Error('fetchNewAddressValidityProofOverRpc requires at least one address+tree pair');
  }

  const candidates = dedupeCandidateParams([
    [{ hashes: [], newAddressesWithTrees: pairs }],
    [{ newAddressesWithTrees: pairs }],
    [pairs],
  ]);

  const errors: string[] = [];

  for (const baseUrl of inclusionValidityProofBaseUrls(runtime)) {
    for (const method of INCLUSION_VALIDITY_PROOF_METHODS) {
      try {
        return await callJsonRpcWithCandidates({
          baseUrl,
          path: endpoints.jsonRpcPath,
          method,
          candidates,
          label: `fetchNewAddressValidityProofOverRpc@${baseUrl}`,
        });
      } catch (err) {
        errors.push(
          `${method}@${baseUrl}: ${String((err as Error)?.message ?? err).slice(0, 200)}`
        );
      }
    }
  }

  throw new Error(
    `fetchNewAddressValidityProofOverRpc failed for all URLs/methods:\n${errors.slice(0, 8).join('\n')}`
  );
}

function buildGenericValidityProofCandidates(request?: LiveLocalRequestParams): JsonRpcParams[] {
  const sanitized = stripInternalLiveLocalHints(request);
  const hashes = collectHashLikeStrings(sanitized);

  if (hashes.length > 0) {
    return dedupeCandidateParams([
      [{ hashes }],
      [hashes],
    ]);
  }

  const serialized = serializeRequestValue(sanitized);
  if (serialized !== undefined) {
    return dedupeCandidateParams([[serialized]]);
  }

  return [];
}

function extractRegisterProofAddressDescriptor(
  request: LiveLocalRequestParams,
  runtime: LightLocalRuntimeConfig
): RegisterProofAddressDescriptor | null {
  if (!isRecord(request)) {
    return null;
  }

  const directAddress =
    getHintedRegisterAddress(request) ??
    toBase58IfPresent(request.address) ??
    toBase58IfPresent(request.newAddress) ??
    toBase58IfPresent(request.registerAddress) ??
    toBase58IfPresent(request.compressedAddress);

  const tree =
    toBase58IfPresent(request.tree) ??
    toBase58IfPresent(request.addressTree) ??
    toBase58IfPresent(request.addressTreePubkey) ??
    extractPublicKeyForRoles(request.__liveLocalRegisterHintTreeInfoRaw, [
      'tree',
      'address-tree',
      'merkle-tree',
    ]) ??
    extractPublicKeyForRoles(request.__liveLocalRegisterHintRemainingAccounts, [
      'tree',
      'address-tree',
      'merkle-tree',
    ]) ??
    runtime.addressTreePubkey;

  if (!directAddress || !tree) {
    return null;
  }

  return { address: directAddress, tree };
}

function buildRegisterValidityProofCandidates(params: {
  request?: LiveLocalRequestParams;
  runtime: LightLocalRuntimeConfig;
}): JsonRpcParams[] {
  const request = isRecord(params.request) ? params.request : undefined;

  const sources: unknown[] = [
    request,
    request?.__liveLocalRegisterHintAddressRaw,
    request?.__liveLocalRegisterHintTreeInfoRaw,
    request?.__liveLocalRegisterHintRemainingAccounts,
    request?.__liveLocalRegisterHintNewAddressRaw,
  ];

  const hashes = new Set<string>();
  const addresses = new Set<string>();

  for (const source of sources) {
    for (const hash of collectHashLikeStrings(source as LiveLocalRequestParams)) {
      hashes.add(hash);
    }

    for (const address of collectAddressLikeStrings(source as LiveLocalRequestParams)) {
      if (address !== 'localnet') {
        addresses.add(address);
      }
    }
  }

  const proofTargets =
    hashes.size > 0
      ? Array.from(hashes).slice(0, 32)
      : Array.from(addresses).slice(0, 32);

  const candidates: JsonRpcParams[] = [];

  if (proofTargets.length > 0) {
    candidates.push([proofTargets]);
    candidates.push([proofTargets, []]);
    candidates.push([proofTargets, [], []]);
    candidates.push([[], proofTargets]);
    candidates.push([[], proofTargets, []]);
    candidates.push([{ hashes: proofTargets }]);
  }

  const sanitized = stripInternalLiveLocalHints(params.request);
  const generic = buildGenericValidityProofCandidates(sanitized);

  return dedupeCandidateParams([...candidates, ...generic]);
}

/**
 * `send` only CPI-inserts a *new* address (no input compressed accounts). Photon
 * `getValidityProof` must be driven by `newAddressesWithTrees` (non-inclusion for
 * the new payment PDA), not by inclusion `hashes` for the sender.
 */
function buildSendNewAddressOnlyValidityProofCandidates(params: {
  request?: LiveLocalRequestParams;
  runtime: LightLocalRuntimeConfig;
}): JsonRpcParams[] {
  const request = params.request;
  const record = isRecord(request) ? request : undefined;

  const tree =
    toBase58IfPresent(record?.tree) ??
    toBase58IfPresent(record?.addressTree) ??
    toBase58IfPresent(record?.addressTreePubkey) ??
    getHintedTreeFromSources(
      record ? [...getRegisterHintSources(record), ...getSendHintSources(record)] : []
    ) ??
    params.runtime.addressTreePubkey;

  const address =
    toBase58IfPresent(record?.stealthAddress) ??
    (record ? extractFirstPublicKeyFromUnknown(record?.stealthAddress) : undefined) ??
    toBase58IfPresent(record?.newPaymentAddress) ??
    (record ? extractFirstPublicKeyFromUnknown(record?.newPaymentAddress) : undefined) ??
    toBase58IfPresent(record?.paymentAddress) ??
    (record ? extractFirstPublicKeyFromUnknown(record?.paymentAddress) : undefined);

  if (!address || !tree) {
    return [];
  }

  const pair = { address, tree };
  return [
    [{ hashes: [], newAddressesWithTrees: [pair] }],
  ];
}

function buildSendValidityProofCandidates(params: {
  request?: LiveLocalRequestParams;
  runtime: LightLocalRuntimeConfig;
}): JsonRpcParams[] {
  const request = params.request;
  const record = isRecord(request) ? request : undefined;

  const newAddressOnly = buildSendNewAddressOnlyValidityProofCandidates({
    request,
    runtime: params.runtime,
  });

  const hintedSourceHashes = Array.isArray(record?.__liveLocalSendHintSourceHashes)
    ? record.__liveLocalSendHintSourceHashes
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item): item is string => item.length > 0)
    : [];

  const hashBased: JsonRpcParams[] = [];
  if (hintedSourceHashes.length > 0) {
    hashBased.push(
      ...dedupeCandidateParams([
        [{ hashes: hintedSourceHashes }],
        [hintedSourceHashes],
      ])
    );
  }

  const genericHashes = collectHashLikeStrings(stripInternalLiveLocalHints(request));
  if (genericHashes.length > 0) {
    hashBased.push(
      ...dedupeCandidateParams([
        [{ hashes: genericHashes }],
        [genericHashes],
      ])
    );
  }

  const generic = buildGenericValidityProofCandidates(stripInternalLiveLocalHints(record));

  if (newAddressOnly.length > 0) {
    if (hashBased.length > 0 || generic.length > 0) {
      return dedupeCandidateParams([...newAddressOnly, ...hashBased, ...generic]);
    }
    return dedupeCandidateParams(newAddressOnly);
  }

  if (hashBased.length > 0) {
    return dedupeCandidateParams(
      generic.length > 0 ? [...hashBased, ...generic] : hashBased
    );
  }

  if (generic.length > 0) {
    return dedupeCandidateParams(generic);
  }

  throw new Error(
    'buildSendValidityProofCandidates requires new payment address+tree, source hashes, or other proof hints for send'
  );
}

function getConfiguredRegisterRemainingAccounts(
  runtime: LightLocalRuntimeConfig
): LightRemainingAccountMeta[] {
  requireConfiguredRegisterRuntime(runtime);

  const candidates: LightRemainingAccountMeta[] = [
    {
      pubkey: new PublicKey(runtime.addressTreePubkey!),
      isSigner: false,
      isWritable: true,
      role: 'merkle-tree',
    },
    {
      pubkey: new PublicKey(runtime.addressQueuePubkey!),
      isSigner: false,
      isWritable: true,
      role: 'address-queue',
    },
  ];

  return dedupeRemainingAccounts(candidates);
}

function extractRemainingAccountsFromAddressProofLike(
  raw: unknown,
  runtime: LightLocalRuntimeConfig,
  owner?: string
): LightRemainingAccountMeta[] {
  const accounts: LightRemainingAccountMeta[] = [];

  const address =
    extractPublicKeyForRoles(raw, ['address']) ??
    extractFirstPublicKeyFromUnknown(isRecord(raw) ? raw.value : raw);

  const tree =
    extractPublicKeyForRoles(raw, ['tree', 'address-tree', 'merkle-tree']) ??
    runtime.addressTreePubkey;

  const queue = extractPublicKeyForRoles(raw, ['queue', 'address-queue', 'nullifier-queue']);

  if (address && address !== owner) {
    accounts.push({
      pubkey: new PublicKey(address),
      isSigner: false,
      isWritable: true,
      role: 'address',
    });
  }

  if (tree) {
    accounts.push({
      pubkey: new PublicKey(tree),
      isSigner: false,
      isWritable: true,
      role: 'merkle-tree',
    });
  }

  if (queue) {
    accounts.push({
      pubkey: new PublicKey(queue),
      isSigner: false,
      isWritable: true,
      role: 'address-queue',
    });
  }

  return dedupeRemainingAccounts(accounts);
}

function buildFallbackRegisterRemainingAccounts(params: {
  runtime: LightLocalRuntimeConfig;
  request?: LiveLocalRequestParams;
}): LightRemainingAccountMeta[] {
  requireConfiguredRegisterRuntime(params.runtime);

  const request = isRecord(params.request) ? params.request : undefined;
  const owner = toBase58IfPresent(request?.owner);
  const accounts: LightRemainingAccountMeta[] = [];

  const ownerLike = request ? getHintedRegisterAddress(request) : undefined;

  const treeLike =
    toBase58IfPresent(request?.tree) ??
    toBase58IfPresent(request?.addressTree) ??
    toBase58IfPresent(request?.addressTreePubkey) ??
    params.runtime.addressTreePubkey;

  const queueLike =
    toBase58IfPresent(request?.queue) ??
    toBase58IfPresent(request?.addressQueue) ??
    toBase58IfPresent(request?.addressQueuePubkey) ??
    params.runtime.addressQueuePubkey;

  if (ownerLike && ownerLike !== owner) {
    accounts.push({
      pubkey: new PublicKey(ownerLike),
      isSigner: false,
      isWritable: true,
      role: 'address',
    });
  }

  if (treeLike) {
    accounts.push({
      pubkey: new PublicKey(treeLike),
      isSigner: false,
      isWritable: true,
      role: 'merkle-tree',
    });
  }

  if (queueLike) {
    accounts.push({
      pubkey: new PublicKey(queueLike),
      isSigner: false,
      isWritable: true,
      role: 'address-queue',
    });
  }

  return dedupeRemainingAccounts(accounts);
}

function buildFallbackSendRemainingAccounts(params: {
  runtime: LightLocalRuntimeConfig;
  request?: SendRemainingAccountsParams;
}): LightRemainingAccountMeta[] {
  const request = isRecord(params.request) ? params.request : undefined;
  const accounts: LightRemainingAccountMeta[] = [];

  const addressLike =
    (request ? getHintedSendAddress(request) : undefined) ??
    toBase58IfPresent(request?.newPaymentAddress) ??
    extractFirstPublicKeyFromUnknown(request?.newPaymentAddress) ??
    toBase58IfPresent(request?.paymentAddress) ??
    extractFirstPublicKeyFromUnknown(request?.paymentAddress) ??
    toBase58IfPresent(request?.stealthAddress) ??
    extractFirstPublicKeyFromUnknown(request?.stealthAddress) ??
    toBase58IfPresent(request?.address) ??
    extractFirstPublicKeyFromUnknown(request?.address);

  const treeLike =
    toBase58IfPresent(request?.tree) ??
    toBase58IfPresent(request?.addressTree) ??
    toBase58IfPresent(request?.addressTreePubkey) ??
    (request ? getHintedSendTree(request) : undefined) ??
    params.runtime.addressTreePubkey;

  const queueLike =
    toBase58IfPresent(request?.queue) ??
    toBase58IfPresent(request?.addressQueue) ??
    toBase58IfPresent(request?.addressQueuePubkey);

  if (addressLike) {
    accounts.push({
      pubkey: new PublicKey(addressLike),
      isSigner: false,
      isWritable: true,
      role: 'address',
    });
  }

  if (treeLike) {
    accounts.push({
      pubkey: new PublicKey(treeLike),
      isSigner: false,
      isWritable: true,
      role: 'merkle-tree',
    });
  }

  if (queueLike) {
    accounts.push({
      pubkey: new PublicKey(queueLike),
      isSigner: false,
      isWritable: true,
      role: 'address-queue',
    });
  }

  return dedupeRemainingAccounts(accounts);
}

function buildFallbackClaimRemainingAccounts(params: {
  runtime: LightLocalRuntimeConfig;
  request?: ClaimRemainingAccountsParams;
}): LightRemainingAccountMeta[] {
  const request = isRecord(params.request) ? params.request : undefined;
  const accounts: LightRemainingAccountMeta[] = [];

  const metaOwnerLike =
    toBase58IfPresent(request?.metaOwner) ??
    toBase58IfPresent(request?.claimer);

  const paymentLike =
    toBase58IfPresent(request?.stealthAddress) ??
    toBase58IfPresent(request?.paymentAddress) ??
    toBase58IfPresent(request?.address);

  if (metaOwnerLike) {
    accounts.push({
      pubkey: new PublicKey(metaOwnerLike),
      isSigner: false,
      isWritable: true,
      role: 'meta-owner',
    });
  }

  if (paymentLike) {
    accounts.push({
      pubkey: new PublicKey(paymentLike),
      isSigner: false,
      isWritable: true,
      role: 'payment',
    });
  }

  return dedupeRemainingAccounts(accounts);
}

export async function fetchLiveIndexerHealth(params?: {
  runtime?: PartialLightLocalRuntimeConfig;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<string> {
  const runtime = resolveLightLocalRuntimeConfig(params?.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params?.endpoints);

  return postJsonRpc<string>({
    baseUrl: choosePhotonBaseUrl(runtime),
    path: endpoints.jsonRpcPath,
    method: endpoints.getIndexerHealthMethod,
    rpcParams: [],
  });
}

export async function fetchLivePackedAddressTreeInfo(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: PackedAddressTreeInfoParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);

  try {
    const raw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getMultipleNewAddressProofsMethod,
      candidates: buildNewAddressProofCandidates({
        runtime,
        request: params.request as LiveLocalRequestParams,
      }),
      label: 'fetchLivePackedAddressTreeInfo',
    });

    return wrapOpaqueStructuredResult(raw, 'fetchLivePackedAddressTreeInfo');
  } catch (error) {
    throw new Error(
      [
        'fetchLivePackedAddressTreeInfo failed for all candidate params:',
        String((error as Error)?.message ?? error),
      ].join('\n')
    );
  }
}

export async function fetchLiveRegisterProof(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: RegisterProofParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);

  try {
    const raw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getValidityProofMethod,
      candidates: buildRegisterValidityProofCandidates({
        runtime,
        request: params.request as LiveLocalRequestParams,
      }),
      label: 'fetchLiveRegisterProof',
    });

    return wrapOpaqueStructuredResult(raw, 'fetchLiveRegisterProof');
  } catch (error) {
    console.log(
      '[fetchLiveRegisterProof] failed',
      String((error as Error)?.message ?? error)
    );

    return wrapJsonFallback('fetchLiveRegisterProof', {
      reason: [
        'Canonical register validity proof unavailable.',
        'fallback new-address proof is intentionally not accepted for register proof slot.',
        '',
        String((error as Error)?.message ?? error),
      ].join('\n'),
      request: serializeRequestValue(stripInternalLiveLocalHints(params.request)),
    });
  }
}

export async function fetchLiveSendProof(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: SendProofParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);

  try {
    const raw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getValidityProofMethod,
      candidates: buildSendValidityProofCandidates({
        runtime,
        request: params.request as LiveLocalRequestParams,
      }),
      label: 'fetchLiveSendProof',
    });

    return wrapOpaqueStructuredResult(raw, 'fetchLiveSendProof');
  } catch (validityProofError) {
    return wrapJsonFallback('fetchLiveSendProof', {
      reason: [
        'Canonical send validity proof unavailable.',
        'fallback new-address proof is intentionally not accepted for send proof slot.',
        '',
        String((validityProofError as Error)?.message ?? validityProofError),
      ].join('\n'),
      request: serializeRequestValue(stripInternalLiveLocalHints(params.request)),
    });
  }
}

export async function fetchLiveClaimProof(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: ClaimProofParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const requestRecord = params.request as Record<string, unknown> | undefined;
  const hintedSourceHashes = Array.isArray(requestRecord?.__liveLocalClaimHintSourceHashes)
    ? (requestRecord.__liveLocalClaimHintSourceHashes as unknown[])
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item): item is string => item.length > 0)
    : [];

  if (hintedSourceHashes.length >= 2) {
    const raw = await fetchInclusionValidityProofOverRpc({
      hashes: hintedSourceHashes,
      runtime,
      endpoints,
    });
    return wrapOpaqueStructuredResult(raw, 'fetchLiveClaimProof');
  }

  const photonBaseUrl = choosePhotonBaseUrl(runtime);
  const candidates = buildClaimValidityProofCandidates(params.request as LiveLocalRequestParams);

  if (process?.env?.PIERRON_DEBUG_CLAIM_PROOF?.trim() === '1') {
    try {
      // eslint-disable-next-line no-console
      console.log(
        '[fetchLiveClaimProof] candidates',
        JSON.stringify(candidates.map((c) => serializeRequestValue(c)), null, 2)
      );
    } catch {
      // best-effort debug
    }
  }

  try {
    const raw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getValidityProofMethod,
      candidates,
      label: 'fetchLiveClaimProof',
    });

    if (process?.env?.PIERRON_DEBUG_CLAIM_PROOF?.trim() === '1') {
      try {
        const rec = isRecord(raw) ? (raw as Record<string, unknown>) : null;
        const roots = Array.isArray(rec?.roots) ? rec?.roots : [];
        const rootIndices = Array.isArray(rec?.rootIndices)
          ? rec?.rootIndices
          : Array.isArray(rec?.root_indices)
            ? rec?.root_indices
            : [];
        const leaves = Array.isArray(rec?.leaves) ? rec?.leaves : [];
        // eslint-disable-next-line no-console
        console.log(
          '[fetchLiveClaimProof] selected summary',
          JSON.stringify(
            {
              rootIndices,
              rootsLen: roots.length,
              leavesLen: leaves.length,
              proveByIndices: rec?.proveByIndices ?? rec?.prove_by_indices ?? null,
            },
            null,
            2
          )
        );
      } catch {
        // best-effort debug
      }
    }

    return wrapOpaqueStructuredResult(raw, 'fetchLiveClaimProof');
  } catch (error) {
    return wrapJsonFallback('fetchLiveClaimProof', {
      reason: String((error as Error)?.message ?? error),
      request: serializeRequestValue(stripInternalLiveLocalHints(params.request)),
    });
  }
}

export async function fetchLiveRegisterMetaMeta(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: RegisterCompressedMetaParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);
  const owner = toBase58IfPresent((params.request as Record<string, unknown> | undefined)?.owner);

  if (!owner) {
    throw new Error('fetchLiveRegisterMetaMeta requires request.owner');
  }

  const raw = await callJsonRpcWithCandidates({
    baseUrl: photonBaseUrl,
    path: endpoints.jsonRpcPath,
    method: endpoints.getCompressedAccountsByOwnerMethod,
    candidates: buildOwnerCandidates(owner),
    label: 'fetchLiveRegisterMetaMeta',
  });

  return wrapOpaqueStructuredResult(raw, 'fetchLiveRegisterMetaMeta');
}

export async function fetchLiveClaimerMeta(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: ClaimerCompressedMetaParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);
  const requestRecord = params.request as Record<string, unknown> | undefined;
  const owner = toBase58IfPresent(requestRecord?.claimer);
  const hintAddress = toBase58IfPresent(
    requestRecord?.__liveLocalClaimerHintCompressedAddress
  );

  if (!owner) {
    return wrapJsonFallback('fetchLiveClaimerMeta', {
      reason: 'missing claimer',
      request: serializeRequestValue(stripInternalLiveLocalHints(params.request)),
    });
  }

  if (hintAddress) {
    try {
      const raw = await callJsonRpcWithCandidates({
        baseUrl: photonBaseUrl,
        path: endpoints.jsonRpcPath,
        method: endpoints.getCompressedAccountMethod,
        candidates: buildCompressedAccountCandidates(hintAddress),
        label: 'fetchLiveClaimerMeta-hint',
      });
      return wrapCompressedMetaByteLikeResult(
        enrichPhotonCompressedAccountAddress(raw, hintAddress),
        'fetchLiveClaimerMeta',
        normalizeLiveClaimerMetaToBytes
      );
    } catch {
      // fallback do by-owner
    }
  }

  try {
    const raw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getCompressedAccountsByOwnerMethod,
      candidates: buildOwnerCandidates(owner),
      label: 'fetchLiveClaimerMeta',
    });

    return wrapCompressedMetaByteLikeResult(
      raw,
      'fetchLiveClaimerMeta',
      normalizeLiveClaimerMetaToBytes
    );
  } catch (error) {
    return wrapJsonFallback('fetchLiveClaimerMeta', {
      reason: String((error as Error)?.message ?? error),
      owner,
    });
  }
}

export async function fetchLivePaymentMeta(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: PaymentCompressedMetaParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);
  const requestRecord = params.request as Record<string, unknown> | undefined;
  const directStealth = toBase58IfPresent(requestRecord?.stealthAddress);
  const owner =
    toBase58IfPresent(requestRecord?.metaOwner) ??
    toBase58IfPresent(requestRecord?.claimer) ??
    null;
  const sourceHashHints = Array.isArray(requestRecord?.__liveLocalClaimHintSourceHashes)
    ? (requestRecord.__liveLocalClaimHintSourceHashes as unknown[])
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
  const hintedHashSet = new Set<string>();
  for (const hint of sourceHashHints) {
    hintedHashSet.add(hint);
    try {
      hintedHashSet.add(discoveryHashForPhotonRpc(hint));
    } catch {
      // keep original hint only
    }
  }
  const pickOwnerItemResult = (raw: unknown): unknown | null => {
    const value = extractResultValue(raw);
    if (!isRecord(value)) return null;
    const items = Array.isArray((value as { items?: unknown[] }).items)
      ? ((value as { items: unknown[] }).items ?? [])
      : [];
    if (items.length === 0) return null;

    if (hintedHashSet.size > 0) {
      for (const item of items) {
        if (
          isRecord(item) &&
          typeof (item as { hash?: unknown }).hash === 'string' &&
          hintedHashSet.has((item as { hash: string }).hash)
        ) {
          const context =
            isRecord(raw) && (raw as { context?: unknown }).context != null
              ? (raw as { context: unknown }).context
              : undefined;
          return context ? { context, value: item } : { value: item };
        }
      }
    }

    const first = items[0];
    if (first == null) return null;
    const context =
      isRecord(raw) && (raw as { context?: unknown }).context != null
        ? (raw as { context: unknown }).context
        : undefined;
    return context ? { context, value: first } : { value: first };
  };

  // Inclusion order: meta hash first, payment second — never fetch payment meta by meta hash.
  const paymentHashHints =
    sourceHashHints.length >= 2 ? [sourceHashHints[1]!] : sourceHashHints.slice(-1);
  for (const sourceHash of paymentHashHints) {
    try {
      const raw = await callJsonRpcWithCandidates({
        baseUrl: photonBaseUrl,
        path: endpoints.jsonRpcPath,
        method: endpoints.getCompressedAccountMethod,
        candidates: buildCompressedAccountCandidates(sourceHash),
        label: 'fetchLivePaymentMeta-sourceHash',
      });
      if (extractResultValue(raw) == null) {
        throw new Error('fetchLivePaymentMeta-sourceHash returned null value');
      }
      return wrapCompressedMetaByteLikeResult(
        enrichPhotonCompressedAccountAddress(raw, directStealth),
        'fetchLivePaymentMeta',
        normalizeLivePaymentMetaToBytes
      );
    } catch {
      // fallback to next source hash hint
    }
  }

  if (directStealth && sourceHashHints.length < 2) {
    try {
      const raw = await callJsonRpcWithCandidates({
        baseUrl: photonBaseUrl,
        path: endpoints.jsonRpcPath,
        method: endpoints.getCompressedAccountMethod,
        candidates: buildCompressedAccountCandidates(directStealth),
        label: 'fetchLivePaymentMeta-stealth',
      });
      if (extractResultValue(raw) == null) {
        throw new Error('fetchLivePaymentMeta-stealth returned null value');
      }
      return wrapCompressedMetaByteLikeResult(
        enrichPhotonCompressedAccountAddress(raw, directStealth),
        'fetchLivePaymentMeta',
        normalizeLivePaymentMetaToBytes
      );
    } catch {
      // fallback: scan request pod innymi kluczami
    }
  }

  if (owner) {
    try {
      const raw = await callJsonRpcWithCandidates({
        baseUrl: photonBaseUrl,
        path: endpoints.jsonRpcPath,
        method: endpoints.getCompressedAccountsByOwnerMethod,
        candidates: buildOwnerCandidates(owner),
        label: 'fetchLivePaymentMeta-owner',
      });
      const selected = pickOwnerItemResult(raw);
      if (selected != null) {
        return wrapCompressedMetaByteLikeResult(
          selected,
          'fetchLivePaymentMeta',
          normalizeLivePaymentMetaToBytes
        );
      }
    } catch {
      // fallback to canonical stealth-program owner below
    }
  }

  try {
    const raw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getCompressedAccountsByOwnerMethod,
      candidates: buildOwnerCandidates(PIERRON_STEALTH_PROGRAM_ID.toBase58()),
      label: 'fetchLivePaymentMeta-program-owner',
    });
    const selected = pickOwnerItemResult(raw);
    if (selected != null) {
      return wrapCompressedMetaByteLikeResult(
        selected,
        'fetchLivePaymentMeta',
        normalizeLivePaymentMetaToBytes
      );
    }
  } catch {
    // fallback to address-like hints below
  }

  const addresses = collectAddressLikeStrings(params.request as LiveLocalRequestParams);

  if (addresses.length === 0) {
    return wrapJsonFallback('fetchLivePaymentMeta', {
      reason: 'missing stealth address',
      request: serializeRequestValue(stripInternalLiveLocalHints(params.request)),
    });
  }

  try {
    const raw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getCompressedAccountMethod,
      candidates: buildCompressedAccountCandidates(addresses[0]!),
      label: 'fetchLivePaymentMeta',
    });
    if (extractResultValue(raw) == null) {
      throw new Error('fetchLivePaymentMeta returned null value');
    }

    return wrapCompressedMetaByteLikeResult(
      raw,
      'fetchLivePaymentMeta',
      normalizeLivePaymentMetaToBytes
    );
  } catch (error) {
    return wrapJsonFallback('fetchLivePaymentMeta', {
      reason: String((error as Error)?.message ?? error),
      address: addresses[0],
    });
  }
}

export async function fetchLiveNewRegisterAddress(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: NewRegisterAddressParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);

  try {
    const raw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getMultipleNewAddressProofsMethod,
      candidates: buildNewAddressProofCandidates({
        runtime,
        request: params.request as LiveLocalRequestParams,
      }),
      label: 'fetchLiveNewRegisterAddress',
    });

    return wrapOpaqueStructuredNewRegisterAddressResult(raw, params.request);
  } catch (error) {
    throw new Error(
      [
        'fetchLiveNewRegisterAddress failed for all candidate params:',
        String((error as Error)?.message ?? error),
      ].join('\n')
    );
  }
}

export async function fetchLiveNewPaymentAddress(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: NewPaymentAddressParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<unknown> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);

  try {
    const raw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getMultipleNewAddressProofsMethod,
      candidates: buildNewAddressProofCandidates({
        runtime,
        request: params.request as LiveLocalRequestParams,
      }),
      label: 'fetchLiveNewPaymentAddress',
    });

    return wrapOpaqueStructuredResult(raw, 'fetchLiveNewPaymentAddress');
  } catch (error) {
    return wrapJsonFallback('fetchLiveNewPaymentAddress', {
      reason: String((error as Error)?.message ?? error),
      request: serializeRequestValue(stripInternalLiveLocalHints(params.request)),
      runtime: {
        addressTreePubkey: runtime.addressTreePubkey,
        addressQueuePubkey: runtime.addressQueuePubkey,
      },
    });
  }
}

export async function fetchLiveRemainingAccountsForRegister(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: RegisterProofParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<LightRemainingAccountMeta[]> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  requireConfiguredRegisterRuntime(runtime);

  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);
  const requestRecord = isRecord(params.request) ? params.request : undefined;
  const owner = toBase58IfPresent(requestRecord?.owner);

  let newAddressProofRaw: unknown | null = null;
  let inferredFromNewAddressProof: LightRemainingAccountMeta[] = [];

  try {
    newAddressProofRaw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getMultipleNewAddressProofsMethod,
      candidates: buildNewAddressProofCandidates({
        runtime,
        request: params.request as LiveLocalRequestParams,
      }),
      label: 'fetchLiveRemainingAccountsForRegister.newAddressProofs',
    });
  } catch {
    // ignore
  }

  if (newAddressProofRaw != null) {
    inferredFromNewAddressProof = filterOwnerAsAddress(
      extractRemainingAccountsFromAddressProofLike(newAddressProofRaw, runtime, owner),
      owner
    );
  }

  const rawResults: unknown[] = [];

  if (owner) {
    try {
      rawResults.push(
        await callJsonRpcWithCandidates({
          baseUrl: photonBaseUrl,
          path: endpoints.jsonRpcPath,
          method: endpoints.getCompressedAccountsByOwnerMethod,
          candidates: buildOwnerCandidates(owner),
          label: 'fetchLiveRemainingAccountsForRegister.owner',
        })
      );
    } catch {
      // ignore
    }
  }

  if (newAddressProofRaw != null) {
    rawResults.push(newAddressProofRaw);
  }

  if (requestRecord?.__liveLocalRegisterHintTreeInfoRaw != null) {
    rawResults.push(requestRecord.__liveLocalRegisterHintTreeInfoRaw);
  }

  if (requestRecord?.__liveLocalRegisterHintRemainingAccounts != null) {
    rawResults.push(requestRecord.__liveLocalRegisterHintRemainingAccounts);
  }

  if (requestRecord?.__liveLocalRegisterHintAddressRaw != null) {
    rawResults.push(requestRecord.__liveLocalRegisterHintAddressRaw);
  }

  if (requestRecord?.__liveLocalRegisterHintNewAddressRaw != null) {
    rawResults.push(requestRecord.__liveLocalRegisterHintNewAddressRaw);
  }

  try {
    const parsed = filterOwnerAsAddress(
      toRemainingAccountsFromUnknown(rawResults, 'fetchLiveRemainingAccountsForRegister'),
      owner
    );

    const parsedWithRoles = parsed.filter((item) => !!item.role);
    const parsedWithNonOwnerAddress = parsedWithRoles.some(
      (item) => item.role === 'address'
    );

    if (parsedWithNonOwnerAddress) {
      return dedupeRemainingAccounts(parsedWithRoles);
    }

    const parsedStructuralOnly = parsed.filter((item) => item.role !== 'address');
    if (parsedStructuralOnly.length > 0) {
      const inferredAddress = inferredFromNewAddressProof.find((item) => item.role === 'address');
      if (inferredAddress) {
        return dedupeRemainingAccounts([...parsedStructuralOnly, inferredAddress]);
      }
      return dedupeRemainingAccounts(parsedStructuralOnly);
    }
  } catch {
    // ignore
  }

  const configuredAccounts = getConfiguredRegisterRemainingAccounts(runtime);
  if (configuredAccounts.length > 0) {
    const fallbackWithOwnerFiltered = filterOwnerAsAddress(
      buildFallbackRegisterRemainingAccounts({
        runtime,
        request: params.request as LiveLocalRequestParams,
      }),
      owner
    );

    const fallbackHasNonOwnerAddress = fallbackWithOwnerFiltered.some(
      (item) => item.role === 'address'
    );

    if (fallbackHasNonOwnerAddress && fallbackWithOwnerFiltered.length > configuredAccounts.length) {
      return dedupeRemainingAccounts(fallbackWithOwnerFiltered);
    }

    if (inferredFromNewAddressProof.length > 0) {
      const inferredWithRoles = inferredFromNewAddressProof.filter((item) => !!item.role);
      if (inferredWithRoles.length > 0) {
        return dedupeRemainingAccounts([
          ...configuredAccounts,
          ...inferredWithRoles.filter((item) => item.role === 'address'),
        ]);
      }
      return dedupeRemainingAccounts([...configuredAccounts, ...inferredFromNewAddressProof]);
    }

    return configuredAccounts;
  }

  try {
    const fallback = filterOwnerAsAddress(
      buildFallbackRegisterRemainingAccounts({
        runtime,
        request: params.request as LiveLocalRequestParams,
      }),
      owner
    );

    if (fallback.length > 0) {
      return fallback;
    }

    return [];
  } catch {
    return [];
  }
}

export async function fetchLiveRemainingAccountsForSend(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: SendRemainingAccountsParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<LightRemainingAccountMeta[]> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);
  const requestRecord = isRecord(params.request) ? params.request : undefined;
  const owner = toBase58IfPresent(requestRecord?.sender);

  let newAddressProofRaw: unknown | null = null;
  let inferred: LightRemainingAccountMeta[] = [];

  try {
    newAddressProofRaw = await callJsonRpcWithCandidates({
      baseUrl: photonBaseUrl,
      path: endpoints.jsonRpcPath,
      method: endpoints.getMultipleNewAddressProofsMethod,
      candidates: buildNewAddressProofCandidates({
        runtime,
        request: params.request as LiveLocalRequestParams,
      }),
      label: 'fetchLiveRemainingAccountsForSend.newAddressProofs',
    });
  } catch {
    // ignore
  }

  if (newAddressProofRaw != null) {
    inferred = extractRemainingAccountsFromAddressProofLike(newAddressProofRaw, runtime);
  }

  const rawResults: unknown[] = [];

  if (newAddressProofRaw != null) {
    rawResults.push(newAddressProofRaw);
  }

  if (requestRecord?.__liveLocalSendHintPackedAddressTreeInfoRaw != null) {
    rawResults.push(requestRecord.__liveLocalSendHintPackedAddressTreeInfoRaw);
  }

  if (requestRecord?.__liveLocalSendHintNewPaymentAddressRaw != null) {
    rawResults.push(requestRecord.__liveLocalSendHintNewPaymentAddressRaw);
  }

  if (requestRecord?.__liveLocalSendHintRemainingAccounts != null) {
    rawResults.push(requestRecord.__liveLocalSendHintRemainingAccounts);
  }

  if (requestRecord?.__liveLocalSendHintSourceCompressedAccountsRaw != null) {
    rawResults.push(requestRecord.__liveLocalSendHintSourceCompressedAccountsRaw);
  }

  if (owner) {
    try {
      rawResults.push(
        await callJsonRpcWithCandidates({
          baseUrl: photonBaseUrl,
          path: endpoints.jsonRpcPath,
          method: endpoints.getCompressedAccountsByOwnerMethod,
          candidates: buildOwnerCandidates(owner),
          label: 'fetchLiveRemainingAccountsForSend.owner',
        })
      );
    } catch {
      // ignore
    }
  }

  let parsed: LightRemainingAccountMeta[] = [];
  try {
    parsed = toRemainingAccountsFromUnknown(rawResults, 'fetchLiveRemainingAccountsForSend');
  } catch {
    parsed = [];
  }

  const inferredWithRoles = inferred.filter((item) => !!item.role);
  if (inferredWithRoles.length > 0) {
    return dedupeRemainingAccounts(inferredWithRoles);
  }

  const parsedWithRoles = parsed.filter((item) => !!item.role);
  if (parsedWithRoles.length > 0) {
    return dedupeRemainingAccounts(parsedWithRoles);
  }

  const fallback = buildFallbackSendRemainingAccounts({
    runtime,
    request: params.request,
  });

  return dedupeRemainingAccounts(fallback);
}

export async function fetchLiveRemainingAccountsForClaim(params: {
  runtime?: PartialLightLocalRuntimeConfig;
  request?: ClaimRemainingAccountsParams;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<LightRemainingAccountMeta[]> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const endpoints = resolveLightLiveLocalEndpointConfig(params.endpoints);
  const photonBaseUrl = choosePhotonBaseUrl(runtime);

  const request = params.request as Record<string, unknown> | undefined;
  const owner =
    toBase58IfPresent(request?.metaOwner) ??
    toBase58IfPresent(request?.claimer);

  const rawResults: unknown[] = [];

  if (owner) {
    try {
      rawResults.push(
        await callJsonRpcWithCandidates({
          baseUrl: photonBaseUrl,
          path: endpoints.jsonRpcPath,
          method: endpoints.getCompressedAccountsByOwnerMethod,
          candidates: buildOwnerCandidates(owner),
          label: 'fetchLiveRemainingAccountsForClaim.owner',
        })
      );
    } catch {
      // ignore
    }
  }

  try {
    return toRemainingAccountsFromUnknown(rawResults, 'fetchLiveRemainingAccountsForClaim');
  } catch {
    const fallback = buildFallbackClaimRemainingAccounts({
      runtime,
      request: params.request,
    });

    if (fallback.length > 0) {
      return fallback;
    }

    return [];
  }
}

export async function probeLivePhotonIndexer(params?: {
  runtime?: PartialLightLocalRuntimeConfig;
  endpoints?: Partial<LightLiveLocalEndpointConfig>;
}): Promise<{
  baseUrl: string;
  health: string;
}> {
  const runtime = resolveLightLocalRuntimeConfig(params?.runtime);
  const baseUrl = choosePhotonBaseUrl(runtime);
  const health = await fetchLiveIndexerHealth(params);

  return {
    baseUrl,
    health,
  };
}

export function getLightLiveLocalEndpointSummary(
  override?: Partial<LightLiveLocalEndpointConfig>
): string[] {
  const endpoints = resolveLightLiveLocalEndpointConfig(override);

  return [
    `jsonRpcPath: ${endpoints.jsonRpcPath}`,
    `getCompressedAccountsByOwnerMethod: ${endpoints.getCompressedAccountsByOwnerMethod}`,
    `getCompressedAccountMethod: ${endpoints.getCompressedAccountMethod}`,
    `getCompressedAccountProofMethod: ${endpoints.getCompressedAccountProofMethod}`,
    `getMultipleCompressedAccountProofsMethod: ${endpoints.getMultipleCompressedAccountProofsMethod}`,
    `getMultipleNewAddressProofsMethod: ${endpoints.getMultipleNewAddressProofsMethod}`,
    `getValidityProofMethod: ${endpoints.getValidityProofMethod}`,
    `getIndexerHealthMethod: ${endpoints.getIndexerHealthMethod}`,
  ];
}
