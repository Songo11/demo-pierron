import {
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { anchorInstructionDiscriminator } from "../core/anchorDiscriminator.ts";
import type { AnchorValidityProof } from "./pierronUserLightBundle.ts";

function u8(value: number): Buffer {
  const b = Buffer.alloc(1);
  b.writeUInt8(value & 0xff, 0);
  return b;
}

function u16(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value & 0xffff, 0);
  return b;
}

function u32(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0, 0);
  return b;
}

function bool(value: boolean): Buffer {
  return u8(value ? 1 : 0);
}

function u64(value: bigint): Buffer {
  // DataView — browser Buffer polyfills often lack writeBigUInt64LE.
  const b = Buffer.alloc(8);
  new DataView(b.buffer, b.byteOffset, 8).setBigUint64(0, value, true);
  return b;
}

function i64(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  new DataView(b.buffer, b.byteOffset, 8).setBigInt64(0, value, true);
  return b;
}

function pubkey(pk: PublicKey): Buffer {
  return pk.toBuffer();
}

function fixed32(bytes: unknown, label: string): Buffer {
  if (Buffer.isBuffer(bytes)) {
    if (bytes.length !== 32) throw new Error(`${label}: oczekiwano 32 B, jest ${bytes.length} B`);
    return Buffer.from(bytes);
  }
  if (bytes instanceof Uint8Array) {
    if (bytes.length !== 32) throw new Error(`${label}: oczekiwano 32 B, jest ${bytes.length} B`);
    return Buffer.from(bytes);
  }
  if (Array.isArray(bytes)) {
    if (bytes.length !== 32) throw new Error(`${label}: oczekiwano 32 B, jest ${bytes.length} B`);
    return Buffer.from(bytes.map((b) => Number(b) & 0xff));
  }
  throw new Error(`${label}: nieobsługiwany format adresu meta.`);
}

function bnToBigInt(value: unknown, fallback = 0n): bigint {
  if (value == null) return fallback;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "object" && value && "toString" in value) {
    try {
      return BigInt((value as { toString(): string }).toString());
    } catch {
      return fallback;
    }
  }
  try {
    return BigInt(String(value));
  } catch {
    return fallback;
  }
}

/** 129 B: tag=1 + compressed proof (RN-safe, bez Anchor layout). */
export function encodeValidityProofBuffer(proof: AnchorValidityProof | Uint8Array): Buffer {
  if (proof instanceof Uint8Array || Buffer.isBuffer(proof)) {
    const buf = Buffer.from(proof);
    if (buf.length !== 129 || buf[0] !== 1) {
      throw new Error(
        `Nieprawidłowy proof (${buf.length} B, tag=${buf[0] ?? "?"}); oczekiwano 129 B z tagiem 1.`
      );
    }
    return buf;
  }

  const inner = proof[0];
  return Buffer.concat([
    Buffer.from([1]),
    fixed32(inner.a, "proof.a"),
    Buffer.from(inner.b),
    fixed32(inner.c, "proof.c"),
  ]);
}

export function encodeCompressedAccountMetaBuffer(meta: {
  treeInfo: {
    rootIndex: number;
    proveByIndex: boolean;
    merkleTreePubkeyIndex: number;
    queuePubkeyIndex: number;
    leafIndex: number;
  };
  address: unknown;
  outputStateTreeIndex: number;
}): Buffer {
  const tree = meta.treeInfo;
  return Buffer.concat([
    u16(tree.rootIndex),
    bool(tree.proveByIndex),
    u8(tree.merkleTreePubkeyIndex),
    u8(tree.queuePubkeyIndex),
    u32(tree.leafIndex),
    fixed32(meta.address, "compressedAccountMeta.address"),
    u8(meta.outputStateTreeIndex),
  ]);
}

