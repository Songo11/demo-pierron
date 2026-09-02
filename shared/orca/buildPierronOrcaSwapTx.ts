/** @deprecated Apps use Meteora only — do not import from dapp/mobile. Ops scripts only. */
import { BN } from "@coral-xyz/anchor";
import { Percentage } from "@orca-so/common-sdk";
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  swapQuoteByInputToken,
} from "@orca-so/whirlpools-sdk";
import type { AnchorProvider } from "@coral-xyz/anchor";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  type Connection,
} from "@solana/web3.js";
import { netBaseUnitsForGrossSell } from "../pierron/tradeTax.ts";
import { loadOrcaWhirlpoolSession } from "./loadOrcaWhirlpool.ts";

/**
 * Buduje transakcję swapV2 na Orca Whirlpool z kontami transfer hook z TLV mintu.
 * Wymaga TokenBadge dla Pierron mint w danej WhirlpoolsConfig (devnet: wniosek do Orca).
 */
export async function buildPierronOrcaSwapTx(params: {
  connection: Connection;
  wallet: AnchorProvider["wallet"];
  whirlpool: PublicKey;
  pierronMint: PublicKey;
  side: "buy" | "sell";
  /** SOL (buy) lub PIERRON UI (sell, brutto przed podatkiem hooka). */
  amountUi: number;
  slippageBps?: number;
  computeUnits?: number;
}): Promise<Transaction> {
  const user = params.wallet.publicKey;
  const session = await loadOrcaWhirlpoolSession({
    connection: params.connection,
    wallet: params.wallet,
    whirlpool: params.whirlpool,
    pierronMint: params.pierronMint,
  });

  if (!session.quoteMint.equals(NATIVE_MINT)) {
    throw new Error(
      `Oczekiwano WSOL jako quote; jest ${session.quoteMint.toBase58()}`
    );
  }

  const pool = await session.client.getPool(session.whirlpool);
  const slippage = Percentage.fromFraction(
    params.slippageBps ?? 100,
    10_000
  );

  let inputMint: PublicKey;
  let inAmount: BN;

  if (params.side === "buy") {
    inputMint = session.quoteMint;
    inAmount = new BN(Math.floor(params.amountUi * 1_000_000_000));
  } else {
    inputMint = session.pierronMint;
    const grossBase = BigInt(Math.floor(params.amountUi * 1_000_000));
    const { net } = netBaseUnitsForGrossSell(grossBase);
    inAmount = new BN(net.toString());
  }

  const quote = await swapQuoteByInputToken(
    pool,
    inputMint,
    inAmount,
    slippage,
    ORCA_WHIRLPOOL_PROGRAM_ID,
    session.ctx.fetcher
  );

  const txBuilder = await pool.swap(quote, user);
  const built = await txBuilder.build({
    blockhashCommitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  const cu = params.computeUnits ?? 1_400_000;
  const swapTx = built.transaction;
  if (!(swapTx instanceof Transaction)) {
    throw new Error("Orca swap returned a versioned transaction; expected legacy Transaction");
  }
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: cu }),
    ...swapTx.instructions
  );
  tx.feePayer = swapTx.feePayer ?? user;
  tx.recentBlockhash =
    typeof built.recentBlockhash === "string"
      ? built.recentBlockhash
      : built.recentBlockhash.blockhash;
  if (built.signers.length > 0) {
    tx.sign(...built.signers);
  }

  return tx;
}
