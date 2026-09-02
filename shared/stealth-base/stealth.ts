import { PublicKey } from '@solana/web3.js';
import { blake3 } from '@noble/hashes/blake3.js';
import { Buffer } from 'node:buffer';
import { getDefaultAddressTreeInfo } from '@lightprotocol/stateless.js';
import nacl from 'tweetnacl';

import {
  deriveAddressV2Batched,
  deriveCompressedAddressFromAddressTreeAccountData,
} from '../core/lightAddressDerivation.ts';

const isReactNative =
  typeof navigator !== 'undefined' &&
  navigator.product === 'ReactNative';

const hasGetRandomValues =
  typeof globalThis !== 'undefined' &&
  typeof globalThis.crypto !== 'undefined' &&
  typeof globalThis.crypto.getRandomValues === 'function';

const runtimeRequire = (() => {
  try {
    return Function(
      'return typeof require !== "undefined" ? require : undefined;'
    )() as undefined | ((moduleName: string) => unknown);
  } catch {
    return undefined;
  }
})();

if (isReactNative && !hasGetRandomValues && runtimeRequire) {
  runtimeRequire('react-native-get-random-values');
}

type CryptoLike = {
  getRandomValues: (array: Uint8Array) => Uint8Array;
};

function getCryptoOrThrow(): CryptoLike {
  const cryptoObject = globalThis.crypto as CryptoLike | undefined;

  if (!cryptoObject || typeof cryptoObject.getRandomValues !== 'function') {
    throw new Error(
      'Brak globalThis.crypto.getRandomValues. ' +
        'W React Native doładuj react-native-get-random-values, ' +
        'a w Node uruchamiaj na środowisku z Web Crypto.'
    );
  }

  return cryptoObject;
}

export type StealthKeys = {
  spendPublicKey: Uint8Array;
  viewPublicKey: Uint8Array;
  /** X25519 secret — tylko lokalnie; nigdy w recipient bundle / on-chain. */
  viewSecretKey: Uint8Array;
};

export type StealthRecipientPublicBundle = {
  spendPublicKey: Uint8Array;
  viewPublicKey: Uint8Array;
};

export type EphemeralKey = {
  ephemeralPublicKey: Uint8Array;
};

export type LightDerivedStealthAddress = {
  seedBytes: Uint8Array;
  lightAddressSeed: Uint8Array;
  addressTree: PublicKey;
  addressQueue: PublicKey;
  stealthAddress: PublicKey;
};

export type StealthMetaAccount = {
  owner: PublicKey;
  nonce: bigint;
  registeredAt: bigint;
  transactionCount: bigint;
};

export type StealthPaymentAccount = {
  stealthAddress: PublicKey;
  amount: bigint;
  createdAt: bigint;
  claimed: boolean;
  senderHash: bigint;
  /** Jedyny portfel uprawniony do claim_stealth. */
  intendedClaimer: PublicKey;
};

export type SenderHashMode = 'debug' | 'onchain';


function randomBytes32(): Uint8Array {
  const bytes = new Uint8Array(32);
  getCryptoOrThrow().getRandomValues(bytes);
  return bytes;
}

function assert32Bytes(input: Uint8Array, label: string) {
  if (!(input instanceof Uint8Array) || input.length !== 32) {
    throw new Error(`${label} musi mieć dokładnie 32 bajty`);
  }
}

function bytesToU64Le(bytes: Uint8Array): bigint {
  if (bytes.length < 8) {
    throw new Error('Do konwersji na u64 LE potrzeba co najmniej 8 bajtów');
  }

  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[i]) << BigInt(8 * i);
  }
  return value;
}

