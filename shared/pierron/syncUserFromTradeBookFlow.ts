import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type { PartialLightLocalRuntimeConfig } from "../light/lightLocalRuntime.ts";
import type { SupportedCluster } from "../core/programIds.ts";
import { deriveTradeBookPda } from "./resolveTransferHookAccounts.ts";
import { getPierronTokenAtaForOwner } from "./pierronTokenAta.ts";
import { buildPierronLightNewUserBundle } from "./pierronLightNewUserBundle.ts";
import {
  buildPierronUserLightClaimBundle,
  userHasPierronLightAccountsForWallet,
} from "./pierronUserLightBundle.ts";
import { buildSyncUserFromTradeBookInstruction } from "./pierronManualLightInstructions.ts";
import type { TradeBookParticipantSnapshot } from "./tradeBookParticipant.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** At least core + epoch compressed accounts visible in Photon for this wallet. */
export async function userHasPierronLightAccounts(params: {
  owner: PublicKey;
  pierronProgramId: PublicKey;
  runtime: PartialLightLocalRuntimeConfig;
}): Promise<boolean> {
  return userHasPierronLightAccountsForWallet(params);
}

/** After on-chain sync, Photon may lag — poll before building claim proof. */
export async function waitForPierronLightAccountsIndexed(params: {
  owner: PublicKey;
  pierronProgramId: PublicKey;
  runtime: PartialLightLocalRuntimeConfig;
  timeoutMs?: number;
  pollMs?: number;
  onProgress?: (elapsedMs: number) => void;
}): Promise<void> {
  const timeoutMs = params.timeoutMs ?? 90_000;
  const pollMs = params.pollMs ?? 2_500;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await userHasPierronLightAccounts(params)) {
      return;
    }
    params.onProgress?.(Date.now() - start);
    await sleep(pollMs);
  }

  throw new Error("PHOTON_INDEXING_TIMEOUT");
}

export type PreparedSyncUserLight = {
  transaction: Transaction;
  mode: "new" | "update";
};

export async function buildSyncUserFromTradeBookTransaction(params: {
  connection: Connection;
  cluster: SupportedCluster;
  pierronProgramId: PublicKey;
  mint: PublicKey;
  user: PublicKey;
  participant?: TradeBookParticipantSnapshot | null;
  lightRuntime: PartialLightLocalRuntimeConfig;
}): Promise<PreparedSyncUserLight> {
  const [accountingState] = PublicKey.findProgramAddressSync(
    [Buffer.from("accounting")],
    params.pierronProgramId
  );
  const tradeBook = deriveTradeBookPda(params.mint, params.pierronProgramId, params.cluster);
  const userToken = getPierronTokenAtaForOwner(
    params.mint,
    params.user,
    TOKEN_2022_PROGRAM_ID
  );

  const hasExisting = await userHasPierronLightAccounts({
    owner: params.user,
    pierronProgramId: params.pierronProgramId,
    runtime: params.lightRuntime,
  });

  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
  );

  if (hasExisting) {
    const bundle = await buildPierronUserLightClaimBundle({
      owner: params.user,
      pierronProgramId: params.pierronProgramId,
      participant: params.participant,
      runtime: params.lightRuntime,
    });

    tx.add(
      buildSyncUserFromTradeBookInstruction({
        programId: params.pierronProgramId,
        user: params.user,
        accountingState,
        tradeBook,
        userToken,
        proof: bundle.proofBytes,
        addressTreeInfo: {
          addressMerkleTreePubkeyIndex: 0,
          addressQueuePubkeyIndex: 0,
          rootIndex: 0,
        },
        outputTreeIndex: 0,
        userAccount: bundle.userAccount,
        lightParams: {
          // bundle.userCoreMeta is already formatCompressedAccountMetaForAnchor'd
          coreMeta: bundle.userCoreMeta as Record<string, unknown>,
          epochMeta: bundle.userEpochMeta as Record<string, unknown>,
          newCoreAddress: null,
          newEpochAddress: null,
        },
        remainingAccounts: bundle.lightRemainingAccounts,
      })
    );

    return { transaction: tx, mode: "update" };
  }

  const bundle = await buildPierronLightNewUserBundle({
    pierronProgramId: params.pierronProgramId,
    runtime: params.lightRuntime,
  });

  tx.add(
    buildSyncUserFromTradeBookInstruction({
      programId: params.pierronProgramId,
      user: params.user,
      accountingState,
      tradeBook,
      userToken,
      proof: bundle.proofBytes,
      addressTreeInfo: bundle.addressTreeInfo,
      outputTreeIndex: bundle.outputTreeIndex,
      userAccount: bundle.userAccount,
      lightParams: bundle.lightParams,
      remainingAccounts: bundle.lightRemainingAccounts,
    })
  );

  return { transaction: tx, mode: "new" };
}

/** Returns null when user already has Light accounts and no sync is needed. */
export async function prepareSyncUserLightIfNeeded(params: {
  connection: Connection;
  cluster: SupportedCluster;
  pierronProgramId: PublicKey;
  mint: PublicKey;
  user: PublicKey;
  participant?: TradeBookParticipantSnapshot | null;
  lightRuntime: PartialLightLocalRuntimeConfig;
}): Promise<PreparedSyncUserLight | null> {
  const hasExisting = await userHasPierronLightAccounts({
    owner: params.user,
    pierronProgramId: params.pierronProgramId,
    runtime: params.lightRuntime,
  });
  if (hasExisting) {
    return null;
  }
  return buildSyncUserFromTradeBookTransaction(params);
}
