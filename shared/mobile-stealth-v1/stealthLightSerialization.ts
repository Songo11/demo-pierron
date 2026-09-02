import {
  coerceJsonLikeEnvelopePayload,
  normalizeLiveClaimerMetaToBytes,
  normalizeLivePaymentMetaToBytes,
  normalizeLiveRegisterMetaMetaToBytes,
  normalizeLiveValidityProofEnvelopeToBytes,
} from '../light/lightLiveLocalNormalization.ts';
import type { LightSerializationKind } from '../light/lightClient.ts';
import type {
  ValidityProofInput,
  PackedAddressTreeInfoInput,
  NewAddressParamsAssignedPackedInput,
} from './stealthInstructionBuilder.ts';

export type SerializedLightInputProvenance = {
  kind: LightSerializationKind;
  note?: string;
};

export type SerializedLightInputs = {
  proofSerialized: Buffer;
  addressTreeInfoSerialized?: Buffer;
  claimerMetaSerialized?: Buffer;
  paymentMetaSerialized?: Buffer;
  metaMetaSerialized?: Buffer | null;
  maybeNewAddressSerialized?: Buffer | null;
  maybeNewPaymentAddressSerialized?: Buffer | null;

  validityProofInput?: ValidityProofInput | null;
  packedAddressTreeInfoInput?: PackedAddressTreeInfoInput | null;
  maybeNewAddressInput?: NewAddressParamsAssignedPackedInput | null;
  maybeNewPaymentAddressInput?: NewAddressParamsAssignedPackedInput | null;

  provenance: {
    proof: SerializedLightInputProvenance;
    addressTreeInfo?: SerializedLightInputProvenance;
    claimerMeta?: SerializedLightInputProvenance;
    paymentMeta?: SerializedLightInputProvenance;
    metaMeta?: SerializedLightInputProvenance | null;
    maybeNewAddress?: SerializedLightInputProvenance | null;
    maybeNewPaymentAddress?: SerializedLightInputProvenance | null;
  };

  canonicalOnly: boolean;
  debugOnly: boolean;
};

export type TaggedLightSerializationInput = {
  bytes: Buffer | Uint8Array | number[];
  serializationKind?: Exclude<LightSerializationKind, 'placeholder'>;
  note?: string;
};

/**
 * Tymczasowy minimalny input debugowy dla CompressedAccountMeta.
 *
 * Uwaga:
 * To NIE jest potwierdzona pełna serializacja typu Light.
 * Używamy tego tylko tam, gdzie świadomie chcemy zasymulować
 * niezerowy address dla prostych testów/debug flow.
 */
export type SimpleCompressedAccountMetaInput = {
  address: Uint8Array | number[];
};

type NormalizedTaggedLightBlob = {
  buffer: Buffer;
  provenance: SerializedLightInputProvenance;
};

type NormalizeTaggedLightBlobOptions = {
  allowJsonFallback?: boolean;
  allowPlaceholder?: boolean;
};

type JsonFallbackEnvelope = {
  kind: 'live-local-json-fallback';
  label?: string;
  payload?: unknown;
  reason?: string;
  request?: unknown;
  runtime?: unknown;
  owner?: string;
  address?: string;
};

type LiveLocalOpaqueEnvelope = {
  label: string;
  payload: unknown;
};

type JsonRecord = Record<string, unknown>;

function fixed32(bytes: Uint8Array | number[], label: string): Buffer {
  const arr = Uint8Array.from(bytes);

  if (arr.length !== 32) {
    throw new Error(`${label} musi mieć dokładnie 32 bajty, a ma ${arr.length}.`);
  }

  return Buffer.from(arr);
}

function normalizeNonEmptyBuffer(
  input: Buffer | Uint8Array | number[],
  label: string
): Buffer {
  if (Buffer.isBuffer(input)) {
    if (input.length === 0) {
      throw new Error(`${label} nie może być puste.`);
    }

    return Buffer.from(input);
  }

  const arr = Uint8Array.from(input);

  if (arr.length === 0) {
    throw new Error(`${label} nie może być puste.`);
  }

  return Buffer.from(arr);
}

function isTaggedLightSerializationInput(
  input: unknown
): input is TaggedLightSerializationInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false;
  }

  return 'bytes' in (input as Record<string, unknown>);
}

