import { Connection, PublicKey } from '@solana/web3.js';

import statelessPkg from './statelessSdk.ts';

import {
  deriveAddressLegacyIndexTree,
  deriveAddressV2Batched,
  deriveCompressedAddressFromAddressTreeAccountData,
} from '../core/lightAddressDerivation.ts';
import { PIERRON_STEALTH_PROGRAM_ID } from '../core/programIds.ts';
import { getAddressMerkleTreeAccountHeader } from './addressMerkleTreeAccount.ts';

import type { RegisterProofParams, SendProofParams } from './lightClient.ts';
import type { PartialLightLocalRuntimeConfig } from './lightLocalRuntime.ts';
import { fetchInclusionValidityProofOverRpc } from './lightLiveLocalClient.ts';
import { normalizeLiveValidityProofEnvelopeToBytes } from './lightLiveLocalNormalization.ts';
import { resolveLightLocalRuntimeConfig } from './lightLocalRuntime.ts';

const { createBN254, createRpc, getDefaultAddressTreeInfo } = statelessPkg as {
  createBN254: (value: Uint8Array) => unknown;
  createRpc: (rpcUrl: string, indexerUrl: string, proverUrl: string) => {
    getValidityProofV0: (
      existingHashes: unknown[],
      newAddresses: Array<{
        address: unknown;
        tree: PublicKey;
        queue: PublicKey;
      }>
    ) => Promise<{
      compressedProof?: {
        a: number[] | Uint8Array;
        b: number[] | Uint8Array;
        c: number[] | Uint8Array;
      } | null;
      roots?: unknown[];
      rootIndices?: Array<number | null | undefined>;
      leafIndices?: Array<number | null | undefined>;
      leaves?: unknown[];
      treeInfos?: unknown[];
      proveByIndices?: Array<boolean | null | undefined>;
      [key: string]: unknown;
    }>;
    getMultipleNewAddressProofs: (
      addresses: unknown[]
    ) => Promise<Array<{
      root?: unknown;
      rootIndex?: number | null | undefined;
      value?: unknown;
      leafLowerRangeValue?: unknown;
      leafHigherRangeValue?: unknown;
      nextIndex?: unknown;
      merkleProofHashedIndexedElementLeaf?: unknown[];
      indexHashedIndexedElementLeaf?: unknown;
      treeInfo?: {
        tree?: PublicKey;
        queue?: PublicKey;
        [key: string]: unknown;
      } | null;
      [key: string]: unknown;
    }>>;
  };
  getDefaultAddressTreeInfo: () => {
    tree: PublicKey;
    queue: PublicKey;
  };
};

export type RegisterProofExperimentMode =
  | 'canonicalSeed'
  | 'canonicalDerivedAddress';

export type RegisterValidityProofV0Result = {
  proofBytes: Uint8Array;
  compressedProof: {
    a: Uint8Array;
    b: Uint8Array;
    c: Uint8Array;
  };
  rootIndex: number;
  addressTree: PublicKey;
  addressQueue: PublicKey;
  derivedAddress: Uint8Array;
  usedSeed: Uint8Array;
  seedSource:
    | 'canonicalRegisterAddressSeed'
    | 'lightAddressSeed'
    | 'lightAddressSeedBytes';
  proofExperimentMode: RegisterProofExperimentMode;
  experimentLogLines: string[];
};

function fixed32(bytes: Uint8Array | number[] | null | undefined, label: string): Uint8Array {
  if (bytes == null) {
    throw new Error(`${label} is missing (undefined compressed proof component)`);
  }
  const arr = Uint8Array.from(bytes);
  if (arr.length !== 32) {
    throw new Error(`${label} must be exactly 32 bytes, got ${arr.length}`);
  }
  return arr;
}

function fixed64(bytes: Uint8Array | number[] | null | undefined, label: string): Uint8Array {
  if (bytes == null) {
    throw new Error(`${label} is missing (undefined compressed proof component)`);
  }
  const arr = Uint8Array.from(bytes);
  if (arr.length !== 64) {
    throw new Error(`${label} must be exactly 64 bytes, got ${arr.length}`);
  }
  return arr;
}

function encodeCompressedProof(input: {
  a: Uint8Array;
  b: Uint8Array;
  c: Uint8Array;
}): Uint8Array {
  return Uint8Array.from([...input.a, ...input.b, ...input.c]);
}

