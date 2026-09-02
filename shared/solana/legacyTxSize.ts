import { Transaction } from "@solana/web3.js";

export const LEGACY_TX_PACKET_DATA_SIZE = 1232;

export function normalizeLegacyTxForSerialize(tx: Transaction): void {
  for (const ix of tx.instructions) {
    if (!Buffer.isBuffer(ix.data)) {
      ix.data = Buffer.from(ix.data);
    }
  }
}

/**
 * Legacy tx wire size. `Transaction.serialize()` throws when >1232 B — parse that
 * error so split logic can run instead of aborting before packing smaller txs.
 */
export function safeLegacyTxByteLength(tx: Transaction): number {
  if (!tx.recentBlockhash) {
    return Number.POSITIVE_INFINITY;
  }
  normalizeLegacyTxForSerialize(tx);
  try {
    return tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).length;
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    const match = msg.match(/Transaction too large:\s*(\d+)\s*>/);
    if (match) {
      return Number(match[1]);
    }
    throw err;
  }
}

export function legacyTxFitsPacket(tx: Transaction): boolean {
  return safeLegacyTxByteLength(tx) <= LEGACY_TX_PACKET_DATA_SIZE;
}
