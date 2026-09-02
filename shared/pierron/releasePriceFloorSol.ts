import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { allocU8, toBuffer, writeU64LE } from "../solana/browserSafeBuffer.ts";
import { derivePriceFloorTreasuryPda } from "./priceFloorSolFee.ts";

/** Anchor `global:release_price_floor_sol` discriminator. */
export const RELEASE_PRICE_FLOOR_SOL_DISCRIMINATOR = Buffer.from([
  189, 36, 80, 91, 55, 128, 201, 85,
]);

export const MIN_PRICE_FLOOR_RELEASE_LAMPORTS = 1_000_000n;
export const PRICE_FLOOR_TREASURY_RESERVE_LAMPORTS = 500_000n;

export function deriveTradeConfigPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("trade-config")],
    programId
  );
  return pda;
}

export function buildReleasePriceFloorSolIx(params: {
  programId: PublicKey;
  authority: PublicKey;
  amount: bigint;
  cluster?: SupportedCluster;
}): TransactionInstruction {
  if (params.amount <= 0n) {
    throw new Error("release amount must be positive");
  }
  if (params.amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("release amount exceeds safe u64 limit");
  }
  const tradeConfig = deriveTradeConfigPda(params.programId);
  const treasury = derivePriceFloorTreasuryPda(params.cluster);
  const raw = allocU8(8 + 8);
  raw.set(RELEASE_PRICE_FLOOR_SOL_DISCRIMINATOR, 0);
  writeU64LE(raw, params.amount, 8);
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: tradeConfig, isSigner: false, isWritable: false },
      { pubkey: params.authority, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      {
        pubkey: new PublicKey("11111111111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
    ],
    data: toBuffer(raw),
  });
}

/** Lamports releasable from treasury without draining rent reserve. */
export function priceFloorTreasuryReleasableLamports(treasuryLamports: bigint): bigint {
  const reserve = PRICE_FLOOR_TREASURY_RESERVE_LAMPORTS;
  if (treasuryLamports <= reserve) return 0n;
  return treasuryLamports - reserve;
}
