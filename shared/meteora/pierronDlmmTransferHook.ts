import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  type Connection,
} from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronProgramId, getPierronTransferHookProgramId } from "../core/programIds.ts";
import { readTradeConfigDexRefs } from "../pierron/tradeConfigRefs.ts";
import { deriveHookTaxDelegatePda } from "../pierron/hookTaxDelegate.ts";
import { resolvePierronTransferHookAccounts } from "../mobile-stealth-v1/pierronTransferHookAccounts.ts";
import {
  resolveTransferHookMetasForTransfer,
  type TransferHookAccountMeta,
} from "../pierron/resolveTransferHookAccounts.ts";

export type { TransferHookAccountMeta };

/**
 * TLV z `addExtraAccountMetasForExecute` bywa w złej kolejności (extra PDA na końcu)
 * i z duplikatem programu. Meteora wymaga: extra_account_meta_state, potem 12 kont execute.
 */
export function normalizePierronHookMetasFromTlv(
  raw: TransferHookAccountMeta[],
  extraAccountMetaState: PublicKey,
  cluster?: SupportedCluster
): TransferHookAccountMeta[] {
  const programId = getPierronProgramId(cluster);
  const withoutTrailingProgramDup = raw.filter((m, idx) => {
    if (idx < 10) return true;
    return !m.pubkey.equals(programId);
  });

  let extra: TransferHookAccountMeta = {
    pubkey: extraAccountMetaState,
    isSigner: false,
    isWritable: false,
  };
  const body: TransferHookAccountMeta[] = [];
  for (const m of withoutTrailingProgramDup) {
    if (m.pubkey.equals(extraAccountMetaState)) {
      extra = m;
      continue;
    }
    const prev = body[body.length - 1];
    if (prev?.pubkey.equals(m.pubkey)) {
      body.push(m);
      continue;
    }
    const dupCount = body.filter((x) => x.pubkey.equals(m.pubkey)).length;
    if (dupCount > 0) {
      // Legacy TLV placeholders (SystemProgram) before hook-tax-delegate PDA migration.
      if (m.pubkey.equals(SystemProgram.programId) && dupCount < 2) {
        body.push(m);
      }
      continue;
    }
    body.push(m);
  }

  if (body.length > 0 && body[0].pubkey.equals(extraAccountMetaState)) {
    return body;
  }
  return [extra, ...body];
}

/**
 * On-chain TLV extras (`build_execute_extra_account_metas`) plus the transfer-hook
 * program id. Meteora `swap2` CPI uses Token-2022 `add_extra_accounts_for_execute_cpi`,
 * which returns `TransferHookError::IncorrectAccount` (2110272652) when the hook
 * program is missing from remaining accounts.
 */
export async function buildPierronTlvExecuteHookMetas(params: {
  connection: Connection;
  mint: PublicKey;
  cluster?: SupportedCluster;
}): Promise<TransferHookAccountMeta[]> {
  const acc = resolvePierronTransferHookAccounts({
    mint: params.mint,
    cluster: params.cluster,
  });
  const [tradeBook] = PublicKey.findProgramAddressSync(
    [Buffer.from("trade-book"), params.mint.toBuffer()],
    acc.pierronProgram
  );
  const redistributionVault = (
    await readTradeConfigDexRefs(params.connection, params.cluster)
  ).redistributionVault;

  return [
    { pubkey: acc.extraAccountMetaState, isSigner: false, isWritable: false },
    { pubkey: acc.tradeConfig, isSigner: false, isWritable: true },
    { pubkey: acc.accountingState, isSigner: false, isWritable: true },
    { pubkey: acc.pierronProgram, isSigner: false, isWritable: false },
    { pubkey: acc.venueAllowlist, isSigner: false, isWritable: true },
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
    { pubkey: acc.transferHookProgram, isSigner: false, isWritable: false },
  ];
}

/** Remaining accounts for Token-2022 `transfer_checked` → hook `Execute`. */
export async function buildPierronHookMetasForTokenTransfer(params: {
  connection: Connection;
  mint: PublicKey;
  sourceToken: PublicKey;
  destinationToken: PublicKey;
  sourceOwner: PublicKey;
  destinationOwner: PublicKey;
  sellTaxSigner?: PublicKey;
  cluster?: SupportedCluster;
}): Promise<TransferHookAccountMeta[]> {
  void params.sourceToken;
  void params.destinationToken;
  void params.sourceOwner;
  void params.destinationOwner;
  void params.sellTaxSigner;
  return buildPierronTlvExecuteHookMetas({
    connection: params.connection,
    mint: params.mint,
    cluster: params.cluster,
  });
}

/** Ręczna lista zgodna z TLV on-chain (bez placeholderów SystemProgram). */
export async function buildPierronHookMetasForPoolDeposit(params: {
  connection: Connection;
  mint: PublicKey;
  sourceToken: PublicKey;
  destinationToken: PublicKey;
  cluster?: SupportedCluster;
}): Promise<TransferHookAccountMeta[]> {
  void params.sourceToken;
  void params.destinationToken;
  return buildPierronTlvExecuteHookMetas({
    connection: params.connection,
    mint: params.mint,
    cluster: params.cluster,
  });
}

