import type { AccountInfo, Commitment, Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';

/**
 * Address merkle tree accounts on Light are multi‑MB. Fetching the full account through
 * Cloudflare Workers / phone RPC proxies returns 503 ("All backends failed").
 * Derivation only needs discriminator + tree type (first 16 bytes) — see
 * {@link deriveCompressedAddressFromAddressTreeAccountData}.
 */
export const ADDRESS_MERKLE_TREE_ACCOUNT_HEADER_BYTES = 64;

export async function getAddressMerkleTreeAccountHeader(
  connection: Connection,
  addressTree: PublicKey,
  commitment: Commitment = 'confirmed'
): Promise<AccountInfo<Buffer> | null> {
  return connection.getAccountInfo(addressTree, {
    commitment,
    dataSlice: { offset: 0, length: ADDRESS_MERKLE_TREE_ACCOUNT_HEADER_BYTES },
  });
}
