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
  role?: string;
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

  /**
   * IMPORTANT:
   * W aktualnym canonical register flow metaMeta ma być ignorowane
   * na init-path i serializowane jako Option::None ([0]).
   *
   * Pole zostawiamy dla kompatybilności API, ale builder register_stealth
   * świadomie go NIE wpina do payloadu jako Some(...).
   */
  metaMetaSerialized?: Buffer | null;
  maybeNewAddressSerialized?: Buffer | null;

  validityProof?: ValidityProofInput | null;
  packedAddressTreeInfo?: PackedAddressTreeInfoInput | null;
  maybeNewAddress?: NewAddressParamsAssignedPackedInput | null;
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
  /** PDA `claim-voucher` — bridge Light → payout. */
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

function toBuffer(bytes: BytesLike, _label: string): Buffer {
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

function optionNone(): Buffer {
  return Buffer.from([0]);
}

function optionSome(payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from([1]), payload]);
}

function assertOptionBuffer(label: string, payload: Buffer): void {
  if (payload.length < 1) {
    throw new Error(`${label} nie może być pusty.`);
  }

  const tag = payload[0];
  if (tag !== 0 && tag !== 1) {
    throw new Error(`${label} ma nieprawidłowy option tag ${tag}. Oczekiwano 0 lub 1.`);
  }

  if (tag === 0 && payload.length !== 1) {
    throw new Error(`${label} z tagiem None musi mieć długość dokładnie 1 bajta.`);
  }

  if (tag === 1 && payload.length < 2) {
    throw new Error(`${label} z tagiem Some musi zawierać payload.`);
  }
}

/**
 * Register canonical init-path:
 * metaMeta ma być wymuszone jako None.
 *
 * To jest dokładnie to, co wynika z logów:
 * - gdy metaMeta było Some(95B) => Anchor deserialization error 0x66
 * - gdy metaMeta było None => instrukcja się deserializuje i przechodzi dalej do runtime
 */
function normalizeRegisterMetaMetaOptionSerialized(): Buffer {
  return optionNone();
}