export function encodeUserAccountBuffer(account: Record<string, unknown>): Buffer {
  const owner =
    account.owner instanceof PublicKey ? account.owner : new PublicKey(String(account.owner));

  const buf = Buffer.concat([
    pubkey(owner),
    u64(bnToBigInt(account.nonce)),
    u64(bnToBigInt(account.lastActivity ?? account.last_activity)),
    i64(bnToBigInt(account.lastActiveEpoch ?? account.last_active_epoch, -1n)),
    i64(
      bnToBigInt(
        account.lastClaimedRedistributionEpoch ?? account.last_claimed_redistribution_epoch,
        -1n
      )
    ),
    i64(bnToBigInt(account.lastClaimTime ?? account.last_claim_time)),
    u64(bnToBigInt(account.ticketStart ?? account.ticket_start)),
    u64(bnToBigInt(account.ticketCount ?? account.ticket_count)),
    i64(bnToBigInt(account.ticketEpoch ?? account.ticket_epoch, -1n)),
    u64(bnToBigInt(account.redistributionClaimCount ?? account.redistribution_claim_count)),
    i64(bnToBigInt(account.createdAt ?? account.created_at)),
    bool(Boolean(account.eligibleForRedistribution ?? account.eligible_for_redistribution)),
    u16(Number(bnToBigInt(account.ticksThisEpoch ?? account.ticks_this_epoch))),
    i64(bnToBigInt(account.ticksEpoch ?? account.ticks_epoch, -1n)),
    i64(bnToBigInt(account.lastTickTime ?? account.last_tick_time)),
    u16(Number(bnToBigInt(account.txsThisEpoch ?? account.txs_this_epoch))),
    i64(bnToBigInt(account.txsEpoch ?? account.txs_epoch, -1n)),
    u64(bnToBigInt(account.epochVolume ?? account.epoch_volume)),
    i64(bnToBigInt(account.epochVolumeEpoch ?? account.epoch_volume_epoch, -1n)),
    u32(Number(bnToBigInt(account.activityBitmap ?? account.activity_bitmap))),
    i64(bnToBigInt(account.activityCycleEpoch ?? account.activity_cycle_epoch, -1n)),
    u8(Number(bnToBigInt(account.activeEpochsCount ?? account.active_epochs_count))),
    i64(bnToBigInt(account.lastClaimedCycle ?? account.last_claimed_cycle, -1n)),
  ]);
  if (buf.length !== 178) {
    throw new Error(`UserAccount encode length ${buf.length} ≠ 178`);
  }
  // RN Buffer.subarray() may return Uint8Array without .equals — compare via Buffer.
  const wiredOwner = Buffer.from(buf.subarray(0, 32));
  const expectedOwner = Buffer.from(owner.toBytes());
  if (wiredOwner.length !== 32 || Buffer.compare(wiredOwner, expectedOwner) !== 0) {
    throw new Error("UserAccount encode: owner bytes mismatch");
  }
  return buf;
}

export function buildPayoutLotteryInstruction(params: {
  programId: PublicKey;
  payer: PublicKey;
  accountingState: PublicKey;
  lotteryVault: PublicKey;
  lotteryAuthority: PublicKey;
  pendingLotteryPayout: PublicKey;
  proof: AnchorValidityProof | Uint8Array;
  userAccount: Record<string, unknown>;
  userCoreMeta: Record<string, unknown>;
  userEpochMeta: Record<string, unknown>;
  remainingAccounts: AccountMeta[];
}): TransactionInstruction {
  const proofBuffer = encodeValidityProofBuffer(params.proof);
  const coreMetaBuffer = encodeCompressedAccountMetaBuffer(
    params.userCoreMeta as Parameters<typeof encodeCompressedAccountMetaBuffer>[0]
  );
  const epochMetaBuffer = encodeCompressedAccountMetaBuffer(
    params.userEpochMeta as Parameters<typeof encodeCompressedAccountMetaBuffer>[0]
  );
  const userBuffer = encodeUserAccountBuffer(params.userAccount);

  const data = Buffer.concat([
    anchorInstructionDiscriminator("payout_lottery"),
    proofBuffer,
    userBuffer,
    coreMetaBuffer,
    epochMetaBuffer,
  ]);

  const keys: AccountMeta[] = [
    { pubkey: params.payer, isSigner: true, isWritable: true },
    { pubkey: params.accountingState, isSigner: false, isWritable: true },
    { pubkey: params.lotteryVault, isSigner: false, isWritable: false },
    { pubkey: params.lotteryAuthority, isSigner: false, isWritable: false },
    { pubkey: params.pendingLotteryPayout, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ...params.remainingAccounts,
  ];

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data,
  });
}

