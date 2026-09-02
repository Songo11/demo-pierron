import { PublicKey } from '@solana/web3.js';

import type {
  RegisterLightBundle,
  SendLightBundle,
  SendProofParams,
} from './lightClient.ts';
import {
  alignSendNewPaymentAddressRoot,
} from './lightSendRootAlignment.ts';
import { normalizeLiveNewPaymentAddressToBytes } from './lightLiveLocalNormalization.ts';
import { LIGHT_CANONICAL_EXTERNAL_INDEX } from './lightCanonicalConfig.ts';
import type { RegisterProofParams } from './lightClient.ts';
import {
  buildRegisterValidityProofViaStatelessRpc,
  buildSendValidityProofViaStatelessRpc,
} from './lightRegisterValidityProofV0.ts';
import type { PartialLightLocalRuntimeConfig } from './lightLocalRuntime.ts';
import {
  REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
  REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
} from './registerCanonicalContract.ts';

export function encodeRegisterPackedAddressTreeInfoBytes(rootIndex: number): Uint8Array {
  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.register;
  const out = new Uint8Array(4);
  out[0] = canonical.merkleTree & 0xff;
  out[1] = canonical.addressQueue & 0xff;
  out[2] = rootIndex & 0xff;
  out[3] = (rootIndex >> 8) & 0xff;
  return out;
}

export type RegisterBundleArtifacts = {
  validityProof: Uint8Array;
  packedAddressTreeInfo: Uint8Array;
  newAddress: Uint8Array;
  addressTree: PublicKey;
  addressQueue: PublicKey;
  derivedAddress: PublicKey;
};

export type SendBundleArtifacts = {
  validityProof: Uint8Array;
  packedAddressTreeInfo: Uint8Array;
  newPaymentAddress: Uint8Array;
  addressTree: PublicKey;
  addressQueue: PublicKey;
  derivedAddress: PublicKey;
};

export function encodeSendPackedAddressTreeInfoBytes(rootIndex: number): Uint8Array {
  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.send;
  const out = new Uint8Array(4);
  out[0] = canonical.merkleTree & 0xff;
  out[1] = canonical.addressQueue & 0xff;
  out[2] = rootIndex & 0xff;
  out[3] = (rootIndex >> 8) & 0xff;
  return out;
}

/**
 * Helius/devnet: raw JSON-RPC `getMultipleNewAddressProofs` often returns -32601.
 * Use @lightprotocol/stateless.js (same as local validator stack).
 */
export async function buildRegisterBundleArtifactsViaStatelessRpc(params: {
  request?: RegisterProofParams;
  runtime?: PartialLightLocalRuntimeConfig;
}): Promise<RegisterBundleArtifacts> {
  const result = await buildRegisterValidityProofViaStatelessRpc(params);
  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.register;

  return {
    validityProof: result.proofBytes,
    packedAddressTreeInfo: encodeRegisterPackedAddressTreeInfoBytes(result.rootIndex),
    newAddress: encodeRegisterNewAddressPackedCanonical({
      seed: result.usedSeed,
      treeIndex: canonical.merkleTree,
      queueIndex: canonical.addressQueue,
      rootIndex: result.rootIndex,
    }),
    addressTree: result.addressTree,
    addressQueue: result.addressQueue,
    derivedAddress: new PublicKey(result.derivedAddress),
  };
}

/**
 * Devnet send: stateless `getValidityProofV0` + canonical packed new payment address
 * (aligned root/tree indices). Avoids Helius proof over stealth pubkey (6043).
 */
export async function buildSendBundleArtifactsViaStatelessRpc(params: {
  request?: SendProofParams;
  runtime?: PartialLightLocalRuntimeConfig;
}): Promise<SendBundleArtifacts> {
  const result = await buildSendValidityProofViaStatelessRpc(params);
  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.send;

  return {
    validityProof: result.proofBytes,
    packedAddressTreeInfo: encodeSendPackedAddressTreeInfoBytes(result.rootIndex),
    newPaymentAddress: encodeRegisterNewAddressPackedCanonical({
      seed: result.usedSeed,
      treeIndex: canonical.merkleTree,
      queueIndex: canonical.addressQueue,
      rootIndex: result.rootIndex,
    }),
    addressTree: result.addressTree,
    addressQueue: result.addressQueue,
    derivedAddress: new PublicKey(result.derivedAddress),
  };
}

export function encodeRegisterNewAddressPackedCanonical(params: {
  seed: Uint8Array;
  treeIndex: number;
  queueIndex: number;
  rootIndex: number;
  assignedToAccount?: boolean;
  assignedAccountIndex?: number;
}): Uint8Array {
  if (params.seed.length !== 32) {
    throw new Error(
      `register newAddress seed must be 32 bytes, got ${params.seed.length}`
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

export function readPackedAddressTreeRootIndex(
  bytes: Uint8Array | null | undefined
): number {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) {
    return 0;
  }
  return (bytes[2] ?? 0) | ((bytes[3] ?? 0) << 8);
}

export function isCanonicalRegisterNewAddressBytes(
  bytes: Uint8Array | null | undefined
): boolean {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 38) {
    return false;
  }

  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.register;
  return (
    bytes[32] === canonical.addressQueue &&
    bytes[33] === canonical.merkleTree &&
    bytes[36] === (REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT ? 1 : 0) &&
    bytes[37] === REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX
  );
}

export function isCanonicalSendNewPaymentAddressBytes(
  bytes: Uint8Array | null | undefined
): boolean {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 38) {
    return false;
  }

  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.send;
  return (
    bytes[32] === canonical.addressQueue &&
    bytes[33] === canonical.merkleTree &&
    bytes[36] === (REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT ? 1 : 0) &&
    bytes[37] === REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX
  );
}