/** Append mint transfer-hook program if missing (Token-2022 Meteora CPI). */
export function appendPierronTransferHookProgramMeta(
  metas: TransferHookAccountMeta[],
  cluster?: SupportedCluster
): TransferHookAccountMeta[] {
  const hookProgram = getPierronTransferHookProgramId(cluster);
  if (metas.some((m) => m.pubkey.equals(hookProgram))) {
    return metas;
  }
  return [
    ...metas,
    { pubkey: hookProgram, isSigner: false, isWritable: false },
  ];
}

/** Writable mirrors for Execute `source_token` / `destination_token` (TLV slots 11–12). */
export function injectMeteoraExecuteMirrorMetas(
  metas: TransferHookAccountMeta[],
  sourceToken: PublicKey,
  destinationToken: PublicKey
): TransferHookAccountMeta[] {
  const out = [...metas];
  if (out.length > 11) {
    out[11] = { pubkey: sourceToken, isSigner: false, isWritable: true };
  }
  if (out.length > 12) {
    out[12] = { pubkey: destinationToken, isSigner: false, isWritable: true };
  }
  return out;
}

/** Writable mirror of hooked `source_token` at TLV slot 12 (sell) or slot 11 (buy pool). */
export function injectMeteoraSourceMirrorMeta(
  metas: TransferHookAccountMeta[],
  sourceToken: PublicKey,
  slot: number = HOOK_META_SOURCE_MIRROR_IDX
): TransferHookAccountMeta[] {
  const out = [...metas];
  if (out.length > slot) {
    out[slot] = { pubkey: sourceToken, isSigner: false, isWritable: true };
    return out;
  }
  let matched = false;
  const mapped = out.map((m) => {
    if (!m.pubkey.equals(sourceToken)) {
      return m;
    }
    matched = true;
    return { pubkey: sourceToken, isSigner: false, isWritable: true };
  });
  if (!matched) {
    mapped.push({ pubkey: sourceToken, isSigner: false, isWritable: true });
  }
  return mapped;
}

export function filterHookMetasForMeteoraAddLiquidity(
  metas: TransferHookAccountMeta[],
  params: { user: PublicKey; lbPair: PublicKey }
): TransferHookAccountMeta[] {
  const skip = new Set([params.user.toBase58(), params.lbPair.toBase58()]);
  return metas.filter((m) => !skip.has(m.pubkey.toBase58()));
}

/**
 * Indices in Meteora `transferHookY` slice (`sdk[i]` after `ix.keys.slice(4)`).
 * TLV has 11 body metas (+ validation at sdk[0]). Index 7 = static `meteora_token_vault` mirror.
 */
export const HOOK_META_METEORA_VAULT_MIRROR_IDX = 7;
export const HOOK_META_INSTRUCTIONS_SYSVAR_IDX = 9;
export const HOOK_META_HOOK_TAX_DELEGATE_IDX = 10;
/** Writable tax debit; TLV slot 7 for pool buys, client may overwrite on sells. */
export const HOOK_META_TAX_FROM_TOKEN_IDX = 7;
export const HOOK_META_METEORA_VAULT_IDX = 11;
/** Writable mirror of Execute `source_token` (TLV slot 12). */
export const HOOK_META_SOURCE_MIRROR_IDX = 12;
/** Legacy manual 14-key list (`buildPierronHookMetasForTokenTransfer`). */
export const HOOK_META_DESTINATION_OWNER_IDX = 9;
export const HOOK_META_SOURCE_OWNER_IDX = 11;

/** Prepend validation PDA so Token-2022 Execute account #4 matches `TransferHook`. */
export function prependExtraAccountMetaForMeteoraSwap(
  metas: TransferHookAccountMeta[],
  extraAccountMetaState: PublicKey
): TransferHookAccountMeta[] {
  if (metas.length > 0 && metas[0].pubkey.equals(extraAccountMetaState)) {
    return metas;
  }
  return [
    {
      pubkey: extraAccountMetaState,
      isSigner: false,
      isWritable: false,
    },
    ...metas,
  ];
}

/**
 * Meteora ma już `sender` / `lb_pair` w accountsPartial — duplikat jako signer+writable → AccountBorrowFailed.
 * Zostaw te pubkey w hook remaining (długość slices), ale tylko readonly.
 * Tax CPI slots (destination_owner / source_owner) keep `isSigner: true` for the swapper wallet.
 */
export function demoteMeteoraConflictingHookMetas(
  metas: TransferHookAccountMeta[],
  params: { user: PublicKey; lbPair: PublicKey }
): TransferHookAccountMeta[] {
  return metas.map((m) => {
    if (!m.pubkey.equals(params.user) && !m.pubkey.equals(params.lbPair)) {
      return m;
    }
    // Meteora `swap2` already includes `user` / `lb_pair` as signers — duplicating
    // signer privilege in the hook slice fails the whole transaction. Tax CPI uses
    // `hook-tax-delegate` when TLV owner slots are not signers.
    return { pubkey: m.pubkey, isSigner: false, isWritable: false };
  });
}

