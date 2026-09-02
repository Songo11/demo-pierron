import {
  createApproveCheckedInstruction,
  getAccount,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import { PublicKey, type Connection, type TransactionInstruction } from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronProgramId } from "../core/programIds.ts";

const HOOK_TAX_DELEGATE_SEED = Buffer.from("hook-tax-delegate");
const MAX_DELEGATE_AMOUNT = 2n ** 64n - 1n;

export function deriveHookTaxDelegatePda(
  mint: PublicKey,
  cluster?: SupportedCluster
): PublicKey {
  const programId = getPierronProgramId(cluster);
  const [pda] = PublicKey.findProgramAddressSync(
    [HOOK_TAX_DELEGATE_SEED, mint.toBuffer()],
    programId
  );
  return pda;
}

/** One-time (per ATA) approve so the hook can CPI 1% tax without TLV signer slots. */
export async function buildEnsureHookTaxDelegateIx(params: {
  connection: Connection;
  owner: PublicKey;
  tokenAccount: PublicKey;
  mint: PublicKey;
  cluster?: SupportedCluster;
}): Promise<TransactionInstruction | null> {
  const delegate = deriveHookTaxDelegatePda(params.mint, params.cluster);
  const [mintInfo, accOrMissing] = await Promise.all([
    getMint(params.connection, params.mint, "processed", TOKEN_2022_PROGRAM_ID),
    getAccount(
      params.connection,
      params.tokenAccount,
      "processed",
      TOKEN_2022_PROGRAM_ID
    ).catch((e) => {
      if (e instanceof TokenAccountNotFoundError) return null;
      throw e;
    }),
  ]);

  if (accOrMissing?.delegate?.equals(delegate)) {
    return null;
  }

  return createApproveCheckedInstruction(
    params.tokenAccount,
    params.mint,
    delegate,
    params.owner,
    MAX_DELEGATE_AMOUNT,
    mintInfo.decimals,
    [],
    TOKEN_2022_PROGRAM_ID
  );
}
