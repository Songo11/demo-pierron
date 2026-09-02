import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import type { SupportedCluster } from '../core/programIds.ts';
import { getCurrentCluster, inferClusterFromRpcUrl } from '../core/programIds.ts';
import {
  fetchStealthSendLookupTable,
  PACKET_DATA_SIZE,
} from './stealthAddressLookupTable.ts';

/** Stealth send/claim with Light CPI needs a high CU ceiling. */
export const STEALTH_TX_COMPUTE_UNIT_LIMIT = 1_400_000;

/** Extra heap for transfer-hook + Light CPI (default bump allocator is 32 KiB). */
export const STEALTH_TX_HEAP_FRAME_BYTES = 256 * 1024;

export type StealthSignableTransaction = VersionedTransaction;

export function serializeStealthTransaction(tx: StealthSignableTransaction): Buffer {
  return Buffer.from(tx.serialize());
}

export function stealthTransactionByteLength(tx: StealthSignableTransaction): number {
  return serializeStealthTransaction(tx).length;
}

function resolveCluster(
  connection: Connection,
  cluster?: SupportedCluster
): SupportedCluster {
  if (cluster) return cluster;
  const endpoint = connection.rpcEndpoint ?? '';
  if (endpoint) return inferClusterFromRpcUrl(endpoint);
  return getCurrentCluster();
}

/**
 * Versioned (v0) tx with optional address lookup table — required after Pierron hook
 * accounts were added (raw message exceeds 1280 B without LUT).
 */
export async function buildStealthVersionedTransaction(params: {
  connection: Connection;
  payer: PublicKey;
  instructions: TransactionInstruction[];
  cluster?: SupportedCluster;
}): Promise<{
  tx: VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
  messageBytes: number;
  usedLookupTable: boolean;
}> {
  const cluster = resolveCluster(params.connection, params.cluster);
  const { blockhash, lastValidBlockHeight } =
    await params.connection.getLatestBlockhash('confirmed');

  const lookupTable = await fetchStealthSendLookupTable(params.connection, cluster);

  const messageV0 = new TransactionMessage({
    payerKey: params.payer,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.requestHeapFrame({
        bytes: STEALTH_TX_HEAP_FRAME_BYTES,
      }),
      ComputeBudgetProgram.setComputeUnitLimit({
        units: STEALTH_TX_COMPUTE_UNIT_LIMIT,
      }),
      ...params.instructions,
    ],
  }).compileToV0Message(lookupTable ? [lookupTable] : []);

  const messageBytes = messageV0.serialize().length;
  // Wire size ≈ shortvec(sig count) + 64×sigs + message (signatures empty until wallet signs).
  const numSigs = messageV0.header.numRequiredSignatures;
  const sigCountShortVec = numSigs < 0x80 ? 1 : 2;
  const packetBytes = sigCountShortVec + numSigs * 64 + messageBytes;
  if (packetBytes > PACKET_DATA_SIZE) {
    throw new Error(
      `Transakcja stealth jest za duża (packet ~${packetBytes} B > ${PACKET_DATA_SIZE} B; message ${messageBytes} B). ` +
        (lookupTable
          ? 'Skróć listę kont lub zaktualizuj lookup table (scripts/devnet-create-stealth-alt.ts).'
          : 'Brak lookup table — uruchom scripts/devnet-create-stealth-alt.ts na devnecie.')
    );
  }

  return {
    tx: new VersionedTransaction(messageV0),
    blockhash,
    lastValidBlockHeight,
    messageBytes,
    usedLookupTable: lookupTable !== null,
  };
}
