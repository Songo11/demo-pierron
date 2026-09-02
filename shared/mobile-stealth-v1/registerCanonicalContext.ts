import { PublicKey } from '@solana/web3.js';

import type { RemainingAccountInput } from './stealthInstructionBuilder.ts';
import {
  REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
  REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
} from '../light/registerCanonicalContract.ts';
import {
  LIGHT_CANONICAL_EXTERNAL_INDEX,
  LOCALNET_LIGHT_ACCOUNTS,
  resolveStealthOutputTreeIndex,
} from '../light/lightCanonicalConfig.ts';

export const LOCALNET_ADDRESS_TREE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.addressTree;
export const LOCALNET_ADDRESS_QUEUE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.addressQueue;
export const LOCALNET_STATE_QUEUE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.stateQueue;
export const LOCALNET_STATE_TREE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.stateTree;

export const REGISTER_EXTERNAL_INDEX = {
  ...LIGHT_CANONICAL_EXTERNAL_INDEX.register,
} as const;

export type RoleAwareRemainingAccount = RemainingAccountInput & {
  role?: string;
};

export type RegisterCanonicalContext = {
  outputTreeIndex: number;
  assignedToAccount: boolean;
  assignedAccountIndex: number;

  addressTreeIndex: number;
  addressQueueIndex: number;
  stateQueueIndex: number;
  stateTreeIndex: number;
  addressIndex: number;

  addressTreePubkey: PublicKey;
  addressQueuePubkey: PublicKey;
  stateQueuePubkey: PublicKey | null;
  stateTreePubkey: PublicKey | null;
  addressPubkey: PublicKey | null;

  verifierAddressAccounts: RemainingAccountInput[] | undefined;
  summaryLines: string[];
};

function isRoleAware(
  account: RemainingAccountInput | (RemainingAccountInput & { role?: string })
): account is RoleAwareRemainingAccount {
  return typeof account === 'object' && account !== null;
}

function toRoleAware(account: RemainingAccountInput): RoleAwareRemainingAccount {
  return isRoleAware(account)
    ? {
        pubkey: account.pubkey,
        isSigner: account.isSigner,
        isWritable: account.isWritable,
        role: (account as RoleAwareRemainingAccount).role,
      }
    : {
        pubkey: account.pubkey,
        isSigner: account.isSigner,
        isWritable: account.isWritable,
      };
}

function toPubkeyString(pubkey: PublicKey | string): string {
  return typeof pubkey === 'string' ? pubkey : pubkey.toBase58();
}

function toPublicKey(pubkey: PublicKey | string): PublicKey {
  return typeof pubkey === 'string' ? new PublicKey(pubkey) : pubkey;
}

function findRemainingAccountByRole(
  remainingAccounts: RemainingAccountInput[] | undefined,
  desiredRole: string
): RoleAwareRemainingAccount | null {
  if (!remainingAccounts || remainingAccounts.length === 0) {
    return null;
  }

  for (const raw of remainingAccounts) {
    const account = toRoleAware(raw);
    if (account.role === desiredRole) {
      return account;
    }
  }

  return null;
}

function summarizeIndexedRemainingAccounts(
  accounts: RemainingAccountInput[] | undefined
): string[] {
  if (!accounts || accounts.length === 0) {
    return ['(none)'];
  }

  return accounts.map((raw, index) => {
    const account = toRoleAware(raw);
    return `${index}:${account.role ?? 'unknown'}:${toPubkeyString(account.pubkey)}:signer=${
      account.isSigner ? '1' : '0'
    }:writable=${account.isWritable ? '1' : '0'}`;
  });
}

export function decodeRegisterPackedAddressTreeInfo(
  bytes: Uint8Array | Buffer | null | undefined
): {
  addressQueueIndex: number | null;
  addressMerkleTreeIndex: number | null;
  rootIndex: number | null;
  assignedToAccount: boolean | null;
  assignedAccountIndex: number | null;
  seed: Uint8Array | null;
} {
  if (!bytes) {
    return {
      addressQueueIndex: null,
      addressMerkleTreeIndex: null,
      rootIndex: null,
      assignedToAccount: null,
      assignedAccountIndex: null,
      seed: null,
    };
  }

  const raw = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  if (raw.length < 38) {
    return {
      addressQueueIndex: null,
      addressMerkleTreeIndex: null,
      rootIndex: null,
      assignedToAccount: null,
      assignedAccountIndex: null,
      seed: null,
    };
  }

  return {
    seed: Uint8Array.from(raw.subarray(0, 32)),
    addressQueueIndex: raw.readUInt8(32),
    addressMerkleTreeIndex: raw.readUInt8(33),
    rootIndex: raw.readUInt16LE(34),
    assignedToAccount: raw.readUInt8(36) === 1,
    assignedAccountIndex: raw.readUInt8(37),
  };
}

