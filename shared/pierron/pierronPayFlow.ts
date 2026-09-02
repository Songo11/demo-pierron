import {
  createTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { AppCluster } from "../core/config.ts";
import {
  getPierronProgramId,
  getPierronTransferHookProgramId,
  getProgramIds,
  setCurrentCluster,
  type SupportedCluster,
} from "../core/programIds.ts";
import { PIERRON_DEVNET_METEORA_POOL } from "../meteora/pierronPoolCanonical.ts";
import { getOrCreateAtaIxForOwner, getPierronTokenAtaForOwner } from "./pierronTokenAta.ts";
import { resolveTransferHookMetasForTransfer } from "./resolveTransferHookAccounts.ts";
import { buildProtocolTaxAndPriceFloorIxs } from "./sellRedistributionTaxPretransfer.ts";
import { buildRecordWalletPayIx } from "./recordWalletPayLedger.ts";
import { quotePierronGrossSolValueLamports } from "./quotePierronSolValue.ts";
import { readTradeConfigDexRefs } from "./tradeConfigRefs.ts";
import { grossFromNet } from "./tradeTax.ts";
import { Program, type Idl } from "@coral-xyz/anchor";
import pierronIdl from "../idl/pierron.json";
import { deriveTradeConfigPda } from "./initUserTradeAccounts.ts";

export const PIERRON_PAY_SCHEME = "pierron";
export const PIERRON_PAY_HOST = "pay";
export const PIERRON_DECIMALS = 6;

export type PierronPayRequest = {
  recipient: PublicKey;
  amountUi: string;
  amountBaseUnits: bigint;
  label?: string;
  reference?: string;
  cluster: AppCluster;
  mint: PublicKey;
};

export class PierronPayParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PierronPayParseError";
  }
}

function clusterFromParam(raw: string | null): AppCluster {
  const value = raw?.trim().toLowerCase();
  if (!value || value === "devnet") return "devnet";
  if (value === "mainnet-beta" || value === "mainnet") return "mainnet-beta";
  if (value === "testnet") return "testnet";
  if (value === "localnet") return "localnet";
  throw new PierronPayParseError(`Nieobsługiwany cluster: ${raw}`);
}

function parseAmountUi(amountRaw: string): { amountUi: string; amountBaseUnits: bigint } {
  const amountUi = amountRaw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(amountUi)) {
    throw new PierronPayParseError("Nieprawidłowa kwota.");
  }
  const [whole, frac = ""] = amountUi.split(".");
  if (frac.length > PIERRON_DECIMALS) {
    throw new PierronPayParseError(`Maksymalnie ${PIERRON_DECIMALS} miejsc po przecinku.`);
  }
  const padded = `${whole}${frac.padEnd(PIERRON_DECIMALS, "0")}`;
  const amountBaseUnits = BigInt(padded);
  if (amountBaseUnits <= 0n) {
    throw new PierronPayParseError("Kwota musi być większa od zera.");
  }
  return { amountUi, amountBaseUnits };
}

function mintForCluster(cluster: AppCluster): PublicKey {
  const idsCluster: SupportedCluster = cluster === "localnet" ? "devnet" : cluster;
  setCurrentCluster(idsCluster);
  const ids = getProgramIds(idsCluster);
  if (!ids.tokenMint) {
    throw new PierronPayParseError("Brak minta PIERRON dla klastra.");
  }
  return ids.tokenMint;
}

