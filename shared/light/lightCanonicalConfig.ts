import { PublicKey } from '@solana/web3.js';

import type { SupportedCluster } from '../core/programIds.ts';

export const LIGHT_CANONICAL_EXTERNAL_INDEX = Object.freeze({
  register: {
    merkleTree: 6,
    addressQueue: 7,
    stateQueue: 8,
    stateTree: 9,
    address: 10,
  },
  send: {
    merkleTree: 6,
    addressQueue: 7,
    stateQueue: 8,
    stateTree: 9,
    address: 10,
  },
} as const);

export const LOCALNET_LIGHT_ACCOUNTS = Object.freeze({
  addressTree: new PublicKey('amt1Ayt45jfbdw5YSo7iz6WZxUmnZsQTYXy82hVwyC2'),
  addressQueue: new PublicKey('aq1S9z4reTSQAdgWHGD2zDaS39sjGrAxbR31vxJ2F4F'),
  stateQueue: new PublicKey('nfq1NvQDJ2GEgnS8zt9prAe8rjjpAW1zFkrvZoBR148'),
  stateTree: new PublicKey('smt1NamzXdq4AMqS2fS2F1i5KTYPZRhoHgWx38d8WsT'),
});

/**
 * Devnet/localnet stack (`amt1`/`aq1`/`nfq1`/`smt1`):
 * - `nfq1` = **NullifierV1** queue (NOT batched OutputQueue) → output index 8 → Light 6042 at `create outputs`.
 * - `smt1` = legacy **StateV1** merkle tree → output index 9 for `LightAccount::new_init` compressed outputs.
 *
 * See `programs/pierron-stealth` claim comment and Light `QueueType::NullifierV1` in `remaining_account_checks.rs`.
 */
export const LOCAL_DEVNET_OUTPUT_TREE_INDEX =
  LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateTree;

/** @deprecated alias — prefer `LOCAL_DEVNET_OUTPUT_TREE_INDEX` / `resolveStealthOutputTreeIndex` */
export const LOCAL_REGISTER_OUTPUT_TREE_INDEX = LOCAL_DEVNET_OUTPUT_TREE_INDEX;

export const LOCAL_SEND_OUTPUT_TREE_INDEX = LOCAL_DEVNET_OUTPUT_TREE_INDEX;

/** @deprecated misnomer from earlier attempt; devnet outputs use state tree (9), not state queue (8). */
export const LOCAL_V2_OUTPUT_TREE_INDEX = LOCAL_DEVNET_OUTPUT_TREE_INDEX;

/**
 * Resolves Anchor `output_tree_index` for register/send Light CPI.
 * Treats `0` as unset (mobile placeholder).
 */
export function resolveStealthOutputTreeIndex(params: {
  cluster?: SupportedCluster | string;
  explicit?: number | null;
  flow?: 'register' | 'send';
}): number {
  const explicit = params.explicit;
  if (
    typeof explicit === 'number' &&
    Number.isFinite(explicit) &&
    explicit > 0 &&
    explicit <= 255
  ) {
    return Math.trunc(explicit);
  }

  const cluster = params.cluster;
  if (cluster === 'localnet' || cluster === 'devnet') {
    return LOCAL_DEVNET_OUTPUT_TREE_INDEX;
  }

  const canonical =
    params.flow === 'send'
      ? LIGHT_CANONICAL_EXTERNAL_INDEX.send
      : LIGHT_CANONICAL_EXTERNAL_INDEX.register;

  return canonical.stateTree;
}

/** CPI signer PDA for pierron-stealth Light invokes (`["cpi_authority"]` + deploy program id). */
export function deriveStealthLightCpiSignerPda(
  programId: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('cpi_authority')],
    programId
  );
  return pda;
}
