import { PublicKey } from '@solana/web3.js';

import type { StealthMetaAccount, StealthPaymentAccount } from '../stealth-base/stealth.ts';
import {
  LIGHT_CANONICAL_EXTERNAL_INDEX,
  LOCALNET_LIGHT_ACCOUNTS,
} from './lightCanonicalConfig.ts';
import type { LightRemainingAccountMeta } from './lightClient.ts';
import {
  REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
  REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
} from './registerCanonicalContract.ts';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

  return /^[A-Za-z0-9+/=]+$/.test(trimmed);
}

function decodeHexString(input: string): Uint8Array {
  const normalized = input.startsWith('0x') ? input.slice(2) : input;
  return Uint8Array.from(Buffer.from(normalized, 'hex'));
}

function decodeBase64String(input: string): Uint8Array {
  return Uint8Array.from(Buffer.from(input, 'base64'));
}

function isByteNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 255
    )
  );
}

function isByteLike(value: unknown): boolean {
  return (
    value instanceof Uint8Array ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) ||
    isByteNumberArray(value) ||
    (typeof value === 'string' &&
      (looksLikeHexString(value.trim()) || looksLikeBase64String(value.trim())))
  );
}

function toBytesDirect(value: unknown, label: string): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return Uint8Array.from(value);
  }

  if (isByteNumberArray(value)) {
    return Uint8Array.from(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      throw new Error(`${label} is empty`);
    }

    if (looksLikeHexString(trimmed)) {
      return decodeHexString(trimmed);
    }

    if (looksLikeBase64String(trimmed)) {
      return decodeBase64String(trimmed);
    }
  }

  throw new Error(`Could not normalize ${label} to bytes`);
}

function extractJsonRpcResult(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if (value.result !== undefined) {
    return value.result;
  }

  return value;
}

function extractPhotonValue(value: unknown): unknown {
  const result = extractJsonRpcResult(value);

  if (!isRecord(result)) {
    return result;
  }

  if (result.value !== undefined) {
    return result.value;
  }

  return result;
}

function extractFirstByteLike(
  value: unknown,
  visited = new Set<unknown>(),
  depth = 0
): unknown | null {
  if (value == null || depth > 10) {
    return null;
  }

  if (isByteLike(value)) {
    return value;
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
      if (found != null) {
        return found;
      }
    }
    return null;
  }

  const record = value as Record<string, unknown>;

  const preferredKeys = [
    'value',
    'bytes',
    'data',
    'serialized',
    'payload',
    'blob',
    'proof',
    'compressedProof',
    'proofBytes',
    'meta',
    'account',
    'compressedAccount',
    'compressed_account',
    'items',
    'raw',
    'result',
  ];

  for (const key of preferredKeys) {
    if (record[key] !== undefined) {
      const found = extractFirstByteLike(record[key], visited, depth + 1);
      if (found != null) {
        return found;
      }
    }
  }

  for (const inner of Object.values(record)) {
    const found = extractFirstByteLike(inner, visited, depth + 1);
    if (found != null) {
      return found;
    }
  }

  return null;
}

function toBytes(value: unknown, label: string): Uint8Array {
  const extracted = extractFirstByteLike(value);

  if (extracted == null) {
    throw new Error(`Could not normalize ${label} to bytes`);
  }

  return toBytesDirect(extracted, label);
}

function toNonEmptyBytes(value: unknown, label: string): Uint8Array {
  const bytes = toBytes(value, label);

  if (bytes.length === 0) {
    throw new Error(`${label} normalized to empty bytes`);
  }

  return bytes;
}

function toPublicKey(value: unknown, label: string): PublicKey {
  if (value instanceof PublicKey) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return new PublicKey(value.trim());
  }

  throw new Error(`Could not normalize ${label} to PublicKey`);
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

function extractRawAccountArray(value: unknown): unknown[] | null {
  const normalized = extractPhotonValue(value);

  if (Array.isArray(normalized)) {
    return normalized;
  }

  if (isRecord(normalized)) {
    for (const key of ['remainingAccounts', 'accounts', 'items', 'value', 'data']) {
      const candidate = normalized[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }

      if (isRecord(candidate) && Array.isArray(candidate.items)) {
        return candidate.items;
      }
    }

    if (normalized.value && isRecord(normalized.value) && Array.isArray(normalized.value.items)) {
      return normalized.value.items;
    }
  }

  return null;
}

