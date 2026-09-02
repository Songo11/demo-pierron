/**
 * Oblicza i zbiera zaległy 1% podatek z swapów Meteora UI (user-signed top-level transfer).
 */
import * as anchor from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  Transaction,
  type ConfirmedSignatureInfo,
} from "@solana/web3.js";
import { calculateTradeTax } from "./tradeTax.ts";
import { buildSellRedistributionTaxTransferIxWithHook } from "./sellRedistributionTaxPretransfer.ts";

const TRADE_VALIDATED_DISC = Buffer.from([
  0x14, 0xd4, 0xea, 0x5e, 0xde, 0xed, 0x40, 0xa7,
]);

const DEFAULT_POOL = "96RRWGfUZ1rpxnuF5xx5KXDBPhm9yej4RbJ6DVcYCg5W";
const DEFAULT_MINT = "BYcQtZN9RbgRDyiRbBSr1UxgcEyWkyqqfmrumdKwLMri";
const DEFAULT_VAULT = "D1ajrrwmWqtKA65aTkYcZicd6ncAhtPWQDWRTYfURzhx";

function decodeTradeValidated(data: Buffer): { user: PublicKey; gross: bigint } | null {
  if (data.length < 48 || !data.subarray(0, 8).equals(TRADE_VALIDATED_DISC)) {
    return null;
  }
  return {
    user: new PublicKey(data.subarray(8, 40)),
    gross: data.readBigUInt64LE(40),
  };
}

export async function computePendingDexTaxForUser(params: {
  connection: Connection;
  user: PublicKey;
  pool?: PublicKey;
  mint?: PublicKey;
  scanLimit?: number;
}): Promise<{ totalTax: bigint; swapCount: number }> {
  const pool =
    params.pool ??
    new PublicKey(process.env.PIERRON_METEORA_POOL || DEFAULT_POOL);
  const mint =
    params.mint ??
    new PublicKey(process.env.PIERRON_MINT || DEFAULT_MINT);
  const scanLimit = params.scanLimit ?? 50;

  const sigs = await params.connection.getSignaturesForAddress(
    pool,
    { limit: scanLimit },
    "confirmed"
  );

  let totalTax = 0n;
  let swapCount = 0;

  for (const info of sigs) {
    if (info.err) continue;
    const tax = await parseUserSwapTax(params.connection, info, mint, params.user);
    if (tax > 0n) {
      totalTax += tax;
      swapCount++;
    }
  }

  return { totalTax, swapCount };
}

async function parseUserSwapTax(
  connection: Connection,
  info: ConfirmedSignatureInfo,
  mint: PublicKey,
  user: PublicKey
): Promise<bigint> {
  const tx = await connection.getTransaction(info.signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx?.meta?.logMessages) return 0n;

  const pierron = process.env.PIERRON_PROGRAM_ID || "A9kNasYvn9ZqdEzHvRHqQFtouqdRzzE2udR8aUqbKb13";
  const hookOk = tx.meta.logMessages.some(
    (l) => l.includes(pierron) && l.includes("success")
  );
  const swapOk = tx.meta.logMessages.some((l) =>
    l.includes("Instruction: Swap2")
  );
  if (!hookOk || !swapOk) return 0n;

  for (const line of tx.meta.logMessages) {
    if (!line.startsWith("Program data: ")) continue;
    const buf = Buffer.from(line.slice("Program data: ".length), "base64");
    const ev = decodeTradeValidated(buf);
    if (!ev || !ev.user.equals(user)) continue;
    return calculateTradeTax(ev.gross).tax;
  }
  return 0n;
}

export async function collectDexTaxFromUserAta(params: {
  connection: Connection;
  payer: PublicKey;
  user: PublicKey;
  mint?: PublicKey;
  taxBaseUnits: bigint;
  sendTransaction: (tx: Transaction) => Promise<string>;
}): Promise<string> {
  const mint =
    params.mint ??
    new PublicKey(process.env.PIERRON_MINT || DEFAULT_MINT);
  const redistributionVault = new PublicKey(
    process.env.REDISTRIBUTION_VAULT || DEFAULT_VAULT
  );
  const userAta = getAssociatedTokenAddressSync(
    mint,
    params.user,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const balance = await params.connection.getTokenAccountBalance(userAta);
  const available = BigInt(balance.value.amount);
  if (available < params.taxBaseUnits) {
    throw new Error(
      `Za mało PIERRON na ATA (${available} < ${params.taxBaseUnits} base units)`
    );
  }

  const ix = await buildSellRedistributionTaxTransferIxWithHook({
    connection: params.connection,
    userTokenAccount: userAta,
    mint,
    redistributionVault,
    owner: params.user,
    taxBaseUnits: params.taxBaseUnits,
    cluster: "devnet",
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = params.payer;
  return params.sendTransaction(tx);
}
