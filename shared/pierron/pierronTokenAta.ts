import { Connection, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

/** ATA z obsługą portfeli off-curve (Phantom / MWA). */
export function getTokenAtaForOwner(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgramId: PublicKey
): PublicKey {
  const allowOwnerOffCurve = !PublicKey.isOnCurve(owner.toBytes());
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve,
    tokenProgramId
  );
}

/** @deprecated alias */
export function getPierronTokenAtaForOwner(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgramId: PublicKey = TOKEN_2022_PROGRAM_ID
): PublicKey {
  return getTokenAtaForOwner(mint, owner, tokenProgramId);
}

export async function getOrCreateAtaIxForOwner(params: {
  connection: Connection;
  mint: PublicKey;
  owner: PublicKey;
  payer?: PublicKey;
  tokenProgramId: PublicKey;
  /** When true, always emit CreateIdempotent (even if ATA exists). Default: only if missing. */
  forceCreateIx?: boolean;
}): Promise<{ ataPubKey: PublicKey; ix?: TransactionInstruction }> {
  const payer = params.payer ?? params.owner;
  const ataPubKey = getTokenAtaForOwner(
    params.mint,
    params.owner,
    params.tokenProgramId
  );
  if (!params.forceCreateIx) {
    const info = await params.connection.getAccountInfo(ataPubKey, "processed");
    if (info) {
      return { ataPubKey };
    }
  }
  // Idempotent create — safe if a concurrent tx already opened the ATA.
  return {
    ataPubKey,
    ix: createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ataPubKey,
      params.owner,
      params.mint,
      params.tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
  };
}
