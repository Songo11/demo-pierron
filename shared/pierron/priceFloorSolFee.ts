import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronProgramId } from "../core/programIds.ts";
import { createPierronDlmmPool } from "../meteora/createPierronDlmmPool.ts";
import { createTransferCheckedInstructionBrowserSafe } from "../solana/browserSafeTransferChecked.ts";

/** Mirrors `PRICE_FLOOR_BPS` in `programs/pierron/src/constants.rs` (50 = 0.5%). */
export const PRICE_FLOOR_BPS = 50n;

const TREASURY_SEED = Buffer.from("price-floor-treasury");

/**
 * @deprecated Legacy PDA — fee no longer lands here.
 * Kept so release scripts / old validators can still resolve the address.
 */
export function derivePriceFloorTreasuryPda(
  cluster?: SupportedCluster
): PublicKey {
  const programId = getPierronProgramId(cluster);
  const [pda] = PublicKey.findProgramAddressSync([TREASURY_SEED], programId);
  return pda;
}

/** 0.5% of transaction value in lamports (swap SOL leg or Pierron Pay quoted SOL value). */
export function calculatePriceFloorSolFeeLamports(
  transactionValueLamports: bigint
): bigint {
  if (transactionValueLamports <= 0n) return 0n;
  return (transactionValueLamports * PRICE_FLOOR_BPS) / 10_000n;
}

/** Resolve the pool's wSOL reserve (the side that is not the PIERRON vault). */
export async function resolveMeteoraSolReserve(params: {
  connection: Connection;
  meteoraPool: PublicKey;
  pierronTokenVault: PublicKey;
  cluster?: SupportedCluster;
}): Promise<PublicKey> {
  const dlmm = await createPierronDlmmPool(
    params.connection,
    params.meteoraPool,
    { cluster: params.cluster }
  );
  const { reserveX, reserveY, tokenXMint, tokenYMint } = dlmm.lbPair;
  if (tokenXMint.equals(NATIVE_MINT)) return reserveX;
  if (tokenYMint.equals(NATIVE_MINT)) return reserveY;
  if (reserveX.equals(params.pierronTokenVault)) return reserveY;
  if (reserveY.equals(params.pierronTokenVault)) return reserveX;
  throw new Error(
    "Meteora pool has no wSOL reserve — price floor fee cannot be deposited"
  );
}

/**
 * Direct price-floor funding: wrap SOL → transfer wSOL into the Meteora pool SOL reserve.
 * Same pool as trading — no new Meteora listing / badge. No Pierron treasury hop.
 */
export async function buildPriceFloorSolFeeIxs(params: {
  connection: Connection;
  payer: PublicKey;
  transactionValueLamports: bigint;
  meteoraPool: PublicKey;
  pierronTokenVault: PublicKey;
  cluster?: SupportedCluster;
  /** Optional pre-resolved reserve (avoids extra RPC when caller already loaded the pool). */
  solReserve?: PublicKey;
  /**
   * Skip idempotent wSOL ATA create — use when setup/wrap already ensures the ATA
   * (saves ~150–200 B on tight buy swap+ledger legacy txs).
   */
  skipCreateWsolAta?: boolean;
  /**
   * Fee lamports were already included in the buy wrap (swap amount + fee).
   * Emit only TransferChecked of wSOL → pool reserve (skips System transfer + SyncNative).
   */
  preWrappedFeeOnly?: boolean;
}): Promise<TransactionInstruction[]> {
  const lamports = calculatePriceFloorSolFeeLamports(
    params.transactionValueLamports
  );
  if (lamports <= 0n) {
    throw new Error("price floor SOL fee must be positive");
  }
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("price floor SOL fee exceeds safe transfer limit");
  }
  const amount = Number(lamports);

  const solReserve =
    params.solReserve ??
    (await resolveMeteoraSolReserve({
      connection: params.connection,
      meteoraPool: params.meteoraPool,
      pierronTokenVault: params.pierronTokenVault,
      cluster: params.cluster,
    }));

  const userWsol = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    params.payer,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const ixs: TransactionInstruction[] = [];
  if (params.preWrappedFeeOnly) {
    ixs.push(
      createTransferCheckedInstructionBrowserSafe(
        userWsol,
        NATIVE_MINT,
        solReserve,
        params.payer,
        amount,
        9,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    return ixs;
  }
  if (!params.skipCreateWsolAta) {
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        params.payer,
        userWsol,
        params.payer,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }
  ixs.push(
    SystemProgram.transfer({
      fromPubkey: params.payer,
      toPubkey: userWsol,
      lamports: amount,
    }),
    createSyncNativeInstruction(userWsol, TOKEN_PROGRAM_ID),
    createTransferCheckedInstructionBrowserSafe(
      userWsol,
      NATIVE_MINT,
      solReserve,
      params.payer,
      amount,
      9,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  return ixs;
}

/**
 * Compact legacy path counted by on-chain `require_price_floor_sol_fee`:
 * SystemProgram transfer to `price-floor-treasury` PDA (1 ix ≈ saves ~100 B vs
 * wrap→TransferChecked into the pool reserve). Used when buy create+wrap+swap
 * cannot fit the direct floor path under the 1232 B legacy packet limit.
 */
export function buildPriceFloorSolFeeLegacyTreasuryIx(params: {
  payer: PublicKey;
  transactionValueLamports: bigint;
  cluster?: SupportedCluster;
}): TransactionInstruction {
  const lamports = calculatePriceFloorSolFeeLamports(
    params.transactionValueLamports
  );
  if (lamports <= 0n) {
    throw new Error("price floor SOL fee must be positive");
  }
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("price floor SOL fee exceeds safe transfer limit");
  }
  return SystemProgram.transfer({
    fromPubkey: params.payer,
    toPubkey: derivePriceFloorTreasuryPda(params.cluster),
    lamports: Number(lamports),
  });
}

/** @deprecated No-op — treasury path removed. */
export async function buildEnsurePriceFloorTreasuryIxs(_params: {
  connection: Connection;
  payer: PublicKey;
  cluster?: SupportedCluster;
}): Promise<TransactionInstruction[]> {
  return [];
}

/** @deprecated Use {@link buildPriceFloorSolFeeIxs}. */
export function buildPriceFloorSolFeeIx(_params: {
  payer: PublicKey;
  transactionValueLamports: bigint;
  cluster?: SupportedCluster;
}): TransactionInstruction {
  throw new Error(
    "buildPriceFloorSolFeeIx removed — use buildPriceFloorSolFeeIxs (direct Meteora SOL reserve)"
  );
}