function normalizePublicKeyInput(
  value: PublicKey | string | undefined,
  fallback: PublicKey,
  label: string
): PublicKey {
  if (!value) {
    return fallback;
  }

  if (value instanceof PublicKey) {
    return value;
  }

  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} nie jest poprawnym PublicKey`);
  }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

export function generateStealthKeys(): StealthKeys {
  // Spend: losowy identyfikator do derive stealth address (nie X25519).
  // View: prawdziwa para X25519 (tweetnacl box) do szyfrowania payment notification.
  const viewPair = nacl.box.keyPair();
  return {
    spendPublicKey: randomBytes32(),
    viewPublicKey: Uint8Array.from(viewPair.publicKey),
    viewSecretKey: Uint8Array.from(viewPair.secretKey),
  };
}

export function makeRecipientStealthBundle(keys: StealthKeys): StealthRecipientPublicBundle {
  assert32Bytes(keys.spendPublicKey, 'spendPublicKey');
  assert32Bytes(keys.viewPublicKey, 'viewPublicKey');

  return {
    spendPublicKey: Uint8Array.from(keys.spendPublicKey),
    viewPublicKey: Uint8Array.from(keys.viewPublicKey),
  };
}

export function generateEphemeralKey(): EphemeralKey {
  return {
    ephemeralPublicKey: randomBytes32(),
  };
}

/**
 * Legacy/debug-only derivation.
 * Real stealth flow should use generateLightStealthAddress().
 */
export function deriveStealthAddress(
  recipientSpendKey: Uint8Array,
  ephemeralPublicKey: Uint8Array
): PublicKey {
  assert32Bytes(recipientSpendKey, 'recipientSpendKey');
  assert32Bytes(ephemeralPublicKey, 'ephemeralPublicKey');

  const result = new Uint8Array(32);

  for (let i = 0; i < 32; i++) {
    result[i] =
      ((recipientSpendKey[i] + ephemeralPublicKey[(i + 13) % 32]) & 0xff) ^
      ephemeralPublicKey[i] ^
      recipientSpendKey[(i + 7) % 32];
  }

  return new PublicKey(result);
}

export function generateLightStealthAddress(params: {
  programId: PublicKey;
  seedBytes?: Uint8Array;
  addressTree?: PublicKey | string;
  addressQueue?: PublicKey | string;
  /** When provided (RPC `getAccountInfo`), matches on-chain legacy vs batched address derivation. */
  addressMerkleTreeAccountData?: Uint8Array;
}): LightDerivedStealthAddress {
  const actualSeedBytes = params.seedBytes ? Uint8Array.from(params.seedBytes) : randomBytes32();
  assert32Bytes(actualSeedBytes, 'seedBytes');

  const defaultAddressTreeInfo = getDefaultAddressTreeInfo();

  const addressTree = normalizePublicKeyInput(
    params.addressTree,
    defaultAddressTreeInfo.tree,
    'addressTree'
  );

  const addressQueue = normalizePublicKeyInput(
    params.addressQueue,
    defaultAddressTreeInfo.queue,
    'addressQueue'
  );

  const derivedAddressBytes =
    params.addressMerkleTreeAccountData &&
    params.addressMerkleTreeAccountData.length >= 16
      ? deriveCompressedAddressFromAddressTreeAccountData(
          actualSeedBytes,
          addressTree,
          params.programId,
          params.addressMerkleTreeAccountData
        )
      : deriveAddressV2Batched(actualSeedBytes, addressTree, params.programId);

  const stealthAddress = new PublicKey(derivedAddressBytes);

  return {
    seedBytes: actualSeedBytes,
    lightAddressSeed: Uint8Array.from(actualSeedBytes),
    addressTree,
    addressQueue,
    stealthAddress,
  };
}

function computeDebugSenderHash(sender: PublicKey): bigint {
  const bytes = sender.toBytes();

  let value = 0n;
  for (let i = 0; i < 8; i++) {
    const mixed =
      bytes[i] ^
      bytes[(i + 7) % 32] ^
      bytes[(i + 13) % 32] ^
      bytes[(i + 21) % 32];
    value |= BigInt(mixed) << BigInt(8 * i);
  }

  return value;
}

function computeOnchainCompatibleSenderHash(sender: PublicKey): bigint {
  const digest = blake3(sender.toBytes());
  return bytesToU64Le(digest.slice(0, 8));
}

export async function computeSenderHash(
  sender: PublicKey,
  mode: SenderHashMode = 'onchain'
): Promise<bigint> {
  if (mode === 'debug') {
    return computeDebugSenderHash(sender);
  }

  return computeOnchainCompatibleSenderHash(sender);
}

export function makeStealthMetaAccount(params: {
  owner: PublicKey;
  nonce: bigint;
  registeredAt: bigint;
  transactionCount?: bigint;
}): StealthMetaAccount {
  return {
    owner: params.owner,
    nonce: params.nonce,
    registeredAt: params.registeredAt,
    transactionCount: params.transactionCount ?? 0n,
  };
}

export async function makeStealthPaymentAccount(params: {
  stealthAddress: PublicKey;
  amount: bigint;
  createdAt: bigint;
  sender: PublicKey;
  intendedClaimer: PublicKey;
  senderHashMode?: SenderHashMode;
}): Promise<StealthPaymentAccount> {
  return {
    stealthAddress: params.stealthAddress,
    amount: params.amount,
    createdAt: params.createdAt,
    claimed: false,
    senderHash: await computeSenderHash(params.sender, params.senderHashMode ?? 'onchain'),
    intendedClaimer: params.intendedClaimer,
  };
}

export function unixNowBigInt(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

export function slotLikeNonce(owner: PublicKey): bigint {
  const bytes = owner.toBytes();
  let acc = 0n;
  for (let i = 0; i < 8; i++) {
    acc |= BigInt(bytes[i]) << BigInt(8 * i);
  }
  return BigInt(Date.now()) ^ acc;
}

export function toFixed32(input: Uint8Array): number[] {
  assert32Bytes(input, 'input');
  return Array.from(input);
}

export function publicKeyToArray32(pk: PublicKey): number[] {
  return Array.from(pk.toBytes());
}
