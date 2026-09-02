import { PublicKey } from '@solana/web3.js';

import {
  dedupeLightRemainingAccounts,
  findLightRemainingAccountByRole,
  type LightRemainingAccountMeta,
} from './lightClient.ts';
import { LOCALNET_LIGHT_ACCOUNTS } from './lightCanonicalConfig.ts';

export type CanonicalRegisterRemainingAccountsParams = {
  addressTree?: PublicKey;
  addressQueue?: PublicKey;
  stateQueue?: PublicKey;
  stateTree?: PublicKey;
  address?: PublicKey | null;
};

function pushRoleIfMissing(
  accounts: LightRemainingAccountMeta[],
  pubkey: PublicKey,
  role: string,
  writable = true
): LightRemainingAccountMeta[] {
  const hasRole = accounts.some((account) => account.role === role);
  const hasPubkey = accounts.some((account) => account.pubkey.equals(pubkey));

  if (hasRole || hasPubkey) {
    return accounts;
  }

  return [
    ...accounts,
    {
      pubkey,
      isSigner: false,
      isWritable: writable,
      role,
    },
  ];
}

function ensureMerkleTreeRole(
  accounts: LightRemainingAccountMeta[],
  addressTree: PublicKey
): LightRemainingAccountMeta[] {
  const merkleTree = findLightRemainingAccountByRole(accounts, [
    'merkle-tree',
    'address-tree',
  ]);

  if (merkleTree) {
    if (merkleTree.role !== 'merkle-tree') {
      return pushRoleIfMissing(accounts, merkleTree.pubkey, 'merkle-tree');
    }
    if (!merkleTree.pubkey.equals(addressTree)) {
      throw new Error(
        `register merkle-tree mismatch: expected=${addressTree.toBase58()} actual=${merkleTree.pubkey.toBase58()}`
      );
    }
    return accounts;
  }

  return pushRoleIfMissing(accounts, addressTree, 'merkle-tree');
}

function ensureStateTreeAccounts(
  accounts: LightRemainingAccountMeta[],
  stateQueue: PublicKey,
  stateTree: PublicKey
): LightRemainingAccountMeta[] {
  const explicitStateQueue = findLightRemainingAccountByRole(accounts, [
    'state-queue',
    'nullifier-queue',
  ]);
  const explicitStateTree = findLightRemainingAccountByRole(accounts, ['state-tree']);

  if (
    explicitStateQueue &&
    !explicitStateQueue.pubkey.equals(stateQueue)
  ) {
    throw new Error(
      `register state-queue mismatch: expected=${stateQueue.toBase58()} actual=${explicitStateQueue.pubkey.toBase58()}`
    );
  }

  if (explicitStateTree && !explicitStateTree.pubkey.equals(stateTree)) {
    throw new Error(
      `register state-tree mismatch: expected=${stateTree.toBase58()} actual=${explicitStateTree.pubkey.toBase58()}`
    );
  }

  let next = accounts;
  next = pushRoleIfMissing(next, stateQueue, 'state-queue');
  next = pushRoleIfMissing(next, stateTree, 'state-tree');
  return next;
}

/**
 * Helius/Photon often return address-tree + address-queue but omit compression state accounts.
 * Register stealth requires canonical roles including state-queue and state-tree.
 */
export function ensureCanonicalRegisterRemainingAccounts(
  accounts: LightRemainingAccountMeta[],
  params?: CanonicalRegisterRemainingAccountsParams
): LightRemainingAccountMeta[] {
  const trees = {
    addressTree: params?.addressTree ?? LOCALNET_LIGHT_ACCOUNTS.addressTree,
    addressQueue: params?.addressQueue ?? LOCALNET_LIGHT_ACCOUNTS.addressQueue,
    stateQueue: params?.stateQueue ?? LOCALNET_LIGHT_ACCOUNTS.stateQueue,
    stateTree: params?.stateTree ?? LOCALNET_LIGHT_ACCOUNTS.stateTree,
  };

  let next = dedupeLightRemainingAccounts(accounts);
  next = ensureMerkleTreeRole(next, trees.addressTree);
  next = pushRoleIfMissing(next, trees.addressQueue, 'address-queue');
  next = ensureStateTreeAccounts(next, trees.stateQueue, trees.stateTree);

  if (params?.address) {
    next = next.filter((account) => account.role !== 'address');
    next = pushRoleIfMissing(next, params.address, 'address');
  }

  return dedupeLightRemainingAccounts(next);
}

/** Register / send / claim — ten sam zestaw kont drzew Light na devnet i localnet. */
export function ensureCanonicalLightTreeRemainingAccounts(
  accounts: LightRemainingAccountMeta[],
  params?: CanonicalRegisterRemainingAccountsParams
): LightRemainingAccountMeta[] {
  return ensureCanonicalRegisterRemainingAccounts(accounts, params);
}

/**
 * `role=address` is for register (derived address PDA on localnet, e.g. `1tB3…`).
 * Send/claim allocate via validity proof + `maybeNewPaymentAddress`; passing a
 * localnet-only address pubkey on devnet breaks Light CPI (often Custom 6042).
 */
export function stripLightAddressRemainingAccount(
  accounts: LightRemainingAccountMeta[]
): LightRemainingAccountMeta[] {
  return accounts.filter((account) => account.role !== 'address');
}

/** Canonical tree spine for send/claim (no register-only `address` slot). */
export function ensureSendLightTreeRemainingAccounts(
  accounts: LightRemainingAccountMeta[],
  params?: CanonicalRegisterRemainingAccountsParams
): LightRemainingAccountMeta[] {
  return ensureCanonicalLightTreeRemainingAccounts(
    stripLightAddressRemainingAccount(accounts),
    params
  );
}
