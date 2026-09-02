import { setLightBackend, LIGHT_CANONICAL_EXTERNAL_INDEX } from '../../shared/light/lightClient.ts';
import { makeRealLocalRegisterLightBackend } from '../../shared/light/lightBackend.local.register.ts';
import {
  resetLocalRegisterResolverProvider,
  resolveLocalRegisterMetaMeta,
  resolveLocalRegisterNewAddress,
  resolveLocalRegisterPackedAddressTreeInfo,
  resolveLocalRegisterRemainingAccounts,
  resolveLocalRegisterValidityProof,
  setLocalRegisterResolverProvider,
  type LocalRegisterResolverProvider,
} from '../../shared/light/lightRegisterResolver.ts';
import {
  fetchLivePackedAddressTreeInfo,
  fetchLiveRegisterProof,
  fetchLiveRegisterMetaMeta,
  fetchLiveNewRegisterAddress,
  fetchLiveRemainingAccountsForRegister,
} from '../../shared/light/lightLiveLocalClient.ts';
import { decodePackedAddressTreeInfoForRegisterFromTaggedInput } from '../../shared/mobile-stealth-v1/stealthTransactionFactory.ts';
import type { RemainingAccountInput } from '../../shared/mobile-stealth-v1/stealthInstructionBuilder.ts';
import {
  REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
  REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
  REGISTER_CANONICAL_META_META_OPTION_NONE,
} from '../../shared/light/registerCanonicalContract.ts';
import {
  buildRegisterBundleArtifactsViaStatelessRpc,
  encodeRegisterNewAddressPackedCanonical,
  isCanonicalRegisterNewAddressBytes,
  pickRegisterAddressSeed,
  type RegisterBundleArtifacts,
} from '../../shared/light/registerNewAddressPacked.ts';
import type { NewRegisterAddressParams } from '../../shared/light/lightClient.ts';
import { getLightLocalRuntimeOverride } from '../../shared/light/lightLocalRuntime.ts';
import { ensureCanonicalRegisterRemainingAccounts } from '../../shared/light/registerRemainingAccounts.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return Uint8Array.from(value);
  }

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