/** Parse `pierron://pay?...`, `https://.../pay?...`, or Solana Pay `solana:...&spl-token=MINT`. */
export function parsePierronPayLink(
  input: string,
  defaults?: { cluster?: AppCluster; mint?: PublicKey }
): PierronPayRequest {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PierronPayParseError("Pusty link płatności.");
  }

  let url: URL;
  try {
    if (trimmed.startsWith("solana:")) {
      const normalized = trimmed.replace(/^solana:/, "https://solana.invalid/");
      url = new URL(normalized);
    } else if (trimmed.startsWith("pierron:")) {
      const normalized = trimmed.replace(/^pierron:/, "https://pierron.invalid/");
      url = new URL(normalized);
    } else {
      url = new URL(trimmed);
    }
  } catch {
    throw new PierronPayParseError("Nie rozpoznano formatu linku płatności.");
  }

  const cluster = clusterFromParam(
    url.searchParams.get("cluster") ?? defaults?.cluster ?? "devnet"
  );
  const mint = defaults?.mint ?? mintForCluster(cluster);

  if (url.protocol === "https:" && url.hostname === "solana.invalid") {
    const recipientRaw = url.pathname.replace(/^\//, "") || url.searchParams.get("recipient");
    if (!recipientRaw) {
      throw new PierronPayParseError("Brak odbiorcy w linku Solana Pay.");
    }
    const splToken = url.searchParams.get("spl-token");
    if (splToken && splToken !== mint.toBase58()) {
      throw new PierronPayParseError("Link dotyczy innego tokena niż PIERRON.");
    }
    const amountParam = url.searchParams.get("amount");
    if (!amountParam) {
      throw new PierronPayParseError("Brak kwoty w linku Solana Pay.");
    }
    const { amountUi, amountBaseUnits } = parseAmountUi(amountParam);
    return {
      recipient: new PublicKey(recipientRaw),
      amountUi,
      amountBaseUnits,
      label: url.searchParams.get("label") ?? undefined,
      reference: url.searchParams.get("reference") ?? undefined,
      cluster,
      mint,
    };
  }

  const hostOk =
    url.hostname === "pierron.invalid" ||
    url.hostname === "pay" ||
    url.pathname.includes("/pay");
  if (!hostOk && url.protocol !== "pierron:") {
    throw new PierronPayParseError("To nie jest link Pierron Pay.");
  }

  const recipientRaw =
    url.searchParams.get("recipient") ??
    url.searchParams.get("merchant") ??
    url.searchParams.get("to");
  if (!recipientRaw) {
    throw new PierronPayParseError("Brak adresu odbiorcy (recipient).");
  }

  const amountRaw = url.searchParams.get("amount") ?? url.searchParams.get("amt");
  if (!amountRaw) {
    throw new PierronPayParseError("Brak kwoty (amount).");
  }

  const { amountUi, amountBaseUnits } = parseAmountUi(amountRaw);

  return {
    recipient: new PublicKey(recipientRaw),
    amountUi,
    amountBaseUnits,
    label: url.searchParams.get("label") ?? url.searchParams.get("memo") ?? undefined,
    reference: url.searchParams.get("ref") ?? url.searchParams.get("reference") ?? undefined,
    cluster,
    mint,
  };
}

export function buildPierronPayLink(request: PierronPayRequest): string {
  const params = new URLSearchParams();
  params.set("recipient", request.recipient.toBase58());
  params.set("amount", request.amountUi);
  if (request.label) params.set("label", request.label);
  if (request.reference) params.set("ref", request.reference);
  if (request.cluster !== "devnet") params.set("cluster", request.cluster);
  return `${PIERRON_PAY_SCHEME}://${PIERRON_PAY_HOST}?${params.toString()}`;
}

/** Solana Pay compatible link (SPL token). */
export function buildSolanaPayPierronLink(request: PierronPayRequest): string {
  const params = new URLSearchParams();
  params.set("amount", request.amountUi);
  params.set("spl-token", request.mint.toBase58());
  if (request.label) params.set("label", request.label);
  if (request.reference) params.set("reference", request.reference);
  return `solana:${request.recipient.toBase58()}?${params.toString()}`;
}

/** General P2P flag — Pierron Pay does not require this (see on-chain `TransferKind::PierronPay`). */
export async function readWalletP2pEnabled(
  connection: Connection,
  cluster: SupportedCluster
): Promise<boolean> {
  const programId = getPierronProgramId(cluster);
  const idl = { ...(pierronIdl as object), address: programId.toBase58() } as Idl;
  const program = new Program(idl, {
    connection,
    publicKey: PublicKey.default,
  } as never);
  const tradeConfig = deriveTradeConfigPda(programId);
  const cfg: Record<string, unknown> = await program.account.tradeConfig.fetch(
    tradeConfig
  );
  return Boolean(
    cfg.allowWalletP2P ??
      cfg.allowWalletP2p ??
      cfg.allow_wallet_p2p
  );
}