export function buildClaimRedistributionInstruction(params: {
  programId: PublicKey;
  user: PublicKey;
  redistributionVault: PublicKey;
  redistributionAuthority: PublicKey;
  accountingState: PublicKey;
  pendingRedistributionClaim: PublicKey;
  userToken: PublicKey;
  proof: AnchorValidityProof | Uint8Array;
  userAccount: Record<string, unknown>;
  userCoreMeta: Record<string, unknown>;
  userEpochMeta: Record<string, unknown>;
  remainingAccounts: AccountMeta[];
}): TransactionInstruction {
  const proofBuffer = encodeValidityProofBuffer(params.proof);
  const coreMetaBuffer = encodeCompressedAccountMetaBuffer(
    params.userCoreMeta as Parameters<typeof encodeCompressedAccountMetaBuffer>[0]
  );
  const epochMetaBuffer = encodeCompressedAccountMetaBuffer(
    params.userEpochMeta as Parameters<typeof encodeCompressedAccountMetaBuffer>[0]
  );
  const userBuffer = encodeUserAccountBuffer(params.userAccount);

  const data = Buffer.concat([
    anchorInstructionDiscriminator("claim_redistribution"),
    proofBuffer,
    userBuffer,
    coreMetaBuffer,
    epochMetaBuffer,
  ]);

  // Guard: owner in wire layout must be the claim signer (else on-chain UnauthorizedOwner).
  // RN-safe: Buffer.from(subarray) — subarray alone may be Uint8Array without helpers.
  const ownerOffset = 8 + proofBuffer.length;
  const wiredOwner = new PublicKey(Buffer.from(data.subarray(ownerOffset, ownerOffset + 32)));
  if (!wiredOwner.equals(params.user)) {
    throw new Error(
      `Claim wire owner mismatch: ix=${wiredOwner.toBase58()} signer=${params.user.toBase58()}`
    );
  }

  const keys: AccountMeta[] = [
    { pubkey: params.user, isSigner: true, isWritable: true },
    { pubkey: params.redistributionVault, isSigner: false, isWritable: true },
    { pubkey: params.redistributionAuthority, isSigner: false, isWritable: false },
    { pubkey: params.accountingState, isSigner: false, isWritable: true },
    { pubkey: params.pendingRedistributionClaim, isSigner: false, isWritable: true },
    { pubkey: params.userToken, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ...params.remainingAccounts,
  ];

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data,
  });
}

/** Consume lottery voucher after settlement transfer (winner must already hold tokens). */
export function buildClaimLotteryPayoutInstruction(params: {
  programId: PublicKey;
  winner: PublicKey;
  tradeConfig: PublicKey;
  accountingState: PublicKey;
  pendingLotteryPayout: PublicKey;
  lotteryVault: PublicKey;
  winnerToken: PublicKey;
}): TransactionInstruction {
  const keys: AccountMeta[] = [
    { pubkey: params.winner, isSigner: true, isWritable: true },
    { pubkey: params.tradeConfig, isSigner: false, isWritable: true },
    { pubkey: params.accountingState, isSigner: false, isWritable: true },
    { pubkey: params.pendingLotteryPayout, isSigner: false, isWritable: true },
    { pubkey: params.lotteryVault, isSigner: false, isWritable: false },
    { pubkey: params.winnerToken, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data: anchorInstructionDiscriminator("claim_lottery_payout"),
  });
}

export function buildSettleLotteryPayoutInstruction(params: {
  programId: PublicKey;
  payer: PublicKey;
  settlementAuthority: PublicKey;
  pierronProgram: PublicKey;
  transferHookProgram: PublicKey;
  tradeConfig: PublicKey;
  accountingState: PublicKey;
  pendingLotteryPayout: PublicKey;
  lotteryVault: PublicKey;
  lotteryAuthority: PublicKey;
  winnerToken: PublicKey;
  sourceMint: PublicKey;
  tokenProgram: PublicKey;
  extraAccountMetaList: PublicKey;
  venueAllowlist: PublicKey;
  tradeBook: PublicKey;
  redistributionVault: PublicKey;
  hookTaxDelegate: PublicKey;
}): TransactionInstruction {
  const keys: AccountMeta[] = [
    { pubkey: params.payer, isSigner: true, isWritable: true },
    { pubkey: params.settlementAuthority, isSigner: false, isWritable: false },
    { pubkey: params.programId, isSigner: false, isWritable: false },
    { pubkey: params.pierronProgram, isSigner: false, isWritable: false },
    { pubkey: params.transferHookProgram, isSigner: false, isWritable: false },
    { pubkey: params.tradeConfig, isSigner: false, isWritable: true },
    { pubkey: params.accountingState, isSigner: false, isWritable: true },
    { pubkey: params.pendingLotteryPayout, isSigner: false, isWritable: true },
    { pubkey: params.lotteryVault, isSigner: false, isWritable: true },
    { pubkey: params.lotteryAuthority, isSigner: false, isWritable: false },
    { pubkey: params.winnerToken, isSigner: false, isWritable: true },
    { pubkey: params.sourceMint, isSigner: false, isWritable: false },
    { pubkey: params.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: params.extraAccountMetaList, isSigner: false, isWritable: false },
    { pubkey: params.venueAllowlist, isSigner: false, isWritable: true },
    { pubkey: params.tradeBook, isSigner: false, isWritable: true },
    { pubkey: params.redistributionVault, isSigner: false, isWritable: true },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: params.hookTaxDelegate, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data: anchorInstructionDiscriminator("settle_lottery_payout"),
  });
}