function decodeLiveLocalOpaqueEnvelope(
  bytes: Uint8Array
): { label: string; payload: unknown } | null {
  const buf = Buffer.from(bytes);

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

function unwrapFetchedBytes(raw: unknown): Uint8Array | null {
  const direct = toBytes(raw);
  if (direct) {
    return direct;
  }

  if (isRecord(raw)) {
    const nested = toBytes(raw.value);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function requireFetchedBytes(raw: unknown, label: string): Uint8Array {
  const bytes = unwrapFetchedBytes(raw);
  if (!bytes || bytes.length === 0) {
    throw new Error(`${label}: missing byte payload`);
  }
  return bytes;
}

function extractCanonicalSeedFromNewAddressPayload(payload: unknown): Uint8Array | null {
  const candidates: unknown[] = [
    pickPath(payload, ['seed']),
    pickPath(payload, ['lightAddressSeedBytes']),
    pickPath(payload, ['lightAddressSeed']),
    pickPath(payload, ['addressSeed']),
    pickPath(payload, ['address_seed']),
    pickPath(payload, ['value', 'seed']),
    pickPath(payload, ['value', 'lightAddressSeedBytes']),
    pickPath(payload, ['value', 'lightAddressSeed']),
    pickPath(payload, ['value', 'addressSeed']),
    pickPath(payload, ['value', 'address_seed']),
    pickPath(payload, ['context', 'lightAddressSeedBytes']),
    pickPath(payload, ['context', 'lightAddressSeed']),
    pickPath(payload, ['context', 'addressSeed']),
    pickPath(payload, ['context', 'address_seed']),
    pickPath(payload, ['params', 'seed']),
    pickPath(payload, ['params', 'lightAddressSeedBytes']),
    pickPath(payload, ['params', 'lightAddressSeed']),
  ];

  for (const candidate of candidates) {
    const bytes = toBytes(candidate);
    if (bytes && bytes.length === 32) {
      return Uint8Array.from(bytes);
    }
  }

  return null;
}

function toRegisterAddressAccounts(
  remainingAccounts: Awaited<ReturnType<typeof fetchLiveRemainingAccountsForRegister>>
): RemainingAccountInput[] {
  const merkleTree =
    remainingAccounts.find((a) => a.role === 'merkle-tree') ??
    remainingAccounts.find((a) => a.role === 'address-tree');
  const addressQueue = remainingAccounts.find((a) => a.role === 'address-queue');
  const address = remainingAccounts.find((a) => a.role === 'address');

  const out: RemainingAccountInput[] = [];

  if (address) {
    out.push({
      pubkey: address.pubkey,
      isSigner: address.isSigner,
      isWritable: address.isWritable,
      role: 'address',
    } as RemainingAccountInput);
  }

  if (merkleTree) {
    out.push({
      pubkey: merkleTree.pubkey,
      isSigner: merkleTree.isSigner,
      isWritable: merkleTree.isWritable,
      role: 'merkle-tree',
    } as RemainingAccountInput);
  }

  if (addressQueue) {
    out.push({
      pubkey: addressQueue.pubkey,
      isSigner: addressQueue.isSigner,
      isWritable: addressQueue.isWritable,
      role: 'address-queue',
    } as RemainingAccountInput);
  }

  return out;
}

function normalizeRegisterNewAddressPayload(params: {
  packedAddressTreeInfoRaw: unknown;
  newAddressRaw: unknown;
  remainingAccounts: Awaited<ReturnType<typeof fetchLiveRemainingAccountsForRegister>>;
  fallbackSeed?: Uint8Array | null;
}): Uint8Array {
  const packedAddressTreeInfoBytes = requireFetchedBytes(
    params.packedAddressTreeInfoRaw,
    'normalizeRegisterNewAddressPayload.packedAddressTreeInfo'
  );

  const directNewAddressBytes = toBytes(params.newAddressRaw);
  if (directNewAddressBytes && isCanonicalRegisterNewAddressBytes(directNewAddressBytes)) {
    return Uint8Array.from(directNewAddressBytes);
  }

  const newAddressBytes =
    directNewAddressBytes ??
    (() => {
      try {
        return requireFetchedBytes(
          params.newAddressRaw,
          'normalizeRegisterNewAddressPayload.newAddress'
        );
      } catch {
        return null;
      }
    })();

  if (newAddressBytes && isCanonicalRegisterNewAddressBytes(newAddressBytes)) {
    return Uint8Array.from(newAddressBytes);
  }

  const newAddressPayload =
    (newAddressBytes
      ? decodeLiveLocalOpaqueEnvelope(newAddressBytes)?.payload ??
        decodeJsonFallback(newAddressBytes)
      : null) ??
    (isRecord(params.newAddressRaw) ? params.newAddressRaw : null);

  const seed =
    (newAddressBytes && newAddressBytes.length === 32
      ? Uint8Array.from(newAddressBytes)
      : null) ??
    extractCanonicalSeedFromNewAddressPayload(newAddressPayload) ??
    params.fallbackSeed ??
    null;
  if (!seed) {
    throw new Error(
      'normalizeRegisterNewAddressPayload: missing canonical 32-byte seed'
    );
  }

  const registerAddressAccounts = toRegisterAddressAccounts(params.remainingAccounts);
  if (registerAddressAccounts.length === 0) {
    throw new Error(
      'normalizeRegisterNewAddressPayload: missing register remaining accounts for helper decode'
    );
  }

  const helperResult = decodePackedAddressTreeInfoForRegisterFromTaggedInput(
    packedAddressTreeInfoBytes,
    registerAddressAccounts
  );

  if (!helperResult) {
    throw new Error(
      'normalizeRegisterNewAddressPayload: packedAddressTreeInfo helper returned empty result'
    );
  }

  // IMPORTANT:
  // helperResult.decoded.* is helper/light-space.
  // canonical payload emitted here must use canonical external index space.
  return encodeRegisterNewAddressPackedCanonical({
    seed,
    treeIndex: LIGHT_CANONICAL_EXTERNAL_INDEX.register.merkleTree,
    queueIndex: LIGHT_CANONICAL_EXTERNAL_INDEX.register.addressQueue,
    rootIndex: helperResult.decoded.rootIndex,
    assignedToAccount: REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
    assignedAccountIndex: REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
  });
}

let registerArtifactsCache: {
  key: string;
  promise: Promise<RegisterBundleArtifacts>;
} | null = null;

function registerArtifactsCacheKey(params?: NewRegisterAddressParams): string | null {
  const owner = params?.owner?.toBase58?.();
  const seed = pickRegisterAddressSeed(
    params?.lightAddressSeed,
    params?.lightAddressSeedBytes
  );
  if (!owner || !seed) {
    return null;
  }
  return `${owner}:${Buffer.from(seed).toString('hex')}`;
}

async function loadRegisterArtifactsViaStateless(
  params?: NewRegisterAddressParams
): Promise<RegisterBundleArtifacts> {
  const key = registerArtifactsCacheKey(params);
  if (!key) {
    throw new Error(
      'register stateless artifacts require owner and 32-byte lightAddressSeed'
    );
  }

  if (!registerArtifactsCache || registerArtifactsCache.key !== key) {
    registerArtifactsCache = {
      key,
      promise: buildRegisterBundleArtifactsViaStatelessRpc({
        request: params,
        runtime: getLightLocalRuntimeOverride() ?? undefined,
      }),
    };
  }

  return registerArtifactsCache.promise;
}

export function installRealLocalRegisterLightBackend(
  provider?: Partial<LocalRegisterResolverProvider>
) {
  resetLocalRegisterResolverProvider();
  registerArtifactsCache = null;

  setLocalRegisterResolverProvider({
    async getPackedAddressTreeInfo(params) {
      const artifacts = await loadRegisterArtifactsViaStateless(params);
      return artifacts.packedAddressTreeInfo;
    },

    async getValidityProofForRegister(params) {
      const artifacts = await loadRegisterArtifactsViaStateless(params);
      return artifacts.validityProof;
    },

    async getCompressedMetaForRegister(params) {
      try {
        const result = await fetchLiveRegisterMetaMeta({
          request: params,
        });
        return requireFetchedBytes(result, 'getCompressedMetaForRegister');
      } catch {
        return Uint8Array.from(REGISTER_CANONICAL_META_META_OPTION_NONE);
      }
    },

    async getNewRegisterAddressParams(params) {
      const artifacts = await loadRegisterArtifactsViaStateless(params);
      return artifacts.newAddress;
    },

    async getRemainingAccountsForRegister(params) {
      const artifacts = await loadRegisterArtifactsViaStateless(params);
      const fetched = await fetchLiveRemainingAccountsForRegister({
        request: {
          ...params,
          __liveLocalRegisterHintNewAddressRaw: artifacts.newAddress,
          __liveLocalRegisterHintTreeInfoRaw: artifacts.packedAddressTreeInfo,
        } as typeof params,
      });

      return ensureCanonicalRegisterRemainingAccounts(fetched, {
        addressTree: artifacts.addressTree,
        addressQueue: artifacts.addressQueue,
        address: artifacts.derivedAddress,
      });
    },

    ...provider,
  });

  setLightBackend(
    makeRealLocalRegisterLightBackend({
      label: 'local-register-real-backend',
      resolvePackedAddressTreeInfo: resolveLocalRegisterPackedAddressTreeInfo,
      resolveValidityProofForRegister: resolveLocalRegisterValidityProof,
      resolveMetaMeta: resolveLocalRegisterMetaMeta,
      resolveNewRegisterAddress: resolveLocalRegisterNewAddress,
      resolveRemainingAccountsForRegister: resolveLocalRegisterRemainingAccounts,
    })
  );
}