export async function buildPierronPayTransferIx(params: {
  connection: Connection;
  payer: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  amountBaseUnits: bigint;
  cluster?: SupportedCluster;
}): Promise<TransactionInstruction> {
  const cluster = params.cluster ?? "devnet";
  const source = getPierronTokenAtaForOwner(params.mint, params.payer);
  const destination = getPierronTokenAtaForOwner(params.mint, params.recipient);
  const hookProgramId = getPierronTransferHookProgramId(cluster);

  const ix = createTransferCheckedInstruction(
    source,
    params.mint,
    destination,
    params.payer,
    params.amountBaseUnits,
    PIERRON_DECIMALS,
    [],
    TOKEN_2022_PROGRAM_ID
  );

  const hookMetas = await resolveTransferHookMetasForTransfer({
    connection: params.connection,
    mint: params.mint,
    source,
    destination,
    owner: params.payer,
    hookProgramId,
    amount: params.amountBaseUnits,
    cluster,
  });

  ix.keys.push(
    ...hookMetas.map((m) => ({
      pubkey: m.pubkey,
      isSigner: m.isSigner,
      isWritable: m.isWritable,
    }))
  );

  return ix;
}

export async function buildPierronPayTransaction(params: {
  connection: Connection;
  payer: PublicKey;
  request: PierronPayRequest;
  cluster?: SupportedCluster;
}): Promise<Transaction> {
  const cluster =
    params.cluster ??
    (params.request.cluster === "localnet" ? "devnet" : params.request.cluster);
  const { mint, recipient, amountBaseUnits } = params.request;
  /** Link amount = net to merchant; payer covers gross + split protocol tax. */
  const payTax = grossFromNet(amountBaseUnits);

  const payerAta = await getOrCreateAtaIxForOwner({
    connection: params.connection,
    mint,
    owner: params.payer,
    payer: params.payer,
    tokenProgramId: TOKEN_2022_PROGRAM_ID,
  });
  const merchantAta = await getOrCreateAtaIxForOwner({
    connection: params.connection,
    mint,
    owner: recipient,
    payer: params.payer,
    tokenProgramId: TOKEN_2022_PROGRAM_ID,
  });

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));
  if (payerAta.ix) tx.add(payerAta.ix);
  if (merchantAta.ix) tx.add(merchantAta.ix);

  const payerSource = getPierronTokenAtaForOwner(mint, params.payer);
  const dexRefs = await readTradeConfigDexRefs(params.connection, cluster);
  const solValueLamports = await quotePierronGrossSolValueLamports({
    connection: params.connection,
    grossBaseUnits: payTax.gross,
    meteoraPool: dexRefs.meteoraPool,
    cluster,
  });

  tx.add(
    buildRecordWalletPayIx({
      grossBaseUnits: payTax.gross,
      solValueLamports,
      payer: params.payer,
      cluster,
    })
  );

  const taxIxs = await buildProtocolTaxAndPriceFloorIxs({
    connection: params.connection,
    userTokenAccount: payerSource,
    mint,
    owner: params.payer,
    grossBaseUnits: payTax.gross,
    transactionValueLamports: solValueLamports,
    cluster,
    meteoraPool: dexRefs.meteoraPool,
    pierronTokenVault: dexRefs.meteoraTokenVault,
  });
  for (const taxIx of taxIxs) {
    tx.add(taxIx);
  }

  const transferIx = await buildPierronPayTransferIx({
    connection: params.connection,
    payer: params.payer,
    recipient,
    mint,
    amountBaseUnits: payTax.net,
    cluster,
  });
  tx.add(transferIx);
  tx.feePayer = params.payer;
  return tx;
}

export function formatPayRecipientShort(pubkey: PublicKey): string {
  const s = pubkey.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Devnet pool marker for merchant pages (optional display). */
export const PIERRON_PAY_DEVNET_POOL = PIERRON_DEVNET_METEORA_POOL;