/** Execute remaining: 11 TLV extras + transfer-hook program. */
export function trimPierronHookMetasToExecuteCount(
  metas: TransferHookAccountMeta[]
): TransferHookAccountMeta[] {
  const executeCount = 12;
  if (metas.length <= executeCount) {
    return metas;
  }
  return metas.slice(0, executeCount);
}

/** Pad hook slice to 1 validation + 11 TLV body accounts (12 total). */
export function padPierronHookMetasToTlvLength(
  metas: TransferHookAccountMeta[]
): TransferHookAccountMeta[] {
  const need = HOOK_META_HOOK_TAX_DELEGATE_IDX + 1;
  const out = [...metas];
  while (out.length < need) {
    out.push({
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    });
  }
  return out;
}

/** Writable mirror of the ATA debited by tax CPI (Execute ATAs are readonly in the hook). */
export function injectMeteoraTaxFromTokenMeta(
  metas: TransferHookAccountMeta[],
  tokenAccount: PublicKey
): TransferHookAccountMeta[] {
  if (metas.length <= HOOK_META_TAX_FROM_TOKEN_IDX) {
    return metas;
  }
  const out = [...metas];
  out[HOOK_META_TAX_FROM_TOKEN_IDX] = {
    pubkey: tokenAccount,
    isSigner: false,
    isWritable: true,
  };
  return out;
}

/** Force swapper wallet + signer on the tax CPI account slot (after demote). */
export function injectMeteoraTaxSignerMeta(
  metas: TransferHookAccountMeta[],
  trader: PublicKey,
  side: "buy" | "sell"
): TransferHookAccountMeta[] {
  const idx =
    side === "buy" ? HOOK_META_DESTINATION_OWNER_IDX : HOOK_META_SOURCE_OWNER_IDX;
  if (metas.length <= idx) {
    return metas;
  }
  const out = [...metas];
  out[idx] = { pubkey: trader, isSigner: true, isWritable: false };
  return out;
}

export async function resolvePierronDlmmTransferHookMetasForTransfer(params: {
  connection: Connection;
  mint: PublicKey;
  sourceToken: PublicKey;
  destinationToken: PublicKey;
  owner: PublicKey;
  cluster?: SupportedCluster;
}): Promise<TransferHookAccountMeta[]> {
  return resolveTransferHookMetasForTransfer({
    connection: params.connection,
    mint: params.mint,
    source: params.sourceToken,
    destination: params.destinationToken,
    owner: params.owner,
    cluster: params.cluster,
  });
}

/**
 * Manual hook remaining accounts for Meteora swap2 (avoids broken TLV signer flags).
 */
export async function resolveMeteoraSwapHookMetas(params: {
  connection: Connection;
  lbPair: PublicKey;
  pierronMint: PublicKey;
  pierronReserve: PublicKey;
  userTokenIn: PublicKey;
  userTokenOut: PublicKey;
  user: PublicKey;
  sellingPierron: boolean;
  cluster?: SupportedCluster;
}): Promise<TransferHookAccountMeta[]> {
  let metas = await buildPierronTlvExecuteHookMetas({
    connection: params.connection,
    mint: params.pierronMint,
    cluster: params.cluster,
  });
  void params.pierronReserve;
  void params.userTokenIn;
  void params.userTokenOut;
  void params.sellingPierron;

  metas = demoteMeteoraConflictingHookMetas(metas, {
    user: params.user,
    lbPair: params.lbPair,
  });
  metas = trimPierronHookMetasToExecuteCount(metas);
  return appendPierronTransferHookProgramMeta(metas, params.cluster);
}

export async function patchDlmmPierronTransferHookMetas(
  dlmmPool: {
    pubkey: PublicKey;
    tokenY: {
      publicKey: PublicKey;
      transferHookAccountMetas: TransferHookAccountMeta[];
    };
    lbPair: { reserveY: PublicKey };
    program: { provider: { connection: Connection } };
  },
  params: {
    mint: PublicKey;
    owner: PublicKey;
    cluster?: SupportedCluster;
  }
): Promise<void> {
  if (params.mint.toBase58() !== dlmmPool.tokenY.publicKey.toBase58()) {
    return;
  }
  const userAta = getAssociatedTokenAddressSync(
    params.mint,
    params.owner,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const acc = resolvePierronTransferHookAccounts({
    mint: params.mint,
    userTokenAccount: userAta,
    cluster: params.cluster,
  });
  const raw = await resolveTransferHookMetasForTransfer({
    connection: dlmmPool.program.provider.connection,
    mint: params.mint,
    source: userAta,
    destination: dlmmPool.lbPair.reserveY,
    owner: params.owner,
    cluster: params.cluster,
  });
  let metas = normalizePierronHookMetasFromTlv(
    raw,
    acc.extraAccountMetaState,
    params.cluster
  );
  metas = filterHookMetasForMeteoraAddLiquidity(metas, {
    user: params.owner,
    lbPair: dlmmPool.pubkey,
  });
  dlmmPool.tokenY.transferHookAccountMetas = injectMeteoraSourceMirrorMeta(
    metas,
    userAta
  );
}
