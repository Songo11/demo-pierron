import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronProgramId } from "../core/programIds.ts";
import { allocU8, toBuffer, writeU64LE } from "../solana/browserSafeBuffer.ts";

/** Anchor `global:record_wallet_pay` discriminator. */
const RECORD_WALLET_PAY_DISCRIMINATOR = Buffer.from([
  42, 27, 206, 122, 73, 26, 151, 239,
]);

/** Marker ix so the transfer hook credits payer ecosystem activity (not the recipient). */
export function buildRecordWalletPayIx(params: {
  grossBaseUnits: bigint;
  solValueLamports: bigint;
  payer: PublicKey;
  cluster?: SupportedCluster;
}): TransactionInstruction {
  if (params.grossBaseUnits <= 0n) {
    throw new Error("wallet pay gross must be positive");
  }
  if (params.solValueLamports <= 0n) {
    throw new Error("wallet pay SOL value must be positive");
  }
  const programId = getPierronProgramId(params.cluster);
  const raw = allocU8(24);
  raw.set(RECORD_WALLET_PAY_DISCRIMINATOR, 0);
  writeU64LE(raw, params.grossBaseUnits, 8);
  writeU64LE(raw, params.solValueLamports, 16);
  return new TransactionInstruction({
    programId,
    keys: [{ pubkey: params.payer, isSigner: true, isWritable: false }],
    data: toBuffer(raw),
  });
}
