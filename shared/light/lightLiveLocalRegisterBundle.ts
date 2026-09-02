import { Connection, PublicKey } from '@solana/web3.js';

import type {
  LightRemainingAccountMeta,
  NewRegisterAddressParams,
  PackedAddressTreeInfoParams,
  RegisterCompressedMetaParams,
  RegisterProofParams,
} from './lightClient.ts';
import type {
  LightLocalRuntimeConfig,
  PartialLightLocalRuntimeConfig,
} from './lightLocalRuntime.ts';
import { resolveLightLocalRuntimeConfig } from './lightLocalRuntime.ts';
import {
  fetchLiveNewRegisterAddress,
  fetchLivePackedAddressTreeInfo,
  fetchLiveRegisterMetaMeta,
  fetchLiveRemainingAccountsForRegister,
} from './lightLiveLocalClient.ts';
import {
  buildRegisterValidityProofViaStatelessRpc,
} from './lightRegisterValidityProofV0.ts';
import { deriveCompressedAddressFromAddressTreeAccountData } from '../core/lightAddressDerivation.ts';
import { PIERRON_STEALTH_PROGRAM_ID } from '../core/programIds.ts';
import { getAddressMerkleTreeAccountHeader } from './addressMerkleTreeAccount.ts';
import {
  REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
  REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
} from './registerCanonicalContract.ts';
import {
  LIGHT_CANONICAL_EXTERNAL_INDEX,
  LOCALNET_LIGHT_ACCOUNTS,
  resolveStealthOutputTreeIndex,
} from './lightCanonicalConfig.ts';
import { decodePackedAddressTreeInfoForRegisterFromTaggedInput } from '../mobile-stealth-v1/stealthTransactionFactory.ts';
import type { RemainingAccountInput } from '../mobile-stealth-v1/stealthInstructionBuilder.ts';

type RegisterSerializationKind = 'canonical' | 'json_fallback';

type RegisterBundleField = {
  status: 'ready' | 'missing';
  source?: 'light-client';
  note: string;
  value?: Uint8Array;
  serializationKind?: RegisterSerializationKind;
};

export type LiveLocalRegisterLightBundle = {
  kind: 'register';
  status: 'ready' | 'missing';
  packedAddressTreeInfo: RegisterBundleField;
  validityProof: RegisterBundleField;
  newAddress: RegisterBundleField;
  metaMeta: RegisterBundleField;
  remainingAccounts: LightRemainingAccountMeta[];
  notes: string[];
  blockingReasons: string[];
};

export type BuildLiveLocalRegisterLightBundleParams = {
  owner: PublicKey | string;
  outputTreeIndex?: number;
  cluster?: string;
  runtime?: PartialLightLocalRuntimeConfig;
  connection?: unknown;
  lightAddressSeed?: Uint8Array;
};

const LOCALNET_ADDRESS_QUEUE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.addressQueue;
const LOCALNET_STATE_QUEUE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.stateQueue;
const LOCALNET_STATE_TREE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.stateTree;

/**
 * SOURCE OF TRUTH:
 * Canonical external register instruction-space used by TS bundle builders.
 *
 * These indexes MUST match the final account layout expected by the instruction builder / runner.
 * On-chain program consumes these canonical indexes and remaps them into local tree_accounts().
 */
const REGISTER_CANONICAL_EXTERNAL_INDEX = Object.freeze({
  ...LIGHT_CANONICAL_EXTERNAL_INDEX.register,
} as const);

type RegisterCanonicalExternalIndex =
  typeof REGISTER_CANONICAL_EXTERNAL_INDEX;

type RegisterProofRequestExtended = RegisterProofParams & {
  canonicalRegisterAddressSeed?: Uint8Array;
  lightAddressSeedBytes?: Uint8Array;
  forcedAddressTree?: PublicKey;
  forcedAddressQueue?: PublicKey;
  expectedRootIndex?: number;
};

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

function toPublicKey(value: PublicKey | string): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

function toBase58IfPresent(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (value instanceof PublicKey) return value.toBase58();

  if (isPublicKeyLike(value)) {
    try {
      const out = value.toBase58();
      if (typeof out === 'string' && out.trim().length > 0) return out.trim();
    } catch {}
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    try {
      return new PublicKey(value as any).toBase58();
    } catch {}
  }

  return undefined;
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return Uint8Array.from(value);

  if (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'number' &&
        Number.isFinite(item) &&
        item >= 0 &&
        item <= 255
    )
  ) {
    return Uint8Array.from(value);
  }

  return null;
}

function looksLikeHexString(input: string): boolean {
  const normalized = input.startsWith('0x') ? input.slice(2) : input;
  return (
    normalized.length > 0 &&
    normalized.length % 2 === 0 &&
    /^[0-9a-fA-F]+$/.test(normalized)
  );
}

function looksLikeBase64String(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length < 8) return false;
  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) return false;
  return true;
}

function decodeBase64String(input: string): Uint8Array | null {
  const trimmed = input.trim();
  if (!looksLikeBase64String(trimmed)) return null;

  try {
    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(trimmed, 'base64'));
    }
  } catch {}

  return null;
}

function toBytesLoose(value: unknown): Uint8Array | null {
  const direct = toBytes(value);
  if (direct) return direct;

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

    const b64 = decodeBase64String(trimmed);
    if (b64) return b64;
  }

  if (isRecord(value)) {
    const numericKeys = Object.keys(value)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));

    if (numericKeys.length > 0) {
      const arr = numericKeys.map((key) => value[key]);
      const nested = toBytes(arr);
      if (nested) return nested;
    }

    for (const key of ['value', 'bytes', 'data', 'serialized']) {
      const nested = toBytesLoose(value[key]);
      if (nested) return nested;
    }
  }

  return null;
}

function decodeJsonFallback(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    const text = new TextDecoder().decode(bytes).trim();
    if (!text.startsWith('{')) return null;
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) return null;
    if (parsed.kind !== 'live-local-json-fallback') return null;
    return parsed;
  } catch {
    return null;
  }
}