function encodeValidityProofSome(compressedProof: Uint8Array): Uint8Array {
  return Uint8Array.from([1, ...compressedProof]);
}

function e2eOnchainRegisterProofSettleEnabled(): boolean {
  try {
    return typeof process !== 'undefined' && process?.env?.E2E_ONCHAIN === '1';
  } catch {
    return false;
  }
}

/**
 * `light test-validator` + Photon czasem serwują getValidity z innym kanałowym
 * Merkle root niż w tej chwili odczytywany on-chain w CPI → 6043. Po twardym
 * settle i kilku próbach indeksator zwykle dogania tip.
 *
 * Przy `E2E_ONCHAIN=1` domyślnie czekamy ~4s (nadpisz `PIERRON_E2E_INDEXER_SETTLE_MS`, `0`=wyłącz).
 */
async function waitForRegisterProofChainAlignMs(): Promise<void> {
  if (!e2eOnchainRegisterProofSettleEnabled()) return;
  const raw = process?.env?.PIERRON_E2E_INDEXER_SETTLE_MS;
  const ms =
    raw == null || raw === ''
      ? 4000
      : Math.max(0, Number.parseInt(String(raw), 10) || 0);
  if (ms === 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function toSeed32(seed: Uint8Array, label: string): Uint8Array {
  const out = Uint8Array.from(seed);
  if (out.length !== 32) {
    throw new Error(`${label} must be 32 bytes, got ${out.length}`);
  }
  return out;
}

function bytesPreview(bytes: Uint8Array, length = 8): string {
  return Array.from(bytes.slice(0, length)).join(',');
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function safePrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[unserializable]';
  }
}

function safePreviewUnknownArray(value: unknown, length = 1): string {
  if (!Array.isArray(value)) {
    return 'n/a';
  }

  return safeJson(value.slice(0, length));
}

function summarizeRawValidityShape(value: unknown): Record<string, unknown> {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  if (!record) {
    return {
      isObject: false,
      type: typeof value,
    };
  }

  return {
    isObject: true,
    keys: Object.keys(record).sort(),
    hasCompressedProof: !!record.compressedProof,
    compressedProofKeys:
      record.compressedProof &&
      typeof record.compressedProof === 'object' &&
      !Array.isArray(record.compressedProof)
        ? Object.keys(record.compressedProof as Record<string, unknown>).sort()
        : null,
    rootIndices: record.rootIndices ?? null,
    rootsLength: Array.isArray(record.roots) ? record.roots.length : null,
    leafIndices: record.leafIndices ?? null,
    leavesLength: Array.isArray(record.leaves) ? record.leaves.length : null,
    treeInfosLength: Array.isArray(record.treeInfos) ? record.treeInfos.length : null,
    proveByIndices: record.proveByIndices ?? null,
  };
}

function summarizeNewAddressProofShape(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) {
    return {
      isArray: false,
      type: typeof value,
    };
  }

  const first = value[0];
  const record =
    first && typeof first === 'object' && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : null;

  return {
    isArray: true,
    length: value.length,
    firstKeys: record ? Object.keys(record).sort() : null,
    firstRootIndex: record?.rootIndex ?? null,
    firstTreeInfo: record?.treeInfo ?? null,
    firstMerkleProofHashedIndexedElementLeafLength: Array.isArray(
      record?.merkleProofHashedIndexedElementLeaf
    )
      ? (record?.merkleProofHashedIndexedElementLeaf as unknown[]).length
      : null,
  };
}

type RegisterProofRequestExtensions = {
  canonicalRegisterAddressSeed?: Uint8Array;
  lightAddressSeedBytes?: Uint8Array;
  forcedAddressTree?: PublicKey;
  forcedAddressQueue?: PublicKey;
  expectedRootIndex?: number;
};