function extractPublicKeyCandidates(
  value: unknown,
  visited = new Set<unknown>(),
  depth = 0
): Array<{ pubkey: PublicKey; role?: string }> {
  if (value == null || depth > 10) {
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
    ['owner', 'owner'],
    ['hash', 'hash'],
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

function normalizeExplicitAccounts(
  rawAccounts: unknown[],
  label: string
): LightRemainingAccountMeta[] {
  return rawAccounts
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

function preferWrappedOpaqueBytes(input: unknown): unknown {
  if (isRecord(input) && input.value !== undefined && isByteLike(input.value)) {
    return input.value;
  }

  return input;
}

function preserveOpaqueOrValueBytes(input: unknown): unknown {
  const result = extractJsonRpcResult(input);

  if (isRecord(result) && result.value !== undefined && isByteLike(result.value)) {
    return result.value;
  }

  if (isRecord(input) && input.value !== undefined && isByteLike(input.value)) {
    return input.value;
  }

  return preferWrappedOpaqueBytes(input);
}

export function looksLikeLiveLocalJsonFallbackBytes(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length === 0) {
    return false;
  }

  try {
    const text = new TextDecoder().decode(bytes).trim();
    if (!text.startsWith('{')) {
      return false;
    }

    const parsed = JSON.parse(text) as { kind?: unknown };
    return parsed?.kind === 'live-local-json-fallback';
  } catch {
    return false;
  }
}

function toStrictNonFallbackBytes(value: unknown, label: string): Uint8Array {
  const bytes = toNonEmptyBytes(value, label);

  if (looksLikeLiveLocalJsonFallbackBytes(bytes)) {
    throw new Error(`${label} normalized to live-local JSON fallback bytes`);
  }

  return bytes;
}

export function normalizeLiveProofToBytes(input: unknown): Uint8Array {
  return toNonEmptyBytes(extractPhotonValue(input), 'liveProof');
}

export function normalizeLiveCompressedMetaToBytes(input: unknown): Uint8Array {
  return toNonEmptyBytes(extractPhotonValue(input), 'liveCompressedMeta');
}

export function normalizeLiveNewAddressParamsToBytes(input: unknown): Uint8Array {
  return toNonEmptyBytes(preserveOpaqueOrValueBytes(input), 'liveNewAddressParams');
}

export function normalizeLivePackedAddressTreeInfoToBytes(input: unknown): Uint8Array {
  for (const root of collectValidityProofCandidateRoots(input)) {
    const normalized = tryNormalizePackedAddressTreeInfoFromRoot(root);
    if (normalized && normalized.length === 4) {
      return normalized;
    }
  }

  return toNonEmptyBytes(preferWrappedOpaqueBytes(input), 'livePackedAddressTreeInfo');
}

export function normalizeLiveRegisterProofToBytes(input: unknown): Uint8Array {
  return normalizeLiveValidityProofEnvelopeToBytes(input);
}

export function normalizeLiveSendProofToBytes(input: unknown): Uint8Array {
  return normalizeLiveValidityProofEnvelopeToBytes(input);
}

/**
 * Z odpowiedzi Photona `getValidityProof` (value / JSON-RPC) — indeksy korzeni użyte w proving.
 * Muszą być spójne z polem `rootIndex` w `CompressedAccountMeta` dla kont ujętych w dowodzie,
 * inaczej Groth16 → Custom 6043 na chainie.
 */
export function extractPhotonValidityProofRootIndicesForClaim(raw: unknown): number[] | null {
  const primary = extractPhotonValue(pickPhotonRpcEnvelopeForNormalize(raw));
  if (!isRecord(primary)) {
    return null;
  }
  let arr: unknown[] | null = null;
  if (Array.isArray(primary.rootIndices)) {
    arr = primary.rootIndices;
  } else if (Array.isArray(primary.root_indices)) {
    arr = primary.root_indices;
  } else if (isRecord(primary.value)) {
    const v = primary.value as Record<string, unknown>;
    if (Array.isArray(v.rootIndices)) {
      arr = v.rootIndices;
    } else if (Array.isArray(v.root_indices)) {
      arr = v.root_indices;
    }
  }
  if (!arr || arr.length === 0) {
    return null;
  }
  const out: number[] = [];
  for (const x of arr) {
    let n: number;
    if (typeof x === 'bigint') {
      n = Number(x);
    } else if (typeof x === 'number' && Number.isFinite(x)) {
      n = Math.trunc(x);
    } else if (typeof x === 'string' && /^\d+$/.test(x.trim())) {
      n = Number(x.trim());
    } else {
      continue;
    }
    if (!Number.isFinite(n) || n < 0 || n > 0xffff) {
      continue;
    }
    out.push(n);
  }
  return out.length > 0 ? out : null;
}

/** rootIndex (u16 LE) w `CompressedAccountMeta` — offsety 0–1. */
export function readClaimCompressedAccountMetaRootIndex(meta: Uint8Array): number {
  if (meta.length < 2) {
    return 0;
  }
  return meta[0]! | (meta[1]! << 8);
}

/**
 * `CompressedAccountMeta` (claim): rootIndex (u16 LE) na offsetach 0–1; offset 2 = proveByIndex.
 * Przy proveByIndex=1 root na chainie jest ignorowany — nie nadpisujemy.
 *
 * `getValidityProof` zwraca `rootIndices: [0,0]` jako indeksy tablicy `roots` w odpowiedzi,
 * nie jako `root_index` z Photona — nadpisanie 1037 → 0 daje CPI z zerowymi korzeniami (6043).
 */
export function patchClaimCompressedAccountMetaRootIndex(
  meta: Uint8Array,
  rootIndex: number
): Uint8Array {
  if (meta.length < 3) {
    return meta;
  }
  if (meta[2] !== 0) {
    return meta;
  }
  if (rootIndex < 0 || rootIndex > 0xffff) {
    return meta;
  }
  const existing = readClaimCompressedAccountMetaRootIndex(meta);
  if (rootIndex === 0 && existing > 0) {
    return meta;
  }
  if (rootIndex === existing) {
    return meta;
  }
  const out = Uint8Array.from(meta);
  out[0] = rootIndex & 0xff;
  out[1] = (rootIndex >> 8) & 0xff;
  return out;
}

/** Dopasuj meta do validity proof tylko gdy to nie kasuje sensownego root_index z Photona. */
export function alignClaimCompressedAccountMetaRootFromValidityProof(
  meta: Uint8Array,
  proofRootIndex: number | undefined
): Uint8Array {
  if (proofRootIndex == null || !Number.isFinite(proofRootIndex)) {
    return meta;
  }
  const idx = Math.trunc(proofRootIndex);
  if (idx < 0 || idx > 0xffff) {
    return meta;
  }
  return patchClaimCompressedAccountMetaRootIndex(meta, idx);
}

/** leafIndex u32 LE na offsetach 5–8 (po root + proveByIndex + tree/queue indices). */
export function patchClaimCompressedAccountMetaLeafIndex(
  meta: Uint8Array,
  leafIndex: number
): Uint8Array {
  if (meta.length < 9) {
    return meta;
  }
  const v = leafIndex >>> 0;
  if (v > 0xffffffff) {
    return meta;
  }
  const out = Uint8Array.from(meta);
  out[5] = v & 0xff;
  out[6] = (v >> 8) & 0xff;
  out[7] = (v >> 16) & 0xff;
  out[8] = (v >> 24) & 0xff;
  return out;
}

function pickPath(root: unknown, path: Array<string | number>): unknown {
  let current: unknown = root;

  for (const key of path) {
    if (Array.isArray(current)) {
      const index =
        typeof key === 'number'
          ? key
          : /^\d+$/.test(String(key))
            ? Number(key)
            : NaN;

      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }

      current = current[index];
      continue;
    }

    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function findCompressedProofInPayload(payload: unknown): unknown | null {
  const roots = [payload, extractPhotonValue(payload)];

  for (const root of roots) {
    if (root == null) continue;

    const directCandidates = [
      pickPath(root, ['compressedProof']),
      pickPath(root, ['compressed_proof']),
      pickPath(root, ['proof']),
      pickPath(root, ['zkp', 'compressedProof']),
      pickPath(root, ['zkp', 'compressed_proof']),
      pickPath(root, ['value', 'compressedProof']),
      pickPath(root, ['value', 'compressed_proof']),
      pickPath(root, ['value', 'proof']),
      pickPath(root, ['value', 0, 'compressedProof']),
      pickPath(root, ['value', 0, 'compressed_proof']),
      pickPath(root, ['value', 0, 'proof']),
      pickPath(root, ['result', 'compressedProof']),
      pickPath(root, ['result', 'compressed_proof']),
      pickPath(root, ['result', 'proof']),
      pickPath(root, ['data', 'compressedProof']),
      pickPath(root, ['data', 'compressed_proof']),
    ];

    for (const candidate of directCandidates) {
      if (candidate != null) {
        return candidate;
      }
    }

    const valueField = isRecord(root) ? root.value : undefined;
    if (Array.isArray(valueField)) {
      for (const item of valueField) {
        const nested = findCompressedProofInPayload(item);
        if (nested != null) {
          return nested;
        }
      }
    }
  }

  return null;
}

function tryFixedProofBytes(value: unknown, expectedLength: number, label: string): Uint8Array | null {
  try {
    const bytes = toBytesDirect(value, label);
    return bytes.length === expectedLength ? bytes : null;
  } catch {
    return null;
  }
}

function findProofPartDeep(
  root: unknown,
  targetKeys: string[],
  expectedLengths: number[],
  visited = new Set<unknown>(),
  depth = 0
): Uint8Array | null {
  if (root == null || depth > 10) {
    return null;
  }

  for (const expectedLength of expectedLengths) {
    const direct = tryFixedProofBytes(root, expectedLength, 'proofPart');
    if (direct) {
      return direct;
    }
  }

  if (typeof root !== 'object') {
    return null;
  }

  if (visited.has(root)) {
    return null;
  }
  visited.add(root);

  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findProofPartDeep(item, targetKeys, expectedLengths, visited, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const record = root as Record<string, unknown>;

  for (const key of targetKeys) {
    if (record[key] !== undefined) {
      const found = findProofPartDeep(
        record[key],
        targetKeys,
        expectedLengths,
        visited,
        depth + 1
      );
      if (found) {
        return found;
      }
    }
  }

  for (const inner of Object.values(record)) {
    const found = findProofPartDeep(inner, targetKeys, expectedLengths, visited, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function extractCompressedProofLikeDeep(
  payload: unknown
): { a: Uint8Array; b: Uint8Array; c: Uint8Array } | null {
  const a = findProofPartDeep(payload, ['a', 'pi_a', 'proof_a'], [32]);
  const b = findProofPartDeep(payload, ['b', 'pi_b', 'proof_b'], [64]);
  const c = findProofPartDeep(payload, ['c', 'pi_c', 'proof_c'], [32]);

  if (!a || !b || !c) {
    return null;
  }

  return { a, b, c };
}

function encodeValidityProof129FromCompressedProofLike(raw: unknown): Uint8Array | null {
  const extracted = extractCompressedProofLikeDeep(raw);
  if (!extracted) {
    return null;
  }

  const out = new Uint8Array(1 + 32 + 64 + 32);
  out[0] = 1;
  out.set(extracted.a, 1);
  out.set(extracted.b, 33);
  out.set(extracted.c, 97);
  return out;
}

function isByteArrayLikeValue(value: unknown): boolean {
  return (
    value instanceof Uint8Array ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 255
      ))
  );
}

function decodeLiveLocalOpaqueEnvelopeBytes(
  bytes: Uint8Array | Buffer
): { label: string; payload: unknown } | null {
  const buffer = Buffer.from(bytes);
  if (
    buffer.length < 8 ||
    buffer[0] !== 0x4c ||
    buffer[1] !== 0x4c ||
    buffer[2] !== 0x52 ||
    buffer[3] !== 0x42
  ) {
    return null;
  }

  const labelLength = buffer.readUInt32LE(4);
  const headerLength = 8 + labelLength;
  if (labelLength <= 0 || headerLength > buffer.length) {
    return null;
  }

  const label = buffer.subarray(8, headerLength).toString('utf8');
  const payloadText = buffer.subarray(headerLength).toString('utf8').trim();

  try {
    return { label, payload: JSON.parse(payloadText) };
  } catch {
    const coerced = coerceJsonLikeEnvelopePayload(payloadText);
    if (coerced !== payloadText) {
      return { label, payload: coerced };
    }
    return { label, payload: payloadText };
  }
}

/** Kanoniczny dekoder koperty LLRB (używany też w stealthTransactionFactory). */
export function decodeLiveLocalOpaqueEnvelopeFromBytes(
  bytes: Uint8Array | Buffer
): { label: string; payload: unknown } | null {
  const decoded = decodeLiveLocalOpaqueEnvelopeBytes(bytes);
  if (!decoded) {
    return null;
  }

  return {
    label: decoded.label,
    payload: coerceJsonLikeEnvelopePayload(decoded.payload),
  };
}

function encodeSendPackedAddressTreeInfoBytes(rootIndex: number): Uint8Array {
  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.send;
  const out = new Uint8Array(4);
  out[0] = canonical.merkleTree & 0xff;
  out[1] = canonical.addressQueue & 0xff;
  out[2] = rootIndex & 0xff;
  out[3] = (rootIndex >> 8) & 0xff;
  return out;
}

function encodeSendNewPaymentAddressPackedCanonical(params: {
  seed: Uint8Array;
  treeIndex: number;
  queueIndex: number;
  rootIndex: number;
  assignedToAccount?: boolean;
  assignedAccountIndex?: number;
}): Uint8Array {
  if (params.seed.length !== 32) {
    throw new Error(
      `send newPaymentAddress seed must be 32 bytes, got ${params.seed.length}`
    );
  }

  const out = new Uint8Array(38);
  out.set(params.seed, 0);
  out[32] = params.queueIndex & 0xff;
  out[33] = params.treeIndex & 0xff;
  out[34] = params.rootIndex & 0xff;
  out[35] = (params.rootIndex >> 8) & 0xff;
  out[36] = (params.assignedToAccount ?? REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT)
    ? 1
    : 0;
  out[37] =
    (params.assignedAccountIndex ?? REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX) &
    0xff;
  return out;
}

function seed32FromCompactSeed(seed: Uint8Array): Uint8Array {
  if (seed.length === 32) {
    return Uint8Array.from(seed);
  }
  const out = new Uint8Array(32);
  out.set(seed.subarray(0, Math.min(seed.length, 32)));
  return out;
}

function extractNewPaymentAddressSeedFromPayload(payload: unknown): Uint8Array | null {
  const coerced = coerceJsonLikeEnvelopePayload(payload);
  if (!isRecord(coerced) && !Array.isArray(coerced)) {
    if (isByteNumberArray(coerced)) {
      try {
        return seed32FromCompactSeed(Uint8Array.from(coerced));
      } catch {
        return null;
      }
    }
    return null;
  }

  const payloadValue =
    pickPath(coerced, ['value']) ??
    pickPath(coerced, ['newAddress']) ??
    pickPath(coerced, ['newPaymentAddress']);

  const firstValueRecord =
    (isRecord(payloadValue) ? payloadValue : null) ??
    (Array.isArray(payloadValue) && isRecord(payloadValue[0]) ? payloadValue[0] : null);

  const nestedNewAddress =
    pickPath(coerced, ['newAddress']) ?? pickPath(coerced, ['newPaymentAddress']);
  const nestedRecord = isRecord(nestedNewAddress) ? nestedNewAddress : null;

  const seedValue =
    pickPath(coerced, ['seed']) ??
    pickPath(nestedRecord, ['seed']) ??
    pickPath(firstValueRecord, ['seed']) ??
    (isByteNumberArray(payloadValue) ? payloadValue : undefined);

  if (!isByteNumberArray(seedValue)) {
    return null;
  }

  try {
    return seed32FromCompactSeed(Uint8Array.from(seedValue));
  } catch {
    return null;
  }
}

function extractNewPaymentAddressRootIndexFromPayload(payload: unknown): number | null {
  const coerced = coerceJsonLikeEnvelopePayload(payload);
  return (
    extractRootIndexFromPackedAddressPayload(coerced) ??
    (typeof pickPath(coerced, ['rootIndex']) === 'number'
      ? (pickPath(coerced, ['rootIndex']) as number)
      : null)
  );
}

function tryNormalizeNewPaymentAddressFromRoot(root: unknown): Uint8Array | null {
  if (root == null) {
    return null;
  }

  try {
    const direct = toBytesDirect(root, 'liveNewPaymentAddress.direct');
    if (direct.length === 38) {
      return direct;
    }
    if (direct.length > 0 && direct.length <= 32) {
      const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.send;
      const rootIndex = 0;
      return encodeSendNewPaymentAddressPackedCanonical({
        seed: seed32FromCompactSeed(direct),
        treeIndex: canonical.merkleTree,
        queueIndex: canonical.addressQueue,
        rootIndex,
      });
    }
  } catch {
    // not direct bytes
  }

  if (isByteArrayLikeValue(root)) {
    const envelope = decodeLiveLocalOpaqueEnvelopeBytes(root);
    if (envelope) {
      const payload = coerceJsonLikeEnvelopePayload(envelope.payload);
      const fromPayload = tryNormalizeNewPaymentAddressFromRoot(payload);
      if (fromPayload) {
        return fromPayload;
      }
    }
  }

  const seed = extractNewPaymentAddressSeedFromPayload(root);
  if (seed) {
    const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.send;
    const rootIndex = extractNewPaymentAddressRootIndexFromPayload(root) ?? 0;
    return encodeSendNewPaymentAddressPackedCanonical({
      seed,
      treeIndex: canonical.merkleTree,
      queueIndex: canonical.addressQueue,
      rootIndex,
      assignedToAccount: true,
      assignedAccountIndex: REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
    });
  }

  return null;
}

function extractRootIndexFromPackedAddressPayload(payload: unknown): number | null {
  const coerced = coerceJsonLikeEnvelopePayload(payload);

  const candidates = [
    pickPath(coerced, ['rootIndex']),
    pickPath(coerced, ['root_index']),
    pickPath(coerced, ['value', 0, 'rootIndex']),
    pickPath(coerced, ['value', 0, 'root_index']),
    pickPath(coerced, ['value', 0, 'rootSeq']),
    pickPath(coerced, ['value', 'rootIndex']),
    pickPath(coerced, ['value', 'rootIndices', 0]),
    pickPath(coerced, ['value', 'root_indices', 0]),
    pickPath(coerced, ['rootIndices', 0]),
    pickPath(coerced, ['root_indices', 0]),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

function tryNormalizePackedAddressTreeInfoFromRoot(root: unknown): Uint8Array | null {
  if (root == null) {
    return null;
  }

  try {
    const direct = toBytesDirect(root, 'livePackedAddressTreeInfo.direct');
    if (direct.length === 4) {
      return direct;
    }
  } catch {
    // not direct 4 B
  }

  if (isByteArrayLikeValue(root)) {
    const envelope = decodeLiveLocalOpaqueEnvelopeBytes(root);
    if (envelope) {
      const rootIndex = extractRootIndexFromPackedAddressPayload(
        coerceJsonLikeEnvelopePayload(envelope.payload)
      );
      if (rootIndex != null) {
        return encodeSendPackedAddressTreeInfoBytes(rootIndex);
      }
    }
  }

  const rootIndex = extractRootIndexFromPackedAddressPayload(root);
  if (rootIndex != null) {
    return encodeSendPackedAddressTreeInfoBytes(rootIndex);
  }

  return null;
}

/** JSON zapisany jako tablica kodów UTF-8 (błąd podwójnej serializacji) → obiekt. */
export function coerceJsonLikeEnvelopePayload(payload: unknown): unknown {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // continue
      }
    }
    if (/^\d+(?:\s*,\s*\d+)+$/.test(trimmed)) {
      try {
        const bytes = Uint8Array.from(
          trimmed.split(',').map((part) => Number(part.trim()))
        );
        return JSON.parse(Buffer.from(bytes).toString('utf8'));
      } catch {
        // continue
      }
    }
  }

  if (
    Array.isArray(payload) &&
    payload.length > 8 &&
    payload.every(
      (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 255
    )
  ) {
    try {
      return JSON.parse(Buffer.from(Uint8Array.from(payload)).toString('utf8'));
    } catch {
      // continue
    }
  }

  if (isRecord(payload) && Array.isArray(payload.data)) {
    const data = payload.data;
    if (
      data.every(
        (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 255
      )
    ) {
      try {
        return JSON.parse(Buffer.from(Uint8Array.from(data)).toString('utf8'));
      } catch {
        // continue
      }
    }
  }

  return payload;
}

function collectValidityProofCandidateRoots(input: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<unknown>();

  const push = (value: unknown) => {
    if (value == null || seen.has(value)) {
      return;
    }
    seen.add(value);
    out.push(value);
  };

  const visit = (value: unknown, depth = 0) => {
    if (value == null || depth > 4) {
      return;
    }

    push(value);

    if (isByteArrayLikeValue(value)) {
      const envelope = decodeLiveLocalOpaqueEnvelopeBytes(value);
      if (envelope) {
        push(coerceJsonLikeEnvelopePayload(envelope.payload));
      }
    }

    push(coerceJsonLikeEnvelopePayload(value));
    push(extractPhotonValue(value));

    if (!isRecord(value)) {
      return;
    }

    if (value.raw !== undefined) {
      visit(value.raw, depth + 1);
    }
    if (value.value !== undefined) {
      visit(value.value, depth + 1);
    }
  };

  visit(input);
  return out;
}

function tryNormalizeValidityProofFromRoot(root: unknown): Uint8Array | null {
  if (root == null) {
    return null;
  }

  try {
    const direct = toBytesDirect(root, 'liveValidityProof.direct');
    if (direct.length === 1) {
      return direct;
    }
    if (direct.length === 129 && direct[0] === 1) {
      return direct;
    }
  } catch {
    // not a direct byte blob
  }

  const compressedProof = findCompressedProofInPayload(root);
  if (compressedProof == null) {
    const deepEncoded = encodeValidityProof129FromCompressedProofLike(root);
    return deepEncoded;
  }

  const encoded = encodeValidityProof129FromCompressedProofLike(compressedProof);
  if (encoded) {
    return encoded;
  }

  if (isRecord(compressedProof)) {
    try {
      const a = toNonEmptyBytes(compressedProof.a, 'liveValidityProof.a');
      const b = toNonEmptyBytes(compressedProof.b, 'liveValidityProof.b');
      const c = toNonEmptyBytes(compressedProof.c, 'liveValidityProof.c');
    if (a.length === 32 && b.length === 64 && c.length === 32) {
      const out = new Uint8Array(1 + 32 + 64 + 32);
      out[0] = 1;
      out.set(a, 1);
      out.set(b, 33);
      out.set(c, 97);
      return out;
      }
    } catch {
      // try deep walk below
    }
  }

  return encodeValidityProof129FromCompressedProofLike(root);
}

/**
 * Kanoniczne 1 B (None) lub 129 B (Some compressed proof) z odpowiedzi Helius/Photon
 * (w tym `value` jako obiekt lub tablica oraz zagnieżdżone merkle fields).
 */
export function normalizeLiveValidityProofEnvelopeToBytes(input: unknown): Uint8Array {
  for (const root of collectValidityProofCandidateRoots(input)) {
    const normalized = tryNormalizeValidityProofFromRoot(root);
    if (normalized && (normalized.length === 1 || normalized.length === 129)) {
      return normalized;
    }
  }

  throw new Error(
    'Nie udało się znormalizować validity proof do 1 lub 129 bajtów (brak rozpoznawalnego compressedProof w odpowiedzi Helius/Photon).'
  );
}

export function normalizeLiveClaimProofToBytes(input: unknown): Uint8Array {
  return normalizeLiveValidityProofEnvelopeToBytes(input);
}

export function normalizeLiveRegisterMetaMetaToBytes(input: unknown): Uint8Array {
  return toNonEmptyBytes(extractPhotonValue(input), 'liveRegisterMetaMeta');
}

/**
 * light_sdk::instruction::CompressedAccountMeta (Anchor) = PackedStateTreeInfo + [u8;32] + u8
 * (bez lamportów — ten sam układ, co w programs/pierron-stealth claim_stealth).
 * Photon dla kont w kolejce wyjścia zwraca `data: null`; wtedy trzeba złożyć meta z
 * `merkleContext` + `address` + `leafIndex` + `proveByIndex`.
 */
function toPubkeyBase58ish(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim().length > 0) {
    return new PublicKey(value.trim()).toBase58();
  }
  try {
    return new PublicKey(value as any).toBase58();
  } catch {
    return null;
  }
}

function toU32Le(value: unknown, label: string): number {
  if (typeof value === 'bigint') {
    if (value < 0n || value > 0xffff_ffffn) {
      throw new Error(`${label} out of u32 range`);
    }
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0 || value > 0xffffffff) {
      throw new Error(`${label} out of u32 range`);
    }
    return value >>> 0;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return toU32Le(BigInt(value.trim()), label);
  }
  throw new Error(`${label} is not a u32-like value`);
}

function toU16LeFromRootHint(value: unknown, proveByIndex: boolean): number {
  if (proveByIndex) {
    return 0;
  }
  if (value == null) {
    return 0;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0 || value > 0xffff) {
      throw new Error('rootIndex out of u16');
    }
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    if (n < 0 || n > 0xffff) {
      throw new Error('rootIndex out of u16');
    }
    return n;
  }
  return 0;
}

/**
 * Kolejność kont w light CPI `tree_accounts` (addressTree, addressQueue, stateQueue, stateTree).
 * Indeksy w PackedStateTreeInfo odnoszą się do tej tabeli.
 */
const LOCALNET_TREE_CPI_PUBKEYS = [
  LOCALNET_LIGHT_ACCOUNTS.addressTree.toBase58(),
  LOCALNET_LIGHT_ACCOUNTS.addressQueue.toBase58(),
  LOCALNET_LIGHT_ACCOUNTS.stateQueue.toBase58(),
  LOCALNET_LIGHT_ACCOUNTS.stateTree.toBase58(),
] as const;

/**
 * Wartości `merkle_context.tree_type` (light_sdk::TreeType jako u16) z Photona v2.
 * 1=StateV1, 2=AddressV1, 3=StateV2, 4=AddressV2 — patrz light-compressed-account.
 */
function resolveCpiIndicesFromMerkleTreeType(
  treeType: unknown
): { merkleTreePubkeyIndex: number; queuePubkeyIndex: number } | null {
  if (treeType == null) {
    return null;
  }
  const t =
    typeof treeType === 'number' && Number.isFinite(treeType)
      ? treeType
      : typeof treeType === 'string' && /^\d+$/.test(treeType.trim())
        ? Number(treeType.trim())
        : NaN;
  if (!Number.isFinite(t)) {
    return null;
  }
  if (t === 1 || t === 3) {
    return { merkleTreePubkeyIndex: 3, queuePubkeyIndex: 2 };
  }
  if (t === 2 || t === 4) {
    return { merkleTreePubkeyIndex: 0, queuePubkeyIndex: 1 };
  }
  return null;
}

/**
 * Lokalne konta Light mają stabilne prefiksy base58 (np. kody smt+nfq, amt+aq).
 * Gdy dokładne pubkeyy nie są w LOCALNET_LIGHT_ACCOUNTS (inna instancja drzewa),
 * można wywnioskować indeksy CPI tak samo jak dla smt1/amt1.
 */
function guessCpiIndicesFromKnownLightAccountPrefixes(
  treePk: string,
  queuePk: string
): { merkleTreePubkeyIndex: number; queuePubkeyIndex: number } | null {
  if (treePk.startsWith('amt') && queuePk.startsWith('aq')) {
    return { merkleTreePubkeyIndex: 0, queuePubkeyIndex: 1 };
  }
  if (treePk.startsWith('smt') && queuePk.startsWith('nfq')) {
    return { merkleTreePubkeyIndex: 3, queuePubkeyIndex: 2 };
  }
  return null;
}

function resolveCpiTreeAndQueueIndices(
  treePk: string,
  queuePk: string,
  merkleContext: Record<string, unknown> | null
): { merkleTreePubkeyIndex: number; queuePubkeyIndex: number } | null {
  const merkleI = LOCALNET_TREE_CPI_PUBKEYS.indexOf(treePk);
  const queueI = LOCALNET_TREE_CPI_PUBKEYS.indexOf(queuePk);
  if (merkleI >= 0 && queueI >= 0) {
    return { merkleTreePubkeyIndex: merkleI, queuePubkeyIndex: queueI };
  }
  if (merkleContext) {
    const fromType = resolveCpiIndicesFromMerkleTreeType(
      merkleContext.treeType ?? merkleContext.tree_type
    );
    if (fromType) {
      return fromType;
    }
  }
  return guessCpiIndicesFromKnownLightAccountPrefixes(treePk, queuePk);
}

function tryEncodeLightSdkCompressedAccountMetaFromPhotonAccount(
  value: unknown
): Uint8Array | null {
  if (!isRecord(value)) {
    return null;
  }
  const root = value as Record<string, unknown>;
  const inner = isRecord(root.compressedAccount)
    ? (root.compressedAccount as Record<string, unknown>)
    : isRecord(root.account)
      ? (root.account as Record<string, unknown>)
      : root;
  const proveByIndex = Boolean(
    inner.proveByIndex ?? inner.prove_by_index ?? root.proveByIndex ?? root.prove_by_index
  );
  // Never use leaf `hash` as CompressedAccountMeta address — Groth16 public inputs use the
  // compressed account pubkey; hash-only getCompressedAccount responses caused Custom 6043.
  const addressStr =
    toPubkeyBase58ish(root._pierronAddressOverride) ??
    toPubkeyBase58ish(inner.address ?? root.address);
  if (!addressStr) {
    return null;
  }
  const leafIndexHint =
    inner.leafIndex ??
    inner.leaf_index ??
    root.leafIndex ??
    root.leaf_index ??
    inner.seq ??
    root.seq;
  const leafIndex =
    leafIndexHint == null ? 0 : toU32Le(leafIndexHint, 'leafIndex');
  const merkle =
    inner.merkleContext ?? inner.merkle_context ?? root.merkleContext ?? root.merkle_context;
  const merkleRec = isRecord(merkle) ? (merkle as Record<string, unknown>) : null;
  let treeStr: string | null = null;
  let queueStr: string | null = null;
  if (merkleRec) {
    treeStr = toPubkeyBase58ish(merkleRec.tree);
    queueStr = toPubkeyBase58ish(merkleRec.queue);
  }
  if (!treeStr) {
    treeStr = toPubkeyBase58ish(inner.tree ?? root.tree);
  }
  if (!treeStr) {
    return null;
  }
  if (!queueStr) {
    const st = LOCALNET_LIGHT_ACCOUNTS.stateTree.toBase58();
    const at = LOCALNET_LIGHT_ACCOUNTS.addressTree.toBase58();
    if (treeStr === st) {
      queueStr = LOCALNET_LIGHT_ACCOUNTS.stateQueue.toBase58();
    } else if (treeStr === at) {
      queueStr = LOCALNET_LIGHT_ACCOUNTS.addressQueue.toBase58();
    } else {
      return null;
    }
  }
  const idx = resolveCpiTreeAndQueueIndices(treeStr, queueStr, merkleRec);
  if (!idx) {
    return null;
  }
  const rootU16 = toU16LeFromRootHint(
    inner.rootIndex ?? inner.root_index ?? root.rootIndex ?? root.root_index,
    proveByIndex
  );
  const out = Buffer.alloc(2 + 1 + 1 + 1 + 4 + 32 + 1);
  let o = 0;
  out.writeUInt16LE(rootU16, o);
  o += 2;
  out.writeUInt8(proveByIndex ? 1 : 0, o);
  o += 1;
  out.writeUInt8(idx.merkleTreePubkeyIndex, o);
  o += 1;
  out.writeUInt8(idx.queuePubkeyIndex, o);
  o += 1;
  out.writeUInt32LE(leafIndex, o);
  o += 4;
  Buffer.from(new PublicKey(addressStr).toBytes()).copy(out, o);
  o += 32;
  // `output_state_tree_index` selects the CPI output Merkle slot from `tree_accounts()`.
  // Writing 0 would target the address tree (first slot); state accounts must match their tree idx.
  out.writeUInt8(idx.merkleTreePubkeyIndex & 0xff, o);
  return out;
}

export function normalizeLiveClaimerMetaToBytes(input: unknown): Uint8Array {
  const primary = extractPhotonValue(input);
  if (isRecord(primary)) {
    const pre = tryEncodeLightSdkCompressedAccountMetaFromPhotonAccount(primary);
    if (pre) {
      return pre;
    }
  }
  try {
    return toNonEmptyBytes(primary, 'liveClaimerMeta');
  } catch (first) {
    const synthetic = tryEncodeLightSdkCompressedAccountMetaFromPhotonAccount(
      isRecord(input) && (input as { value?: unknown }).value != null
        ? (input as { value: unknown }).value
        : primary
    );
    if (synthetic) {
      return synthetic;
    }
    throw first;
  }
}

export function normalizeLivePaymentMetaToBytes(input: unknown): Uint8Array {
  const primary = extractPhotonValue(input);
  if (primary == null) {
    throw new Error(
      'livePaymentMeta: Photon getCompressedAccount returned no account (value null). ' +
        'Check that the address is the new-payment leaf from the send proof, not a random key, and that the indexer has caught up.'
    );
  }
  if (isRecord(primary)) {
    const ownerItems = Array.isArray((primary as { items?: unknown[] }).items)
      ? ((primary as { items: unknown[] }).items ?? [])
      : [];
    for (const item of ownerItems) {
      const candidate =
        isRecord(item) && isRecord((item as { account?: unknown }).account)
          ? (item as { account: unknown }).account
          : item;
      if (isRecord(candidate)) {
        const byOwnerEncoded = tryEncodeLightSdkCompressedAccountMetaFromPhotonAccount(candidate);
        if (byOwnerEncoded) {
          return byOwnerEncoded;
        }
      }
    }

    const pre = tryEncodeLightSdkCompressedAccountMetaFromPhotonAccount(primary);
    if (pre) {
      return pre;
    }

    if (process?.env?.PIERRON_DEBUG_CLAIM_PAYMENT_META?.trim()?.toLowerCase() === '1') {
      try {
        // eslint-disable-next-line no-console
        console.log(
          '[normalizeLivePaymentMetaToBytes] primary preview',
          JSON.stringify(primary).slice(0, 2000)
        );
      } catch {
        // best-effort debug
      }
    }

    throw new Error('livePaymentMeta: could not synthesize CompressedAccountMeta from Photon record');
  }
  try {
    return toNonEmptyBytes(primary, 'livePaymentMeta');
  } catch (first) {
    const v =
      isRecord(input) && (input as { value?: unknown }).value != null
        ? (input as { value: unknown }).value
        : primary;
    const synthetic = tryEncodeLightSdkCompressedAccountMetaFromPhotonAccount(v);
    if (synthetic) {
      return synthetic;
    }
    try {
      return toNonEmptyBytes(input, 'livePaymentMeta.full');
    } catch {
      try {
        return toNonEmptyBytes(
          isRecord(input) && input.value != null ? input.value : primary,
          'livePaymentMeta.unwrappedValue'
        );
      } catch {
        throw first;
      }
    }
  }
}

export function normalizeLiveNewRegisterAddressToBytes(input: unknown): Uint8Array {
  return toNonEmptyBytes(preserveOpaqueOrValueBytes(input), 'liveNewRegisterAddress');
}

export function normalizeLiveNewPaymentAddressToBytes(input: unknown): Uint8Array {
  for (const root of collectValidityProofCandidateRoots(input)) {
    const normalized = tryNormalizeNewPaymentAddressFromRoot(root);
    if (normalized && normalized.length === 38) {
      return normalized;
    }
  }

  const preserved = preserveOpaqueOrValueBytes(input);
  try {
    const direct = toBytesDirect(preserved, 'liveNewPaymentAddress.direct');
    if (direct.length === 38) {
      return direct;
    }
  } catch {
    // not a direct 38-byte blob
  }

  if (isByteArrayLikeValue(preserved)) {
    const envelope = decodeLiveLocalOpaqueEnvelopeBytes(preserved);
    if (envelope) {
      const normalized = tryNormalizeNewPaymentAddressFromRoot(
        coerceJsonLikeEnvelopePayload(envelope.payload)
      );
      if (normalized && normalized.length === 38) {
        return normalized;
      }
    }
  }

  return toNonEmptyBytes(preserved, 'liveNewPaymentAddress');
}

export function normalizeLiveRemainingAccounts(
  input: unknown
): LightRemainingAccountMeta[] {
  const rawArray = extractRawAccountArray(input);

  let normalized: LightRemainingAccountMeta[] = [];

  if (rawArray) {
    normalized = normalizeExplicitAccounts(rawArray, 'liveRemainingAccounts');
  }

  if (normalized.length === 0) {
    normalized = extractPublicKeyCandidates(extractPhotonValue(input)).map((item) => ({
      pubkey: item.pubkey,
      isSigner: false,
      isWritable: true,
      role: item.role,
    }));
  }

  normalized = dedupeRemainingAccounts(normalized);

  if (normalized.length === 0) {
    throw new Error('liveRemainingAccounts normalized to an empty list');
  }

  return normalized;
}

export function normalizeLiveProofToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(extractPhotonValue(input), 'liveProof');
}

export function normalizeLiveCompressedMetaToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(extractPhotonValue(input), 'liveCompressedMeta');
}

export function normalizeLiveNewAddressParamsToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(preserveOpaqueOrValueBytes(input), 'liveNewAddressParams');
}

export function normalizeLivePackedAddressTreeInfoToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(preferWrappedOpaqueBytes(input), 'livePackedAddressTreeInfo');
}

export function normalizeLiveRegisterProofToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(extractPhotonValue(input), 'liveRegisterProof');
}

export function normalizeLiveSendProofToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(extractPhotonValue(input), 'liveSendProof');
}

export function normalizeLiveClaimProofToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(extractPhotonValue(input), 'liveClaimProof');
}

export function normalizeLiveRegisterMetaMetaToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(extractPhotonValue(input), 'liveRegisterMetaMeta');
}

export function normalizeLiveClaimerMetaToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(extractPhotonValue(input), 'liveClaimerMeta');
}

export function normalizeLivePaymentMetaToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(extractPhotonValue(input), 'livePaymentMeta');
}

export function normalizeLiveNewRegisterAddressToBytesStrict(input: unknown): Uint8Array {
  return toStrictNonFallbackBytes(preserveOpaqueOrValueBytes(input), 'liveNewRegisterAddress');
}

export function normalizeLiveNewPaymentAddressToBytesStrict(input: unknown): Uint8Array {
  const bytes = normalizeLiveNewPaymentAddressToBytes(input);
  if (bytes.length !== 38) {
    throw new Error(
      `liveNewPaymentAddress must normalize to 38 bytes, got ${bytes.length}`
    );
  }
  if (looksLikeLiveLocalJsonFallbackBytes(bytes)) {
    throw new Error('liveNewPaymentAddress normalized to live-local JSON fallback bytes');
  }
  return bytes;
}