function isSimpleCompressedAccountMetaInput(
  input: unknown
): input is SimpleCompressedAccountMetaInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false;
  }

  return 'address' in (input as Record<string, unknown>);
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

  if (!/[+/=]/.test(trimmed)) {
    return false;
  }

  return true;
}

function toBufferFromUnknownByteLike(value: unknown, label: string): Buffer {
  if (Buffer.isBuffer(value)) {
    if (value.length === 0) {
      throw new Error(`${label} nie może być puste.`);
    }
    return Buffer.from(value);
  }

  if (value instanceof Uint8Array) {
    if (value.length === 0) {
      throw new Error(`${label} nie może być puste.`);
    }
    return Buffer.from(value);
  }

  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 255
    )
  ) {
    return Buffer.from(Uint8Array.from(value));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (looksLikeHexString(trimmed)) {
      const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
      return Buffer.from(normalized, 'hex');
    }

    if (looksLikeBase64String(trimmed)) {
      const decoded = Buffer.from(trimmed, 'base64');
      if (decoded.length > 0) {
        return decoded;
      }
    }
  }

  throw new Error(`${label} nie jest bajtowym payloadem.`);
}

function tryDecodeUnknownByteLike(value: unknown, label: string): Buffer | null {
  try {
    return toBufferFromUnknownByteLike(value, label);
  } catch {
    return null;
  }
}

