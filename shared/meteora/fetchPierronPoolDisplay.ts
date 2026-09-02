import { NATIVE_MINT } from "@solana/spl-token";
import type { Connection, PublicKey } from "@solana/web3.js";
import { createPierronDlmmPool } from "./createPierronDlmmPool.ts";

export type PierronPoolDisplay = {
  pool: string;
  mintPierron: string;
  mintQuote: string;
  activeBinId: number;
  pricePerPierronInSol: string;
  binPierronUi: string;
  binSolUi: string;
  binStep: number;
  baseFeeBps: number;
};

function uiAmount(raw: bigint, decimals: number): string {
  const div = 10n ** BigInt(decimals);
  const whole = raw / div;
  const frac = raw % div;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/** Dane puli z RPC (działa nawet gdy Meteora UI / datapi zwraca 404). */
export async function fetchPierronPoolDisplay(
  connection: Connection,
  pool: PublicKey,
  mintPierron: PublicKey,
  opt?: { cluster?: "devnet" | "mainnet-beta" }
): Promise<PierronPoolDisplay> {
  const dlmm = await createPierronDlmmPool(connection, pool, {
    cluster: opt?.cluster ?? "devnet",
  });
  const active = await dlmm.getActiveBin();
  const tokenX = dlmm.lbPair.tokenXMint;
  const tokenY = dlmm.lbPair.tokenYMint;
  const pierronIsX = tokenX.equals(mintPierron);
  const mintQuote = pierronIsX ? tokenY : tokenX;
  const pierronDecimals = pierronIsX
    ? dlmm.tokenX.mint.decimals
    : dlmm.tokenY.mint.decimals;
  const quoteDecimals = pierronIsX
    ? dlmm.tokenY.mint.decimals
    : dlmm.tokenX.mint.decimals;

  const xAmt = BigInt(active.xAmount.toString());
  const yAmt = BigInt(active.yAmount.toString());
  const pierronRaw = pierronIsX ? xAmt : yAmt;
  const quoteRaw = pierronIsX ? yAmt : xAmt;

  return {
    pool: pool.toBase58(),
    mintPierron: mintPierron.toBase58(),
    mintQuote: mintQuote.toBase58(),
    activeBinId: active.binId,
    pricePerPierronInSol: active.price,
    binPierronUi: uiAmount(pierronRaw, pierronDecimals),
    binSolUi: uiAmount(quoteRaw, quoteDecimals),
    binStep: dlmm.lbPair.binStep,
    baseFeeBps: dlmm.lbPair.parameters.baseFactor,
  };
}

export const WSOL_MINT = NATIVE_MINT.toBase58();