/**
 * Wyciąga obiekt z JSON-RPC (np. pole `raw` z `{ value, raw }`) przed normalizacją meta.
 */
export function pickPhotonRpcEnvelopeForNormalize(fetched: unknown): unknown {
  if (!fetched || typeof fetched !== 'object') {
    return fetched;
  }
  const r = fetched as { raw?: unknown };
  if (r.raw !== undefined) {
    return r.raw;
  }
  return fetched;
}

function readBigUint64LE(bytes: Uint8Array, offset: number): bigint {
  if (offset < 0 || offset + 8 > bytes.length) {
    throw new Error('readBigUint64LE oob');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

function readBigInt64LE(bytes: Uint8Array, offset: number): bigint {
  if (offset < 0 || offset + 8 > bytes.length) {
    throw new Error('readBigInt64LE oob');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getBigInt64(0, true);
}

function tryPublicKeyField(value: unknown): PublicKey | null {
  if (value == null) {
    return null;
  }
  try {
    if (value instanceof PublicKey) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return new PublicKey(value.trim());
    }
    return new PublicKey(value as any);
  } catch {
    return null;
  }
}

function tryU64Bigint(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : null;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
}

function tryI64Bigint(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
}

function tryBoolField(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 0 || value === 1) {
    return value === 1;
  }
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase();
    if (t === 'true') {
      return true;
    }
    if (t === 'false') {
      return false;
    }
  }
  return null;
}

