import * as web3 from '@solana/web3.js';
import { anchorInstructionDiscriminator } from '../core/anchorDiscriminator.ts';
import type { AccountMeta } from '@solana/web3.js';
import type { SupportedCluster } from '../core/programIds.ts';
import { getConfiguredRedistributionVault } from '../core/programIds.ts';
import {
  pierronTransferHookAccountMetas,
  resolvePierronTransferHookAccounts,
} from './pierronTransferHookAccounts.ts';

const { SystemProgram, TransactionInstruction } = web3;

type BytesLike = Uint8Array | Buffer | number[];

export type RemainingAccountInput = {
  pubkey: web3.PublicKey;
  isSigner: boolean;
  isWritable: boolean;
};

export type CompressedProofInput = {
  a: BytesLike;
  b: BytesLike;
  c: BytesLike;
};

export type ValidityProofInput = {
  compressedProof?: CompressedProofInput | null;
};

export type PackedAddressTreeInfoInput = {
  addressMerkleTreePubkeyIndex: number;
  addressQueuePubkeyIndex: number;
  rootIndex: number;
};

export type NewAddressParamsAssignedPackedInput = {
  seed: BytesLike;
  addressQueueAccountIndex: number;
  addressMerkleTreeAccountIndex: number;
  addressMerkleTreeRootIndex: number;
  assignedToAccount: boolean;
  assignedAccountIndex: number;
};

export type RegisterStealthTxParams = {
  programId: web3.PublicKey;
  user: web3.PublicKey;
  systemProgram?: web3.PublicKey;
  remainingAccounts?: RemainingAccountInput[];

  proofSerialized: Buffer;
  addressTreeInfoSerialized: Buffer;
  outputTreeIndex: number;

  metaAccount: {
    owner: web3.PublicKey;
    nonce: bigint;
    registeredAt: bigint;
    transactionCount: bigint;
  };
  keys: {
    spendPublicKey: Uint8Array | number[];
    viewPublicKey: Uint8Array | number[];
  };

  metaMetaSerialized?: Buffer | null;
  maybeNewAddressSerialized?: Buffer | null;
};

export type SendStealthTxParams = {
  programId: web3.PublicKey;
  sender: web3.PublicKey;
  mint: web3.PublicKey;
  senderToken: web3.PublicKey;
  stealthToken: web3.PublicKey;
  stealthAuthority: web3.PublicKey;
  tokenProgram: web3.PublicKey;
  systemProgram?: web3.PublicKey;
  remainingAccounts?: RemainingAccountInput[];
  cluster?: SupportedCluster;

  amount: bigint;
  proofSerialized: Buffer;
  addressTreeInfoSerialized: Buffer;
  outputTreeIndex: number;

  recipientSpendKey: Uint8Array | number[];
  ephemeralKey: {
    ephemeralPublicKey: Uint8Array | number[];
  };
  paymentAccount: {
    stealthAddress: web3.PublicKey;
    amount: bigint;
    createdAt: bigint;
    claimed: boolean;
    senderHash: bigint;
    intendedClaimer: web3.PublicKey;
  };

  maybeNewPaymentAddressSerialized?: Buffer | null;

  // Prefer these structured fields for send_stealth when available.
  validityProof?: ValidityProofInput | null;
  packedAddressTreeInfo?: PackedAddressTreeInfoInput | null;
  maybeNewPaymentAddress?: NewAddressParamsAssignedPackedInput | null;
};

export type ClaimStealthTxParams = {
  programId: web3.PublicKey;
  claimer: web3.PublicKey;
  mint: web3.PublicKey;
  stealthToken: web3.PublicKey;
  claimerToken: web3.PublicKey;
  stealthAuthority: web3.PublicKey;
  tokenProgram: web3.PublicKey;
  claimVoucher: web3.PublicKey;
  systemProgram?: web3.PublicKey;
  remainingAccounts?: RemainingAccountInput[];
  cluster?: SupportedCluster;

  proofSerialized: Buffer;

  claimerMetaAccount: {
    owner: web3.PublicKey;
    nonce: bigint;
    registeredAt: bigint;
    transactionCount: bigint;
  };
  claimerMetaSerialized: Buffer;

  paymentAccount: {
    stealthAddress: web3.PublicKey;
    amount: bigint;
    createdAt: bigint;
    claimed: boolean;
    senderHash: bigint;
    intendedClaimer: web3.PublicKey;
  };
  paymentMetaSerialized: Buffer;

  stealthAuthorityBump: number;
};