function decodeLiveLocalOpaqueEnvelope(
  bytes: Uint8Array
): { label: string; payload: unknown } | null {
  const buf = Buffer.from(bytes);

  if (buf.length < 8) return null;
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

  if (labelLength <= 0 || headerLength > buf.length) return null;

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

function collectRegisterAddressCandidates(payload: unknown): Array<{
  source: string;
  value: string;
}> {
  const out: Array<{ source: string; value: string }> = [];
  const seen = new Set<string>();

  const candidatePaths: Array<{ source: string; path: Array<string | number> }> = [
    { source: 'payload.address', path: ['address'] },
    { source: 'payload.newAddress', path: ['newAddress'] },
    { source: 'payload.registerAddress', path: ['registerAddress'] },
    { source: 'payload.derivedAddress', path: ['derivedAddress'] },
    { source: 'payload.compressedAddress', path: ['compressedAddress'] },
    { source: 'payload.value.address', path: ['value', 'address'] },
    { source: 'payload.value.newAddress', path: ['value', 'newAddress'] },
    { source: 'payload.value.registerAddress', path: ['value', 'registerAddress'] },
    { source: 'payload.value.derivedAddress', path: ['value', 'derivedAddress'] },
    { source: 'payload.value.compressedAddress', path: ['value', 'compressedAddress'] },
    { source: 'payload.value.0.address', path: ['value', 0, 'address'] },
    { source: 'payload.value.0.newAddress', path: ['value', 0, 'newAddress'] },
    { source: 'payload.value.0.registerAddress', path: ['value', 0, 'registerAddress'] },
    { source: 'payload.value.0.derivedAddress', path: ['value', 0, 'derivedAddress'] },
    { source: 'payload.value.0.compressedAddress', path: ['value', 0, 'compressedAddress'] },
  ];

  for (const candidate of candidatePaths) {
    const value = toBase58IfPresent(pickPath(payload, candidate.path));
    if (!value) continue;
    const dedupeKey = `${candidate.source}:${value}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      source: candidate.source,
      value,
    });
  }

  return out;
}

function summarizeRegisterAddressCandidates(
  payload: unknown,
  owner?: PublicKey
): string[] {
  const ownerBase58 = owner?.toBase58();
  const candidates = collectRegisterAddressCandidates(payload);

  if (candidates.length === 0) return ['registerAddressCandidates: none'];

  return candidates.map((candidate, index) => {
    const ownerTag =
      ownerBase58 && candidate.value === ownerBase58 ? ':matches-owner' : '';
    return `registerAddressCandidate[${index}]: ${candidate.source}=${candidate.value}${ownerTag}`;
  });
}

function isRegisterValidityProofLike(bytes: Uint8Array): {
  ok: boolean;
  note?: string;
} {
  if (bytes.length === 1 || bytes.length === 129) {
    return {
      ok: true,
      note: `register validityProof accepted as canonical byte payload (${bytes.length} B)`,
    };
  }

  const envelope = decodeLiveLocalOpaqueEnvelope(bytes);
  if (!envelope) {
    return {
      ok: false,
      note: `register validityProof has unsupported raw length ${bytes.length} B`,
    };
  }

  const compressedProof =
    pickPath(envelope.payload, ['value', 'compressedProof']) ??
    pickPath(envelope.payload, ['value', 'compressed_proof']) ??
    pickPath(envelope.payload, ['value', 'value', 'compressedProof']) ??
    pickPath(envelope.payload, ['value', 'value', 'compressed_proof']) ??
    pickPath(envelope.payload, ['compressedProof']) ??
    pickPath(envelope.payload, ['compressed_proof']);

  if (compressedProof != null) {
    return {
      ok: true,
      note: `register validityProof accepted from live-local envelope: ${envelope.label}`,
    };
  }

  return {
    ok: false,
    note: `register validityProof envelope ${envelope.label} does not contain compressedProof`,
  };
}

function unwrapFetchedBytes(raw: unknown): {
  value: Uint8Array | null;
  serializationKind: RegisterSerializationKind | null;
} {
  const direct = toBytes(raw);
  if (direct) {
    return {
      value: direct,
      serializationKind: decodeJsonFallback(direct) ? 'json_fallback' : 'canonical',
    };
  }

  if (isRecord(raw)) {
    const nested = toBytes(raw.value);
    if (nested) {
      return {
        value: nested,
        serializationKind: decodeJsonFallback(nested) ? 'json_fallback' : 'canonical',
      };
    }
  }

  return {
    value: null,
    serializationKind: null,
  };
}

function readyField(label: string, fetched: unknown): RegisterBundleField {
  const unwrapped = unwrapFetchedBytes(fetched);

  if (!unwrapped.value || unwrapped.value.length === 0) {
    return {
      status: 'missing',
      source: 'light-client',
      note: `local register ${label} resolved to empty bytes`,
    };
  }

  return {
    status: 'ready',
    source: 'light-client',
    note: `local register ${label} resolved`,
    value: unwrapped.value,
    serializationKind: unwrapped.serializationKind ?? 'canonical',
  };
}

function readyValidityProofField(fetched: unknown): RegisterBundleField {
  const unwrapped = unwrapFetchedBytes(fetched);

  if (!unwrapped.value || unwrapped.value.length === 0) {
    return {
      status: 'missing',
      source: 'light-client',
      note: 'local register validityProof resolved to empty bytes',
    };
  }

  const validity = isRegisterValidityProofLike(unwrapped.value);
  if (!validity.ok) {
    return {
      status: 'missing',
      source: 'light-client',
      note:
        validity.note ??
        'local register validityProof is not a valid compressed proof payload',
    };
  }

  return {
    status: 'ready',
    source: 'light-client',
    note: validity.note ?? 'local register validityProof resolved',
    value: unwrapped.value,
    serializationKind: unwrapped.serializationKind ?? 'canonical',
  };
}

function missingField(label: string, error: unknown): RegisterBundleField {
  return {
    status: 'missing',
    source: 'light-client',
    note: `local register ${label} failed: ${String((error as Error)?.message ?? error)}`,
  };
}

function buildBlockingReasons(
  bundle: LiveLocalRegisterLightBundle,
  owner?: PublicKey
): string[] {
  const reasons: string[] = [];

  if (bundle.packedAddressTreeInfo.status !== 'ready') {
    reasons.push(
      `register.packedAddressTreeInfo: status=${bundle.packedAddressTreeInfo.status}, note=${bundle.packedAddressTreeInfo.note}`
    );
  }

  if (bundle.validityProof.status !== 'ready') {
    reasons.push(
      `register.validityProof: status=${bundle.validityProof.status}, note=${bundle.validityProof.note}`
    );
  }

  if (bundle.newAddress.status !== 'ready') {
    reasons.push(
      `register.newAddress: status=${bundle.newAddress.status}, note=${bundle.newAddress.note}`
    );
  }

  if (!Array.isArray(bundle.remainingAccounts) || bundle.remainingAccounts.length === 0) {
    reasons.push('register.remainingAccounts: status=missing, note=no remaining accounts resolved');
  }

  const addressAccount = bundle.remainingAccounts.find((account) => account.role === 'address');

  if (!addressAccount) {
    reasons.push(
      'register.remainingAccounts: status=missing, note=missing remaining account with role=address'
    );
  } else if (owner && addressAccount.pubkey.equals(owner)) {
    reasons.push(
      `register.remainingAccounts: status=missing, note=role=address resolves to owner (${owner.toBase58()}); expected a derived register address account`
    );
  }

  return reasons;
}

function buildSharedRegisterRequest(
  params: BuildLiveLocalRegisterLightBundleParams
): {
  packedAddressTreeInfo: PackedAddressTreeInfoParams;
  registerProof: RegisterProofRequestExtended;
  newRegisterAddress: NewRegisterAddressParams;
  registerMetaMeta: RegisterCompressedMetaParams;
} {
  const owner = toPublicKey(params.owner);
  const outputTreeIndex = resolveStealthOutputTreeIndex({
    cluster: params.cluster,
    explicit: params.outputTreeIndex,
    flow: 'register',
  });
  const cluster = params.cluster ?? 'localnet';

  return {
    packedAddressTreeInfo: {
      owner,
      outputTreeIndex,
      cluster,
      lightAddressSeed: params.lightAddressSeed,
    } as PackedAddressTreeInfoParams,
    registerProof: {
      owner,
      outputTreeIndex,
      cluster,
      lightAddressSeed: params.lightAddressSeed,
      lightAddressSeedBytes: params.lightAddressSeed,
    } as RegisterProofRequestExtended,
    newRegisterAddress: {
      owner,
      outputTreeIndex,
      cluster,
      lightAddressSeed: params.lightAddressSeed,
    } as NewRegisterAddressParams,
    registerMetaMeta: {
      owner,
      outputTreeIndex,
      cluster,
    } as RegisterCompressedMetaParams,
  };
}

function fingerprintRemainingAccount(account: LightRemainingAccountMeta): string {
  return [
    account.pubkey.toBase58(),
    account.isSigner ? '1' : '0',
    account.isWritable ? '1' : '0',
    account.role ?? '',
  ].join('|');
}

function dedupeLightRemainingAccounts(
  accounts: LightRemainingAccountMeta[]
): LightRemainingAccountMeta[] {
  const deduped: LightRemainingAccountMeta[] = [];
  const seen = new Set<string>();

  for (const account of accounts) {
    const fp = fingerprintRemainingAccount(account);
    if (seen.has(fp)) continue;
    seen.add(fp);
    deduped.push(account);
  }

  return deduped;
}

function findRemainingAccountByRole(
  accounts: LightRemainingAccountMeta[],
  roles: string[]
): LightRemainingAccountMeta | undefined {
  return accounts.find((account) => roles.includes(account.role ?? ''));
}

function requireRegisterCanonicalRoles(
  accounts: LightRemainingAccountMeta[]
): {
  merkleTree?: LightRemainingAccountMeta;
  addressQueue?: LightRemainingAccountMeta;
  stateQueue?: LightRemainingAccountMeta;
  stateTree?: LightRemainingAccountMeta;
  address?: LightRemainingAccountMeta;
} {
  return {
    merkleTree: findRemainingAccountByRole(accounts, ['merkle-tree', 'address-tree']),
    addressQueue: findRemainingAccountByRole(accounts, ['address-queue']),
    stateQueue: findRemainingAccountByRole(accounts, ['state-queue']),
    stateTree: findRemainingAccountByRole(accounts, ['state-tree']),
    address: findRemainingAccountByRole(accounts, ['address']),
  };
}

function ensureRegisterAddressQueueAccount(
  accounts: LightRemainingAccountMeta[],
  cluster?: string
): LightRemainingAccountMeta[] {
  const normalized = Array.isArray(accounts) ? [...accounts] : [];
  const isLocalnet = (cluster ?? 'localnet') === 'localnet';

  if (!isLocalnet) return dedupeLightRemainingAccounts(normalized);

  const hasAddressQueueRole = normalized.some(
    (account) => account.role === 'address-queue'
  );
  const hasAddressQueuePubkey = normalized.some(
    (account) => account.pubkey.toBase58() === LOCALNET_ADDRESS_QUEUE_PUBKEY.toBase58()
  );

  if (!hasAddressQueueRole && !hasAddressQueuePubkey) {
    normalized.push({
      pubkey: LOCALNET_ADDRESS_QUEUE_PUBKEY,
      isSigner: false,
      isWritable: true,
      role: 'address-queue',
    });
  }

  return dedupeLightRemainingAccounts(normalized);
}

function ensureRegisterStateTreeAccounts(
  accounts: LightRemainingAccountMeta[],
  stateQueuePubkey: PublicKey,
  stateTreePubkey: PublicKey
): LightRemainingAccountMeta[] {
  const next = [...accounts];
  const explicitStateQueue = findRemainingAccountByRole(next, ['state-queue', 'nullifier-queue']);
  const explicitStateTree = findRemainingAccountByRole(next, ['state-tree']);

  if (explicitStateQueue && !explicitStateQueue.pubkey.equals(stateQueuePubkey)) {
    throw new Error(
      `local register state-queue mismatch: expected=${stateQueuePubkey.toBase58()} actual=${explicitStateQueue.pubkey.toBase58()}`
    );
  }

  if (explicitStateTree && !explicitStateTree.pubkey.equals(stateTreePubkey)) {
    throw new Error(
      `local register state-tree mismatch: expected=${stateTreePubkey.toBase58()} actual=${explicitStateTree.pubkey.toBase58()}`
    );
  }

  if (!next.some((account) => account.pubkey.equals(stateQueuePubkey))) {
    next.push({
      pubkey: stateQueuePubkey,
      isSigner: false,
      isWritable: true,
      role: 'state-queue',
    });
  }

  if (!next.some((account) => account.pubkey.equals(stateTreePubkey))) {
    next.push({
      pubkey: stateTreePubkey,
      isSigner: false,
      isWritable: true,
      role: 'state-tree',
    });
  }

  return dedupeLightRemainingAccounts(next);
}

function extractCanonicalSeedFromNewAddressPayloadWithSource(
  payload: unknown
): { seed: Uint8Array; source: string } | null {
  const candidates: Array<{ value: unknown; source: string }> = [
    { value: pickPath(payload, ['seed']), source: 'payload.seed' },
    {
      value: pickPath(payload, ['lightAddressSeedBytes']),
      source: 'payload.lightAddressSeedBytes',
    },
    {
      value: pickPath(payload, ['lightAddressSeed']),
      source: 'payload.lightAddressSeed',
    },
    {
      value: pickPath(payload, ['canonicalRegisterAddressSeed']),
      source: 'payload.canonicalRegisterAddressSeed',
    },
    { value: pickPath(payload, ['value', 'seed']), source: 'payload.value.seed' },
    {
      value: pickPath(payload, ['value', 'lightAddressSeedBytes']),
      source: 'payload.value.lightAddressSeedBytes',
    },
    {
      value: pickPath(payload, ['value', 'lightAddressSeed']),
      source: 'payload.value.lightAddressSeed',
    },
    {
      value: pickPath(payload, ['value', 'canonicalRegisterAddressSeed']),
      source: 'payload.value.canonicalRegisterAddressSeed',
    },
  ];

  for (const candidate of candidates) {
    const bytes = toBytes(candidate.value);
    if (bytes && bytes.length === 32) {
      return {
        seed: Uint8Array.from(bytes),
        source: candidate.source,
      };
    }
  }

  return null;
}

function encodeNewAddressParamsAssignedPackedCanonical(params: {
  seed: Uint8Array;
  treeIndex: number;
  queueIndex: number;
  rootIndex: number;
  assignedToAccount: boolean;
  assignedAccountIndex: number;
}): Uint8Array {
  const out = new Uint8Array(38);
  out.set(params.seed, 0);
  out[32] = params.queueIndex & 0xff;
  out[33] = params.treeIndex & 0xff;
  out[34] = params.rootIndex & 0xff;
  out[35] = (params.rootIndex >> 8) & 0xff;
  out[36] = params.assignedToAccount ? 1 : 0;
  out[37] = params.assignedAccountIndex & 0xff;
  return out;
}

function encodePackedAddressTreeInfoCanonical(params: {
  treeIndex: number;
  queueIndex: number;
  rootIndex: number;
}): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = params.treeIndex & 0xff;
  out[1] = params.queueIndex & 0xff;
  out[2] = params.rootIndex & 0xff;
  out[3] = (params.rootIndex >> 8) & 0xff;
  return out;
}

function extractRootIndexFromPackedAddressTreeInfoCanonical(
  bytes: Uint8Array | undefined
): number | null {
  if (!bytes || bytes.length < 4) return null;
  return (bytes[2] ?? 0) | ((bytes[3] ?? 0) << 8);
}

function extractSeedFromFinalCanonicalMaybeNewAddress(
  maybeNewAddressValue: Uint8Array | undefined
): Uint8Array | null {
  if (!maybeNewAddressValue || maybeNewAddressValue.length < 32) return null;
  return Uint8Array.from(maybeNewAddressValue.slice(0, 32));
}

async function deriveRegisterAddressAccount(params: {
  accounts: LightRemainingAccountMeta[];
  seedBytes: Uint8Array | null;
  seedSourceLabel: string;
  notes: string[];
  rpcUrl: string;
}): Promise<LightRemainingAccountMeta | null> {
  if (!params.seedBytes) {
    params.notes.push(
      `local register derived address unavailable: ${params.seedSourceLabel} unavailable`
    );
    return null;
  }

  const canonicalRoles = requireRegisterCanonicalRoles(params.accounts);
  const merkleTreeAccount = canonicalRoles.merkleTree;
  const addressQueueAccount = canonicalRoles.addressQueue;

  if (!merkleTreeAccount || !addressQueueAccount) {
    params.notes.push(
      'local register derived address unavailable: missing merkle-tree or address-queue in remaining accounts'
    );
    return null;
  }

  const seedBytes = Uint8Array.from(params.seedBytes);
  if (seedBytes.length !== 32) {
    throw new Error(`light register seed must be 32 bytes, got ${seedBytes.length}`);
  }

  const connection = new Connection(params.rpcUrl, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
  });
  const treeInfo = await getAddressMerkleTreeAccountHeader(
    connection,
    merkleTreeAccount.pubkey,
    'confirmed'
  );
  if (!treeInfo?.data) {
    params.notes.push(
      `local register derived address unavailable: no account data for merkle tree ${merkleTreeAccount.pubkey.toBase58()}`
    );
    return null;
  }

  const derivedAddressBytes = deriveCompressedAddressFromAddressTreeAccountData(
    seedBytes,
    merkleTreeAccount.pubkey,
    PIERRON_STEALTH_PROGRAM_ID,
    new Uint8Array(treeInfo.data)
  );
  const derivedAddress = new PublicKey(derivedAddressBytes);

  params.notes.push(
    `local register derived address prepared via deriveCompressedAddressFromAddressTreeAccountData (${params.seedSourceLabel}): ${derivedAddress.toBase58()}`
  );
  params.notes.push(
    `local register derived address inputs: tree=${merkleTreeAccount.pubkey.toBase58()} queue=${addressQueueAccount.pubkey.toBase58()} seedBytesLength=${seedBytes.length}`
  );

  return {
    pubkey: derivedAddress,
    isSigner: false,
    isWritable: true,
    role: 'address',
  };
}

function buildVerifierRegisterAddressAccounts(
  accounts: LightRemainingAccountMeta[],
  derivedAddressAccount: LightRemainingAccountMeta | null
): RemainingAccountInput[] | undefined {
  const canonicalRoles = requireRegisterCanonicalRoles(accounts);
  const merkleTree = canonicalRoles.merkleTree;
  const addressQueue = canonicalRoles.addressQueue;
  const address = derivedAddressAccount ?? canonicalRoles.address;

  if (!address || !merkleTree || !addressQueue) return undefined;

  return [
    {
      pubkey: address.pubkey,
      isSigner: address.isSigner,
      isWritable: address.isWritable,
      role: 'address',
    } as RemainingAccountInput,
    {
      pubkey: merkleTree.pubkey,
      isSigner: merkleTree.isSigner,
      isWritable: merkleTree.isWritable,
      role: 'merkle-tree',
    } as RemainingAccountInput,
    {
      pubkey: addressQueue.pubkey,
      isSigner: addressQueue.isSigner,
      isWritable: addressQueue.isWritable,
      role: 'address-queue',
    } as RemainingAccountInput,
  ];
}

function normalizeVerifierRegisterAddressAccountsOrThrow(params: {
  remainingAccounts: LightRemainingAccountMeta[];
  derivedAddressAccount: LightRemainingAccountMeta | null;
  notes: string[];
}): RemainingAccountInput[] {
  const accounts = buildVerifierRegisterAddressAccounts(
    params.remainingAccounts,
    params.derivedAddressAccount
  );

  if (!accounts || accounts.length !== 3) {
    params.notes.push(
      'local register verifier register address accounts unavailable (expected 3: address, merkle-tree, address-queue)'
    );
    throw new Error('missing verifier register address accounts');
  }

  const order = ['address', 'merkle-tree', 'address-queue'] as const;
  const sorted = order.map((role) => {
    const found = accounts.find((a) => a.role === role);
    if (!found) throw new Error(`missing verifier register address account role=${role}`);
    return found;
  });

  params.notes.push(
    `local register verifier register address accounts resolved: ${sorted
      .map((a) => `${a.role}:${a.pubkey.toBase58()}`)
      .join(',')}`
  );

  return sorted;
}

function normalizeRegisterPackedAddressTreeInfoField(params: {
  fetchedPackedAddressTreeInfo: unknown;
  registerAddressAccounts: RemainingAccountInput[] | undefined;
  notes: string[];
  canonicalIndex?: RegisterCanonicalExternalIndex;
}): RegisterBundleField {
  const packedBytes = unwrapFetchedBytes(params.fetchedPackedAddressTreeInfo).value;

  if (!packedBytes) {
    return {
      status: 'missing',
      source: 'light-client',
      note:
        'local register packedAddressTreeInfo normalization failed: no canonical byte payload',
    };
  }

  if (!params.registerAddressAccounts || params.registerAddressAccounts.length === 0) {
    return {
      status: 'missing',
      source: 'light-client',
      note:
        'local register packedAddressTreeInfo normalization failed: missing verifier register address accounts',
    };
  }

  let helperResult:
    | {
        serialized: Buffer;
        decoded: {
          addressMerkleTreeIndex: number;
          addressQueueIndex: number;
          rootIndex: number;
        };
        source: string;
      }
    | null = null;

  try {
    helperResult = decodePackedAddressTreeInfoForRegisterFromTaggedInput(
      packedBytes,
      params.registerAddressAccounts
    );
  } catch (error: any) {
    return {
      status: 'missing',
      source: 'light-client',
      note:
        `local register packedAddressTreeInfo normalization failed: helper decode error: ${String(
          error?.message ?? error
        )}`,
    };
  }

  if (!helperResult) {
    return {
      status: 'missing',
      source: 'light-client',
      note:
        'local register packedAddressTreeInfo normalization failed: helper returned empty result',
    };
  }

  const canonicalIndex = params.canonicalIndex ?? REGISTER_CANONICAL_EXTERNAL_INDEX;

  const normalized = encodePackedAddressTreeInfoCanonical({
    treeIndex: canonicalIndex.merkleTree,
    queueIndex: canonicalIndex.addressQueue,
    rootIndex: helperResult.decoded.rootIndex,
  });

  params.notes.push(
    `local register packedAddressTreeInfo normalized to canonical external instruction-space via ${helperResult.source} (treeIndex=${canonicalIndex.merkleTree}, queueIndex=${canonicalIndex.addressQueue}, rootIndex=${helperResult.decoded.rootIndex})`
  );
  params.notes.push(
    `local register packedAddressTreeInfo helper decoded (light-space): treeIndex=${helperResult.decoded.addressMerkleTreeIndex} queueIndex=${helperResult.decoded.addressQueueIndex} rootIndex=${helperResult.decoded.rootIndex}`
  );

  return {
    status: 'ready',
    source: 'light-client',
    note:
      `local register packedAddressTreeInfo normalized to canonical external instruction-space via ${helperResult.source}`,
    value: normalized,
    serializationKind: 'canonical',
  };
}

function normalizeRegisterNewAddressField(params: {
  fetchedNewAddress: unknown;
  fetchedPackedAddressTreeInfo: unknown;
  registerAddressAccounts: RemainingAccountInput[] | undefined;
  remainingAccounts: LightRemainingAccountMeta[];
  notes: string[];
  owner?: PublicKey;
  lightAddressSeed?: Uint8Array;
  canonicalIndex?: RegisterCanonicalExternalIndex;
}): {
  field: RegisterBundleField;
  payloadSeedBytes: Uint8Array | null;
} {
  const envelope = readyField('newAddress.raw', params.fetchedNewAddress);

  if (envelope.status !== 'ready' || !envelope.value) {
    return {
      field: {
        status: 'missing',
        source: 'light-client',
        note: 'local register newAddress missing before normalization',
      },
      payloadSeedBytes: null,
    };
  }

  const decodedEnvelope = decodeLiveLocalOpaqueEnvelope(envelope.value);
  const jsonFallbackPayload = decodeJsonFallback(envelope.value);

  const newAddressPayload =
    decodedEnvelope?.payload ??
    jsonFallbackPayload ??
    (isRecord(params.fetchedNewAddress) ? params.fetchedNewAddress : null);

  params.notes.push(
    `local register newAddress payload source: ${
      decodedEnvelope
        ? `opaque-envelope(${decodedEnvelope.label})`
        : jsonFallbackPayload
          ? 'json-fallback'
          : isRecord(params.fetchedNewAddress)
            ? 'raw-record'
            : 'unknown'
    }`
  );

  for (const line of summarizeRegisterAddressCandidates(newAddressPayload, params.owner)) {
    params.notes.push(line);
  }

  const seedResult =
    extractCanonicalSeedFromNewAddressPayloadWithSource(newAddressPayload) ??
    (params.lightAddressSeed && params.lightAddressSeed.length === 32
      ? { seed: Uint8Array.from(params.lightAddressSeed), source: 'fallback-lightAddressSeed' }
      : null);

  if (!seedResult) {
    return {
      field: {
        status: 'missing',
        source: 'light-client',
        note:
          'local register newAddress normalization failed: live payload does not contain canonical 32-byte seed',
      },
      payloadSeedBytes: null,
    };
  }

  params.notes.push(
    `local register newAddress seed recovered from live payload source=${seedResult.source}`
  );

  const packedBytes = unwrapFetchedBytes(params.fetchedPackedAddressTreeInfo).value;

  if (!packedBytes) {
    return {
      field: {
        status: 'missing',
        source: 'light-client',
        note:
          'local register newAddress normalization failed: packedAddressTreeInfo has no canonical byte payload',
      },
      payloadSeedBytes: seedResult.seed,
    };
  }

  let registerAddressAccounts = params.registerAddressAccounts;

  if (!registerAddressAccounts || registerAddressAccounts.length === 0) {
    params.notes.push(
      'local register newAddress normalization failed: missing verifier register address accounts'
    );
    return {
      field: {
        status: 'missing',
        source: 'light-client',
        note:
          'local register newAddress normalization failed: missing verifier register address accounts',
      },
      payloadSeedBytes: seedResult.seed,
    };
  }

  let helperResult:
    | {
        serialized: Buffer;
        decoded: {
          addressMerkleTreeIndex: number;
          addressQueueIndex: number;
          rootIndex: number;
        };
        source: string;
      }
    | null = null;

  try {
    helperResult = decodePackedAddressTreeInfoForRegisterFromTaggedInput(
      packedBytes,
      registerAddressAccounts
    );
  } catch (error: any) {
    return {
      field: {
        status: 'missing',
        source: 'light-client',
        note:
          `local register newAddress normalization failed: packedAddressTreeInfo helper decode error: ${String(
            error?.message ?? error
          )}`,
      },
      payloadSeedBytes: seedResult.seed,
    };
  }

  if (!helperResult) {
    return {
      field: {
        status: 'missing',
        source: 'light-client',
        note:
          'local register newAddress normalization failed: packedAddressTreeInfo helper returned empty result',
      },
      payloadSeedBytes: seedResult.seed,
    };
  }

  params.notes.push(
    `local register newAddress root recovered via register helper source=${helperResult.source} serialized=${Array.from(
      helperResult.serialized
    ).join(',')} (rootIndex=${helperResult.decoded.rootIndex})`
  );
  params.notes.push(
    `local register newAddress helper decoded (light-space): treeIndex=${helperResult.decoded.addressMerkleTreeIndex} queueIndex=${helperResult.decoded.addressQueueIndex} rootIndex=${helperResult.decoded.rootIndex}`
  );

  const canonicalIndex = params.canonicalIndex ?? REGISTER_CANONICAL_EXTERNAL_INDEX;

  const normalized = encodeNewAddressParamsAssignedPackedCanonical({
    seed: seedResult.seed,
    treeIndex: canonicalIndex.merkleTree,
    queueIndex: canonicalIndex.addressQueue,
    rootIndex: helperResult.decoded.rootIndex,
    assignedToAccount: REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
    assignedAccountIndex: REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
  });

  params.notes.push(
    `local register newAddress normalized to canonical external instruction-space (assignedToAccount=${REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT}, assignedAccountIndex=${REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX}, treeIndex=${canonicalIndex.merkleTree}, queueIndex=${canonicalIndex.addressQueue}, rootIndex=${helperResult.decoded.rootIndex})`
  );
  params.notes.push(
    `local register newAddress bytes[36]=${normalized[36] ?? -1} bytes[37]=${normalized[37] ?? -1}`
  );

  return {
    field: {
      status: 'ready',
      source: 'light-client',
      note:
        `local register newAddress normalized to canonical external instruction-space packed params via ${helperResult.source}`,
      value: normalized,
      serializationKind: 'canonical',
    },
    payloadSeedBytes: seedResult.seed,
  };
}

async function ensureRegisterAddressAccount(params: {
  accounts: LightRemainingAccountMeta[];
  owner: PublicKey;
  finalMaybeNewAddressValue?: Uint8Array;
  notes: string[];
  rpcUrl: string;
}): Promise<LightRemainingAccountMeta[]> {
  const normalized = [...params.accounts];

  const existingAddress = normalized.find((account) => account.role === 'address');
  if (existingAddress) {
    normalized.splice(normalized.indexOf(existingAddress), 1);
  }

  const finalSeedBytes = extractSeedFromFinalCanonicalMaybeNewAddress(
    params.finalMaybeNewAddressValue
  );

  const derivedAddressAccount = await deriveRegisterAddressAccount({
    accounts: normalized,
    seedBytes: finalSeedBytes,
    seedSourceLabel: 'final canonical maybeNewAddress.value[0..32]',
    notes: params.notes,
    rpcUrl: params.rpcUrl,
  });

  if (!derivedAddressAccount) {
    if (existingAddress) normalized.push(existingAddress);
    return dedupeLightRemainingAccounts(normalized);
  }

  normalized.push(derivedAddressAccount);

  params.notes.push(
    `local register derived address injected via deriveCompressedAddressFromAddressTreeAccountData: ${derivedAddressAccount.pubkey.toBase58()}`
  );

  return dedupeLightRemainingAccounts(normalized);
}

function findCompressedProofObject(payload: unknown): unknown | null {
  const candidates = [
    pickPath(payload, ['compressedProof']),
    pickPath(payload, ['compressed_proof']),
    pickPath(payload, ['proof']),
    pickPath(payload, ['value', 'compressedProof']),
    pickPath(payload, ['value', 'compressed_proof']),
    pickPath(payload, ['value', 'proof']),
    pickPath(payload, ['value', 0, 'compressedProof']),
    pickPath(payload, ['value', 0, 'compressed_proof']),
    pickPath(payload, ['value', 0, 'proof']),
    pickPath(payload, ['result', 'compressedProof']),
    pickPath(payload, ['result', 'compressed_proof']),
    pickPath(payload, ['result', 'proof']),
  ];

  for (const candidate of candidates) {
    if (candidate != null) return candidate;
  }

  return null;
}

function describeUnknownShape(value: unknown, depth = 0): string {
  if (depth > 2) return 'max-depth';

  if (value == null) return String(value);

  if (value instanceof Uint8Array) {
    return `Uint8Array(len=${value.length},preview=${Array.from(value.slice(0, 8)).join(',')})`;
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return `Buffer(len=${value.length},preview=${Array.from(value.subarray(0, 8)).join(',')})`;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (looksLikeHexString(trimmed)) {
      return `string(hex,len=${trimmed.startsWith('0x') ? trimmed.length - 2 : trimmed.length},preview=${trimmed.slice(0, 24)})`;
    }
    if (looksLikeBase64String(trimmed)) {
      return `string(base64,len=${trimmed.length},preview=${trimmed.slice(0, 24)})`;
    }
    return `string(len=${trimmed.length},preview=${trimmed.slice(0, 24)})`;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${typeof value}(${String(value)})`;
  }

  if (Array.isArray(value)) {
    const head = value.slice(0, 3).map((item) => describeUnknownShape(item, depth + 1));
    return `Array(len=${value.length},head=[${head.join('; ')}])`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const preview = keys.slice(0, 6).join(',');
    return `Record(keys=${preview}${keys.length > 6 ? ',...' : ''})`;
  }

  return typeof value;
}

function logCompressedProofLikeShape(notes: string[], label: string, value: unknown): void {
  notes.push(`local register live proof candidate shape ${label}: ${describeUnknownShape(value)}`);

  if (Array.isArray(value)) {
    value.slice(0, 8).forEach((item, index) => {
      notes.push(
        `local register live proof candidate shape ${label}[${index}]: ${describeUnknownShape(item, 1)}`
      );

      if (typeof item === 'string') {
        const decoded = decodeBase64String(item);
        if (decoded) {
          notes.push(
            `local register live proof candidate decoded ${label}[${index}]: base64->${decoded.length}B preview=${Array.from(
              decoded.slice(0, 12)
            ).join(',')}`
          );
        }
      } else {
        const looseBytes = toBytesLoose(item);
        if (looseBytes) {
          notes.push(
            `local register live proof candidate decoded ${label}[${index}]: bytes->${looseBytes.length}B preview=${Array.from(
              looseBytes.slice(0, 12)
            ).join(',')}`
          );
        }
      }
    });
    return;
  }

  const looseBytes = toBytesLoose(value);
  if (looseBytes) {
    notes.push(
      `local register live proof candidate bytes ${label}: len=${looseBytes.length} preview=${Array.from(
        looseBytes.slice(0, 12)
      ).join(',')}`
    );
  }

  if (isRecord(value)) {
    for (const [key, inner] of Object.entries(value).slice(0, 8)) {
      notes.push(
        `local register live proof candidate shape ${label}.${key}: ${describeUnknownShape(inner, 1)}`
      );
      const innerBytes = toBytesLoose(inner);
      if (innerBytes) {
        notes.push(
          `local register live proof candidate decoded ${label}.${key}: bytes->${innerBytes.length}B preview=${Array.from(
            innerBytes.slice(0, 12)
          ).join(',')}`
        );
      }
    }
  }
}

function findProofPartDeep(
  root: unknown,
  targetKeys: string[],
  expectedLengths: number[],
  visited = new Set<unknown>(),
  depth = 0
): Uint8Array | null {
  if (root == null || depth > 8) return null;

  const direct = toBytesLoose(root);
  if (direct && expectedLengths.includes(direct.length)) {
    return direct;
  }

  if (typeof root !== 'object') return null;
  if (visited.has(root)) return null;
  visited.add(root);

  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findProofPartDeep(item, targetKeys, expectedLengths, visited, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = root as Record<string, unknown>;

  for (const key of targetKeys) {
    if (record[key] !== undefined) {
      const found = findProofPartDeep(record[key], targetKeys, expectedLengths, visited, depth + 1);
      if (found) return found;
    }
  }

  for (const [, value] of Object.entries(record)) {
    const found = findProofPartDeep(value, targetKeys, expectedLengths, visited, depth + 1);
    if (found) return found;
  }

  return null;
}

function extractCompressedProofLikeDeep(payload: unknown): {
  a: Uint8Array;
  b: Uint8Array;
  c: Uint8Array;
} | null {
  const a = findProofPartDeep(payload, ['a', 'pi_a', 'proof_a'], [32]);
  const b = findProofPartDeep(payload, ['b', 'pi_b', 'proof_b'], [64]);
  const c = findProofPartDeep(payload, ['c', 'pi_c', 'proof_c'], [32]);

  if (!a || !b || !c) {
    return null;
  }

  return { a, b, c };
}

function tryBuildProofFromBase64Array(
  value: unknown,
  notes: string[],
  label: string
): Uint8Array | null {
  if (!Array.isArray(value)) return null;

  const decodedItems = value
    .map((item, index) => {
      if (typeof item !== 'string') return null;
      const bytes = decodeBase64String(item);
      if (!bytes) return null;
      return { index, bytes };
    })
    .filter((item): item is { index: number; bytes: Uint8Array } => !!item);

  if (decodedItems.length === 0) return null;

  notes.push(
    `local register live proof array ${label}: decodedBase64Items=${decodedItems.length}/${value.length}`
  );

  for (let i = 0; i <= decodedItems.length - 3; i++) {
    const a = decodedItems[i];
    const b = decodedItems[i + 1];
    const c = decodedItems[i + 2];
    if (a && b && c && a.bytes.length === 32 && b.bytes.length === 64 && c.bytes.length === 32) {
      notes.push(
        `local register live proof array ${label}: matched pattern 32/64/32 at decoded indexes [${a.index},${b.index},${c.index}]`
      );
      return Uint8Array.from([1, ...a.bytes, ...b.bytes, ...c.bytes]);
    }
  }

  for (let i = 0; i <= decodedItems.length - 4; i++) {
    const a = decodedItems[i];
    const b1 = decodedItems[i + 1];
    const b2 = decodedItems[i + 2];
    const c = decodedItems[i + 3];
    if (
      a &&
      b1 &&
      b2 &&
      c &&
      a.bytes.length === 32 &&
      b1.bytes.length === 32 &&
      b2.bytes.length === 32 &&
      c.bytes.length === 32
    ) {
      notes.push(
        `local register live proof array ${label}: matched pattern 32/32/32/32 at decoded indexes [${a.index},${b1.index},${b2.index},${c.index}]`
      );
      const b = Uint8Array.from([...b1.bytes, ...b2.bytes]);
      return Uint8Array.from([1, ...a.bytes, ...b, ...c.bytes]);
    }
  }

  notes.push(
    `local register live proof array ${label}: no 32/64/32 or 32/32/32/32 pattern matched`
  );
  return null;
}

function encodeValidityProofFromCompressedProofLike(
  raw: unknown,
  notes?: string[],
  label?: string
): Uint8Array | null {
  const extracted = extractCompressedProofLikeDeep(raw);
  if (extracted) {
    return Uint8Array.from([1, ...extracted.a, ...extracted.b, ...extracted.c]);
  }

  if (notes && label) {
    const arrayForm = tryBuildProofFromBase64Array(raw, notes, label);
    if (arrayForm) return arrayForm;
  }

  return null;
}

function tryBuildValidityProofFromLivePayloads(params: {
  fetchedNewAddress: unknown;
  fetchedPackedAddressTreeInfo: unknown;
  notes: string[];
}): RegisterBundleField | null {
  const payloads: Array<{ name: string; payload: unknown }> = [];

  const newAddressBytes = unwrapFetchedBytes(params.fetchedNewAddress).value;
  if (newAddressBytes) {
    const env = decodeLiveLocalOpaqueEnvelope(newAddressBytes);
    if (env) payloads.push({ name: `newAddress:${env.label}`, payload: env.payload });
  }
  if (isRecord(params.fetchedNewAddress)) {
    payloads.push({ name: 'newAddress:raw-record', payload: params.fetchedNewAddress });
  }

  const packedBytes = unwrapFetchedBytes(params.fetchedPackedAddressTreeInfo).value;
  if (packedBytes) {
    const env = decodeLiveLocalOpaqueEnvelope(packedBytes);
    if (env) payloads.push({ name: `packedAddressTreeInfo:${env.label}`, payload: env.payload });
  }
  if (isRecord(params.fetchedPackedAddressTreeInfo)) {
    payloads.push({
      name: 'packedAddressTreeInfo:raw-record',
      payload: params.fetchedPackedAddressTreeInfo,
    });
  }

  for (const candidate of payloads) {
    const compressedProofLike = findCompressedProofObject(candidate.payload);
    if (!compressedProofLike) continue;

    logCompressedProofLikeShape(params.notes, candidate.name, compressedProofLike);

    const proofBytes = encodeValidityProofFromCompressedProofLike(
      compressedProofLike,
      params.notes,
      candidate.name
    );

    if (!proofBytes) {
      params.notes.push(
        `local register live proof candidate rejected: ${candidate.name} contains compressedProof-like object but could not normalize deep a/b/c`
      );
      params.notes.push(
        `local register live proof candidate top-level keys: ${
          isRecord(compressedProofLike) ? Object.keys(compressedProofLike).join(',') : 'non-record'
        }`
      );
      continue;
    }

    params.notes.push(
      `local register validityProof sourced directly from live payload: ${candidate.name}`
    );

    return {
      status: 'ready',
      source: 'light-client',
      note: `register validityProof accepted as canonical byte payload (${proofBytes.length} B)`,
      value: proofBytes,
      serializationKind: 'canonical',
    };
  }

  params.notes.push(
    'local register live payload proof unavailable; using primary stateless canonical-derived-address proof path'
  );
  return null;
}

async function fetchRegisterBundlePieces(params: {
  runtime: LightLocalRuntimeConfig;
  request: ReturnType<typeof buildSharedRegisterRequest>;
}) {
  const packedAddressTreeInfo = await fetchLivePackedAddressTreeInfo({
    runtime: params.runtime,
    request: params.request.packedAddressTreeInfo,
  });

  const newAddress = await fetchLiveNewRegisterAddress({
    runtime: params.runtime,
    request: params.request.newRegisterAddress,
  });

  let metaMeta: unknown;
  try {
    metaMeta = await fetchLiveRegisterMetaMeta({
      runtime: params.runtime,
      request: params.request.registerMetaMeta,
    });
  } catch (error) {
    metaMeta = {
      value: undefined,
      note: `optional register metaMeta unavailable: ${String((error as Error)?.message ?? error)}`,
    };
  }

  const remainingAccounts = await fetchLiveRemainingAccountsForRegister({
    runtime: params.runtime,
    request: params.request.registerProof,
  });

  return {
    packedAddressTreeInfo,
    newAddress,
    metaMeta,
    remainingAccounts,
  };
}

export async function buildRegisterLightBundleFromLiveLocalRuntime(
  params: BuildLiveLocalRegisterLightBundleParams
): Promise<LiveLocalRegisterLightBundle> {
  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const request = buildSharedRegisterRequest(params);
  const owner = toPublicKey(params.owner);
  const notes: string[] = [];
  const canonicalIndex = REGISTER_CANONICAL_EXTERNAL_INDEX;

  let packedAddressTreeInfo: RegisterBundleField;
  let validityProof: RegisterBundleField;
  let newAddress: RegisterBundleField;
  let metaMeta: RegisterBundleField;
  let remainingAccounts: LightRemainingAccountMeta[] = [];

  try {
    const result = await fetchRegisterBundlePieces({
      runtime,
      request,
    });

    remainingAccounts = ensureRegisterAddressQueueAccount(
      Array.isArray(result.remainingAccounts) ? result.remainingAccounts : [],
      params.cluster
    );

    remainingAccounts = ensureRegisterStateTreeAccounts(
      remainingAccounts,
      LOCALNET_STATE_QUEUE_PUBKEY,
      LOCALNET_STATE_TREE_PUBKEY
    );
    notes.push(
      `local register state-queue ensured: ${LOCALNET_STATE_QUEUE_PUBKEY.toBase58()}`
    );
    notes.push(
      `local register state-tree ensured: ${LOCALNET_STATE_TREE_PUBKEY.toBase58()}`
    );

    const rawNewAddressEnvelope = readyField('newAddress.raw', result.newAddress);
    let preliminaryPayloadSeedBytes: Uint8Array | null = null;
    let preliminaryPayloadSeedSource = 'unavailable';

    if (rawNewAddressEnvelope.status === 'ready' && rawNewAddressEnvelope.value) {
      const decodedEnvelope = decodeLiveLocalOpaqueEnvelope(rawNewAddressEnvelope.value);
      const jsonFallbackPayload = decodeJsonFallback(rawNewAddressEnvelope.value);
      const rawPayload =
        decodedEnvelope?.payload ??
        jsonFallbackPayload ??
        (isRecord(result.newAddress) ? result.newAddress : null);

      const preliminarySeedResult =
        extractCanonicalSeedFromNewAddressPayloadWithSource(rawPayload);
      preliminaryPayloadSeedBytes = preliminarySeedResult?.seed ?? null;
      preliminaryPayloadSeedSource = preliminarySeedResult?.source ?? 'unavailable';
    }

    if (preliminaryPayloadSeedBytes) {
      request.registerProof.canonicalRegisterAddressSeed = Uint8Array.from(
        preliminaryPayloadSeedBytes
      );
      request.registerProof.lightAddressSeedBytes = Uint8Array.from(preliminaryPayloadSeedBytes);
      notes.push(
        `local register preliminary payload seed recovered: source=${preliminaryPayloadSeedSource}`
      );
      notes.push(
        `local register preliminary payload seed preview: ${Array.from(
          preliminaryPayloadSeedBytes.slice(0, 8)
        ).join(',')}`
      );
    } else {
      notes.push('local register preliminary payload seed unavailable');
    }

    const preliminaryDerivedAddressAccount = await deriveRegisterAddressAccount({
      accounts: remainingAccounts,
      seedBytes: preliminaryPayloadSeedBytes,
      seedSourceLabel: 'preliminary payload seed',
      notes,
      rpcUrl: runtime.rpcUrl,
    });

    let verifierRegisterAddressAccounts: RemainingAccountInput[] | undefined;
    try {
      verifierRegisterAddressAccounts = normalizeVerifierRegisterAddressAccountsOrThrow({
        remainingAccounts,
        derivedAddressAccount: preliminaryDerivedAddressAccount,
        notes,
      });
    } catch (e: any) {
      verifierRegisterAddressAccounts = undefined;
      notes.push(`local register verifier accounts normalization failed: ${String(e?.message ?? e)}`);
    }

    packedAddressTreeInfo = normalizeRegisterPackedAddressTreeInfoField({
      fetchedPackedAddressTreeInfo: result.packedAddressTreeInfo,
      registerAddressAccounts: verifierRegisterAddressAccounts,
      notes,
      canonicalIndex,
    });

    const newAddressNormalization = normalizeRegisterNewAddressField({
      fetchedNewAddress: result.newAddress,
      fetchedPackedAddressTreeInfo: result.packedAddressTreeInfo,
      registerAddressAccounts: verifierRegisterAddressAccounts,
      remainingAccounts,
      notes,
      owner,
      lightAddressSeed: params.lightAddressSeed,
      canonicalIndex,
    });

    newAddress = newAddressNormalization.field;

    remainingAccounts = await ensureRegisterAddressAccount({
      accounts: remainingAccounts,
      owner,
      finalMaybeNewAddressValue: newAddressNormalization.field.value,
      notes,
      rpcUrl: runtime.rpcUrl,
    });

    const finalCanonicalSeed = extractSeedFromFinalCanonicalMaybeNewAddress(
      newAddressNormalization.field.value
    );

    let statelessProofField: RegisterBundleField | null = null;
    try {
      const canonicalRoles = requireRegisterCanonicalRoles(remainingAccounts);

      const forcedAddressTree = canonicalRoles.merkleTree?.pubkey;
      const forcedAddressQueue = canonicalRoles.addressQueue?.pubkey;

      // Indexer-packed root index often lags behind the Merkle root the prover uses; do not
      // constrain getValidityProofV0 to that value (would fail locally) or ship it on-chain
      // (6043). After a successful proof we rewrite packedAddressTreeInfo + newAddress below.
      const packedHintRootIndex = extractRootIndexFromPackedAddressTreeInfoCanonical(
        packedAddressTreeInfo.value
      );

      if (forcedAddressTree) {
        request.registerProof.forcedAddressTree = forcedAddressTree;
      }
      if (forcedAddressQueue) {
        request.registerProof.forcedAddressQueue = forcedAddressQueue;
      }
      delete (request.registerProof as { expectedRootIndex?: number }).expectedRootIndex;

      notes.push(
        `local register proof primary path=canonical-derived-address tree=${forcedAddressTree?.toBase58() ?? 'n/a'} queue=${forcedAddressQueue?.toBase58() ?? 'n/a'} packedHintRootIndex=${String(packedHintRootIndex)} (not enforced; aligned to proof after success)`
      );

      const validityProofResult = await buildRegisterValidityProofViaStatelessRpc({
        runtime,
        request: request.registerProof,
        forcedAddressTree,
        forcedAddressQueue,
      });

      notes.push(`local register proof path selected: canonical-derived-address`);
      notes.push(`local register proof backend seedSource: ${validityProofResult.seedSource}`);
      notes.push(
        `local register proof usedSeed preview: ${Array.from(
          validityProofResult.usedSeed.slice(0, 8)
        ).join(',')}`
      );

      if (Array.isArray(validityProofResult.experimentLogLines)) {
        const canonicalDerivedAddressLine = validityProofResult.experimentLogLines.find((line) =>
          String(line).includes('canonicalDerivedAddress.mode=ok')
        );

        if (canonicalDerivedAddressLine) {
          notes.push(canonicalDerivedAddressLine);
        }
      }

      const proofDerivedAddress = new PublicKey(validityProofResult.derivedAddress);
      notes.push(`local register proof derived address: ${proofDerivedAddress.toBase58()}`);
      notes.push(`local register proof rootIndex: ${validityProofResult.rootIndex}`);
      notes.push(`local register proof addressTree: ${validityProofResult.addressTree.toBase58()}`);
      notes.push(`local register proof addressQueue: ${validityProofResult.addressQueue.toBase58()}`);

      statelessProofField = readyValidityProofField({
        value: validityProofResult.proofBytes,
      });

      const proofRootIndex = validityProofResult.rootIndex;
      const seedForAlignedNewAddress =
        finalCanonicalSeed ??
        extractSeedFromFinalCanonicalMaybeNewAddress(
          newAddress.status === 'ready' ? newAddress.value : undefined
        );
      if (
        packedAddressTreeInfo.status === 'ready' &&
        packedAddressTreeInfo.value &&
        newAddress.status === 'ready' &&
        newAddress.value &&
        seedForAlignedNewAddress
      ) {
        const prevPackedRoot = extractRootIndexFromPackedAddressTreeInfoCanonical(
          packedAddressTreeInfo.value
        );
        const prevNewRoot =
          newAddress.value.length >= 36
            ? newAddress.value[34]! | (newAddress.value[35]! << 8)
            : null;
        packedAddressTreeInfo = {
          status: 'ready',
          source: 'light-client',
          note: `${packedAddressTreeInfo.note} | aligned rootIndex to proof: ${String(prevPackedRoot)} -> ${String(proofRootIndex)}`,
          value: encodePackedAddressTreeInfoCanonical({
            treeIndex: canonicalIndex.merkleTree,
            queueIndex: canonicalIndex.addressQueue,
            rootIndex: proofRootIndex,
          }),
          serializationKind: 'canonical',
        };
        newAddress = {
          status: 'ready',
          source: 'light-client',
          note: `${newAddress.note} | aligned rootIndex to proof: ${String(prevNewRoot)} -> ${String(proofRootIndex)}`,
          value: encodeNewAddressParamsAssignedPackedCanonical({
            seed: seedForAlignedNewAddress,
            treeIndex: canonicalIndex.merkleTree,
            queueIndex: canonicalIndex.addressQueue,
            rootIndex: proofRootIndex,
            assignedToAccount: REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
            assignedAccountIndex: REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
          }),
          serializationKind: 'canonical',
        };
        notes.push(
          `local register CPI fields aligned to proof rootIndex=${proofRootIndex} (packed was ${String(prevPackedRoot)}, newAddress root was ${String(prevNewRoot)})`
        );
      } else {
        notes.push(
          'local register CPI root align skipped: missing packedAddressTreeInfo/newAddress/seed'
        );
      }

      if (finalCanonicalSeed) {
        const compareConnection = new Connection(runtime.rpcUrl, {
          commitment: 'confirmed',
          disableRetryOnRateLimit: true,
        });
        const validityTreeAcct = await getAddressMerkleTreeAccountHeader(
          compareConnection,
          validityProofResult.addressTree,
          'confirmed'
        );
        if (!validityTreeAcct?.data) {
          notes.push(
            `local register final canonical compare skipped: missing address tree account ${validityProofResult.addressTree.toBase58()}`
          );
        } else {
        const finalDerivedAddressBytes = deriveCompressedAddressFromAddressTreeAccountData(
          finalCanonicalSeed,
          validityProofResult.addressTree,
          PIERRON_STEALTH_PROGRAM_ID,
          new Uint8Array(validityTreeAcct.data)
        );
        const finalDerivedAddress = new PublicKey(finalDerivedAddressBytes);

        notes.push(
          `local register final canonical seed preview: ${Array.from(
            finalCanonicalSeed.slice(0, 8)
          ).join(',')}`
        );
        notes.push(`local register final canonical derived address: ${finalDerivedAddress.toBase58()}`);
        notes.push(
          `local register proof derived address matches final canonical seed: ${
            finalDerivedAddress.equals(proofDerivedAddress) ? 'yes' : 'no'
          }`
        );

          const finalAddressAccount = remainingAccounts.find((account) => account.role === 'address');
          if (finalAddressAccount) {
            notes.push(
              `local register proof derived address matches remaining role=address: ${
                finalAddressAccount.pubkey.equals(proofDerivedAddress) ? 'yes' : 'no'
              }`
            );
            notes.push(
              `local register final canonical derived address matches remaining role=address: ${
                finalAddressAccount.pubkey.equals(finalDerivedAddress) ? 'yes' : 'no'
              }`
            );
          }
        }
      } else {
        notes.push('local register final canonical seed unavailable for proof comparison');
      }
    } catch (error) {
      notes.push(
        `local register canonical-derived-address proof path failed: ${String((error as Error)?.message ?? error)}`
      );
    }

    const livePayloadProofField = tryBuildValidityProofFromLivePayloads({
      fetchedNewAddress: result.newAddress,
      fetchedPackedAddressTreeInfo: result.packedAddressTreeInfo,
      notes,
    });

    const statelessPathFailures = notes.filter((n) =>
      n.includes('local register canonical-derived-address proof path failed')
    );
    const statelessPathFailureNote =
      statelessPathFailures.length > 0
        ? statelessPathFailures[statelessPathFailures.length - 1]
        : undefined;

    validityProof =
      statelessProofField ??
      livePayloadProofField ??
      {
        status: 'missing',
        source: 'light-client',
        note: [
          'local register validityProof unavailable from both canonical-derived-address path and live payload path',
          statelessPathFailureNote,
        ]
          .filter(Boolean)
          .join(' | '),
      };

    const metaMetaUnwrapped = unwrapFetchedBytes(result.metaMeta);
    metaMeta =
      metaMetaUnwrapped.value && metaMetaUnwrapped.value.length > 0
        ? {
            status: 'ready',
            source: 'light-client',
            note: 'local register metaMeta resolved (optional path)',
            value: metaMetaUnwrapped.value,
            serializationKind: metaMetaUnwrapped.serializationKind ?? 'canonical',
          }
        : {
            status: 'missing',
            source: 'light-client',
            note: 'local register metaMeta missing (optional for init path)',
          };

    const addressAccount = remainingAccounts.find((account) => account.role === 'address');
    if (addressAccount && addressAccount.pubkey.equals(owner)) {
      notes.push(
        `local register remainingAccounts rejected: role=address resolves to owner ${owner.toBase58()}`
      );
    } else if (addressAccount) {
      notes.push(
        `local register remainingAccounts address resolved to ${addressAccount.pubkey.toBase58()}`
      );
    }

    if (packedAddressTreeInfo.status === 'ready') {
      notes.push('local register packedAddressTreeInfo resolved via canonical external instruction-space');
    } else {
      notes.push(`local register packedAddressTreeInfo rejected: ${packedAddressTreeInfo.note}`);
    }

    if (validityProof.status === 'ready') {
      notes.push(`local register validityProof resolved: ${validityProof.note}`);
    } else {
      notes.push(`local register validityProof rejected: ${validityProof.note}`);
    }

    if (newAddress.status === 'ready') {
      notes.push('local register newAddress resolved via canonical external instruction-space');
      notes.push(
        `local register canonical newAddress assignment: assignedToAccount=${REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT} assignedAccountIndex=${REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX}`
      );
      notes.push(
        `local register canonical external index contract: merkleTree=${canonicalIndex.merkleTree}, addressQueue=${canonicalIndex.addressQueue}, stateQueue=${canonicalIndex.stateQueue}, stateTree=${canonicalIndex.stateTree}, address=${canonicalIndex.address}`
      );
    } else {
      notes.push(`local register newAddress rejected: ${newAddress.note}`);
    }

    if (metaMeta.status === 'ready') {
      notes.push('local register metaMeta resolved (optional)');
    } else {
      notes.push('local register metaMeta missing but ignored for init path');
    }

    if (remainingAccounts.length > 0) {
      notes.push('local register remainingAccounts resolved directly from live backend');
      notes.push(
        `local register remainingAccounts roles: ${
          remainingAccounts.map((account) => account.role ?? 'unknown').join(',') || 'none'
        }`
      );

      remainingAccounts.forEach((account, index) => {
        notes.push(
          `local register remainingAccounts[${index}]: ${index}:${account.role}:${account.pubkey.toBase58()}:signer=${account.isSigner ? 1 : 0}:writable=${account.isWritable ? 1 : 0}`
        );
      });
    }

    if (remainingAccounts.some((account) => account.role === 'address-queue')) {
      notes.push('local register address-queue ensured for localnet fallback');
    }

    if (remainingAccounts.some((account) => account.role === 'state-queue')) {
      notes.push('local register state-queue ensured for localnet fallback');
    }

    if (remainingAccounts.some((account) => account.role === 'state-tree')) {
      notes.push('local register state-tree ensured for localnet fallback');
    }
  } catch (error) {
    packedAddressTreeInfo = missingField('packedAddressTreeInfo', error);
    validityProof = missingField('validityProof', error);
    newAddress = missingField('newAddress', error);
    metaMeta = {
      status: 'missing',
      source: 'light-client',
      note: 'local register metaMeta unavailable after register bundle failure',
    };
    remainingAccounts = [];
  }

  const provisionalBundle: LiveLocalRegisterLightBundle = {
    kind: 'register',
    status: 'missing',
    packedAddressTreeInfo,
    validityProof,
    newAddress,
    metaMeta,
    remainingAccounts,
    notes,
    blockingReasons: [],
  };

  const blockingReasons = buildBlockingReasons(provisionalBundle, owner);

  return {
    ...provisionalBundle,
    status: blockingReasons.length === 0 ? 'ready' : 'missing',
    blockingReasons,
  };
}

export const buildLiveLocalRegisterLightBundle =
  buildRegisterLightBundleFromLiveLocalRuntime;
export const buildRegisterLightBundleFromRuntime =
  buildRegisterLightBundleFromLiveLocalRuntime;
export const buildRegisterBundleFromLiveLocalRuntime =
  buildRegisterLightBundleFromLiveLocalRuntime;
export const makeRegisterLightBundleFromLiveLocalRuntime =
  buildRegisterLightBundleFromLiveLocalRuntime;
export const buildRegisterLightBundle =
  buildRegisterLightBundleFromLiveLocalRuntime;