/** Settlement: SPL payout from redistribution vault + consume voucher (claimant signs). */
export function buildSettleRedistributionClaimInstruction(params: {
  programId: PublicKey;
  settlementAuthority: PublicKey;
  pierronProgram: PublicKey;
  transferHookProgram: PublicKey;
  tradeConfig: PublicKey;
  accountingState: PublicKey;
  pendingRedistributionClaim: PublicKey;
  claimant: PublicKey;
  redistributionVault: PublicKey;
  redistributionAuthority: PublicKey;
  lotteryVault: PublicKey;
  lotteryAuthority: PublicKey;
  userToken: PublicKey;
  sourceMint: PublicKey;
  tokenProgram: PublicKey;
  extraAccountMetaList: PublicKey;
  venueAllowlist: PublicKey;
  tradeBook: PublicKey;
  hookTaxDelegate: PublicKey;
  remainingAccounts?: AccountMeta[];
}): TransactionInstruction {
  const keys: AccountMeta[] = [
    { pubkey: params.settlementAuthority, isSigner: false, isWritable: false },
    { pubkey: params.programId, isSigner: false, isWritable: false },
    { pubkey: params.pierronProgram, isSigner: false, isWritable: false },
    { pubkey: params.transferHookProgram, isSigner: false, isWritable: false },
    { pubkey: params.tradeConfig, isSigner: false, isWritable: true },
    { pubkey: params.accountingState, isSigner: false, isWritable: true },
    { pubkey: params.pendingRedistributionClaim, isSigner: false, isWritable: true },
    { pubkey: params.claimant, isSigner: true, isWritable: true },
    { pubkey: params.redistributionVault, isSigner: false, isWritable: true },
    { pubkey: params.redistributionAuthority, isSigner: false, isWritable: false },
    { pubkey: params.lotteryVault, isSigner: false, isWritable: true },
    { pubkey: params.lotteryAuthority, isSigner: false, isWritable: false },
    { pubkey: params.userToken, isSigner: false, isWritable: true },
    { pubkey: params.sourceMint, isSigner: false, isWritable: false },
    { pubkey: params.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: params.extraAccountMetaList, isSigner: false, isWritable: false },
    { pubkey: params.venueAllowlist, isSigner: false, isWritable: true },
    { pubkey: params.tradeBook, isSigner: false, isWritable: true },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: params.hookTaxDelegate, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ...(params.remainingAccounts ?? []),
  ];

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data: anchorInstructionDiscriminator("settle_redistribution_claim"),
  });
}

function encodePackedAddressTreeInfoBuffer(info: {
  addressMerkleTreePubkeyIndex: number;
  addressQueuePubkeyIndex: number;
  rootIndex: number;
}): Buffer {
  return Buffer.concat([
    u8(info.addressMerkleTreePubkeyIndex),
    u8(info.addressQueuePubkeyIndex),
    u16(info.rootIndex),
  ]);
}

function encodeOptionCompressedAccountMeta(
  meta: Record<string, unknown> | null | undefined
): Buffer {
  if (!meta) return Buffer.from([0]);
  return Buffer.concat([
    Buffer.from([1]),
    encodeCompressedAccountMetaBuffer(
      meta as Parameters<typeof encodeCompressedAccountMetaBuffer>[0]
    ),
  ]);
}

