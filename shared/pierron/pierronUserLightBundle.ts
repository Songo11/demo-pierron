import { PublicKey, SystemProgram, type AccountMeta } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "@noble/hashes/utils";
import { sanitizeRpcUrlForDisplay } from "../light/compressionRpcTransport.ts";
import {
  fetchCompressedAccountsByOwnerOverRpc,
  fetchInclusionValidityProofOverRpc,
} from "../light/lightLiveLocalClient.ts";
import {
  alignClaimCompressedAccountMetaRootFromValidityProof,
  extractPhotonValidityProofRootIndicesForClaim,
  normalizeLiveClaimerMetaToBytes,
  patchClaimCompressedAccountMetaRootIndex,
} from "../light/lightLiveLocalNormalization.ts";
import { encodeClaimValidityProofFromRpcResult } from "../light/lightRegisterValidityProofV0.ts";
import { LOCALNET_LIGHT_ACCOUNTS } from "../light/lightCanonicalConfig.ts";
import type { PartialLightLocalRuntimeConfig } from "../light/lightLocalRuntime.ts";
import type { TradeBookParticipantSnapshot } from "./tradeBookParticipant.ts";

const LIGHT_SYSTEM_PROGRAM_ID = new PublicKey(
  "SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7"
);
const REGISTERED_PROGRAM_PDA = new PublicKey(
  "35hkDgaAKwMCaxRz2ocSZ6NaUrtKkyNqU6c4RV3tYJRh"
);
const ACCOUNT_COMPRESSION_AUTHORITY = new PublicKey(
  "HwXnGK3tPkkVY6P439H2p68AxpeuWXd5PcrAxFpbmfbA"
);
const ACCOUNT_COMPRESSION_PROGRAM = new PublicKey(
  "compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq"
);

/** On-chain `#[derive(LightDiscriminator)]` = SHA256(name)[0..8] — NOT Anchor `account:`. */
function lightNativeDiscriminator(name: string): Buffer {
  return Buffer.from(sha256(utf8ToBytes(name)).subarray(0, 8));
}

const USER_ACCOUNT_CORE_DISC = lightNativeDiscriminator("UserAccountCore");
const USER_ACCOUNT_EPOCH_DISC = lightNativeDiscriminator("UserAccountEpoch");

/** Borsh body sizes for Light-hashed account data (no disc prefix). */
const USER_ACCOUNT_CORE_BODY_LEN = 113;
const USER_ACCOUNT_EPOCH_BODY_LEN = 76;

function toBigInt(value: unknown, fallback = 0n): bigint {
  if (value == null) return fallback;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "object" && value && "toString" in value) {
    try {
      const asString = (value as { toString(): string }).toString();
      if (asString.length > 0) return BigInt(asString);
    } catch {
      /* fall through */
    }
  }
  try {
    return BigInt(String(value));
  } catch {
    return fallback;
  }
}

function toU16(value: unknown, fallback = 0): number {
  return Number(toBigInt(value, BigInt(fallback))) & 0xffff;
}

function toU8(value: unknown, fallback = 0): number {
  return Number(toBigInt(value, BigInt(fallback))) & 0xff;
}

function toU32(value: unknown, fallback = 0): number {
  return Number(toBigInt(value, BigInt(fallback))) >>> 0;
}

function normalizeCompressedProofComponent(
  bytes: unknown,
  expectedLen: number,
  label: string
): number[] {
  if (bytes == null) {
    throw new Error(`Brak składowej proof (${label}) w odpowiedzi Photon.`);
  }
  if (typeof bytes === "string") {
    const asBase64 = Buffer.from(bytes, "base64");
    if (asBase64.length === expectedLen) return [...asBase64];
    const hex = bytes.replace(/^0x/i, "");
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length === expectedLen * 2) {
      return [...Buffer.from(hex, "hex")];
    }
  }
  if (bytes instanceof Uint8Array || Buffer.isBuffer(bytes)) {
    const arr = [...bytes];
    if (arr.length !== expectedLen) {
      throw new Error(`${label}: oczekiwano ${expectedLen} B, jest ${arr.length} B`);
    }
    return arr.map((b) => Number(b) & 0xff);
  }
  if (Array.isArray(bytes)) {
    if (bytes.length !== expectedLen) {
      throw new Error(`${label}: oczekiwano ${expectedLen} B, jest ${bytes.length} B`);
    }
    return bytes.map((b) => Number(b) & 0xff);
  }
  if (typeof bytes === "object" && bytes && "data" in bytes && Array.isArray((bytes as { data: unknown[] }).data)) {
    return normalizeCompressedProofComponent((bytes as { data: unknown[] }).data, expectedLen, label);
  }
  throw new Error(`Nieobsługiwany format ${label} w compressedProof.`);
}