function normalizeNewAddressOptionSerialized(
  payload: Buffer | null | undefined,
  label: string
): Buffer {
  if (!payload) {
    return optionNone();
  }

  if (payload.length === 1 && payload[0] === 0) {
    return Buffer.from(payload);
  }

  if (payload.length === 39 && payload[0] === 1) {
    return Buffer.from(payload);
  }

  if (payload.length === 38) {
    return optionSome(payload);
  }

  throw new Error(
    `${label} ma nieprawidłową długość ${payload.length}. Oczekiwano null, [0], 38B payload lub 39B z option tagiem.`
  );
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

/**
 * Canonical packed new-address payload:
 * [option:1][seed32][queue_index:u8][tree_index:u8][root_index:u16][assigned:bool][assigned_idx:u8]
 *
 * SOURCE OF TRUTH:
 * - byte 32 = queue index
 * - byte 33 = tree index
 *
 * This must stay aligned with:
 * - shared/light/lightClient.ts
 * - shared/light/lightLiveLocalRegisterBundle.ts
 * - shared/mobile-stealth-v1/stealthLightReadyRunner.ts
 * - shared/mobile-stealth-v1/stealthTransactionFactory.ts
 */
function encodeNewAddressParamsAssignedPacked(
  input?: NewAddressParamsAssignedPackedInput | null,
  label = 'maybeNewPaymentAddress'
): Buffer {
  if (!input) {
    return Buffer.from([0]);
  }

  return Buffer.concat([
    Buffer.from([1]),
    fixed32(input.seed, `${label}.seed`),
    u8(input.addressQueueAccountIndex),
    u8(input.addressMerkleTreeAccountIndex),
    u16(input.addressMerkleTreeRootIndex),
    bool(input.assignedToAccount),
    u8(input.assignedAccountIndex),
  ]);
}

function assertRegisterPayloadShape(params: {
  proofBuffer: Buffer;
  addressTreeInfoBuffer: Buffer;
  outputTreeIndex: number;
  metaAccountBuffer: Buffer;
  keysBuffer: Buffer;
  metaMetaBuffer: Buffer;
  maybeNewAddressBuffer: Buffer;
  data?: Buffer;
}): void {
  if (![1, 129].includes(params.proofBuffer.length)) {
    throw new Error(
      `register_stealth.proof ma nieprawidłową długość ${params.proofBuffer.length}. Dozwolone: 1, 129.`
    );
  }

  if (params.addressTreeInfoBuffer.length !== 4) {
    throw new Error(
      `register_stealth.addressTreeInfo ma nieprawidłową długość ${params.addressTreeInfoBuffer.length}. Oczekiwano 4.`
    );
  }

  if (!Number.isInteger(params.outputTreeIndex) || params.outputTreeIndex < 0 || params.outputTreeIndex > 255) {
    throw new Error(
      `register_stealth.outputTreeIndex ma nieprawidłową wartość ${params.outputTreeIndex}.`
    );
  }

  if (params.metaAccountBuffer.length !== 56) {
    throw new Error(
      `register_stealth.metaAccount ma nieprawidłową długość ${params.metaAccountBuffer.length}. Oczekiwano 56.`
    );
  }

  if (params.keysBuffer.length !== 64) {
    throw new Error(
      `register_stealth.keys ma nieprawidłową długość ${params.keysBuffer.length}. Oczekiwano 64.`
    );
  }

  assertOptionBuffer('register_stealth.metaMeta', params.metaMetaBuffer);
  assertOptionBuffer('register_stealth.maybeNewAddress', params.maybeNewAddressBuffer);

  if (params.metaMetaBuffer[0] !== 0 || params.metaMetaBuffer.length !== 1) {
    throw new Error(
      'register_stealth.metaMeta w canonical init-path musi być None ([0]).'
    );
  }

  if (params.maybeNewAddressBuffer[0] === 1 && params.maybeNewAddressBuffer.length !== 39) {
    throw new Error(
      `register_stealth.maybeNewAddress dla Some(...) musi mieć długość 39 bajtów, a ma ${params.maybeNewAddressBuffer.length}.`
    );
  }

  if (params.data) {
    const expectedLength =
      8 +
      params.proofBuffer.length +
      params.addressTreeInfoBuffer.length +
      1 +
      params.metaAccountBuffer.length +
      params.keysBuffer.length +
      params.metaMetaBuffer.length +
      params.maybeNewAddressBuffer.length;

    if (params.data.length !== expectedLength) {
      throw new Error(
        `register_stealth instruction.data ma długość ${params.data.length}, oczekiwano ${expectedLength}.`
      );
    }
  }
}

function assertSendPayloadShape(
  proofBuffer: Buffer,
  addressTreeInfoBuffer: Buffer,
  maybeNewPaymentAddressBuffer: Buffer,
  data: Buffer
): void {
  if (![1, 129].includes(proofBuffer.length)) {
    throw new Error(
      `send_stealth.proof ma nieprawidłową długość ${proofBuffer.length}. Dozwolone: 1, 129.`
    );
  }

  if (addressTreeInfoBuffer.length !== 4) {
    throw new Error(
      `send_stealth.addressTreeInfo ma nieprawidłową długość ${addressTreeInfoBuffer.length}. Oczekiwano 4.`
    );
  }

  assertOptionBuffer('send_stealth.maybeNewPaymentAddress', maybeNewPaymentAddressBuffer);

  if (
    maybeNewPaymentAddressBuffer[0] === 1 &&
    maybeNewPaymentAddressBuffer.length !== 39
  ) {
    throw new Error(
      `send_stealth.maybeNewPaymentAddress dla Some(...) musi mieć długość 39 bajtów, a ma ${maybeNewPaymentAddressBuffer.length}.`
    );
  }

  const expectedLength = 174 + proofBuffer.length + maybeNewPaymentAddressBuffer.length;
  if (data.length !== expectedLength) {
    throw new Error(
      `send_stealth instruction.data ma długość ${data.length}, oczekiwano ${expectedLength}.`
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

  const proofBuffer = params.validityProof
    ? encodeValidityProof(params.validityProof)
    : params.proofSerialized;

  const addressTreeInfoBuffer = params.packedAddressTreeInfo
    ? encodePackedAddressTreeInfo(params.packedAddressTreeInfo)
    : params.addressTreeInfoSerialized;

  const metaAccountBuffer = serializeStealthMetaAccount(params.metaAccount);
  const keysBuffer = serializeStealthKeys(params.keys);

  /**
   * Canonical register init-path:
   * metaMeta zawsze None.
   */
  const metaMetaBuffer = normalizeRegisterMetaMetaOptionSerialized();

  const maybeNewAddressBuffer =
    params.maybeNewAddress !== undefined
      ? encodeNewAddressParamsAssignedPacked(
          params.maybeNewAddress,
          'register_stealth.maybeNewAddress'
        )
      : normalizeNewAddressOptionSerialized(
          params.maybeNewAddressSerialized ?? null,
          'register_stealth.maybeNewAddress'
        );

  const data = Buffer.concat([
    anchorInstructionDiscriminator('register_stealth'),
    proofBuffer,
    addressTreeInfoBuffer,
    u8(params.outputTreeIndex),
    metaAccountBuffer,
    keysBuffer,
    metaMetaBuffer,
    maybeNewAddressBuffer,
  ]);

  assertRegisterPayloadShape({
    proofBuffer,
    addressTreeInfoBuffer,
    outputTreeIndex: params.outputTreeIndex,
    metaAccountBuffer,
    keysBuffer,
    metaMetaBuffer,
    maybeNewAddressBuffer,
    data,
  });

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

  const maybeNewPaymentAddressBuffer =
    params.maybeNewPaymentAddress !== undefined
      ? encodeNewAddressParamsAssignedPacked(
          params.maybeNewPaymentAddress,
          'send_stealth.maybeNewPaymentAddress'
        )
      : normalizeNewAddressOptionSerialized(
          params.maybeNewPaymentAddressSerialized ?? null,
          'send_stealth.maybeNewPaymentAddress'
        );

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

/** Druga instrukcja claim — transfer z vault (świeży heap BPF po Light). */
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