function encodeNewAddressParamsAssignedPacked(input: {
  seed: Uint8Array;
  addressQueueAccountIndex: number;
  addressMerkleTreeAccountIndex: number;
  addressMerkleTreeRootIndex: number;
  assignedToAccount: boolean;
  assignedAccountIndex: number;
}): Buffer {
  return Buffer.concat([
    Buffer.from([1]),
    fixed32(input.seed, "newAddress.seed"),
    u8(input.addressQueueAccountIndex),
    u8(input.addressMerkleTreeAccountIndex),
    u16(input.addressMerkleTreeRootIndex),
    bool(input.assignedToAccount),
    u8(input.assignedAccountIndex),
  ]);
}

function encodeOptionNewAddressParams(
  input: {
    seed: Uint8Array;
    addressQueueAccountIndex: number;
    addressMerkleTreeAccountIndex: number;
    addressMerkleTreeRootIndex: number;
    assignedToAccount: boolean;
    assignedAccountIndex: number;
  } | null | undefined
): Buffer {
  if (!input) return Buffer.from([0]);
  return encodeNewAddressParamsAssignedPacked(input);
}

export function encodeLightCpiParamsBuffer(params: {
  coreMeta?: Record<string, unknown> | null;
  epochMeta?: Record<string, unknown> | null;
  newCoreAddress?: {
    seed: Uint8Array;
    addressQueueAccountIndex: number;
    addressMerkleTreeAccountIndex: number;
    addressMerkleTreeRootIndex: number;
    assignedToAccount: boolean;
    assignedAccountIndex: number;
  } | null;
  newEpochAddress?: {
    seed: Uint8Array;
    addressQueueAccountIndex: number;
    addressMerkleTreeAccountIndex: number;
    addressMerkleTreeRootIndex: number;
    assignedToAccount: boolean;
    assignedAccountIndex: number;
  } | null;
}): Buffer {
  return Buffer.concat([
    encodeOptionCompressedAccountMeta(params.coreMeta),
    encodeOptionCompressedAccountMeta(params.epochMeta),
    encodeOptionNewAddressParams(params.newCoreAddress),
    encodeOptionNewAddressParams(params.newEpochAddress),
  ]);
}

export function buildSyncUserFromTradeBookInstruction(params: {
  programId: PublicKey;
  user: PublicKey;
  accountingState: PublicKey;
  tradeBook: PublicKey;
  userToken: PublicKey;
  proof: AnchorValidityProof | Uint8Array;
  addressTreeInfo: {
    addressMerkleTreePubkeyIndex: number;
    addressQueuePubkeyIndex: number;
    rootIndex: number;
  };
  outputTreeIndex: number;
  userAccount: Record<string, unknown>;
  lightParams: {
    coreMeta?: Record<string, unknown> | null;
    epochMeta?: Record<string, unknown> | null;
    newCoreAddress?: {
      seed: Uint8Array;
      addressQueueAccountIndex: number;
      addressMerkleTreeAccountIndex: number;
      addressMerkleTreeRootIndex: number;
      assignedToAccount: boolean;
      assignedAccountIndex: number;
    } | null;
    newEpochAddress?: {
      seed: Uint8Array;
      addressQueueAccountIndex: number;
      addressMerkleTreeAccountIndex: number;
      addressMerkleTreeRootIndex: number;
      assignedToAccount: boolean;
      assignedAccountIndex: number;
    } | null;
  };
  remainingAccounts: AccountMeta[];
}): TransactionInstruction {
  const proofBuffer = encodeValidityProofBuffer(params.proof);
  const userBuffer = encodeUserAccountBuffer(params.userAccount);
  const addressTreeBuffer = encodePackedAddressTreeInfoBuffer(params.addressTreeInfo);
  const lightParamsBuffer = encodeLightCpiParamsBuffer(params.lightParams);

  const data = Buffer.concat([
    anchorInstructionDiscriminator("sync_user_from_trade_book"),
    proofBuffer,
    addressTreeBuffer,
    u8(params.outputTreeIndex),
    userBuffer,
    lightParamsBuffer,
  ]);

  const keys: AccountMeta[] = [
    { pubkey: params.user, isSigner: true, isWritable: true },
    { pubkey: params.accountingState, isSigner: false, isWritable: true },
    { pubkey: params.tradeBook, isSigner: false, isWritable: true },
    { pubkey: params.userToken, isSigner: false, isWritable: false },
    ...params.remainingAccounts,
  ];

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data,
  });
}
