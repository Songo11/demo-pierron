import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  getMintLen,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Connection,
} from "@solana/web3.js";
import { deriveHookTaxDelegatePda } from "./hookTaxDelegate.ts";
import type { SupportedCluster } from "../core/programIds.ts";
import { TOKEN_DECIMALS } from "./tokenomicsConstants.ts";

/**
 * Token-2022 mint with PermanentDelegate (hook-tax-delegate) + TransferHook (Pierron).
 * Extension order: PermanentDelegate before TransferHook before InitializeMint.
 */
export async function createPierronMint2022WithHook(params: {
  connection: Connection;
  payer: Keypair;
  hookProgramId: PublicKey;
  cluster?: SupportedCluster;
}): Promise<PublicKey> {
  const mintKeypair = Keypair.generate();
  const extensions = [ExtensionType.PermanentDelegate, ExtensionType.TransferHook];
  const mintLen = getMintLen(extensions);
  const lamports = await params.connection.getMinimumBalanceForRentExemption(mintLen);
  const hookTaxDelegate = deriveHookTaxDelegatePda(
    mintKeypair.publicKey,
    params.cluster
  );

  await sendAndConfirmTransaction(
    params.connection,
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: params.payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializePermanentDelegateInstruction(
        mintKeypair.publicKey,
        hookTaxDelegate,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeTransferHookInstruction(
        mintKeypair.publicKey,
        params.payer.publicKey,
        params.hookProgramId,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        TOKEN_DECIMALS,
        params.payer.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      )
    ),
    [params.payer, mintKeypair],
    { skipPreflight: false }
  );

  console.log(
    `[mint] ${mintKeypair.publicKey.toBase58()} (PermanentDelegate + TransferHook, delegate=${hookTaxDelegate.toBase58()})`
  );
  return mintKeypair.publicKey;
}
