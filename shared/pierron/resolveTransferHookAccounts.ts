import {
  TOKEN_2022_PROGRAM_ID,
  getExtraAccountMetaAddress,
  getExtraAccountMetas,
  resolveExtraAccountMeta,
} from "@solana/spl-token";
import {
  PublicKey,
  TransactionInstruction,
  type AccountMeta,
  type Connection,
} from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import {
  getPierronProgramId,
  getPierronTransferHookProgramId,
} from "../core/programIds.ts";
import { allocU8, toBuffer, writeU64LE } from "../solana/browserSafeBuffer.ts";
import { createTransferCheckedInstructionBrowserSafe } from "../solana/browserSafeTransferChecked.ts";

export type TransferHookAccountMeta = {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
};

const HOOK_META_CACHE_TTL_MS = 120_000;
const hookMetaCache = new Map<
  string,
  { metas: TransferHookAccountMeta[]; expiresAt: number }
>();

function hookMetaCacheKey(params: {
  mint: PublicKey;
  source: PublicKey;
  destination: PublicKey;
  owner: PublicKey;
  cluster?: SupportedCluster;
}): string {
  return [
    params.mint.toBase58(),
    params.source.toBase58(),
    params.destination.toBase58(),
    params.owner.toBase58(),
    params.cluster ?? "default",
  ].join(":");
}

/** PDA `["trade-book", mint]`. */
export function deriveTradeBookPda(
  mint: PublicKey,
  programId?: PublicKey,
  cluster?: SupportedCluster
): PublicKey {
  const hookProgram = programId ?? getPierronProgramId(cluster);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("trade-book"), mint.toBuffer()],
    hookProgram
  );
  return pda;
}

/** Browser-safe Execute ix (spl-token uses writeBigUInt64LE). */
function createExecuteInstructionBrowserSafe(
  programId: PublicKey,
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  validateStatePubkey: PublicKey,
  amount: bigint
): TransactionInstruction {
  const keys: AccountMeta[] = [source, mint, destination, owner, validateStatePubkey].map(
    (pubkey) => ({
      pubkey,
      isSigner: false,
      isWritable: false,
    })
  );
  const raw = allocU8(16);
  raw.set([105, 37, 101, 197, 75, 251, 102, 26], 0);
  writeU64LE(raw, amount, 8);
  return new TransactionInstruction({
    keys,
    programId,
    data: toBuffer(raw),
  });
}

function deEscalateAccountMeta(
  accountMeta: AccountMeta,
  accountMetas: AccountMeta[]
): AccountMeta {
  const maybeHighestPrivileges = accountMetas.find((meta) =>
    meta.pubkey.equals(accountMeta.pubkey)
  );
  if (maybeHighestPrivileges) {
    const isSigner = maybeHighestPrivileges.isSigner || accountMeta.isSigner;
    const isWritable = maybeHighestPrivileges.isWritable || accountMeta.isWritable;
    if (!isSigner && isSigner !== accountMeta.isSigner) {
      accountMeta.isSigner = false;
    }
    if (!isWritable && isWritable !== accountMeta.isWritable) {
      accountMeta.isWritable = false;
    }
  }
  return accountMeta;
}

async function addExtraAccountMetasForExecuteBrowserSafe(
  connection: Connection,
  instruction: TransactionInstruction,
  programId: PublicKey,
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: number | bigint,
  commitment?: "confirmed" | "processed" | "finalized"
): Promise<void> {
  const validateStatePubkey = getExtraAccountMetaAddress(mint, programId);
  const validateStateAccount = await connection.getAccountInfo(
    validateStatePubkey,
    commitment
  );
  if (validateStateAccount == null) {
    return;
  }
  const validateStateData = getExtraAccountMetas(validateStateAccount);

  if (
    ![source, mint, destination, owner].every((key) =>
      instruction.keys.some((meta) => meta.pubkey.equals(key))
    )
  ) {
    throw new Error("Missing required account in instruction");
  }

  const executeInstruction = createExecuteInstructionBrowserSafe(
    programId,
    source,
    mint,
    destination,
    owner,
    validateStatePubkey,
    BigInt(amount)
  );

  for (const extraAccountMeta of validateStateData) {
    executeInstruction.keys.push(
      deEscalateAccountMeta(
        await resolveExtraAccountMeta(
          connection,
          extraAccountMeta,
          executeInstruction.keys,
          executeInstruction.data,
          executeInstruction.programId
        ),
        executeInstruction.keys
      )
    );
  }

  instruction.keys.push(...executeInstruction.keys.slice(5));
  instruction.keys.push({ pubkey: programId, isSigner: false, isWritable: false });
  instruction.keys.push({
    pubkey: validateStatePubkey,
    isSigner: false,
    isWritable: false,
  });
}

/**
 * Resolves transfer-hook extra accounts from the mint TLV.
 * Use for Meteora DLMM and any Token-2022 transfer.
 */
export async function resolveTransferHookMetasForTransfer(params: {
  connection: Connection;
  mint: PublicKey;
  source: PublicKey;
  destination: PublicKey;
  owner: PublicKey;
  hookProgramId?: PublicKey;
  amount?: bigint;
  cluster?: SupportedCluster;
}): Promise<TransferHookAccountMeta[]> {
  const cacheKey = hookMetaCacheKey(params);
  const cached = hookMetaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.metas;
  }

  const hookProgram =
    params.hookProgramId ?? getPierronTransferHookProgramId(params.cluster);

  const decimals =
    (await params.connection.getAccountInfo(params.mint, "processed"))?.data[44] ??
    6;

  const ix = createTransferCheckedInstructionBrowserSafe(
    params.source,
    params.mint,
    params.destination,
    params.owner,
    params.amount ?? 1n,
    decimals,
    [],
    TOKEN_2022_PROGRAM_ID
  );

  await addExtraAccountMetasForExecuteBrowserSafe(
    params.connection,
    ix,
    hookProgram,
    params.source,
    params.mint,
    params.destination,
    params.owner,
    params.amount ?? 0n,
    "processed"
  );

  // Index 4 = extra_account_meta_list; 5+ = TLV extras (matches Meteora `slice(4)`).
  const metas = ix.keys.slice(4).map((k) => ({
    pubkey: k.pubkey,
    isSigner: k.isSigner,
    isWritable: k.isWritable,
  }));
  hookMetaCache.set(cacheKey, {
    metas,
    expiresAt: Date.now() + HOOK_META_CACHE_TTL_MS,
  });
  return metas;
}
