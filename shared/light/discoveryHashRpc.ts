import { createBN254, encodeBN254toBase58 } from './statelessSdk.ts';

/** Photon / Helius JSON-RPC expects compressed-account hashes as base58 BN254, not decimal. */
const PHOTON_HASH_BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;

/**
 * Normalize a discovery hash (decimal / hex / base58) to Photon RPC base58 form.
 */
export function discoveryHashForPhotonRpc(hash: string): string {
  const trimmed = hash.trim();
  if (!trimmed) {
    throw new Error('discovery hash is empty');
  }
  if (PHOTON_HASH_BASE58.test(trimmed)) {
    return trimmed;
  }
  if (/^\d+$/.test(trimmed)) {
    return encodeBN254toBase58(createBN254(trimmed) as import('bn.js').default);
  }
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length >= 16) {
    return encodeBN254toBase58(createBN254(trimmed, 16) as import('bn.js').default);
  }
  throw new Error(
    `Unrecognized discovery hash for Photon RPC (expected base58, decimal, or hex; len=${trimmed.length})`
  );
}

export function discoveryHashesForPhotonRpc(hashes: string[]): string[] {
  return hashes.map(discoveryHashForPhotonRpc);
}
