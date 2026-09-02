/**
 * Post-Meteora `transfer_hook` ledger (trade book / lottery / redistribution activity).
 * Must run in the **same transaction** as Meteora `swap2` — on-chain rejects ledger-only
 * OfficialBuy/Sell (otherwise a failed swap could still mint presence).
 */
import {
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
  type Connection,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronProgramId, getPierronTransferHookProgramId } from "../core/programIds.ts";
import type { TransferHookAccountMeta } from "../meteora/pierronDlmmTransferHook.ts";
import { allocU8, toBuffer, writeU64LE } from "../solana/browserSafeBuffer.ts";
import { deriveHookTaxDelegatePda } from "./hookTaxDelegate.ts";
import { readTradeConfigDexRefs } from "./tradeConfigRefs.ts";

/** On-chain Execute TLV: validation PDA + 10 Pierron extras (11 total). */
const DIRECT_TRANSFER_HOOK_REMAINING_COUNT = 11;

/** Correct Pierron hook remaining accounts — do not trust stale TLV venue PDA. */
export async function buildPierronDirectTransferHookRemainingMetas(params: {
  connection: Connection;
  mint: PublicKey;
  cluster?: SupportedCluster;
  redistributionVault?: PublicKey;
}): Promise<TransferHookAccountMeta[]> {
  const programId = getPierronProgramId(params.cluster);
  const hookProgram = getPierronTransferHookProgramId(params.cluster);
  const [tradeConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("trade-config")],
    programId
  );
  const [accounting] = PublicKey.findProgramAddressSync(
    [Buffer.from("accounting")],
    programId
  );
  const [venue] = PublicKey.findProgramAddressSync(
    [Buffer.from("venue-allowlist"), params.mint.toBuffer()],
    programId
  );
  const [tradeBook] = PublicKey.findProgramAddressSync(
    [Buffer.from("trade-book"), params.mint.toBuffer()],
    programId
  );
  const [extraMeta] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), params.mint.toBuffer()],
    hookProgram
  );
  const redistributionVault =
    params.redistributionVault ??
    (await readTradeConfigDexRefs(params.connection, params.cluster))
      .redistributionVault;

  return [
    { pubkey: extraMeta, isSigner: false, isWritable: false },
    { pubkey: tradeConfig, isSigner: false, isWritable: true },
    { pubkey: accounting, isSigner: false, isWritable: true },
    { pubkey: programId, isSigner: false, isWritable: false },
    { pubkey: venue, isSigner: false, isWritable: true },
    { pubkey: tradeBook, isSigner: false, isWritable: true },
    { pubkey: tradeBook, isSigner: false, isWritable: true },
    { pubkey: redistributionVault, isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    {
      pubkey: deriveHookTaxDelegatePda(params.mint, params.cluster),
      isSigner: false,
      isWritable: false,
    },
  ];
}

/** Strip hook-executor program dupes; Meteora slice may include a 12th TLV slot. */
export function hookMetasForDirectPierronTransferHook(
  metas: TransferHookAccountMeta[],
  cluster?: SupportedCluster
): TransferHookAccountMeta[] {
  const hookExecutor = getPierronTransferHookProgramId(cluster);
  const filtered = metas.filter((m) => !m.pubkey.equals(hookExecutor));
  if (filtered.length <= DIRECT_TRANSFER_HOOK_REMAINING_COUNT) {
    return filtered;
  }
  return filtered.slice(0, DIRECT_TRANSFER_HOOK_REMAINING_COUNT);
}

/** Anchor `global:transfer_hook` discriminator (ledger only, collect_tax_cpi=false).
 * TARGET: does not credit `redistribution_accumulated` when tax>0 — PD
 * `collect_dex_redistribution_tax` (or `transfer_hook_settlement`) owns the ledger bump.
 */
const TRANSFER_HOOK_DISCRIMINATOR = Buffer.from([
  105, 37, 101, 197, 75, 251, 102, 26,
]);

export function buildRecordDexSwapLedgerIx(params: {
  mint: PublicKey;
  sourceToken: PublicKey;
  destinationToken: PublicKey;
  /** Meteora lb_pair on buy; user wallet on sell. */
  authority: PublicKey;
  amount: bigint;
  hookRemainingMetas: TransferHookAccountMeta[];
  cluster?: SupportedCluster;
  /** Consumed redistribution vouchers — tier fallback when trade book lags (mirrors assert). */
  consumedRedistributionVouchers?: PublicKey[];
}): TransactionInstruction {
  if (params.amount <= 0n) {
    throw new Error("dex ledger amount must be positive");
  }
  const programId = getPierronProgramId(params.cluster);
  const raw = allocU8(16);
  raw.set(TRANSFER_HOOK_DISCRIMINATOR, 0);
  writeU64LE(raw, params.amount, 8);
  const data = toBuffer(raw);

  const voucherKeys = params.consumedRedistributionVouchers ?? [];

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.sourceToken, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: params.destinationToken, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: false, isWritable: false },
      ...(
        params.hookRemainingMetas.length > 0
          ? hookMetasForDirectPierronTransferHook(
              params.hookRemainingMetas,
              params.cluster
            )
          : []
      ).map((m) => ({
        pubkey: m.pubkey,
        isSigner: m.isSigner,
        isWritable: m.isWritable,
      })),
      ...voucherKeys.map((pubkey) => ({
        pubkey,
        isSigner: false,
        isWritable: false,
      })),
    ],
    data,
  });
}

export async function buildMeteoraDexSwapLedgerIx(params: {
  connection: Connection;
  lbPair: PublicKey;
  pierronMint: PublicKey;
  pierronReserve: PublicKey;
  userTokenIn: PublicKey;
  userTokenOut: PublicKey;
  user: PublicKey;
  sellingPierron: boolean;
  ledgerAmount: bigint;
  hookRemainingMetas: TransferHookAccountMeta[];
  cluster?: SupportedCluster;
  consumedRedistributionVouchers?: PublicKey[];
}): Promise<TransactionInstruction> {
  const dexRefs = await readTradeConfigDexRefs(params.connection, params.cluster);
  const ledgerPoolVault = dexRefs.meteoraTokenVault;
  const sourceToken = params.sellingPierron
    ? params.userTokenIn
    : ledgerPoolVault;
  const destinationToken = params.sellingPierron
    ? ledgerPoolVault
    : params.userTokenOut;
  const authority = params.sellingPierron ? params.user : dexRefs.meteoraPool;

  return buildRecordDexSwapLedgerIx({
    mint: params.pierronMint,
    sourceToken,
    destinationToken,
    authority,
    amount: params.ledgerAmount,
    hookRemainingMetas: params.hookRemainingMetas,
    cluster: params.cluster,
    consumedRedistributionVouchers: params.consumedRedistributionVouchers,
  });
}
