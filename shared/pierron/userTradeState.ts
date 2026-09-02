import { PublicKey } from "@solana/web3.js";
import { getPierronTokenAtaForOwner } from "./pierronTokenAta.ts";

/** PDA `["user-trade", token_account]` — zgodne z extra-account-metas (AccountKey 0/2). */
export function deriveUserTradeStatePda(
  tokenAccount: PublicKey,
  programId: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-trade"), tokenAccount.toBuffer()],
    programId
  );
  return pda;
}

export function deriveUserTradeStatePdaForOwner(params: {
  owner: PublicKey;
  mint: PublicKey;
  tokenProgramId: PublicKey;
  programId: PublicKey;
  allowOwnerOffCurve?: boolean;
}): PublicKey {
  void params.allowOwnerOffCurve;
  const ata = getPierronTokenAtaForOwner(
    params.mint,
    params.owner,
    params.tokenProgramId
  );
  return deriveUserTradeStatePda(ata, params.programId);
}
