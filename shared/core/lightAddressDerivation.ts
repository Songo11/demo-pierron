import { PublicKey } from '@solana/web3.js';
import { keccak256 } from 'ethereum-cryptography/keccak.js';

/** `light_compressed_account::constants::ADDRESS_MERKLE_TREE_ACCOUNT_DISCRIMINATOR` */
export const ADDRESS_MERKLE_TREE_ACCOUNT_DISCRIMINATOR = Uint8Array.from([
  11, 161, 175, 9, 212, 229, 73, 73,
]);

/** `BatchedMerkleTreeAccount::LIGHT_DISCRIMINATOR` (`*b"BatchMta"`) */
export const BATCH_MERKLE_TREE_ACCOUNT_DISCRIMINATOR = new TextEncoder().encode('BatchMta');

/** `light_compressed_account::ADDRESS_MERKLE_TREE_TYPE_V2` */
export const ADDRESS_MERKLE_TREE_TYPE_V2 = 4;

function byteArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function readU64Le(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

/**
 * Match on-chain `derive_new_addresses`: legacy indexed tree vs batched `TreeType::AddressV2`.
 * `treeAccountData` must be at least 16 bytes (discriminator + tree type u64 for batched).
 */
export function deriveCompressedAddressFromAddressTreeAccountData(
  seed: Uint8Array,
  addressMerkleTree: PublicKey,
  invokingProgramId: PublicKey,
  treeAccountData: Uint8Array
): Uint8Array {
  const data = new Uint8Array(treeAccountData);
  if (data.length < 16) {
    throw new Error(
      `address merkle tree account data too short (need >=16 bytes), got ${data.length}`
    );
  }
  const disc = data.subarray(0, 8);
  if (byteArraysEqual(disc, ADDRESS_MERKLE_TREE_ACCOUNT_DISCRIMINATOR)) {
    return deriveAddressLegacyIndexTree(addressMerkleTree, seed);
  }
  if (byteArraysEqual(disc, BATCH_MERKLE_TREE_ACCOUNT_DISCRIMINATOR)) {
    const treeType = readU64Le(data, 8);
    if (treeType === BigInt(ADDRESS_MERKLE_TREE_TYPE_V2)) {
      return deriveAddressV2Batched(seed, addressMerkleTree, invokingProgramId);
    }
    throw new Error(
      `unsupported batched address merkle tree TreeType=${String(treeType)} (expected AddressV2=${ADDRESS_MERKLE_TREE_TYPE_V2})`
    );
  }
  throw new Error(
    `unknown address merkle tree discriminator (first 8 bytes): ${Array.from(disc).join(',')}`
  );
}

function require32(label: string, seed: Uint8Array) {
  if (seed.length !== 32) {
    throw new Error(`${label} must be 32 bytes, got ${seed.length}`);
  }
}

/**
 * V1 / indexed address merkle tree: `light_compressed_account::address::derive_address_legacy`
 * (Keccak of tree || seed || 0xff, first byte zeroed to fit BN254 field).
 */
export function deriveAddressLegacyIndexTree(
  addressMerkleTree: PublicKey,
  seed: Uint8Array
): Uint8Array {
  require32('seed', seed);
  const input = Buffer.concat([
    addressMerkleTree.toBuffer(),
    Buffer.from(seed),
    Buffer.from([0xff]),
  ]);
  const hash = keccak256(input);
  const out = new Uint8Array(hash);
  out[0] = 0;
  return out;
}

/**
 * Batched V2 address tree: `light_compressed_account::address::derive_address`
 * (Keccak of seed || tree || program_id || 0xff, first byte zeroed). Must match on-chain
 * `derive_new_addresses` for `AcpAccount::BatchedAddressTree`.
 */
export function deriveAddressV2Batched(
  seed: Uint8Array,
  addressMerkleTree: PublicKey,
  invokingProgramId: PublicKey
): Uint8Array {
  require32('seed', seed);
  const input = Buffer.concat([
    Buffer.from(seed),
    addressMerkleTree.toBuffer(),
    invokingProgramId.toBuffer(),
    Buffer.from([0xff]),
  ]);
  const hash = keccak256(input);
  const out = new Uint8Array(hash);
  out[0] = 0;
  return out;
}