function collectPhotonStealthDecodeRecords(input: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<unknown>();

  const push = (value: unknown) => {
    if (!isRecord(value) || seen.has(value)) {
      return;
    }
    seen.add(value);
    out.push(value);
  };

  const visit = (value: unknown, depth = 0) => {
    if (value == null || depth > 6) {
      return;
    }

    const coerced = coerceJsonLikeEnvelopePayload(value);
    push(coerced);

    const inner = unwrapPhotonCompressedAccountEnvelope(coerced);
    if (inner) {
      push(inner);
    }

    const primary = extractPhotonValue(coerced);
    if (isRecord(primary)) {
      push(primary);
      if (Array.isArray((primary as { items?: unknown[] }).items)) {
        for (const item of (primary as { items: unknown[] }).items ?? []) {
          if (isRecord(item)) {
            push(item);
            if (isRecord((item as { account?: unknown }).account)) {
              push((item as { account: Record<string, unknown> }).account);
            }
          }
        }
      }
    }

    if (isRecord(coerced)) {
      for (const key of ['value', 'raw', 'account', 'compressedAccount', 'compressed_account']) {
        if (coerced[key] !== undefined) {
          visit(coerced[key], depth + 1);
        }
      }
    }
  };

  visit(input);
  return out;
}

function unwrapPhotonCompressedAccountEnvelope(value: unknown): Record<string, unknown> | null {
  const primary = extractPhotonValue(value);
  if (!isRecord(primary)) {
    return null;
  }
  if (isRecord(primary.compressedAccount)) {
    return primary.compressedAccount as Record<string, unknown>;
  }
  if (isRecord(primary.compressed_account)) {
    return primary.compressed_account as Record<string, unknown>;
  }
  if (isRecord(primary.account)) {
    return primary.account as Record<string, unknown>;
  }
  return primary;
}