/**
 * Helius/Photon often returns LLRB envelopes instead of 38B `NewAddressParamsAssignedPacked`.
 * Decode when possible; otherwise rebuild from prepare-send `lightAddressSeed` + packed tree info.
 */
export function normalizeOrRepairSendNewPaymentAddressBytes(
  bytes: Uint8Array,
  lightAddressSeed?: Uint8Array | null,
  packedAddressTreeInfo?: Uint8Array | null,
  proofRootIndex?: number | null
): Uint8Array {
  let out: Uint8Array | null = null;

  if (isCanonicalSendNewPaymentAddressBytes(bytes)) {
    out = bytes;
  } else if (bytes.length === 38) {
    out = bytes;
  } else {
    try {
      const normalized = normalizeLiveNewPaymentAddressToBytes({ value: bytes });
      if (normalized.length === 38) {
        out = normalized;
      }
    } catch {
      // fall through to seed repair
    }
  }

  if (!out) {
    const seed = pickRegisterAddressSeed(lightAddressSeed);
    if (seed) {
      const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.send;
      const treeIndex =
        packedAddressTreeInfo && packedAddressTreeInfo.length >= 2
          ? packedAddressTreeInfo[0]!
          : canonical.merkleTree;
      const queueIndex =
        packedAddressTreeInfo && packedAddressTreeInfo.length >= 2
          ? packedAddressTreeInfo[1]!
          : canonical.addressQueue;
      const rootIndex =
        proofRootIndex ??
        readPackedAddressTreeRootIndex(packedAddressTreeInfo ?? null);
      out = encodeRegisterNewAddressPackedCanonical({
        seed,
        treeIndex,
        queueIndex,
        rootIndex,
      });
    }
  }

  if (!out) {
    return bytes;
  }

  if (proofRootIndex != null && out.length === 38) {
    return alignSendNewPaymentAddressRoot(out, proofRootIndex);
  }

  return out;
}

export function pickRegisterAddressSeed(
  ...candidates: Array<Uint8Array | null | undefined>
): Uint8Array | null {
  for (const candidate of candidates) {
    if (candidate instanceof Uint8Array && candidate.length === 32) {
      return Uint8Array.from(candidate);
    }
  }
  return null;
}

/**
 * Devnet Helius often returns opaque JSON instead of 38B packed params.
 * Rebuild canonical newAddress from prepare-register seed + packed tree info.
 */
export function repairRegisterLightBundleNewAddress(
  bundle: RegisterLightBundle,
  lightAddressSeed?: Uint8Array | null
): RegisterLightBundle {
  if (isCanonicalRegisterNewAddressBytes(bundle.newAddress?.value ?? null)) {
    return bundle;
  }

  const seed = pickRegisterAddressSeed(
    lightAddressSeed,
    bundle.newAddress?.value instanceof Uint8Array &&
      bundle.newAddress.value.length === 32
      ? bundle.newAddress.value
      : null
  );

  if (!seed) {
    return bundle;
  }

  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.register;
  const rootIndex = readPackedAddressTreeRootIndex(
    bundle.packedAddressTreeInfo?.value ?? null
  );

  const value = encodeRegisterNewAddressPackedCanonical({
    seed,
    treeIndex: canonical.merkleTree,
    queueIndex: canonical.addressQueue,
    rootIndex,
  });

  return {
    ...bundle,
    newAddress: {
      status: 'ready',
      source: 'light-client',
      note: 'repaired register newAddress from lightAddressSeed + packedAddressTreeInfo',
      value,
      serializationKind: 'canonical',
    },
  };
}

/**
 * Devnet Helius often returns opaque LLRB for `newPaymentAddress` instead of 38B packed params.
 */
export function repairSendLightBundleNewPaymentAddress(
  bundle: SendLightBundle,
  lightAddressSeed?: Uint8Array | null
): SendLightBundle {
  const current = bundle.newPaymentAddress?.value;
  if (isCanonicalSendNewPaymentAddressBytes(current ?? null)) {
    return bundle;
  }
  if (!(current instanceof Uint8Array) || current.length === 0) {
    return bundle;
  }

  const packed = bundle.packedAddressTreeInfo?.value ?? null;
  const proofRoot = readPackedAddressTreeRootIndex(packed);
  const repaired = normalizeOrRepairSendNewPaymentAddressBytes(
    current,
    lightAddressSeed,
    packed,
    proofRoot
  );

  if (repaired.length !== 38) {
    return bundle;
  }
  if (
    current.length === repaired.length &&
    current.every((byte, index) => byte === repaired[index])
  ) {
    return bundle;
  }

  return {
    ...bundle,
    newPaymentAddress: {
      status: 'ready',
      source: 'light-client',
      note: 'repaired send newPaymentAddress from lightAddressSeed + packedAddressTreeInfo',
      value: repaired,
      serializationKind: 'canonical',
    },
  };
}