function extractCompressedProofPayload(raw: unknown): Record<string, unknown> {
  const unwrap = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  };

  const roots = [
    unwrap(raw),
    unwrap((raw as Record<string, unknown> | null)?.value),
    unwrap((raw as Record<string, unknown> | null)?.result),
  ].filter(Boolean) as Record<string, unknown>[];

  for (const candidate of roots) {
    const proof = candidate.compressedProof ?? candidate.compressed_proof;
    if (proof && typeof proof === "object") return proof as Record<string, unknown>;
    const tuple = candidate[0] ?? candidate["0"];
    if (tuple && typeof tuple === "object") return tuple as Record<string, unknown>;
  }

  throw new Error("Brak compressedProof w odpowiedzi validity proof.");
}

export type AnchorValidityProof = {
  0: { a: Buffer; b: Buffer; c: Buffer };
};

function compressedProofComponentsToBuffers(raw: unknown): { a: Buffer; b: Buffer; c: Buffer } {
  const payload = extractCompressedProofPayload(raw);
  return {
    a: Buffer.from(normalizeCompressedProofComponent(payload.a, 32, "proof.a")),
    b: Buffer.from(normalizeCompressedProofComponent(payload.b, 64, "proof.b")),
    c: Buffer.from(normalizeCompressedProofComponent(payload.c, 32, "proof.c")),
  };
}

/** Canonical 129-byte Light proof (tag=1 + a + b + c) → Anchor `ValidityProof` tuple. */
export function anchorValidityProofFromProofBytes(proofBytes: Uint8Array): AnchorValidityProof {
  const buf = Buffer.from(proofBytes);
  if (buf.length !== 129 || buf[0] !== 1) {
    throw new Error(
      `Nieprawidłowy proof Light (${buf.length} B, tag=${buf[0] ?? "?"}) — oczekiwano 129 B z tagiem 1.`
    );
  }
  return {
    0: {
      a: Buffer.from(buf.subarray(1, 33)),
      b: Buffer.from(buf.subarray(33, 97)),
      c: Buffer.from(buf.subarray(97, 129)),
    },
  };
}

export function normalizeValidityProofForAnchor(raw: unknown): AnchorValidityProof {
  return { 0: compressedProofComponentsToBuffers(raw) };
}

export function formatCompressedAccountMetaForAnchor(
  meta: ReturnType<typeof decodeCompressedMetaObject>
) {
  const tree = meta.treeInfo ?? {
    rootIndex: 0,
    proveByIndex: false,
    merkleTreePubkeyIndex: 0,
    queuePubkeyIndex: 0,
    leafIndex: 0,
  };
  return {
    treeInfo: {
      rootIndex: toU16(tree.rootIndex, 0),
      proveByIndex: Boolean(tree.proveByIndex),
      merkleTreePubkeyIndex: toU8(tree.merkleTreePubkeyIndex, 0),
      queuePubkeyIndex: toU8(tree.queuePubkeyIndex, 0),
      leafIndex: toU32(tree.leafIndex, 0),
    },
    address: Array.isArray(meta.address)
      ? meta.address.map((b) => Number(b) & 0xff)
      : Array(32).fill(0),
    outputStateTreeIndex: toU8(meta.outputStateTreeIndex, 0),
  };
}

