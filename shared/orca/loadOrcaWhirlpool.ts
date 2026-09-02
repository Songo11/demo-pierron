/** @deprecated Apps use Meteora only — do not import from dapp/mobile. Ops scripts only. */
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  type WhirlpoolClient,
} from "@orca-so/whirlpools-sdk";
import type { AnchorProvider } from "@coral-xyz/anchor";
import type { Connection, PublicKey } from "@solana/web3.js";

export type OrcaWhirlpoolSession = {
  connection: Connection;
  ctx: WhirlpoolContext;
  client: WhirlpoolClient;
  whirlpool: PublicKey;
  /** Pierron mint in this pool. */
  pierronMint: PublicKey;
  /** WSOL or other quote mint. */
  quoteMint: PublicKey;
  /** Vault holding Pierron tokens for the pool. */
  pierronVault: PublicKey;
  /** Vault holding quote tokens. */
  quoteVault: PublicKey;
  pierronIsTokenA: boolean;
};

export async function loadOrcaWhirlpoolSession(params: {
  connection: Connection;
  wallet: AnchorProvider["wallet"];
  whirlpool: PublicKey;
  pierronMint: PublicKey;
}): Promise<OrcaWhirlpoolSession> {
  const ctx = WhirlpoolContext.from(params.connection, params.wallet);
  const client = buildWhirlpoolClient(ctx);
  const pool = await client.getPool(params.whirlpool);
  const data = pool.getData();

  const pierronIsTokenA = data.tokenMintA.equals(params.pierronMint);
  const pierronIsTokenB = data.tokenMintB.equals(params.pierronMint);
  if (!pierronIsTokenA && !pierronIsTokenB) {
    throw new Error(
      `Pierron mint ${params.pierronMint.toBase58()} not in whirlpool ${params.whirlpool.toBase58()}`
    );
  }

  return {
    connection: params.connection,
    ctx,
    client,
    whirlpool: params.whirlpool,
    pierronMint: params.pierronMint,
    quoteMint: pierronIsTokenA ? data.tokenMintB : data.tokenMintA,
    pierronVault: pierronIsTokenA ? data.tokenVaultA : data.tokenVaultB,
    quoteVault: pierronIsTokenA ? data.tokenVaultB : data.tokenVaultA,
    pierronIsTokenA,
  };
}