function tryCoercePhotonByteField(raw: unknown, label: string): Uint8Array | null {
  if (raw == null) {
    return null;
  }
  try {
    return toBytesDirect(raw as unknown, label);
  } catch {
    return null;
  }
}

/**
 * CompressedAccountLegacy.data często ma kształt CompressedAccountData:
 * `{ discriminator: number[], data: <bytes>, dataHash: number[] }` (Photon / JSON-RPC).
 */
function tryExtractAccountDataBytes(inner: Record<string, unknown>): Uint8Array | null {
  const data = inner.data ?? inner.accountData ?? inner.account_data;
  if (data == null) {
    return null;
  }

  if (typeof data === 'string' && data.trim().length > 0) {
    try {
      const decoded = tryCoercePhotonByteField(
        Buffer.from(data.trim(), 'base64'),
        'compressedAccount.data.base64'
      );
      if (decoded && decoded.length > 0) {
        return decoded;
      }
    } catch {
      // not base64
    }
  }

  if (isRecord(data) && !isByteLike(data)) {
    const nested =
      (data as Record<string, unknown>).data ??
      (data as Record<string, unknown>).bytes ??
      (data as Record<string, unknown>).payload;
    const nestedBytes = tryCoercePhotonByteField(nested, 'CompressedAccountData.data');
    if (nestedBytes && nestedBytes.length > 0) {
      return nestedBytes;
    }
  }

  return tryCoercePhotonByteField(data, 'compressedAccount.data');
}