export function formatUserAccountForAnchor(account: Record<string, unknown>): Record<string, unknown> {
  return {
    owner:
      account.owner instanceof PublicKey ? account.owner : new PublicKey(String(account.owner)),
    nonce: toBigInt(account.nonce),
    lastActivity: toBigInt(account.lastActivity ?? account.last_activity),
    lastActiveEpoch: toBigInt(account.lastActiveEpoch ?? account.last_active_epoch, -1n),
    lastClaimedRedistributionEpoch: toBigInt(
      account.lastClaimedRedistributionEpoch ?? account.last_claimed_redistribution_epoch,
      -1n
    ),
    lastClaimTime: toBigInt(account.lastClaimTime ?? account.last_claim_time),
    ticketStart: toBigInt(account.ticketStart ?? account.ticket_start),
    ticketCount: toBigInt(account.ticketCount ?? account.ticket_count),
    ticketEpoch: toBigInt(account.ticketEpoch ?? account.ticket_epoch, -1n),
    redistributionClaimCount: toBigInt(
      account.redistributionClaimCount ?? account.redistribution_claim_count
    ),
    createdAt: toBigInt(account.createdAt ?? account.created_at),
    eligibleForRedistribution: Boolean(
      account.eligibleForRedistribution ?? account.eligible_for_redistribution
    ),
    ticksThisEpoch: toU16(account.ticksThisEpoch ?? account.ticks_this_epoch),
    ticksEpoch: toBigInt(account.ticksEpoch ?? account.ticks_epoch, -1n),
    lastTickTime: toBigInt(account.lastTickTime ?? account.last_tick_time),
    txsThisEpoch: toU16(account.txsThisEpoch ?? account.txs_this_epoch),
    txsEpoch: toBigInt(account.txsEpoch ?? account.txs_epoch, -1n),
    epochVolume: toBigInt(account.epochVolume ?? account.epoch_volume),
    epochVolumeEpoch: toBigInt(account.epochVolumeEpoch ?? account.epoch_volume_epoch, -1n),
    activityBitmap: toU32(account.activityBitmap ?? account.activity_bitmap),
    activityCycleEpoch: toBigInt(account.activityCycleEpoch ?? account.activity_cycle_epoch, -1n),
    activeEpochsCount: toU8(account.activeEpochsCount ?? account.active_epochs_count),
    lastClaimedCycle: toBigInt(account.lastClaimedCycle ?? account.last_claimed_cycle, -1n),
  };
}

type PhotonOwnerItem = {
  hash: string | null;
  raw: unknown;
  dataLen: number;
  discriminator: Buffer;
  leafIndex: number;
};

/** Serialized `UserAccountCore` / `UserAccountEpoch` on Photon (owner at byte 0 of Borsh body). */
const PIERRON_LIGHT_CORE_MIN_DATA_LEN = USER_ACCOUNT_CORE_BODY_LEN;
const PIERRON_LIGHT_EPOCH_MAX_DATA_LEN = USER_ACCOUNT_EPOCH_BODY_LEN + 8; // body or disc+body

/**
 * Photon may return Borsh body alone, or LightDiscriminator(8) || body.
 * Always return the Borsh body with owner at offset 0.
 */
function lightAccountBorshBody(data: Buffer): Buffer | null {
  if (
    data.length === USER_ACCOUNT_CORE_BODY_LEN ||
    data.length === USER_ACCOUNT_EPOCH_BODY_LEN
  ) {
    return data;
  }
  if (
    data.length === USER_ACCOUNT_CORE_BODY_LEN + 8 ||
    data.length === USER_ACCOUNT_EPOCH_BODY_LEN + 8
  ) {
    const disc = data.subarray(0, 8);
    const body = data.subarray(8);
    if (disc.equals(USER_ACCOUNT_CORE_DISC) || disc.equals(USER_ACCOUNT_EPOCH_DISC)) {
      return body;
    }
    // Unknown disc — still try body if length matches (legacy / indexer drift).
    if (
      body.length === USER_ACCOUNT_CORE_BODY_LEN ||
      body.length === USER_ACCOUNT_EPOCH_BODY_LEN
    ) {
      return body;
    }
  }
  // Nested Photon sometimes pads; prefer exact body lengths at offset 0 or 8.
  for (const off of [0, 8]) {
    for (const len of [USER_ACCOUNT_CORE_BODY_LEN, USER_ACCOUNT_EPOCH_BODY_LEN]) {
      if (data.length >= off + len) {
        const slice = data.subarray(off, off + len);
        if (off === 8) {
          const disc = data.subarray(0, 8);
          if (disc.equals(USER_ACCOUNT_CORE_DISC) || disc.equals(USER_ACCOUNT_EPOCH_DISC)) {
            return slice;
          }
        } else if (
          slice.length === USER_ACCOUNT_CORE_BODY_LEN ||
          slice.length === USER_ACCOUNT_EPOCH_BODY_LEN
        ) {
          // only accept offset-0 exact body when total length is exact (avoid truncating disc+body wrong)
          if (data.length === len) return slice;
        }
      }
    }
  }
  return null;
}

