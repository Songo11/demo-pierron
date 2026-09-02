import {
  PublicKey,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

/**
 * Browser-safe TransferChecked ix.
 * `@solana/spl-token`'s createTransferCheckedInstruction uses buffer-layout
 * `writeBigUInt64LE`, which many Next/Turbopack Buffer polyfills lack.
 */
export function createTransferCheckedInstructionBrowserSafe(
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint | number,
  decimals: number,
  multiSigners: PublicKey[] = [],
  programId: PublicKey = TOKEN_PROGRAM_ID
): TransactionInstruction {
  const keys: AccountMeta[] = [
    { pubkey: source, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: destination, isSigner: false, isWritable: true },
    {
      pubkey: owner,
      isSigner: multiSigners.length === 0,
      isWritable: false,
    },
    ...multiSigners.map((pubkey) => ({
      pubkey,
      isSigner: true,
      isWritable: false,
    })),
  ];

  // TokenInstruction.TransferChecked = 12; layout: u8 + u64 amount + u8 decimals
  const raw = new Uint8Array(10);
  raw[0] = 12;
  new DataView(raw.buffer).setBigUint64(1, BigInt(amount), true);
  raw[9] = decimals & 0xff;

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from(raw),
  });
}