function resolveCanonicalRegisterSeed(request?: RegisterProofParams): {
  seed: Uint8Array;
  source: 'canonicalRegisterAddressSeed' | 'lightAddressSeed' | 'lightAddressSeedBytes';
} {
  const maybeCanonical = (request as RegisterProofParams & RegisterProofRequestExtensions | undefined)?.canonicalRegisterAddressSeed;

  if (maybeCanonical && maybeCanonical.length > 0) {
    return {
      seed: toSeed32(maybeCanonical, 'canonicalRegisterAddressSeed'),
      source: 'canonicalRegisterAddressSeed',
    };
  }

  if (request?.lightAddressSeed && request.lightAddressSeed.length > 0) {
    return {
      seed: toSeed32(request.lightAddressSeed, 'lightAddressSeed'),
      source: 'lightAddressSeed',
    };
  }

  const maybeSeedBytes = (request as RegisterProofParams & RegisterProofRequestExtensions | undefined)?.lightAddressSeedBytes;

  if (maybeSeedBytes && maybeSeedBytes.length > 0) {
    return {
      seed: toSeed32(maybeSeedBytes, 'lightAddressSeedBytes'),
      source: 'lightAddressSeedBytes',
    };
  }

  throw new Error(
    'buildRegisterValidityProofViaStatelessRpc requires canonicalRegisterAddressSeed or lightAddressSeed'
  );
}

/**
 * V1 / indexed address tree (see `deriveAddressLegacyIndexTree` in `lightAddressDerivation.ts`).
 * Hot paths use [`deriveCompressedAddressFromAddressTreeAccountData`] after reading the tree account.
 */
export function deriveAddressLegacy(
  treePubkey: PublicKey,
  seed: Uint8Array
): Uint8Array {
  return deriveAddressLegacyIndexTree(treePubkey, seed);
}

export { deriveAddressV2Batched };

function resolveAddressTreeInfo(runtime?: PartialLightLocalRuntimeConfig): {
  addressTree: PublicKey;
  addressQueue: PublicKey;
} {
  const resolved = resolveLightLocalRuntimeConfig(runtime);

  const defaultInfo = getDefaultAddressTreeInfo();

  const addressTree = resolved.addressTreePubkey
    ? new PublicKey(resolved.addressTreePubkey)
    : defaultInfo.tree;

  const addressQueue = resolved.addressQueuePubkey
    ? new PublicKey(resolved.addressQueuePubkey)
    : defaultInfo.queue;

  return {
    addressTree,
    addressQueue,
  };
}