function readPierronWalletOwnerFromLightData(data: Buffer): PublicKey | null {
  const body = lightAccountBorshBody(data) ?? (data.length >= 32 ? data : null);
  if (!body || body.length < 32) return null;
  try {
    return new PublicKey(body.subarray(0, 32));
  } catch {
    return null;
  }
}

function classifyPierronLightAccountKind(data: Buffer): "core" | "epoch" | null {
  const body = lightAccountBorshBody(data);
  if (!body) {
    if (data.length >= PIERRON_LIGHT_CORE_MIN_DATA_LEN) return "core";
    if (data.length > 32 && data.length <= PIERRON_LIGHT_EPOCH_MAX_DATA_LEN) return "epoch";
    return null;
  }
  if (body.length === USER_ACCOUNT_CORE_BODY_LEN) return "core";
  if (body.length === USER_ACCOUNT_EPOCH_BODY_LEN) return "epoch";
  if (body.length >= PIERRON_LIGHT_CORE_MIN_DATA_LEN) return "core";
  if (body.length > 32 && body.length <= USER_ACCOUNT_EPOCH_BODY_LEN + 4) return "epoch";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractPhotonItems(raw: unknown): unknown[] {
  if (!isRecord(raw)) return [];
  const value = raw.value ?? raw.result ?? raw;
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.items)) return value.items;
  if (isRecord(value) && Array.isArray(value.accounts)) return value.accounts;
  return [];
}

function extractAccountDataBytes(item: unknown): Buffer | null {
  if (!isRecord(item)) return null;

  // Helius / Photon flat item: { data: { discriminator, data: "<base64>" } }
  const topData = item.data;
  if (isRecord(topData)) {
    if (typeof topData.data === "string") {
      return Buffer.from(topData.data, "base64");
    }
    if (Array.isArray(topData.data)) {
      return Buffer.from(topData.data as number[]);
    }
  }

  const account = (item.compressedAccount ?? item.compressed_account ?? item.account ?? item) as Record<
    string,
    unknown
  >;
  const data = account.data;
  if (typeof data === "string") {
    return Buffer.from(data, "base64");
  }
  if (Array.isArray(data)) {
    return Buffer.from(data);
  }
  if (isRecord(data)) {
    if (typeof data.data === "string") {
      return Buffer.from(data.data, "base64");
    }
    if (Array.isArray(data.data)) {
      return Buffer.from(data.data as number[]);
    }
  }
  return null;
}

function pierronLightKindDiscriminator(kind: "core" | "epoch"): Buffer {
  return kind === "core" ? USER_ACCOUNT_CORE_DISC : USER_ACCOUNT_EPOCH_DISC;
}

function extractHash(item: unknown): string | null {
  if (!isRecord(item)) return null;
  const account = item.compressedAccount ?? item.compressed_account ?? item;
  if (!isRecord(account)) {
    const hash = item.hash ?? item.accountHash;
    return typeof hash === "string" && hash.length > 0 ? hash : null;
  }
  const hash = account.hash ?? account.accountHash ?? item.hash;
  return typeof hash === "string" && hash.length > 0 ? hash : null;
}

function extractPhotonLeafIndex(item: unknown): number {
  if (!isRecord(item)) return 0;
  const account = item.compressedAccount ?? item.compressed_account ?? item;
  const source = isRecord(account) ? account : item;
  const leafIndex = source.leafIndex ?? source.leaf_index;
  return typeof leafIndex === "number" && Number.isFinite(leafIndex) ? Math.trunc(leafIndex) : 0;
}