function u8(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`Wartość ${value} nie mieści się w u8.`);
  }

  const b = Buffer.alloc(1);
  b.writeUInt8(value, 0);
  return b;
}

function u16(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`Wartość ${value} nie mieści się w u16.`);
  }

  const b = Buffer.alloc(2);
  b.writeUInt16LE(value, 0);
  return b;
}

function bool(value: boolean): Buffer {
  return u8(value ? 1 : 0);
}

function u64(value: bigint): Buffer {
  if (value < 0n) {
    throw new Error(`Wartość ${value.toString()} nie mieści się w u64.`);
  }

  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(value, 0);
  return b;
}

function i64(value: bigint): Buffer {
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;

  if (value < min || value > max) {
    throw new Error(`Wartość ${value.toString()} nie mieści się w i64.`);
  }

  const b = Buffer.alloc(8);
  b.writeBigInt64LE(value, 0);
  return b;
}

function pubkey(pk: web3.PublicKey): Buffer {
  return pk.toBuffer();
}

function toBuffer(bytes: BytesLike, label: string): Buffer {
  if (Buffer.isBuffer(bytes)) {
    return Buffer.from(bytes);
  }

  return Buffer.from(Uint8Array.from(bytes));
}

function fixed32(bytes: BytesLike, label: string): Buffer {
  const out = toBuffer(bytes, label);
  if (out.length !== 32) {
    throw new Error(`${label} musi mieć dokładnie 32 bajty, a ma ${out.length}.`);
  }
  return out;
}

function fixed64(bytes: BytesLike, label: string): Buffer {
  const out = toBuffer(bytes, label);
  if (out.length !== 64) {
    throw new Error(`${label} musi mieć dokładnie 64 bajty, a ma ${out.length}.`);
  }
  return out;
}

function optionBytes(payload?: Buffer | null): Buffer {
  if (!payload) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), payload]);
}

function serializeStealthMetaAccount(
  input: RegisterStealthTxParams['metaAccount']
): Buffer {
  return Buffer.concat([
    pubkey(input.owner),
    u64(input.nonce),
    i64(input.registeredAt),
    u64(input.transactionCount),
  ]);
}

function serializeStealthKeys(
  input: RegisterStealthTxParams['keys']
): Buffer {
  return Buffer.concat([
    fixed32(input.spendPublicKey, 'spendPublicKey'),
    fixed32(input.viewPublicKey, 'viewPublicKey'),
  ]);
}

function serializeEphemeralKey(
  input: SendStealthTxParams['ephemeralKey']
): Buffer {
  return fixed32(input.ephemeralPublicKey, 'ephemeralKey.ephemeralPublicKey');
}

function serializeStealthPaymentAccount(
  input: SendStealthTxParams['paymentAccount']
): Buffer {
  return Buffer.concat([
    pubkey(input.stealthAddress),
    u64(input.amount),
    i64(input.createdAt),
    bool(input.claimed),
    u64(input.senderHash),
    pubkey(input.intendedClaimer),
  ]);
}

function encodeCompressedProof(input: CompressedProofInput): Buffer {
  return Buffer.concat([
    fixed32(input.a, 'validityProof.compressedProof.a'),
    fixed64(input.b, 'validityProof.compressedProof.b'),
    fixed32(input.c, 'validityProof.compressedProof.c'),
  ]);
}

function encodeValidityProof(input?: ValidityProofInput | null): Buffer {
  const compressedProof = input?.compressedProof ?? null;
  return compressedProof
    ? Buffer.concat([Buffer.from([1]), encodeCompressedProof(compressedProof)])
    : Buffer.from([0]);
}

function encodePackedAddressTreeInfo(
  input: PackedAddressTreeInfoInput
): Buffer {
  return Buffer.concat([
    u8(input.addressMerkleTreePubkeyIndex),
    u8(input.addressQueuePubkeyIndex),
    u16(input.rootIndex),
  ]);
}

function encodeNewAddressParamsAssignedPacked(
  input?: NewAddressParamsAssignedPackedInput | null
): Buffer {
  if (!input) {
    return Buffer.from([0]);
  }

  return Buffer.concat([
    Buffer.from([1]),
    fixed32(input.seed, 'maybeNewPaymentAddress.seed'),
    u8(input.addressQueueAccountIndex),
    u8(input.addressMerkleTreeAccountIndex),
    u16(input.addressMerkleTreeRootIndex),
    bool(input.assignedToAccount),
    u8(input.assignedAccountIndex),
  ]);
}