/** DFS po odpowiedzi RPC — szuka zagnieżdżonego leaf `data.data` lub surowego `data`. */
function tryExtractPhotonAccountLeafBytesDeep(root: unknown): Uint8Array | null {
  if (root === null || typeof root !== 'object') {
    return null;
  }
  const visited = new Set<unknown>();
  const minLen = 8;

  function visit(node: unknown): Uint8Array | null {
    if (node === null || typeof node !== 'object') {
      return null;
    }
    if (visited.has(node)) {
      return null;
    }
    visited.add(node);

    if (isRecord(node)) {
      const envelope =
        node.compressedAccount ?? node.compressed_account ?? node.account ?? null;
      if (envelope != null) {
        const fromEnv = visit(envelope);
        if (fromEnv) {
          return fromEnv;
        }
      }

      const extracted = tryExtractAccountDataBytes(node);
      if (extracted && extracted.length >= minLen) {
        return extracted;
      }

      for (const child of Object.values(node)) {
        const sub = visit(child);
        if (sub) {
          return sub;
        }
      }
    } else if (Array.isArray(node)) {
      for (const item of node) {
        const sub = visit(item);
        if (sub) {
          return sub;
        }
      }
    }
    return null;
  }

  return visit(root);
}

const STEALTH_META_ACCOUNT_PAYLOAD = 56;
const STEALTH_PAYMENT_ACCOUNT_PAYLOAD = 89;

/** Offsets: przy buforze 8+N bajtów prefiks musi być LIGHT_DISCRIMINATOR (nie mieszać z Borszem). */
function stealthMetaDecodeOffsets(totalLen: number): number[] {
  if (totalLen >= STEALTH_META_ACCOUNT_PAYLOAD + 8) {
    return [8];
  }
  if (totalLen === STEALTH_META_ACCOUNT_PAYLOAD) {
    return [0];
  }
  return [];
}

function stealthPaymentDecodeOffsets(totalLen: number): number[] {
  if (totalLen >= STEALTH_PAYMENT_ACCOUNT_PAYLOAD + 8) {
    return [8];
  }
  if (totalLen === STEALTH_PAYMENT_ACCOUNT_PAYLOAD) {
    return [0];
  }
  return [];
}

function decodeStealthMetaFromAccountDataBytes(bytes: Uint8Array): StealthMetaAccount | null {
  // Jednoznaczny rozmiar płatności bez prefiksu — nie parsuj jako meta (unikamy fałszywych dopasowań).
  if (bytes.length === STEALTH_PAYMENT_ACCOUNT_PAYLOAD) {
    return null;
  }

  const offsets = stealthMetaDecodeOffsets(bytes.length);
  for (const off of offsets) {
    if (bytes.length < off + STEALTH_META_ACCOUNT_PAYLOAD) {
      continue;
    }
    try {
      const slice = bytes.subarray(off, off + STEALTH_META_ACCOUNT_PAYLOAD);
      const owner = new PublicKey(slice.subarray(0, 32));
      const nonce = readBigUint64LE(slice, 32);
      const registeredAt = readBigInt64LE(slice, 40);
      const transactionCount = readBigUint64LE(slice, 48);
      return {
        owner,
        nonce,
        registeredAt,
        transactionCount,
      };
    } catch {
      // next offset
    }
  }
  return null;
}

function decodeStealthPaymentFromAccountDataBytes(bytes: Uint8Array): StealthPaymentAccount | null {
  if (bytes.length === STEALTH_META_ACCOUNT_PAYLOAD) {
    return null;
  }

  const offsets = stealthPaymentDecodeOffsets(bytes.length);
  for (const off of offsets) {
    if (bytes.length < off + STEALTH_PAYMENT_ACCOUNT_PAYLOAD) {
      continue;
    }
    try {
      const slice = bytes.subarray(off, off + STEALTH_PAYMENT_ACCOUNT_PAYLOAD);
      const stealthAddress = new PublicKey(slice.subarray(0, 32));
      const amount = readBigUint64LE(slice, 32);
      const createdAt = readBigInt64LE(slice, 40);
      const claimed = slice[48] !== 0;
      const senderHash = readBigUint64LE(slice, 49);
      const intendedClaimer = new PublicKey(slice.subarray(57, 89));
      return {
        stealthAddress,
        amount,
        createdAt,
        claimed,
        senderHash,
        intendedClaimer,
      };
    } catch {
      // next offset
    }
  }
  return null;
}

