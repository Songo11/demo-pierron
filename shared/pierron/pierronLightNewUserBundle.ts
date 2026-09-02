import { Keypair, PublicKey, type AccountMeta } from "@solana/web3.js";
import { deriveAddressLegacyIndexTree } from "../core/lightAddressDerivation.ts";
import { encodeClaimValidityProofFromRpcResult } from "../light/lightRegisterValidityProofV0.ts";
import {
  fetchNewAddressValidityProofOverRpc,
} from "../light/lightLiveLocalClient.ts";
import { LOCALNET_LIGHT_ACCOUNTS } from "../light/lightCanonicalConfig.ts";
import type { PartialLightLocalRuntimeConfig } from "../light/lightLocalRuntime.ts";
import {
  anchorValidityProofFromProofBytes,
  buildPierronLightSystemMetas,
  buildPierronLightTreeMetas,
  type AnchorValidityProof,
} from "./pierronUserLightBundle.ts";
import {
  PIERRON_LIGHT_EXTERNAL_INDEX,
  PIERRON_LIGHT_OUTPUT_TREE_INDEX,
} from "./pierronLightConstants.ts";

export type PierronNewAddressParamsInput = {
  seed: Uint8Array;
  addressQueueAccountIndex: number;
  addressMerkleTreeAccountIndex: number;
  addressMerkleTreeRootIndex: number;
  assignedToAccount: boolean;
  assignedAccountIndex: number;
};

export type PierronLightNewUserBundle = {
  proof: AnchorValidityProof;
  proofBytes: Buffer;
  addressTreeInfo: {
    addressMerkleTreePubkeyIndex: number;
    addressQueuePubkeyIndex: number;
    rootIndex: number;
  };
  outputTreeIndex: number;
  lightParams: {
    coreMeta: null;
    epochMeta: null;
    newCoreAddress: PierronNewAddressParamsInput;
    newEpochAddress: PierronNewAddressParamsInput;
  };
  userAccount: Record<string, unknown>;
  lightRemainingAccounts: AccountMeta[];
  coreSeed: Uint8Array;
  epochSeed: Uint8Array;
};

function toBn254SafeSeed(raw: Uint8Array): Uint8Array {
  const out = Uint8Array.from(raw);
  out[0] = 0;
  return out;
}

function randomSeed32(): Uint8Array {
  return toBn254SafeSeed(Uint8Array.from(Keypair.generate().secretKey.subarray(0, 32)));
}

function emptyUserAccountForSync(): Record<string, unknown> {
  return {
    owner: PublicKey.default,
    nonce: 0n,
    lastActivity: 0n,
    lastActiveEpoch: -1n,
    lastClaimedRedistributionEpoch: -1n,
    lastClaimTime: 0n,
    ticketStart: 0n,
    ticketCount: 0n,
    ticketEpoch: -1n,
    redistributionClaimCount: 0n,
    createdAt: 0n,
    eligibleForRedistribution: false,
    ticksThisEpoch: 0,
    ticksEpoch: -1n,
    lastTickTime: 0n,
    txsThisEpoch: 0,
    txsEpoch: -1n,
    epochVolume: 0n,
    epochVolumeEpoch: -1n,
    activityBitmap: 0,
    activityCycleEpoch: -1n,
    activeEpochsCount: 0,
    lastClaimedCycle: -1n,
  };
}

function extractRootIndex(raw: unknown): number {
  const record = raw as Record<string, unknown> | null;
  const value = (record?.value ?? record?.result ?? record) as Record<string, unknown> | null;
  const rootIndices = value?.rootIndices ?? value?.root_indices;
  if (Array.isArray(rootIndices) && rootIndices.length > 0) {
    const first = rootIndices[0];
    if (typeof first === "number" && Number.isFinite(first)) return Math.trunc(first);
  }
  const rootIndex = value?.rootIndex ?? value?.root_index;
  if (typeof rootIndex === "number" && Number.isFinite(rootIndex)) return Math.trunc(rootIndex);
  return 0;
}

/**
 * Build Light proof + new-address params for a first-time pierron user (no Photon accounts yet).
 * Uses raw JSON-RPC only — safe on React Native.
 */
export async function buildPierronLightNewUserBundle(params: {
  pierronProgramId: PublicKey;
  runtime: PartialLightLocalRuntimeConfig;
  coreSeed?: Uint8Array;
  epochSeed?: Uint8Array;
}): Promise<PierronLightNewUserBundle> {
  const addressTree = LOCALNET_LIGHT_ACCOUNTS.addressTree;
  const addressQueue = LOCALNET_LIGHT_ACCOUNTS.addressQueue;
  const stateTree = LOCALNET_LIGHT_ACCOUNTS.stateTree;
  const stateQueue = LOCALNET_LIGHT_ACCOUNTS.stateQueue;

  const coreSeed = toBn254SafeSeed(params.coreSeed ?? randomSeed32());
  const epochSeed = toBn254SafeSeed(params.epochSeed ?? randomSeed32());

  const coreAddressBytes = deriveAddressLegacyIndexTree(addressTree, coreSeed);
  const epochAddressBytes = deriveAddressLegacyIndexTree(addressTree, epochSeed);
  const coreAddress = new PublicKey(coreAddressBytes);
  const epochAddress = new PublicKey(epochAddressBytes);

  const validityRaw = await fetchNewAddressValidityProofOverRpc({
    runtime: params.runtime,
    addressesWithTrees: [
      { address: coreAddress.toBase58(), tree: addressTree.toBase58() },
      { address: epochAddress.toBase58(), tree: addressTree.toBase58() },
    ],
  });

  const encoded = encodeClaimValidityProofFromRpcResult(validityRaw);
  const rootIndex = extractRootIndex(validityRaw);

  const treeIdx = PIERRON_LIGHT_EXTERNAL_INDEX.addressMerkleTree;
  const queueIdx = PIERRON_LIGHT_EXTERNAL_INDEX.addressQueue;

  const newCoreAddress: PierronNewAddressParamsInput = {
    seed: coreSeed,
    addressQueueAccountIndex: queueIdx,
    addressMerkleTreeAccountIndex: treeIdx,
    addressMerkleTreeRootIndex: rootIndex,
    assignedToAccount: true,
    assignedAccountIndex: 0,
  };

  const newEpochAddress: PierronNewAddressParamsInput = {
    seed: epochSeed,
    addressQueueAccountIndex: queueIdx,
    addressMerkleTreeAccountIndex: treeIdx,
    addressMerkleTreeRootIndex: rootIndex,
    assignedToAccount: true,
    assignedAccountIndex: 1,
  };

  return {
    proof: anchorValidityProofFromProofBytes(encoded.proofBytes),
    proofBytes: Buffer.from(encoded.proofBytes),
    addressTreeInfo: {
      addressMerkleTreePubkeyIndex: treeIdx,
      addressQueuePubkeyIndex: queueIdx,
      rootIndex,
    },
    outputTreeIndex: PIERRON_LIGHT_OUTPUT_TREE_INDEX,
    lightParams: {
      coreMeta: null,
      epochMeta: null,
      newCoreAddress,
      newEpochAddress,
    },
    userAccount: emptyUserAccountForSync(),
    lightRemainingAccounts: [
      ...buildPierronLightSystemMetas(params.pierronProgramId),
      ...buildPierronLightTreeMetas({
        addressTree,
        addressQueue,
        stateTree,
        stateQueue,
      }),
    ],
    coreSeed,
    epochSeed,
  };
}