export function buildRegisterVerifierAddressAccounts(
  remainingAccounts: RemainingAccountInput[] | undefined
): RemainingAccountInput[] | undefined {
  if (!remainingAccounts || remainingAccounts.length === 0) {
    return undefined;
  }

  const address = findRemainingAccountByRole(remainingAccounts, 'address');
  const merkleTree =
    findRemainingAccountByRole(remainingAccounts, 'merkle-tree') ??
    findRemainingAccountByRole(remainingAccounts, 'address-tree');
  const addressQueue = findRemainingAccountByRole(remainingAccounts, 'address-queue');

  const ordered: RemainingAccountInput[] = [];

  if (address) {
    ordered.push({
      pubkey: toPublicKey(address.pubkey),
      isSigner: address.isSigner,
      isWritable: address.isWritable,
      role: 'address',
    } as RemainingAccountInput);
  }

  if (merkleTree) {
    ordered.push({
      pubkey: toPublicKey(merkleTree.pubkey),
      isSigner: merkleTree.isSigner,
      isWritable: merkleTree.isWritable,
      role: 'merkle-tree',
    } as RemainingAccountInput);
  }

  if (addressQueue) {
    ordered.push({
      pubkey: toPublicKey(addressQueue.pubkey),
      isSigner: addressQueue.isSigner,
      isWritable: addressQueue.isWritable,
      role: 'address-queue',
    } as RemainingAccountInput);
  }

  return ordered.length > 0 ? ordered : undefined;
}

export function buildRegisterCanonicalContext(params: {
  remainingAccounts?: RemainingAccountInput[];
  maybeNewAddressSerialized?: Uint8Array | Buffer | null;
  outputTreeIndex?: number;
  cluster?: string;
}): RegisterCanonicalContext {
  const outputTreeIndex = resolveStealthOutputTreeIndex({
    cluster: params.cluster,
    explicit: params.outputTreeIndex,
    flow: 'register',
  });
  const remainingAccounts = params.remainingAccounts;

  const addressTree =
    findRemainingAccountByRole(remainingAccounts, 'merkle-tree') ??
    findRemainingAccountByRole(remainingAccounts, 'address-tree');
  const addressQueue = findRemainingAccountByRole(remainingAccounts, 'address-queue');
  const stateQueue =
    findRemainingAccountByRole(remainingAccounts, 'state-queue') ??
    findRemainingAccountByRole(remainingAccounts, 'nullifier-queue');
  const stateTree = findRemainingAccountByRole(remainingAccounts, 'state-tree');
  const address = findRemainingAccountByRole(remainingAccounts, 'address');

  const decodedMaybeNewAddress = decodeRegisterPackedAddressTreeInfo(
    params.maybeNewAddressSerialized ?? null
  );

  const verifierAddressAccounts = buildRegisterVerifierAddressAccounts(remainingAccounts);

  const summaryLines: string[] = [
    `registerMode: init_path_forced`,
    `registerOutputTreeIndexEffective: ${outputTreeIndex}`,
    `registerDecodeContextSource: verifier-register-address-accounts`,
    `registerAssignedAccountIndexSource: canonical-assigned-register-flow`,
    `registerBundle.expected.assignedToAccount=${String(
      REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT
    )}`,
    `registerBundle.expected.assignedAccountIndex=${String(
      REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX
    )}`,
    `registerBundle.newAddress.assignedToAccount=${String(
      decodedMaybeNewAddress.assignedToAccount
    )}`,
    `registerBundle.newAddress.assignedAccountIndex=${String(
      decodedMaybeNewAddress.assignedAccountIndex
    )}`,
    `registerBundle.newAddress.treeIndex=${String(
      decodedMaybeNewAddress.addressMerkleTreeIndex
    )}`,
    `registerBundle.newAddress.queueIndex=${String(
      decodedMaybeNewAddress.addressQueueIndex
    )}`,
    `registerBundle.newAddress.rootIndex=${String(decodedMaybeNewAddress.rootIndex)}`,
    `registerResolvedAddressPubkey: ${
      address ? toPubkeyString(address.pubkey) : 'n/a'
    }`,
    `registerResolvedMerkleTreePubkey: ${
      addressTree ? toPubkeyString(addressTree.pubkey) : 'n/a'
    }`,
    `registerVerifierAddressAccountsCount: ${verifierAddressAccounts?.length ?? 0}`,
    ...summarizeIndexedRemainingAccounts(verifierAddressAccounts).map(
      (line, index) => `registerVerifierAddressAccounts[${index}]: ${line}`
    ),
  ];

  return {
    outputTreeIndex,
    assignedToAccount: REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
    assignedAccountIndex: REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,

    addressTreeIndex: REGISTER_EXTERNAL_INDEX.merkleTree,
    addressQueueIndex: REGISTER_EXTERNAL_INDEX.addressQueue,
    stateQueueIndex: REGISTER_EXTERNAL_INDEX.stateQueue,
    stateTreeIndex: REGISTER_EXTERNAL_INDEX.stateTree,
    addressIndex: REGISTER_EXTERNAL_INDEX.address,

    addressTreePubkey: addressTree
      ? toPublicKey(addressTree.pubkey)
      : LOCALNET_ADDRESS_TREE_PUBKEY,
    addressQueuePubkey: addressQueue
      ? toPublicKey(addressQueue.pubkey)
      : LOCALNET_ADDRESS_QUEUE_PUBKEY,
    stateQueuePubkey: stateQueue ? toPublicKey(stateQueue.pubkey) : null,
    stateTreePubkey: stateTree ? toPublicKey(stateTree.pubkey) : null,
    addressPubkey: address ? toPublicKey(address.pubkey) : null,

    verifierAddressAccounts,
    summaryLines,
  };
}