function decodeCompressedMetaObject(metaBytes: Uint8Array) {
  const buf = Buffer.from(metaBytes);
  const rootIndex = buf.readUInt16LE(0);
  const proveByIndex = buf[2] !== 0;
  const merkleTreePubkeyIndex = buf[3];
  const queuePubkeyIndex = buf[4];
  const leafIndex = buf.readUInt32LE(5);
  const address = Array.from(buf.subarray(9, 41));
  const outputStateTreeIndex = buf[41] ?? merkleTreePubkeyIndex;
  return {
    treeInfo: {
      rootIndex,
      proveByIndex,
      merkleTreePubkeyIndex,
      queuePubkeyIndex,
      leafIndex,
    },
    address,
    outputStateTreeIndex,
  };
}

export function buildPierronLightSystemMetas(pierronProgramId: PublicKey): AccountMeta[] {
  const [cpiSigner] = PublicKey.findProgramAddressSync(
    [Buffer.from("cpi_authority")],
    pierronProgramId
  );

  // Light SDK v2 CompressionCpiAccountIndex — no noop / self program slots.
  return [
    { pubkey: LIGHT_SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: cpiSigner, isSigner: false, isWritable: false },
    { pubkey: REGISTERED_PROGRAM_PDA, isSigner: false, isWritable: false },
    { pubkey: ACCOUNT_COMPRESSION_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: ACCOUNT_COMPRESSION_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
}

export function buildPierronLightTreeMetas(params?: {
  addressTree?: PublicKey;
  addressQueue?: PublicKey;
  stateTree?: PublicKey;
  stateQueue?: PublicKey;
}): AccountMeta[] {
  const addressTree = params?.addressTree ?? LOCALNET_LIGHT_ACCOUNTS.addressTree;
  const addressQueue = params?.addressQueue ?? LOCALNET_LIGHT_ACCOUNTS.addressQueue;
  const stateTree = params?.stateTree ?? LOCALNET_LIGHT_ACCOUNTS.stateTree;
  const stateQueue = params?.stateQueue ?? LOCALNET_LIGHT_ACCOUNTS.stateQueue;

  return [
    { pubkey: addressTree, isSigner: false, isWritable: true },
    { pubkey: addressQueue, isSigner: false, isWritable: true },
    { pubkey: stateQueue, isSigner: false, isWritable: true },
    { pubkey: stateTree, isSigner: false, isWritable: true },
  ];
}

function mapPhotonOwnerItemsForWallet(params: {
  raw: unknown;
  walletOwner: PublicKey;
}): PhotonOwnerItem[] {
  const items = extractPhotonItems(params.raw);

  return items
    .map((item) => {
      const data = extractAccountDataBytes(item);
      if (!data || data.length < 32) return null;

      const walletInData = readPierronWalletOwnerFromLightData(data);
      if (!walletInData?.equals(params.walletOwner)) return null;

      const kind = classifyPierronLightAccountKind(data);
      if (!kind) return null;

      return {
        hash: extractHash(item),
        raw: item,
        dataLen: data.length,
        discriminator: pierronLightKindDiscriminator(kind),
        leafIndex: extractPhotonLeafIndex(item),
      };
    })
    .filter((row): row is PhotonOwnerItem => row !== null);
}

/** Photon indexes Pierron Light accounts under the program id, not the user wallet. */
export async function fetchPierronUserCompressedItems(params: {
  owner: PublicKey;
  pierronProgramId: PublicKey;
  runtime: PartialLightLocalRuntimeConfig;
}): Promise<PhotonOwnerItem[]> {
  const errors: string[] = [];

  try {
    const raw = await fetchCompressedAccountsByOwnerOverRpc({
      owner: params.pierronProgramId,
      runtime: params.runtime,
      limit: 250,
    });
    const mapped = mapPhotonOwnerItemsForWallet({ raw, walletOwner: params.owner });
    if (mapped.length > 0) return mapped;
    errors.push("json-rpc(program): 0 accounts for wallet");
  } catch (error) {
    errors.push(
      `json-rpc(program): ${sanitizeRpcUrlForDisplay(String((error as Error)?.message ?? error))}`
    );
  }

  // Legacy path: wallet as RPC owner (local validator / older indexers).
  try {
    const raw = await fetchCompressedAccountsByOwnerOverRpc({
      owner: params.owner,
      runtime: params.runtime,
      limit: 100,
    });
    const legacy = mapPhotonOwnerItemsForWallet({ raw, walletOwner: params.owner });
    if (legacy.length > 0) return legacy;
    errors.push("json-rpc(wallet): 0 accounts");
  } catch (error) {
    errors.push(
      `json-rpc(wallet): ${sanitizeRpcUrlForDisplay(String((error as Error)?.message ?? error))}`
    );
  }

  throw new Error(
    `Photon getCompressedAccountsByOwner failed (${errors.join(" | ")})`
  );
}

export async function userHasPierronLightAccountsForWallet(params: {
  owner: PublicKey;
  pierronProgramId: PublicKey;
  runtime: PartialLightLocalRuntimeConfig;
}): Promise<boolean> {
  try {
    const items = await fetchPierronUserCompressedItems(params);
    const hasCore = items.some((row) => row.discriminator.equals(USER_ACCOUNT_CORE_DISC));
    const hasEpoch = items.some((row) => row.discriminator.equals(USER_ACCOUNT_EPOCH_DISC));
    return hasCore && hasEpoch;
  } catch {
    return false;
  }
}

function pickLatestPierronItem(
  items: PhotonOwnerItem[],
  discriminator: Buffer
): PhotonOwnerItem | undefined {
  return items
    .filter((row) => row.discriminator.equals(discriminator))
    .sort((a, b) => b.leafIndex - a.leafIndex)[0];
}

export type PierronUserLightClaimBundle = {
  proof: AnchorValidityProof;
  /** Raw 129 B ValidityProof for RN-safe manual instruction build. */
  proofBytes: Buffer;
  userCoreMeta: ReturnType<typeof decodeCompressedMetaObject>;
  userEpochMeta: ReturnType<typeof decodeCompressedMetaObject>;
  userAccount: Record<string, unknown>;
  lightRemainingAccounts: AccountMeta[];
};

export function mergeParticipantIntoUserAccount(params: {
  owner: PublicKey;
  coreFields: Record<string, unknown>;
  epochFields: Record<string, unknown>;
  participant?: TradeBookParticipantSnapshot | null;
}): Record<string, unknown> {
  const p = params.participant;

  // Core/epoch hashed by Light MUST match the Photon leaf exactly.
  // Do NOT overlay trade-book ticket/activity onto those fields — on-chain merges
  // trade book after snapshotting the leaf for new_mut input.
  return formatUserAccountForAnchor({
    owner: params.owner,
    nonce: params.coreFields.nonce ?? 0,
    lastActivity: params.coreFields.lastActivity ?? params.coreFields.last_activity ?? 0,
    lastActiveEpoch: params.coreFields.lastActiveEpoch ?? params.coreFields.last_active_epoch ?? -1,
    lastClaimedRedistributionEpoch:
      params.coreFields.lastClaimedRedistributionEpoch ??
      params.coreFields.last_claimed_redistribution_epoch ??
      -1,
    lastClaimTime: params.coreFields.lastClaimTime ?? params.coreFields.last_claim_time ?? 0,
    ticketStart: params.coreFields.ticketStart ?? params.coreFields.ticket_start ?? 0,
    ticketCount: params.coreFields.ticketCount ?? params.coreFields.ticket_count ?? 0,
    ticketEpoch: params.coreFields.ticketEpoch ?? params.coreFields.ticket_epoch ?? -1,
    redistributionClaimCount:
      params.coreFields.redistributionClaimCount ??
      params.coreFields.redistribution_claim_count ??
      0,
    createdAt: params.coreFields.createdAt ?? params.coreFields.created_at ?? 0,
    eligibleForRedistribution:
      params.coreFields.eligibleForRedistribution ??
      params.coreFields.eligible_for_redistribution ??
      false,
    ticksThisEpoch: params.epochFields.ticksThisEpoch ?? params.epochFields.ticks_this_epoch ?? 0,
    ticksEpoch: params.epochFields.ticksEpoch ?? params.epochFields.ticks_epoch ?? -1,
    lastTickTime: params.epochFields.lastTickTime ?? params.epochFields.last_tick_time ?? 0,
    txsThisEpoch: params.epochFields.txsThisEpoch ?? params.epochFields.txs_this_epoch ?? 0,
    txsEpoch: params.epochFields.txsEpoch ?? params.epochFields.txs_epoch ?? -1,
    epochVolume: params.epochFields.epochVolume ?? params.epochFields.epoch_volume ?? 0,
    epochVolumeEpoch:
      params.epochFields.epochVolumeEpoch ?? params.epochFields.epoch_volume_epoch ?? -1,
    // Ix-only fields (not part of Light core/epoch leaf hash):
    activityBitmap: p?.activityBitmap ?? 0,
    activityCycleEpoch: p?.activityCycleEpoch ?? -1,
    activeEpochsCount: p?.activeEpochsCount ?? 0,
    lastClaimedCycle: p?.lastClaimedCycle ?? -1,
  });
}

function readPubkey(buf: Buffer, offset: number): PublicKey {
  return new PublicKey(buf.subarray(offset, offset + 32));
}

function readU64(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

function readI64(buf: Buffer, offset: number): bigint {
  return buf.readBigInt64LE(offset);
}

function decodeUserAccountCore(data: Buffer): Record<string, unknown> {
  let o = 0;
  const owner = readPubkey(data, o);
  o += 32;
  const nonce = readU64(data, o);
  o += 8;
  const lastActivity = readU64(data, o);
  o += 8;
  const lastActiveEpoch = readI64(data, o);
  o += 8;
  const lastClaimedRedistributionEpoch = readI64(data, o);
  o += 8;
  const lastClaimTime = readI64(data, o);
  o += 8;
  const ticketStart = readU64(data, o);
  o += 8;
  const ticketCount = readU64(data, o);
  o += 8;
  const ticketEpoch = readI64(data, o);
  o += 8;
  const redistributionClaimCount = readU64(data, o);
  o += 8;
  const createdAt = readI64(data, o);
  o += 8;
  const eligibleForRedistribution = data[o] !== 0;
  return {
    owner,
    nonce,
    lastActivity,
    lastActiveEpoch,
    lastClaimedRedistributionEpoch,
    lastClaimTime,
    ticketStart,
    ticketCount,
    ticketEpoch,
    redistributionClaimCount,
    createdAt,
    eligibleForRedistribution,
  };
}

function decodeUserAccountEpoch(data: Buffer): Record<string, unknown> {
  let o = 0;
  const owner = readPubkey(data, o);
  o += 32;
  const ticksThisEpoch = data.readUInt16LE(o);
  o += 2;
  const ticksEpoch = readI64(data, o);
  o += 8;
  const lastTickTime = readI64(data, o);
  o += 8;
  const txsThisEpoch = data.readUInt16LE(o);
  o += 2;
  const txsEpoch = readI64(data, o);
  o += 8;
  const epochVolume = readU64(data, o);
  o += 8;
  const epochVolumeEpoch = readI64(data, o);
  return {
    owner,
    ticksThisEpoch,
    ticksEpoch,
    lastTickTime,
    txsThisEpoch,
    txsEpoch,
    epochVolume,
    epochVolumeEpoch,
  };
}

export async function buildPierronUserLightClaimBundle(params: {
  owner: PublicKey;
  pierronProgramId: PublicKey;
  participant?: TradeBookParticipantSnapshot | null;
  runtime: PartialLightLocalRuntimeConfig;
}): Promise<PierronUserLightClaimBundle> {
  const items = await fetchPierronUserCompressedItems({
    owner: params.owner,
    pierronProgramId: params.pierronProgramId,
    runtime: params.runtime,
  });

  const coreItem = pickLatestPierronItem(items, USER_ACCOUNT_CORE_DISC);
  const epochItem = pickLatestPierronItem(items, USER_ACCOUNT_EPOCH_DISC);

  if (!coreItem || !epochItem) {
    throw new Error(
      "Brak skompresowanego konta użytkownika Pierron (Light). Wykonaj jednorazowo tick lub sync aktywności z DEX."
    );
  }

  const coreHash = coreItem.hash;
  const epochHash = epochItem.hash;
  if (!coreHash || !epochHash) {
    throw new Error("Photon nie zwrócił hashy skompresowanych kont użytkownika.");
  }

  const validityRaw = await fetchInclusionValidityProofOverRpc({
    hashes: [coreHash, epochHash],
    runtime: params.runtime,
  });
  const encoded = encodeClaimValidityProofFromRpcResult(validityRaw);
  const rootIndices = extractPhotonValidityProofRootIndicesForClaim(encoded.validityEnvelope);

  // Photon returns account JSON — synthesize PackedStateTreeInfo + address + output index
  // for Light CPI tree_accounts (0..3). Blind byte conversion yields garbage indices
  // (e.g. merkleTreePubkeyIndex=126) → Light System OutputMerkleTreeIndexOutOfBounds (0x17ad),
  // which clients misread as Pierron UnauthorizedOwner (same numeric code).
  let coreMetaBytes = normalizeLiveClaimerMetaToBytes(coreItem.raw);
  let epochMetaBytes = normalizeLiveClaimerMetaToBytes(epochItem.raw);
  if (coreMetaBytes.length < 42 || epochMetaBytes.length < 42) {
    throw new Error(
      `Nieprawidłowa meta Light (core=${coreMetaBytes.length} B, epoch=${epochMetaBytes.length} B) — oczekiwano ≥42 B.`
    );
  }
  if (rootIndices && rootIndices.length > 0) {
    coreMetaBytes = patchClaimCompressedAccountMetaRootIndex(coreMetaBytes, rootIndices[0] ?? 0);
    epochMetaBytes = patchClaimCompressedAccountMetaRootIndex(
      epochMetaBytes,
      rootIndices.length > 1 ? rootIndices[1]! : rootIndices[0] ?? 0
    );
    coreMetaBytes = alignClaimCompressedAccountMetaRootFromValidityProof(
      coreMetaBytes,
      rootIndices[0] ?? 0
    );
    epochMetaBytes = alignClaimCompressedAccountMetaRootFromValidityProof(
      epochMetaBytes,
      rootIndices.length > 1 ? rootIndices[1]! : rootIndices[0] ?? 0
    );
  }

  const coreDataRaw = extractAccountDataBytes(coreItem.raw);
  const epochDataRaw = extractAccountDataBytes(epochItem.raw);
  if (!coreDataRaw || !epochDataRaw) {
    throw new Error("Nie można odczytać danych skompresowanych kont użytkownika.");
  }

  const coreData = lightAccountBorshBody(coreDataRaw) ?? coreDataRaw;
  const epochData = lightAccountBorshBody(epochDataRaw) ?? epochDataRaw;

  // Photon returns Light-serialized body (owner at byte 0), not Anchor 8B account disc prefix.
  const coreFields = decodeUserAccountCore(coreData);
  const epochFields = decodeUserAccountEpoch(epochData);

  const coreOwner =
    coreFields.owner instanceof PublicKey
      ? coreFields.owner
      : new PublicKey(String(coreFields.owner));
  const epochOwner =
    epochFields.owner instanceof PublicKey
      ? epochFields.owner
      : new PublicKey(String(epochFields.owner));
  if (!coreOwner.equals(params.owner) || !epochOwner.equals(params.owner)) {
    throw new Error(
      `UnauthorizedOwner: skompresowane konto Light ma owner=${coreOwner.toBase58()}/` +
        `${epochOwner.toBase58()}, a portfel to ${params.owner.toBase58()}. ` +
        `Odłącz/połącz TEN SAM portfel, poczekaj ~30 s na Photon i spróbuj sync ponownie.`
    );
  }

  const userAccount = mergeParticipantIntoUserAccount({
    owner: params.owner,
    coreFields,
    epochFields,
    participant: params.participant,
  });

  return {
    proof: anchorValidityProofFromProofBytes(encoded.proofBytes),
    proofBytes: Buffer.from(encoded.proofBytes),
    userCoreMeta: formatCompressedAccountMetaForAnchor(decodeCompressedMetaObject(coreMetaBytes)),
    userEpochMeta: formatCompressedAccountMetaForAnchor(decodeCompressedMetaObject(epochMetaBytes)),
    userAccount,
    lightRemainingAccounts: [
      ...buildPierronLightSystemMetas(params.pierronProgramId),
      ...buildPierronLightTreeMetas(),
    ],
  };
}