async function logNewAddressProofExperiment(params: {
  rpc: ReturnType<typeof createRpc>;
  canonicalDerivedAddress: Uint8Array;
  addressTree: PublicKey;
  addressQueue: PublicKey;
  experimentLogLines: string[];
}): Promise<void> {
  try {
    const newAddressProofs = await params.rpc.getMultipleNewAddressProofs([
      createBN254(params.canonicalDerivedAddress),
    ]);

    const rawShape = summarizeNewAddressProofShape(newAddressProofs);

    console.log(
      '[register new-address proof raw shape]',
      safePrettyJson(rawShape)
    );
    console.log(
      '[register new-address proof raw json]',
      safePrettyJson(newAddressProofs)
    );
    console.dir(newAddressProofs, { depth: null });

    const first = Array.isArray(newAddressProofs) ? newAddressProofs[0] : null;

    const debug = {
      count: Array.isArray(newAddressProofs) ? newAddressProofs.length : null,
      firstRootIndex: first?.rootIndex ?? null,
      firstTree:
        first?.treeInfo?.tree instanceof PublicKey
          ? first.treeInfo.tree.toBase58()
          : first?.treeInfo?.tree ?? null,
      firstQueue:
        first?.treeInfo?.queue instanceof PublicKey
          ? first.treeInfo.queue.toBase58()
          : first?.treeInfo?.queue ?? null,
      firstValue: first?.value ?? null,
      firstLeafLowerRangeValue: first?.leafLowerRangeValue ?? null,
      firstLeafHigherRangeValue: first?.leafHigherRangeValue ?? null,
      firstNextIndex: first?.nextIndex ?? null,
      firstMerkleProofHashedIndexedElementLeafLength: Array.isArray(
        first?.merkleProofHashedIndexedElementLeaf
      )
        ? first.merkleProofHashedIndexedElementLeaf.length
        : null,
      firstIndexHashedIndexedElementLeaf: first?.indexHashedIndexedElementLeaf ?? null,
    };

    console.log(
      '[register new-address proof debug]',
      safePrettyJson(debug)
    );

    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.count=${String(debug.count)}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.firstRootIndex=${String(
        debug.firstRootIndex
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.firstTree=${String(debug.firstTree)}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.firstQueue=${String(debug.firstQueue)}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.firstMerkleProofHashedIndexedElementLeafLength=${String(
        debug.firstMerkleProofHashedIndexedElementLeafLength
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.firstValue=${safeJson(debug.firstValue)}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.firstLeafLowerRangeValue=${safeJson(
        debug.firstLeafLowerRangeValue
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.firstLeafHigherRangeValue=${safeJson(
        debug.firstLeafHigherRangeValue
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.firstNextIndex=${safeJson(
        debug.firstNextIndex
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.firstIndexHashedIndexedElementLeaf=${safeJson(
        debug.firstIndexHashedIndexedElementLeaf
      )}`
    );
  } catch (error) {
    console.log(
      '[register new-address proof experiment failed]',
      String((error as Error)?.message ?? error)
    );

    params.experimentLogLines.push(
      `registerProofExperiment.newAddressProof.error=${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function getProofForCandidate(params: {
  rpc: ReturnType<typeof createRpc>;
  addressTree: PublicKey;
  addressQueue: PublicKey;
  inputBytes: Uint8Array;
  mode: RegisterProofExperimentMode;
  experimentLogLines?: string[];
}): Promise<{
  mode: RegisterProofExperimentMode;
  inputBytes: Uint8Array;
  compressedProof: {
    a: Uint8Array;
    b: Uint8Array;
    c: Uint8Array;
  };
  rootIndex: number;
}> {
  await waitForRegisterProofChainAlignMs();

  const refreshCount = e2eOnchainRegisterProofSettleEnabled()
    ? Math.max(1, Number.parseInt(String(process?.env?.PIERRON_VALIDITY_REFRESH_COUNT || '2'), 10) || 1)
    : 1;
  const refreshGap = Math.max(
    0,
    Number.parseInt(String(process?.env?.PIERRON_VALIDITY_REFRESH_GAP_MS || '2000'), 10) || 0
  );

  const proofInput = {
    address: createBN254(params.inputBytes),
    tree: params.addressTree,
    queue: params.addressQueue,
  } as const;

  let validity: Awaited<ReturnType<ReturnType<typeof createRpc>['getValidityProofV0']>> = null!;

  for (let attempt = 0; attempt < refreshCount; attempt += 1) {
    if (attempt > 0 && refreshGap > 0) {
      await new Promise((resolve) => setTimeout(resolve, refreshGap));
    }
    const next = await params.rpc.getValidityProofV0([], [proofInput]);
    validity = next;
  }

  if (params.experimentLogLines && e2eOnchainRegisterProofSettleEnabled() && refreshCount > 1) {
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.validityRefresh=${String(refreshCount)}@gapMs=${String(refreshGap)}`
    );
  }

  const rawValidityShape = summarizeRawValidityShape(validity);

  console.log('[register validity proof raw shape]', safePrettyJson(rawValidityShape));
  console.log('[register validity proof raw json]', safePrettyJson(validity));
  console.dir(validity, { depth: null });

  const validityDebug = {
    mode: params.mode,
    rawValidityKeys:
      validity && typeof validity === 'object' && !Array.isArray(validity)
        ? Object.keys(validity as Record<string, unknown>).sort()
        : null,
    rootIndices: validity?.rootIndices ?? null,
    rootsLength: Array.isArray(validity?.roots) ? validity.roots.length : null,
    rootsPreview: safePreviewUnknownArray(validity?.roots, 1),
    leafIndices: validity?.leafIndices ?? null,
    leavesLength: Array.isArray(validity?.leaves) ? validity.leaves.length : null,
    leavesPreview: safePreviewUnknownArray(validity?.leaves, 1),
    treeInfosLength: Array.isArray(validity?.treeInfos) ? validity.treeInfos.length : null,
    treeInfosPreview: safePreviewUnknownArray(validity?.treeInfos, 1),
    proveByIndices: validity?.proveByIndices ?? null,
    hasCompressedProof: !!validity?.compressedProof,
  };

  console.log('[register validity proof debug]', safePrettyJson(validityDebug));

  if (params.experimentLogLines) {
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.rawValidityKeys=${safeJson(
        validityDebug.rawValidityKeys
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.rootIndices=${safeJson(
        validity?.rootIndices ?? null
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.rootsLength=${
        Array.isArray(validity?.roots) ? validity.roots.length : 'n/a'
      }`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.rootsPreview=${safePreviewUnknownArray(
        validity?.roots,
        1
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.leafIndices=${safeJson(
        validity?.leafIndices ?? null
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.leavesLength=${
        Array.isArray(validity?.leaves) ? validity.leaves.length : 'n/a'
      }`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.leavesPreview=${safePreviewUnknownArray(
        validity?.leaves,
        1
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.treeInfosLength=${
        Array.isArray(validity?.treeInfos) ? validity.treeInfos.length : 'n/a'
      }`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.treeInfosPreview=${safePreviewUnknownArray(
        validity?.treeInfos,
        1
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.proveByIndices=${safeJson(
        validity?.proveByIndices ?? null
      )}`
    );
    params.experimentLogLines.push(
      `registerProofExperiment.${params.mode}.hasCompressedProof=${
        validity?.compressedProof ? 'yes' : 'no'
      }`
    );
  }

  if (!validity?.compressedProof) {
    throw new Error(`getValidityProofV0 returned null compressedProof for mode=${params.mode}`);
  }

  const rootIndex = validity.rootIndices?.[0];
  if (rootIndex == null) {
    throw new Error(`getValidityProofV0 did not return rootIndices[0] for mode=${params.mode}`);
  }

  return {
    mode: params.mode,
    inputBytes: Uint8Array.from(params.inputBytes),
    compressedProof: {
      a: fixed32(validity.compressedProof.a, `compressedProof.a(${params.mode})`),
      b: fixed64(validity.compressedProof.b, `compressedProof.b(${params.mode})`),
      c: fixed32(validity.compressedProof.c, `compressedProof.c(${params.mode})`),
    },
    rootIndex,
  };
}

export async function buildRegisterValidityProofViaStatelessRpc(params: {
  request?: RegisterProofParams;
  runtime?: PartialLightLocalRuntimeConfig;
  forcedAddressTree?: PublicKey;
  forcedAddressQueue?: PublicKey;
  expectedRootIndex?: number;
}): Promise<RegisterValidityProofV0Result> {
  const request = params.request;

  if (!request?.owner) {
    throw new Error('buildRegisterValidityProofViaStatelessRpc requires request.owner');
  }

  const requestExt = request as RegisterProofParams & RegisterProofRequestExtensions;

  const { seed: resolvedSeed, source: seedSource } = resolveCanonicalRegisterSeed(request);

  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const indexerUrl = runtime.indexerUrl ?? runtime.photonUrl ?? runtime.rpcUrl;
  const proverUrl = runtime.proverUrl ?? indexerUrl;
  const rpc = createRpc(runtime.rpcUrl, indexerUrl, proverUrl);

  const fallbackTreeInfo = resolveAddressTreeInfo(params.runtime);

  const addressTree =
    params.forcedAddressTree ??
    requestExt.forcedAddressTree ??
    fallbackTreeInfo.addressTree;

  const addressQueue =
    params.forcedAddressQueue ??
    requestExt.forcedAddressQueue ??
    fallbackTreeInfo.addressQueue;

  const expectedRootIndex =
    params.expectedRootIndex ??
    requestExt.expectedRootIndex;

  const canonicalSeed = Uint8Array.from(resolvedSeed);

  const connection = new Connection(runtime.rpcUrl, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
  });
  let addressTreeAccount;
  try {
    addressTreeAccount = await getAddressMerkleTreeAccountHeader(
      connection,
      addressTree,
      'confirmed'
    );
  } catch (cause) {
    throw new Error(
      [
        `buildRegisterValidityProofViaStatelessRpc: failed to fetch address tree ${addressTree.toBase58()}`,
        `rpcUrl=${runtime.rpcUrl}`,
        `indexerUrl=${indexerUrl}`,
        String((cause as Error)?.message ?? cause),
      ].join(' | ')
    );
  }
  if (!addressTreeAccount?.data) {
    throw new Error(
      `buildRegisterValidityProofViaStatelessRpc: missing merkle tree account data for ${addressTree.toBase58()} (rpcUrl=${runtime.rpcUrl})`
    );
  }
  const canonicalDerivedAddress = deriveCompressedAddressFromAddressTreeAccountData(
    canonicalSeed,
    addressTree,
    PIERRON_STEALTH_PROGRAM_ID,
    new Uint8Array(addressTreeAccount.data)
  );

  const experimentLogLines: string[] = [];
  experimentLogLines.push(`registerProofExperiment.seedSource=${seedSource}`);
  experimentLogLines.push(
    `registerProofExperiment.usedSeedPreview=${bytesPreview(canonicalSeed)}`
  );
  experimentLogLines.push(
    `registerProofExperiment.derivedAddress=${new PublicKey(canonicalDerivedAddress).toBase58()}`
  );
  experimentLogLines.push(
    `registerProofExperiment.addressTree=${addressTree.toBase58()}`
  );
  experimentLogLines.push(
    `registerProofExperiment.addressQueue=${addressQueue.toBase58()}`
  );
  if (typeof expectedRootIndex === 'number') {
    experimentLogLines.push(`registerProofExperiment.expectedRootIndex=${expectedRootIndex}`);
  }

  await logNewAddressProofExperiment({
    rpc,
    canonicalDerivedAddress,
    addressTree,
    addressQueue,
    experimentLogLines,
  });

  // Raw 32-byte seed is not a valid BN254 field element for getValidityProofV0 (createBN254).
  // Proofs must use the derived compressed address bytes.
  let canonicalDerivedAddressAttempt:
    | Awaited<ReturnType<typeof getProofForCandidate>>
    | null = null;
  let canonicalDerivedAddressError: unknown = null;

  try {
    canonicalDerivedAddressAttempt = await getProofForCandidate({
      rpc,
      addressTree,
      addressQueue,
      inputBytes: canonicalDerivedAddress,
      mode: 'canonicalDerivedAddress',
      experimentLogLines,
    });

    experimentLogLines.push(
      `registerProofExperiment.canonicalDerivedAddress.mode=ok rootIndex=${canonicalDerivedAddressAttempt.rootIndex} inputPreview=${bytesPreview(
        canonicalDerivedAddressAttempt.inputBytes
      )}`
    );
  } catch (error) {
    canonicalDerivedAddressError = error;
    experimentLogLines.push(
      `registerProofExperiment.canonicalDerivedAddress.mode=error message=${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const selected = canonicalDerivedAddressAttempt;

  if (!selected) {
    const detail =
      canonicalDerivedAddressError instanceof Error
        ? canonicalDerivedAddressError.message
        : String(canonicalDerivedAddressError);
    const needsHelius =
      detail.includes('Method not found') || detail.includes('method not found');
    const proverStackHint =
      detail.includes('Internal server error')
        ? ' Prover/Photon: ensure prover is reachable (localnet :3001 or Helius devnet with ZK compression).'
        : needsHelius
          ? ' Użyj Helius API key w Ustawieniach (devnet). Publiczny api.devnet.solana.com nie ma getValidityProofV0 / Photon.'
          : '';
    throw new Error(
      [
        'buildRegisterValidityProofViaStatelessRpc: validity proof failed',
        detail,
        proverStackHint,
      ]
        .filter((line) => line.length > 0)
        .join('\n')
    );
  }

  if (
    typeof expectedRootIndex === 'number' &&
    selected.rootIndex !== expectedRootIndex
  ) {
    throw new Error(
      `register proof root mismatch: expectedRootIndex=${expectedRootIndex}, selectedRootIndex=${selected.rootIndex}`
    );
  }

  experimentLogLines.push(
    `registerProofExperiment.selectedMode=${selected.mode}`
  );

  const encodedCompressedProof = encodeCompressedProof(selected.compressedProof);
  const proofBytes = encodeValidityProofSome(encodedCompressedProof);

  return {
    proofBytes,
    compressedProof: selected.compressedProof,
    rootIndex: selected.rootIndex,
    addressTree,
    addressQueue,
    derivedAddress: canonicalDerivedAddress,
    usedSeed: canonicalSeed,
    seedSource,
    proofExperimentMode: selected.mode,
    experimentLogLines,
  };
}

/**
 * Send stealth: same Groth16 new-address proof as register, but keyed by sender + payment seed.
 * Must use derived compressed address bytes (not stealth pubkey) — Helius `newAddressesWithTrees`
 * with pubkey causes Light System 6043 (`ProofVerificationFailed`).
 */
export async function buildSendValidityProofViaStatelessRpc(params: {
  request?: SendProofParams;
  runtime?: PartialLightLocalRuntimeConfig;
}): Promise<RegisterValidityProofV0Result> {
  const request = params.request;

  const seed =
    request?.lightAddressSeed && request.lightAddressSeed.length > 0
      ? request.lightAddressSeed
      : null;

  if (!seed || seed.length !== 32) {
    throw new Error(
      'buildSendValidityProofViaStatelessRpc requires 32-byte lightAddressSeed'
    );
  }

  return buildRegisterValidityProofViaStatelessRpc({
    request: {
      owner: request?.sender ?? request?.stealthAddress,
      lightAddressSeed: seed,
      cluster: request?.cluster,
      outputTreeIndex: request?.outputTreeIndex,
    },
    runtime: params.runtime,
  });
}

export type ClaimValidityProofV0Result = {
  proofBytes: Uint8Array;
  /** Raw `getValidityProofV0` response — `rootIndices` alignment in `buildClaimLightBundle`. */
  validityEnvelope: Record<string, unknown>;
};

type ValidityProofRpcShape = {
  compressedProof?: {
    a?: Uint8Array | number[] | null;
    b?: Uint8Array | number[] | null;
    c?: Uint8Array | number[] | null;
  } | null;
  [key: string]: unknown;
};

/** Shared by JSON-RPC claim proof (Helius / Photon) and tests. */
export function encodeClaimValidityProofFromRpcResult(
  raw: unknown
): ClaimValidityProofV0Result {
  const validity = raw as ValidityProofRpcShape;
  let proofBytes: Uint8Array;

  if (validity?.compressedProof) {
    const encodedCompressedProof = encodeCompressedProof({
      a: fixed32(validity.compressedProof.a, 'claim.compressedProof.a'),
      b: fixed64(validity.compressedProof.b, 'claim.compressedProof.b'),
      c: fixed32(validity.compressedProof.c, 'claim.compressedProof.c'),
    });
    proofBytes = encodeValidityProofSome(encodedCompressedProof);
  } else {
    proofBytes = normalizeLiveValidityProofEnvelopeToBytes(raw);
  }

  const validityEnvelope: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : { value: raw };

  return { proofBytes, validityEnvelope };
}

/** Photon / Helius zwraca hash skompresowanego konta jako base58 (nie hex). */
const DISCOVERY_HASH_BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;

function discoveryHashToBn254(hash: string): unknown {
  const trimmed = hash.trim();
  if (!trimmed) {
    throw new Error('claim source hash is empty');
  }
  if (/^\d+$/.test(trimmed)) {
    return createBN254(trimmed);
  }
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length >= 16) {
    return createBN254(trimmed, 16);
  }
  if (DISCOVERY_HASH_BASE58.test(trimmed)) {
    return createBN254(trimmed, 'base58');
  }
  throw new Error(
    `Unrecognized claim source hash format (expected decimal, hex, or base58; len=${trimmed.length})`
  );
}

/**
 * Claim stealth: inclusion proof over existing compressed accounts (StealthMeta + StealthPayment).
 * Helius Photon `getValidityProof` JSON often lacks a normalizable `compressedProof`; stateless RPC matches register/send.
 *
 * `sourceHashes` order must match on-chain CPI: claimer meta first, payment second.
 */
export async function buildClaimValidityProofViaStatelessRpc(params: {
  sourceHashes: string[];
  runtime?: PartialLightLocalRuntimeConfig;
}): Promise<ClaimValidityProofV0Result> {
  const hashes = params.sourceHashes
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is string => item.length > 0);

  if (hashes.length < 2) {
    throw new Error(
      `buildClaimValidityProofViaStatelessRpc requires at least two source hashes (meta then payment), got ${hashes.length}`
    );
  }

  await waitForRegisterProofChainAlignMs();

  const runtime = resolveLightLocalRuntimeConfig(params.runtime);
  const onHeliusDevnet = (runtime.rpcUrl ?? '').includes('devnet.helius-rpc.com');
  const refreshCount = e2eOnchainRegisterProofSettleEnabled() || onHeliusDevnet
    ? Math.max(1, Number.parseInt(String(process?.env?.PIERRON_VALIDITY_REFRESH_COUNT || '2'), 10) || 2)
    : 1;
  const refreshGap = Math.max(
    0,
    Number.parseInt(String(process?.env?.PIERRON_VALIDITY_REFRESH_GAP_MS || '2000'), 10) || 0
  );

  let lastError: unknown;
  for (let attempt = 0; attempt < refreshCount; attempt += 1) {
    if (attempt > 0 && refreshGap > 0) {
      await new Promise((resolve) => setTimeout(resolve, refreshGap));
    }
    try {
      const raw = await fetchInclusionValidityProofOverRpc({
        hashes,
        runtime: params.runtime,
      });
      return encodeClaimValidityProofFromRpcResult(raw);
    } catch (error) {
      lastError = error;
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown');
  throw new Error(`buildClaimValidityProofViaStatelessRpc: ${detail}`);
}