function assertBufferLength(
  payload: Buffer,
  allowed: number[],
  label: string
): void {
  if (!allowed.includes(payload.length)) {
    throw new Error(
      `${label} ma nieprawidłową długość ${payload.length}. Dozwolone: ${allowed.join(', ')}.`
    );
  }
}

function assertSendPayloadShape(
  proofBuffer: Buffer,
  addressTreeInfoBuffer: Buffer,
  maybeNewPaymentAddressBuffer: Buffer,
  data: Buffer
): void {
  assertBufferLength(proofBuffer, [1, 129], 'send_stealth.proof');
  assertBufferLength(addressTreeInfoBuffer, [4], 'send_stealth.addressTreeInfo');
  assertBufferLength(maybeNewPaymentAddressBuffer, [1, 39], 'send_stealth.maybeNewPaymentAddress');

  const expectedLength = 174 + proofBuffer.length + maybeNewPaymentAddressBuffer.length;
  if (data.length !== expectedLength) {
    throw new Error(
      `send_stealth instruction.data ma długość ${data.length}, oczekiwano ${expectedLength}.`
    );
  }
}

function assertClaimPayloadShape(
  proofBuffer: Buffer,
  claimerMetaBuffer: Buffer,
  paymentMetaBuffer: Buffer,
  data: Buffer
): void {
  assertBufferLength(proofBuffer, [1, 129], 'claim_stealth.proof');
  assertBufferLength(claimerMetaBuffer, [42], 'claim_stealth.claimerMeta');
  assertBufferLength(paymentMetaBuffer, [42], 'claim_stealth.paymentMeta');

  const expectedLength = 238 + proofBuffer.length;
  if (data.length !== expectedLength) {
    throw new Error(
      `claim_stealth instruction.data ma długość ${data.length}, oczekiwano ${expectedLength}.`
    );
  }
}

function mapRemainingAccounts(
  remainingAccounts?: RemainingAccountInput[]
): AccountMeta[] {
  return (remainingAccounts ?? []).map((a) => ({
    pubkey: a.pubkey,
    isSigner: a.isSigner,
    isWritable: a.isWritable,
  }));
}

export function buildRegisterStealthTransactionInstruction(
  params: RegisterStealthTxParams
): web3.TransactionInstruction {
  const keys: AccountMeta[] = [
    { pubkey: params.user, isSigner: true, isWritable: true },
    {
      pubkey: params.systemProgram ?? SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    ...mapRemainingAccounts(params.remainingAccounts),
  ];

  const data = Buffer.concat([
    anchorInstructionDiscriminator('register_stealth'),
    params.proofSerialized,
    params.addressTreeInfoSerialized,
    u8(params.outputTreeIndex),
    serializeStealthMetaAccount(params.metaAccount),
    serializeStealthKeys(params.keys),
    optionBytes(params.metaMetaSerialized ?? null),
    optionBytes(params.maybeNewAddressSerialized ?? null),
  ]);

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data,
  });
}

export function buildSendStealthTransactionInstruction(
  params: SendStealthTxParams
): web3.TransactionInstruction {
  const redistributionVault = getConfiguredRedistributionVault(params.cluster);
  if (!redistributionVault) {
    throw new Error(
      `Brak redistributionVault dla klastra ${params.cluster ?? 'devnet'}.`
    );
  }
  const hookAccounts = resolvePierronTransferHookAccounts({
    mint: params.mint,
    redistributionVault,
    cluster: params.cluster,
  });

  const keys: AccountMeta[] = [
    { pubkey: params.sender, isSigner: true, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.senderToken, isSigner: false, isWritable: true },
    { pubkey: params.stealthToken, isSigner: false, isWritable: true },
    { pubkey: params.stealthAuthority, isSigner: false, isWritable: false },
    { pubkey: params.tokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: params.systemProgram ?? SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    ...pierronTransferHookAccountMetas(hookAccounts),
    ...mapRemainingAccounts(params.remainingAccounts),
  ];

  const proofBuffer = params.validityProof
    ? encodeValidityProof(params.validityProof)
    : params.proofSerialized;

  const addressTreeInfoBuffer = params.packedAddressTreeInfo
    ? encodePackedAddressTreeInfo(params.packedAddressTreeInfo)
    : params.addressTreeInfoSerialized;

  const maybeNewPaymentAddressBuffer = params.maybeNewPaymentAddress !== undefined
    ? encodeNewAddressParamsAssignedPacked(params.maybeNewPaymentAddress)
    : optionBytes(params.maybeNewPaymentAddressSerialized ?? null);

  const data = Buffer.concat([
    anchorInstructionDiscriminator('send_stealth'),
    u64(params.amount),
    proofBuffer,
    addressTreeInfoBuffer,
    u8(params.outputTreeIndex),
    fixed32(params.recipientSpendKey, 'recipientSpendKey'),
    serializeEphemeralKey(params.ephemeralKey),
    serializeStealthPaymentAccount(params.paymentAccount),
    maybeNewPaymentAddressBuffer,
  ]);

  assertSendPayloadShape(
    proofBuffer,
    addressTreeInfoBuffer,
    maybeNewPaymentAddressBuffer,
    data
  );

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data,
  });
}

