/**
 * PD-signed 1% tax collection into redistribution vault (post Meteora UI swap).
 */
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  PublicKey,
  type Connection,
  type Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import pierronIdl from "../idl/pierron.json";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronProgramId } from "../core/programIds.ts";
import { deriveHookTaxDelegatePda } from "./hookTaxDelegate.ts";
import { buildPierronHookMetasForTokenTransfer } from "../meteora/pierronDlmmTransferHook.ts";
import { deriveTradeConfigPda } from "./initUserTradeAccounts.ts";
import { deriveTradeBookPda } from "./resolveTransferHookAccounts.ts";

const DEVNET_REDISTRIBUTION_VAULT = new PublicKey(
  "D1ajrrwmWqtKA65aTkYcZicd6ncAhtPWQDWRTYfURzhx"
);

function deriveAccountingPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("accounting")], programId)[0];
}

/** Plain wallet object — `anchor.Wallet` breaks on React Native (undefined → prototype error). */
const READONLY_WALLET = {
  publicKey: PublicKey.default,
  signTransaction: async (tx: Transaction) => tx,
  signAllTransactions: async (txs: Transaction[]) => txs,
};

/** Read-only Anchor program for building swap/tax instructions without a wallet. */
export function getReadonlyPierronProgram(
  connection: Connection,
  cluster?: SupportedCluster
): Program {
  const programId = getPierronProgramId(cluster);
  const provider = new AnchorProvider(connection, READONLY_WALLET as never, {
    commitment: "confirmed",
  });
  const idl = {
    ...(pierronIdl as object),
    address: programId.toBase58(),
  } as Idl;
  return new Program(idl, provider);
}

export async function buildCollectDexRedistributionTaxIx(params: {
  connection: Connection;
  program?: Program;
  payer: PublicKey;
  fromToken: PublicKey;
  mint: PublicKey;
  amount: bigint;
  /** Token account owner (user wallet). Avoids RPC getAccount during tx prepare. */
  sourceOwner?: PublicKey;
  cluster?: SupportedCluster;
  redistributionVault?: PublicKey;
}): Promise<TransactionInstruction> {
  const cluster = params.cluster ?? "devnet";
  const programId = getPierronProgramId(cluster);
  const program =
    params.program ?? getReadonlyPierronProgram(params.connection, cluster);

  const collectMethod = (program.methods as Record<string, unknown>)
    .collectDexRedistributionTax;
  if (typeof collectMethod !== "function") {
    throw new Error(
      "IDL brakuje collect_dex_redistribution_tax — skopiuj pierron_idl.json do shared/idl/pierron.json"
    );
  }

  const redistributionVault =
    params.redistributionVault ??
    (cluster === "devnet"
      ? DEVNET_REDISTRIBUTION_VAULT
      : await readRedistributionVault(params.connection, cluster));

  const delegate = deriveHookTaxDelegatePda(params.mint, cluster);
  const sourceOwner = params.sourceOwner ?? params.payer;
  const [redistributionAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("redistribution-authority")],
    programId
  );

  let hookMetas = await buildPierronHookMetasForTokenTransfer({
    connection: params.connection,
    mint: params.mint,
    sourceToken: params.fromToken,
    destinationToken: redistributionVault,
    sourceOwner,
    destinationOwner: redistributionAuthority,
    sellTaxSigner: delegate,
    cluster,
  });
  hookMetas = hookMetas.map((m) => ({ ...m, isSigner: false }));

  const tradeConfig = deriveTradeConfigPda(programId);
  const accountingState = deriveAccountingPda(programId);
  const tradeBook = deriveTradeBookPda(params.mint, programId, cluster);
  const remaining = hookMetas.map((m) => ({
    pubkey: m.pubkey,
    isSigner: m.isSigner,
    isWritable: m.isWritable,
  }));
  if (!remaining.some((m) => m.pubkey.equals(tradeBook))) {
    remaining.push({
      pubkey: tradeBook,
      isSigner: false,
      isWritable: true,
    });
  }

  return await program.methods
    .collectDexRedistributionTax(new BN(params.amount.toString()))
    .accountsPartial({
      payer: params.payer,
      tradeConfig,
      accountingState,
      fromToken: params.fromToken,
      mint: params.mint,
      redistributionVault,
      hookTaxDelegate: delegate,
      pierronProgram: programId,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .remainingAccounts(remaining)
    .instruction();
}

async function readRedistributionVault(
  connection: Connection,
  cluster: SupportedCluster
): Promise<PublicKey> {
  const programId = getPierronProgramId(cluster);
  const tradeConfig = deriveTradeConfigPda(programId);
  const acc = await connection.getAccountInfo(tradeConfig);
  if (!acc?.data || acc.data.length < 8 + 1 + 32 + 32 + 32) {
    throw new Error("trade_config not found");
  }
  return new PublicKey(
    acc.data.subarray(8 + 1 + 32 + 32, 8 + 1 + 32 + 32 + 32)
  );
}

/** User-signed fallback (same tx shape as dApp post-buy tax). */
export { buildSellRedistributionTaxTransferIxWithHook } from "./sellRedistributionTaxPretransfer.ts";