function decodeJsonFallbackEnvelope(buf: Buffer): JsonFallbackEnvelope | null {
  try {
    const text = buf.toString('utf8').trim();

    if (!text.startsWith('{')) {
      return null;
    }

    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    if ((parsed as { kind?: unknown }).kind !== 'live-local-json-fallback') {
      return null;
    }

    return parsed as JsonFallbackEnvelope;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeLiveLocalOpaqueEnvelope(buf: Buffer): LiveLocalOpaqueEnvelope | null {
  if (buf.length < 8) {
    return null;
  }

  if (
    buf[0] !== 0x4c ||
    buf[1] !== 0x4c ||
    buf[2] !== 0x52 ||
    buf[3] !== 0x42
  ) {
    return null;
  }

  const labelLength = buf.readUInt32LE(4);
  const headerLength = 8 + labelLength;

  if (labelLength <= 0 || headerLength > buf.length) {
    return null;
  }

  const label = buf.subarray(8, headerLength).toString('utf8');
  const payloadBytes = buf.subarray(headerLength);
  const payloadText = payloadBytes.toString('utf8').trim();

  try {
    return {
      label,
      payload: JSON.parse(payloadText),
    };
  } catch {
    return {
      label,
      payload: payloadText,
    };
  }
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

    current = current[key as keyof typeof current];
  }

  return current;
}

function readByteArrayFixed(
  value: unknown,
  label: string,
  expectedLength: number
): Buffer {
  if (!Array.isArray(value)) {
    throw new Error(`${label} nie jest tablicą bajtów.`);
  }

  const buf = Buffer.from(value);
  if (buf.length !== expectedLength) {
    throw new Error(`${label} musi mieć ${expectedLength} bajtów, ma ${buf.length}.`);
  }

  return buf;
}

function readByteArray32(value: unknown, label: string): Buffer {
  return readByteArrayFixed(value, label, 32);
}

function readByteArray64(value: unknown, label: string): Buffer {
  return readByteArrayFixed(value, label, 64);
}

function encodeCompressedProof(input: {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}): Buffer {
  return Buffer.concat([input.a, input.b, input.c]);
}

function encodeValidityProofSome(compressedProof: Buffer): Buffer {
  return Buffer.concat([Buffer.from([1]), compressedProof]);
}

function decodeValidityProofInputFrom129(
  buffer: Buffer
): ValidityProofInput | null {
  if (buffer.length !== 129 || buffer[0] !== 1) {
    return null;
  }

  return {
    compressedProof: {
      a: Buffer.from(buffer.subarray(1, 33)),
      b: Buffer.from(buffer.subarray(33, 97)),
      c: Buffer.from(buffer.subarray(97, 129)),
    },
  };
}

function decodePackedAddressTreeInfoInputFrom4(
  buffer: Buffer
): PackedAddressTreeInfoInput | null {
  if (buffer.length !== 4) {
    return null;
  }

  return {
    addressMerkleTreePubkeyIndex: buffer.readUInt8(0),
    addressQueuePubkeyIndex: buffer.readUInt8(1),
    rootIndex: buffer.readUInt16LE(2),
  };
}

function decodeNewAddressParamsAssignedPackedInputFrom38(
  buffer: Buffer
): NewAddressParamsAssignedPackedInput | null {
  if (buffer.length !== 38) {
    return null;
  }

  return {
    seed: Buffer.from(buffer.subarray(0, 32)),
    addressQueueAccountIndex: buffer.readUInt8(32),
    addressMerkleTreeAccountIndex: buffer.readUInt8(33),
    addressMerkleTreeRootIndex: buffer.readUInt16LE(34),
    assignedToAccount: buffer.readUInt8(36) === 1,
    assignedAccountIndex: buffer.readUInt8(37),
  };
}

function decodePackedAddressTreeInfoInputFromEnvelope(
  payload: unknown
): PackedAddressTreeInfoInput | null {
  const directStruct = isRecord(payload) ? payload : null;

  const directMerkleTreeIndex =
    pickPath(directStruct, ['addressMerkleTreePubkeyIndex']) ??
    pickPath(directStruct, ['address_merkle_tree_pubkey_index']);

  const directQueueIndex =
    pickPath(directStruct, ['addressQueuePubkeyIndex']) ??
    pickPath(directStruct, ['address_queue_pubkey_index']);

  const directRootIndex =
    pickPath(directStruct, ['rootIndex']) ??
    pickPath(directStruct, ['root_index']);

  if (
    typeof directMerkleTreeIndex === 'number' &&
    typeof directQueueIndex === 'number' &&
    typeof directRootIndex === 'number'
  ) {
    return {
      addressMerkleTreePubkeyIndex: directMerkleTreeIndex,
      addressQueuePubkeyIndex: directQueueIndex,
      rootIndex: directRootIndex,
    };
  }

  const firstEntry =
    pickPath(payload, ['value', 0]) ??
    pickPath(payload, ['value', '0']) ??
    (Array.isArray(payload) ? payload[0] : undefined);

  const rootIndex =
    pickPath(firstEntry, ['rootSeq']) ??
    pickPath(firstEntry, ['root_index']) ??
    pickPath(firstEntry, ['rootIndex']);

  if (typeof rootIndex !== 'number') {
    return null;
  }

  const addressMerkleTreePubkeyIndex = 8;
  const addressQueuePubkeyIndex = 9;

  return {
    addressMerkleTreePubkeyIndex,
    addressQueuePubkeyIndex,
    rootIndex,
  };
}

function extractFirstByteLike(
  value: unknown,
  visited = new Set<unknown>(),
  depth = 0
): unknown | null {
  if (value == null || depth > 10) {
    return null;
  }

  const direct = tryDecodeUnknownByteLike(value, 'extractFirstByteLike');
  if (direct) {
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

function maybeNormalizeLiveLocalEnvelope(
  buffer: Buffer,
  label: string
): { buffer: Buffer; note?: string } | null {
  const envelope = decodeLiveLocalOpaqueEnvelope(buffer);

  if (!envelope) {
    return null;
  }

  envelope.payload = coerceJsonLikeEnvelopePayload(envelope.payload);

  if (
    label === 'ValidityProof.send' ||
    label === 'ValidityProof.register' ||
    label === 'ValidityProof.claim'
  ) {
    if (buffer.length === 129 && buffer[0] === 1) {
      return {
        buffer: Buffer.from(buffer),
        note: `canonical validity proof blob (${buffer.length} B)`,
      };
    }
  }

  const embeddedJsonFallback =
    typeof envelope.payload === 'object' && envelope.payload != null
      ? decodeJsonFallbackEnvelope(Buffer.from(JSON.stringify(envelope.payload), 'utf8'))
      : null;

  if (embeddedJsonFallback) {
    throw new Error(
      [
        `${label} zawiera live-local JSON fallback zamiast kanonicznego binarnego payloadu.`,
        embeddedJsonFallback.reason
          ? `Reason: ${embeddedJsonFallback.reason}`
          : embeddedJsonFallback.label
            ? `Source: ${embeddedJsonFallback.label}`
            : undefined,
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  if (
    label === 'ValidityProof.send' ||
    label === 'ValidityProof.register' ||
    label === 'ValidityProof.claim'
  ) {
    try {
      const normalized = normalizeLiveValidityProofEnvelopeToBytes(envelope.payload);
      if (normalized.length === 1 || normalized.length === 129) {
        return {
          buffer: Buffer.from(normalized),
          note: `decoded live-local envelope for ${label}: ${envelope.label} (normalizeLiveValidityProofEnvelopeToBytes)`,
        };
      }
    } catch {
      // fall through to legacy envelope parsing
    }

    const compressedProof =
      pickPath(envelope.payload, ['value', 'compressedProof']) ??
      pickPath(envelope.payload, ['value', 'compressed_proof']) ??
      pickPath(envelope.payload, ['value', 0, 'compressedProof']) ??
      pickPath(envelope.payload, ['value', 0, 'compressed_proof']) ??
      pickPath(envelope.payload, ['value', 'value', 'compressedProof']) ??
      pickPath(envelope.payload, ['value', 'value', 'compressed_proof']) ??
      pickPath(envelope.payload, ['compressedProof']) ??
      pickPath(envelope.payload, ['compressed_proof']);

    if (compressedProof != null) {
      const a = readByteArray32(
        pickPath(compressedProof, ['a']),
        'ValidityProof.compressedProof.a'
      );
      const b = readByteArray64(
        pickPath(compressedProof, ['b']),
        'ValidityProof.compressedProof.b'
      );
      const c = readByteArray32(
        pickPath(compressedProof, ['c']),
        'ValidityProof.compressedProof.c'
      );

      return {
        buffer: encodeValidityProofSome(encodeCompressedProof({ a, b, c })),
        note: `decoded live-local envelope for ${label}: ${envelope.label}`,
      };
    }

    const extracted = extractFirstByteLike(envelope.payload);
    if (extracted != null) {
      const bytes = tryDecodeUnknownByteLike(extracted, `${label}.byteLike`);
      if (bytes && (bytes.length === 1 || bytes.length === 129)) {
        return {
          buffer: bytes,
          note: `decoded live-local envelope for ${label}: ${envelope.label} -> byteLike`,
        };
      }
    }

    const payloadKind = Array.isArray(envelope.payload)
      ? `array(len=${envelope.payload.length})`
      : typeof envelope.payload === 'object' && envelope.payload != null
        ? `object(keys=${Object.keys(envelope.payload as object).slice(0, 8).join(',')})`
        : typeof envelope.payload;

    throw new Error(
      [
        `${label} envelope nie zawiera compressedProof ani poprawnego byte-like proof blob (1 lub 129 B).`,
        `envelope.label=${String(envelope.label)}`,
        `payload.kind=${payloadKind}`,
        'Sprawdź Helius API key (Ustawienia) i ponów przygotuj send_stealth.',
      ].join('\n')
    );
  }

  return {
    buffer,
    note: `preserved live-local envelope: ${envelope.label}`,
  };
}

function maybeNormalizeJsonFallbackValidityProof(
  buffer: Buffer,
  label: string
): { buffer: Buffer; note?: string } | null {
  if (
    label !== 'ValidityProof.send' &&
    label !== 'ValidityProof.register' &&
    label !== 'ValidityProof.claim'
  ) {
    return null;
  }

  const fallback = decodeJsonFallbackEnvelope(buffer);
  if (!fallback) {
    return null;
  }

  try {
    const normalized = normalizeLiveValidityProofEnvelopeToBytes(fallback.payload);
    if (normalized.length === 1 || normalized.length === 129) {
      return {
        buffer: Buffer.from(normalized),
        note: `decoded json_fallback payload for ${label}${
          fallback.label ? `: ${fallback.label}` : ''
        } (normalizeLiveValidityProofEnvelopeToBytes)`,
      };
    }
  } catch {
    // fall through
  }

  const compressedProof =
    pickPath(fallback.payload, ['value', 'compressedProof']) ??
    pickPath(fallback.payload, ['value', 'compressed_proof']) ??
    pickPath(fallback.payload, ['value', 0, 'compressedProof']) ??
    pickPath(fallback.payload, ['value', 0, 'compressed_proof']) ??
    pickPath(fallback.payload, ['value', 'value', 'compressedProof']) ??
    pickPath(fallback.payload, ['value', 'value', 'compressed_proof']) ??
    pickPath(fallback.payload, ['compressedProof']) ??
    pickPath(fallback.payload, ['compressed_proof']);

  if (compressedProof != null) {
    const a = readByteArray32(
      pickPath(compressedProof, ['a']),
      'ValidityProof.compressedProof.a'
    );
    const b = readByteArray64(
      pickPath(compressedProof, ['b']),
      'ValidityProof.compressedProof.b'
    );
    const c = readByteArray32(
      pickPath(compressedProof, ['c']),
      'ValidityProof.compressedProof.c'
    );

    return {
      buffer: encodeValidityProofSome(encodeCompressedProof({ a, b, c })),
      note: `decoded json_fallback payload for ${label}${
        fallback.label ? `: ${fallback.label}` : ''
      }`,
    };
  }

  const extracted = extractFirstByteLike(fallback.payload);
  if (extracted != null) {
    const bytes = tryDecodeUnknownByteLike(extracted, `${label}.byteLike`);
    if (bytes && (bytes.length === 1 || bytes.length === 129)) {
      return {
        buffer: bytes,
        note: `decoded json_fallback byte-like payload for ${label}${
          fallback.label ? `: ${fallback.label}` : ''
        }`,
      };
    }
  }

  throw new Error(
    [
      `${label} json_fallback payload nie zawiera compressedProof ani poprawnego byte-like proof blob (1 lub 129 B).`,
      fallback.reason ? `reason=${fallback.reason}` : undefined,
      fallback.label ? `source=${fallback.label}` : undefined,
    ]
      .filter(Boolean)
      .join('\n')
  );
}

/**
 * Wyciąga kanoniczne bajty compressed-account meta z owrapowania live-local JSON
 * (gdy `wrapByteLikeResult` w indexerze zwróci pełną odpowiedź zamiast samego `data`).
 */
function maybeNormalizeJsonFallbackCompressedAccountMeta(
  buffer: Buffer,
  label: string
): { buffer: Buffer; note?: string } | null {
  if (
    label !== 'CompressedAccountMeta.claimer' &&
    label !== 'CompressedAccountMeta.payment' &&
    label !== 'CompressedAccountMeta.register'
  ) {
    return null;
  }

  const fallback = decodeJsonFallbackEnvelope(buffer);
  if (!fallback) {
    return null;
  }

  const metaNote = (s: string) =>
    `decoded json_fallback compressed account meta for ${label}${
      fallback.label ? `: ${fallback.label}` : ''
    } (${s})`;

  try {
    if (label === 'CompressedAccountMeta.claimer') {
      const b = normalizeLiveClaimerMetaToBytes(fallback.payload);
      return { buffer: Buffer.from(b), note: metaNote('lightLiveLocalNormalization') };
    }
    if (label === 'CompressedAccountMeta.register') {
      const b = normalizeLiveRegisterMetaMetaToBytes(fallback.payload);
      return { buffer: Buffer.from(b), note: metaNote('lightLiveLocalNormalization') };
    }
  } catch {
    // try heurystyka poniżej
  }

  if (label === 'CompressedAccountMeta.payment') {
    try {
      const b = normalizeLivePaymentMetaToBytes(fallback.payload);
      return { buffer: Buffer.from(b), note: metaNote('lightLiveLocalNormalization') };
    } catch {
      // heurystyka poniżej
    }
  }

  const roots: unknown[] = [fallback.payload, fallback.request, fallback];
  for (const root of roots) {
    if (root == null) continue;
    const extracted = extractFirstByteLike(root);
    if (extracted == null) continue;
    const bytes = tryDecodeUnknownByteLike(extracted, `${label}.byteLike`);
    if (bytes && bytes.length >= 1) {
      return {
        buffer: bytes,
        note: metaNote('extractFirstByteLike'),
      };
    }
  }

  throw new Error(
    [
      `${label} json_fallback nie zawiera wyciągalnych bajtów compressed account meta.`,
      fallback.reason ? `reason=${fallback.reason}` : undefined,
      fallback.label ? `source=${fallback.label}` : undefined,
    ]
      .filter(Boolean)
      .join('\n')
  );
}

function ensureAllowedSerializationKind(params: {
  label: string;
  buffer: Buffer;
  provenance: SerializedLightInputProvenance;
  allowJsonFallback: boolean;
  allowPlaceholder: boolean;
}): void {
  const { label, buffer, provenance, allowJsonFallback, allowPlaceholder } = params;

  if (provenance.kind === 'json_fallback' && !allowJsonFallback) {
    throw new Error(
      `${label} ma serializationKind=json_fallback i nie może być użyte jako raw blob contract.`
    );
  }

  if (provenance.kind === 'placeholder' && !allowPlaceholder) {
    throw new Error(
      `${label} ma serializationKind=placeholder i nie może być użyte jako raw blob contract.`
    );
  }

  const embeddedFallback = decodeJsonFallbackEnvelope(buffer);
  if (embeddedFallback && !allowJsonFallback) {
    throw new Error(
      [
        `${label} zawiera live-local JSON fallback zamiast kanonicznego, binarnego payloadu.`,
        embeddedFallback.reason
          ? `Reason: ${embeddedFallback.reason}`
          : embeddedFallback.label
            ? `Source: ${embeddedFallback.label}`
            : undefined,
      ]
        .filter(Boolean)
        .join(' ')
    );
  }
}

function normalizeTaggedLightBlob(
  input: Buffer | Uint8Array | number[] | TaggedLightSerializationInput,
  label: string,
  options?: NormalizeTaggedLightBlobOptions
): NormalizedTaggedLightBlob {
  const allowJsonFallback = options?.allowJsonFallback ?? false;
  const allowPlaceholder = options?.allowPlaceholder ?? false;

  const normalized: NormalizedTaggedLightBlob = isTaggedLightSerializationInput(input)
    ? {
        buffer: normalizeNonEmptyBuffer(input.bytes, label),
        provenance: {
          kind: input.serializationKind ?? 'canonical',
          note: input.note,
        },
      }
    : {
        buffer: normalizeNonEmptyBuffer(input, label),
        provenance: {
          kind: 'canonical',
        },
      };

  const normalizedLiveLocal = maybeNormalizeLiveLocalEnvelope(normalized.buffer, label);
  if (normalizedLiveLocal) {
    normalized.buffer = normalizedLiveLocal.buffer;
    normalized.provenance = {
      ...normalized.provenance,
      note:
        [normalized.provenance.note, normalizedLiveLocal.note].filter(Boolean).join(' | ') ||
        undefined,
    };
  }

  const normalizedJsonFallback = maybeNormalizeJsonFallbackValidityProof(
    normalized.buffer,
    label
  );
  if (normalizedJsonFallback) {
    normalized.buffer = normalizedJsonFallback.buffer;
    normalized.provenance = {
      ...normalized.provenance,
      kind: 'canonical',
      note:
        [normalized.provenance.note, normalizedJsonFallback.note]
          .filter(Boolean)
          .join(' | ') || undefined,
    };
  }

  const normalizedJsonFallbackMeta = maybeNormalizeJsonFallbackCompressedAccountMeta(
    normalized.buffer,
    label
  );
  if (normalizedJsonFallbackMeta) {
    normalized.buffer = normalizedJsonFallbackMeta.buffer;
    normalized.provenance = {
      kind: 'canonical',
      note:
        [normalized.provenance.note, normalizedJsonFallbackMeta.note]
          .filter(Boolean)
          .join(' | ') || undefined,
    };
  }

  ensureAllowedSerializationKind({
    label,
    buffer: normalized.buffer,
    provenance: normalized.provenance,
    allowJsonFallback,
    allowPlaceholder,
  });

  return normalized;
}

function isDebugKind(kind: LightSerializationKind): boolean {
  return kind === 'placeholder' || kind === 'json_fallback';
}

function deriveFlags(
  provenance: SerializedLightInputs['provenance']
): Pick<SerializedLightInputs, 'canonicalOnly' | 'debugOnly'> {
  const allKinds = [
    provenance.proof.kind,
    provenance.addressTreeInfo?.kind,
    provenance.claimerMeta?.kind,
    provenance.paymentMeta?.kind,
    provenance.metaMeta?.kind,
    provenance.maybeNewAddress?.kind,
    provenance.maybeNewPaymentAddress?.kind,
  ].filter((kind): kind is LightSerializationKind => !!kind);

  return {
    canonicalOnly: allKinds.length > 0 && allKinds.every((kind) => kind === 'canonical'),
    debugOnly: allKinds.some((kind) => isDebugKind(kind)),
  };
}

function summarizeSingleSerializedField(
  label: string,
  value: Buffer | undefined | null,
  provenance?: SerializedLightInputProvenance | null
): string {
  const size = value?.length ?? 0;
  const kind = provenance?.kind ?? 'n/a';
  return `${label}: ${size} B (${kind})`;
}

export function summarizeSerializedLightInputs(input: SerializedLightInputs): string[] {
  return [
    summarizeSingleSerializedField('proofSerialized', input.proofSerialized, input.provenance.proof),
    summarizeSingleSerializedField(
      'addressTreeInfoSerialized',
      input.addressTreeInfoSerialized,
      input.provenance.addressTreeInfo
    ),
    summarizeSingleSerializedField(
      'claimerMetaSerialized',
      input.claimerMetaSerialized,
      input.provenance.claimerMeta
    ),
    summarizeSingleSerializedField(
      'paymentMetaSerialized',
      input.paymentMetaSerialized,
      input.provenance.paymentMeta
    ),
    summarizeSingleSerializedField(
      'metaMetaSerialized',
      input.metaMetaSerialized,
      input.provenance.metaMeta
    ),
    summarizeSingleSerializedField(
      'maybeNewAddressSerialized',
      input.maybeNewAddressSerialized,
      input.provenance.maybeNewAddress
    ),
    summarizeSingleSerializedField(
      'maybeNewPaymentAddressSerialized',
      input.maybeNewPaymentAddressSerialized,
      input.provenance.maybeNewPaymentAddress
    ),
    `lightCanonicalOnly: ${input.canonicalOnly ? 'tak' : 'nie'}`,
    `lightDebugOnly: ${input.debugOnly ? 'tak' : 'nie'}`,
  ];
}

function serializeSimpleCompressedAccountMeta(
  input: SimpleCompressedAccountMetaInput,
  label: string
): Buffer {
  return fixed32(input.address, `${label}.address`);
}

export function buildRegisterLightInputs(params: {
  proof: Buffer | Uint8Array | number[] | TaggedLightSerializationInput;
  addressTreeInfo: Buffer | Uint8Array | number[] | TaggedLightSerializationInput;
  maybeNewAddress?:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | null;
  metaMeta?:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | SimpleCompressedAccountMetaInput
    | null;
}): SerializedLightInputs {
  const proof = normalizeTaggedLightBlob(params.proof, 'ValidityProof.register', {
    allowJsonFallback: true,
    allowPlaceholder: false,
  });
  const addressTreeInfo = normalizeTaggedLightBlob(
    params.addressTreeInfo,
    'PackedAddressTreeInfo.register'
  );

  const maybeNewAddress =
    params.maybeNewAddress == null
      ? null
      : normalizeTaggedLightBlob(params.maybeNewAddress, 'NewAddressParams.register', {
          allowJsonFallback: false,
          allowPlaceholder: false,
        });

  const metaMeta =
    params.metaMeta == null
      ? null
      : isSimpleCompressedAccountMetaInput(params.metaMeta)
        ? {
            buffer: serializeSimpleCompressedAccountMeta(
              params.metaMeta,
              'CompressedAccountMeta.register'
            ),
            provenance: {
              kind: 'placeholder' as LightSerializationKind,
              note: 'simple compressed account meta placeholder',
            },
          }
        : normalizeTaggedLightBlob(params.metaMeta, 'CompressedAccountMeta.register', {
            allowJsonFallback: false,
            allowPlaceholder: true,
          });

  const provenance: SerializedLightInputs['provenance'] = {
    proof: proof.provenance,
    addressTreeInfo: addressTreeInfo.provenance,
    metaMeta: metaMeta?.provenance ?? null,
    maybeNewAddress: maybeNewAddress?.provenance ?? null,
  };

  const flags = deriveFlags(provenance);

  let packedAddressTreeInfoInput =
    decodePackedAddressTreeInfoInputFrom4(addressTreeInfo.buffer);

  if (!packedAddressTreeInfoInput) {
    const envelope = decodeLiveLocalOpaqueEnvelope(addressTreeInfo.buffer);
    if (envelope) {
      packedAddressTreeInfoInput =
        decodePackedAddressTreeInfoInputFromEnvelope(envelope.payload);
    }
  }

  return {
    proofSerialized: proof.buffer,
    addressTreeInfoSerialized: addressTreeInfo.buffer,
    metaMetaSerialized: metaMeta?.buffer ?? null,
    maybeNewAddressSerialized: maybeNewAddress?.buffer ?? null,
    validityProofInput: decodeValidityProofInputFrom129(proof.buffer),
    packedAddressTreeInfoInput,
    maybeNewAddressInput:
      maybeNewAddress?.buffer != null
        ? decodeNewAddressParamsAssignedPackedInputFrom38(maybeNewAddress.buffer)
        : null,
    provenance,
    canonicalOnly: flags.canonicalOnly,
    debugOnly: flags.debugOnly,
  };
}

export function buildSendLightInputs(params: {
  proof: Buffer | Uint8Array | number[] | TaggedLightSerializationInput;
  addressTreeInfo: Buffer | Uint8Array | number[] | TaggedLightSerializationInput;
  maybeNewPaymentAddress?:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | null;
}): SerializedLightInputs {
  const proof = normalizeTaggedLightBlob(params.proof, 'ValidityProof.send', {
    allowJsonFallback: true,
    allowPlaceholder: false,
  });
  const addressTreeInfo = normalizeTaggedLightBlob(
    params.addressTreeInfo,
    'PackedAddressTreeInfo.send'
  );

  const maybeNewPaymentAddress =
    params.maybeNewPaymentAddress == null
      ? null
      : normalizeTaggedLightBlob(
          params.maybeNewPaymentAddress,
          'NewPaymentAddress.send',
          {
            allowJsonFallback: false,
            allowPlaceholder: false,
          }
        );

  const provenance: SerializedLightInputs['provenance'] = {
    proof: proof.provenance,
    addressTreeInfo: addressTreeInfo.provenance,
    maybeNewPaymentAddress: maybeNewPaymentAddress?.provenance ?? null,
  };

  const flags = deriveFlags(provenance);

  let packedAddressTreeInfoInput =
    decodePackedAddressTreeInfoInputFrom4(addressTreeInfo.buffer);

  if (!packedAddressTreeInfoInput) {
    const envelope = decodeLiveLocalOpaqueEnvelope(addressTreeInfo.buffer);
    if (envelope) {
      packedAddressTreeInfoInput =
        decodePackedAddressTreeInfoInputFromEnvelope(envelope.payload);
    }
  }

  return {
    proofSerialized: proof.buffer,
    addressTreeInfoSerialized: addressTreeInfo.buffer,
    maybeNewPaymentAddressSerialized: maybeNewPaymentAddress?.buffer ?? null,
    validityProofInput: decodeValidityProofInputFrom129(proof.buffer),
    packedAddressTreeInfoInput,
    maybeNewPaymentAddressInput:
      maybeNewPaymentAddress?.buffer != null
        ? decodeNewAddressParamsAssignedPackedInputFrom38(maybeNewPaymentAddress.buffer)
        : null,
    provenance,
    canonicalOnly: flags.canonicalOnly,
    debugOnly: flags.debugOnly,
  };
}

export function buildClaimLightInputs(params: {
  proof: Buffer | Uint8Array | number[] | TaggedLightSerializationInput;
  claimerMeta:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | SimpleCompressedAccountMetaInput;
  paymentMeta:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | SimpleCompressedAccountMetaInput;
}): SerializedLightInputs {
  const proof = normalizeTaggedLightBlob(params.proof, 'ValidityProof.claim');

  const claimerMeta = isSimpleCompressedAccountMetaInput(params.claimerMeta)
    ? {
        buffer: serializeSimpleCompressedAccountMeta(
          params.claimerMeta,
          'CompressedAccountMeta.claimer'
        ),
        provenance: {
          kind: 'placeholder' as LightSerializationKind,
          note: 'simple compressed account meta placeholder',
        },
      }
    : normalizeTaggedLightBlob(params.claimerMeta, 'CompressedAccountMeta.claimer', {
        allowJsonFallback: false,
        allowPlaceholder: true,
      });

  const paymentMeta = isSimpleCompressedAccountMetaInput(params.paymentMeta)
    ? {
        buffer: serializeSimpleCompressedAccountMeta(
          params.paymentMeta,
          'CompressedAccountMeta.payment'
        ),
        provenance: {
          kind: 'placeholder' as LightSerializationKind,
          note: 'simple compressed account meta placeholder',
        },
      }
    : normalizeTaggedLightBlob(params.paymentMeta, 'CompressedAccountMeta.payment', {
        allowJsonFallback: false,
        allowPlaceholder: true,
      });

  const provenance: SerializedLightInputs['provenance'] = {
    proof: proof.provenance,
    claimerMeta: claimerMeta.provenance,
    paymentMeta: paymentMeta.provenance,
  };

  const flags = deriveFlags(provenance);

  return {
    proofSerialized: proof.buffer,
    claimerMetaSerialized: claimerMeta.buffer,
    paymentMetaSerialized: paymentMeta.buffer,
    provenance,
    canonicalOnly: flags.canonicalOnly,
    debugOnly: flags.debugOnly,
  };
}