export function buildClaimStealthTransactionInstruction(
  params: ClaimStealthTxParams
): web3.TransactionInstruction {
  const redistributionVault = getConfiguredRedistributionVault(params.cluster);
  if (!redistributionVault) {
    throw new Error(
      `Brak redistributionVault dla klastra ${params.cluster ?? 'devnet'}.`
    );
  }
  const hookAccounts = resolvePierronTransferHookAccounts({
    mint: params.mint,
    redistributionVault,
    cluster: params.cluster,
  });

  const keys: AccountMeta[] = [
    { pubkey: params.claimer, isSigner: true, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.stealthToken, isSigner: false, isWritable: true },
    { pubkey: params.claimerToken, isSigner: false, isWritable: true },
    { pubkey: params.stealthAuthority, isSigner: false, isWritable: false },
    { pubkey: params.tokenProgram, isSigner: false, isWritable: false },
    ...pierronTransferHookAccountMetas(hookAccounts),
    { pubkey: params.claimVoucher, isSigner: false, isWritable: true },
    {
      pubkey: params.systemProgram ?? web3.SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    ...mapRemainingAccounts(params.remainingAccounts),
  ];

  const data = Buffer.concat([
    anchorInstructionDiscriminator('claim_stealth'),
    params.proofSerialized,
    serializeStealthMetaAccount(params.claimerMetaAccount),
    params.claimerMetaSerialized,
    serializeStealthPaymentAccount(params.paymentAccount),
    params.paymentMetaSerialized,
    u8(params.stealthAuthorityBump),
  ]);

  assertClaimPayloadShape(
    params.proofSerialized,
    params.claimerMetaSerialized,
    params.paymentMetaSerialized,
    data
  );

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data,
  });
}

export function deriveClaimVoucherPda(params: {
  programId: web3.PublicKey;
  claimer: web3.PublicKey;
}): { claimVoucher: web3.PublicKey; bump: number } {
  const [claimVoucher, bump] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('claim-voucher'), params.claimer.toBuffer()],
    params.programId
  );
  return { claimVoucher, bump };
}

export function buildClaimStealthPayoutTransactionInstruction(
  params: ClaimStealthTxParams
): web3.TransactionInstruction {
  const redistributionVault = getConfiguredRedistributionVault(params.cluster);
  if (!redistributionVault) {
    throw new Error(
      `Brak redistributionVault dla klastra ${params.cluster ?? 'devnet'}.`
    );
  }
  const hookAccounts = resolvePierronTransferHookAccounts({
    mint: params.mint,
    redistributionVault,
    cluster: params.cluster,
  });

  const keys: AccountMeta[] = [
    { pubkey: params.claimer, isSigner: true, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.stealthToken, isSigner: false, isWritable: true },
    { pubkey: params.claimerToken, isSigner: false, isWritable: true },
    { pubkey: params.stealthAuthority, isSigner: false, isWritable: false },
    { pubkey: params.tokenProgram, isSigner: false, isWritable: false },
    ...pierronTransferHookAccountMetas(hookAccounts),
    { pubkey: params.claimVoucher, isSigner: false, isWritable: true },
  ];

  const data = Buffer.concat([
    anchorInstructionDiscriminator('claim_stealth_payout'),
    u8(params.stealthAuthorityBump),
  ]);

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data,
  });
}