function decodeStealthMetaFromJsonFields(rec: Record<string, unknown>): StealthMetaAccount | null {
  const owner = tryPublicKeyField(rec.owner);
  const nonce = tryU64Bigint(rec.nonce);
  const registeredAt = tryI64Bigint(rec.registeredAt ?? rec.registered_at);
  const transactionCount = tryU64Bigint(rec.transactionCount ?? rec.transaction_count);
  if (
    owner &&
    nonce !== null &&
    registeredAt !== null &&
    transactionCount !== null
  ) {
    return {
      owner,
      nonce,
      registeredAt,
      transactionCount,
    };
  }
  const dataObj = rec.data;
  if (isRecord(dataObj) && !isByteLike(dataObj)) {
    const nested =
      decodeStealthMetaFromJsonFields(dataObj) ??
      (isRecord(dataObj.payload) ? decodeStealthMetaFromJsonFields(dataObj.payload) : null);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function decodeStealthPaymentFromJsonFields(
  rec: Record<string, unknown>
): StealthPaymentAccount | null {
  // Nie używaj `address` ani `hash` zk liścia zamiennie za stealthAddress — pole w Borschu
  // musi się zgadzać bitowo z CompressedAccount.data; błędny pubkey psuje dowód Groth16 (6043).
  const stealthAddress = tryPublicKeyField(rec.stealthAddress ?? rec.stealth_address);
  const amount = tryU64Bigint(rec.amount);
  const createdAt = tryI64Bigint(rec.createdAt ?? rec.created_at);
  const claimed = tryBoolField(rec.claimed);
  const senderHash = tryU64Bigint(rec.senderHash ?? rec.sender_hash);
  const intendedClaimer = tryPublicKeyField(
    rec.intendedClaimer ?? rec.intended_claimer
  );
  if (
    stealthAddress &&
    amount !== null &&
    createdAt !== null &&
    claimed !== null &&
    senderHash !== null &&
    intendedClaimer
  ) {
    return {
      stealthAddress,
      amount,
      createdAt,
      claimed,
      senderHash,
      intendedClaimer,
    };
  }
  const dataObj = rec.data;
  if (isRecord(dataObj) && !isByteLike(dataObj)) {
    const nested =
      decodeStealthPaymentFromJsonFields(dataObj) ??
      (isRecord(dataObj.payload)
        ? decodeStealthPaymentFromJsonFields(dataObj.payload)
        : null);
    if (nested) {
      return nested;
    }
  }
  return null;
}

/** Best-effort: pola JSON z Photona lub surowe `data` (z ewentualnym 8-bajtowym prefiksem). */
export function tryDecodeStealthMetaFromPhotonNormalizeInput(
  input: unknown
): StealthMetaAccount | null {
  const candidates = collectPhotonStealthDecodeRecords(input);
  const deepBytes = tryExtractPhotonAccountLeafBytesDeep(input);

  for (const rec of candidates) {
    const fromBytesDirect =
      tryExtractAccountDataBytes(rec) ??
      tryExtractPhotonAccountLeafBytesDeep(rec) ??
      deepBytes;
    if (fromBytesDirect) {
      const d = decodeStealthMetaFromAccountDataBytes(fromBytesDirect);
      if (d) {
        return d;
      }
    }
    const fromObj = decodeStealthMetaFromJsonFields(rec);
    if (fromObj) {
      return fromObj;
    }
  }

  return null;
}

/** StealthMeta tylko z bajtów leaf — bez JSON (Photon pola mogą nie pasować do Groth16). */
export function tryDecodeStealthMetaFromPhotonAccountBytesOnly(
  input: unknown
): StealthMetaAccount | null {
  const candidates = collectPhotonStealthDecodeRecords(input);
  const deepBytes = tryExtractPhotonAccountLeafBytesDeep(input);

  for (const rec of candidates) {
    const fromBytesDirect =
      tryExtractAccountDataBytes(rec) ??
      tryExtractPhotonAccountLeafBytesDeep(rec) ??
      deepBytes;
    if (fromBytesDirect) {
      const d = decodeStealthMetaFromAccountDataBytes(fromBytesDirect);
      if (d) {
        return d;
      }
    }
  }

  return null;
}

/** leaf_index z odpowiedzi Photona (do dopasowania CompressedAccountMeta do dowodu). */
export function extractPhotonAccountLeafIndexFromNormalizeInput(input: unknown): number | null {
  const primary = extractPhotonValue(pickPhotonRpcEnvelopeForNormalize(input));
  if (!isRecord(primary)) {
    return null;
  }
  const root = primary as Record<string, unknown>;
  const inner = isRecord(root.compressedAccount)
    ? (root.compressedAccount as Record<string, unknown>)
    : isRecord(root.account)
      ? (root.account as Record<string, unknown>)
      : root;
  const leafIndexHint =
    inner.leafIndex ??
    inner.leaf_index ??
    root.leafIndex ??
    root.leaf_index ??
    inner.seq ??
    root.seq;
  if (leafIndexHint == null) {
    return null;
  }
  try {
    return toU32Le(leafIndexHint, 'leafIndex');
  } catch {
    return null;
  }
}

export function tryDecodeStealthPaymentFromPhotonNormalizeInput(
  input: unknown
): StealthPaymentAccount | null {
  const candidates = collectPhotonStealthDecodeRecords(input);
  const deepBytes = tryExtractPhotonAccountLeafBytesDeep(input);

  for (const rec of candidates) {
    const fromBytesDirect =
      tryExtractAccountDataBytes(rec) ??
      tryExtractPhotonAccountLeafBytesDeep(rec) ??
      deepBytes;
    if (fromBytesDirect) {
      const d = decodeStealthPaymentFromAccountDataBytes(fromBytesDirect);
      if (d) {
        return d;
      }
    }
    const fromObj = decodeStealthPaymentFromJsonFields(rec);
    if (fromObj) {
      return fromObj;
    }
  }

  return null;
}

/** StealthPayment tylko z bajtów leaf — bez JSON (Photon pola mogą nie pasować do Groth16). */
export function tryDecodeStealthPaymentFromPhotonAccountBytesOnly(
  input: unknown
): StealthPaymentAccount | null {
  const candidates = collectPhotonStealthDecodeRecords(input);
  const deepBytes = tryExtractPhotonAccountLeafBytesDeep(input);

  for (const rec of candidates) {
    const fromBytesDirect =
      tryExtractAccountDataBytes(rec) ??
      tryExtractPhotonAccountLeafBytesDeep(rec) ??
      deepBytes;
    if (fromBytesDirect) {
      const d = decodeStealthPaymentFromAccountDataBytes(fromBytesDirect);
      if (d) {
        return d;
      }
    }
  }

  return null;
}

export function summarizeNormalizedLiveBytes(label: string, bytes: Uint8Array): string {
  return `${label}: ${bytes.length} B`;
}

export function summarizeNormalizedLiveRemainingAccounts(
  accounts: LightRemainingAccountMeta[]
): string[] {
  return accounts.map((account, index) => {
    return [
      `#${index}`,
      account.pubkey.toBase58(),
      `signer=${account.isSigner ? 'yes' : 'no'}`,
      `writable=${account.isWritable ? 'yes' : 'no'}`,
      `role=${account.role ?? 'unset'}`,
    ].join(' | ');
  });
}
