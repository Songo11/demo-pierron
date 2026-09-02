import {
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  type AccountMeta,
  type Connection,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { deriveTradeBookPda } from "./resolveTransferHookAccounts.ts";
import { deriveTradeConfigPda } from "./initUserTradeAccounts.ts";
import { deriveExtraAccountMetaStatePda, deriveVenueAllowlistPda } from "./lotteryPdas.ts";
import { deriveHookTaxDelegatePda } from "./hookTaxDelegate.ts";
import type { SupportedCluster } from "../core/programIds.ts";
import {
  getPierronProgramId,
  getPierronSettlementProgramId,
  getPierronTransferHookProgramId,
} from "../core/programIds.ts";

/**
 * Remaining accounts for settlement TransferChecked + transfer hook.
 * Order mirrors `transfer_hook_remaining_accounts` in pierron-settlement
 * (and live `addExtraAccountMetasForExecute` resolution on devnet).
 *
 * Do NOT call `@solana/spl-token` `addExtraAccountMetasForExecute` in the browser —
 * it uses `Buffer.writeBigUInt64LE`, broken under Next/Turbopack Buffer polyfills.
 */
export function buildRedistributionSettlementHookRemainingAccounts(params: {
  tradeConfig: PublicKey;
  accountingState: PublicKey;
  programId: PublicKey;
  venueAllowlist: PublicKey;
  tradeBook: PublicKey;
  redistributionVault: PublicKey;
  extraAccountMetaList: PublicKey;
  hookTaxDelegate: PublicKey;
  transferHookProgram: PublicKey;
}): AccountMeta[] {
  return [
    { pubkey: params.extraAccountMetaList, isSigner: false, isWritable: false },
    { pubkey: params.tradeConfig, isSigner: false, isWritable: true },
    { pubkey: params.accountingState, isSigner: false, isWritable: true },
    { pubkey: params.programId, isSigner: false, isWritable: false },
    { pubkey: params.venueAllowlist, isSigner: false, isWritable: true },
    { pubkey: params.tradeBook, isSigner: false, isWritable: true },
    { pubkey: params.tradeBook, isSigner: false, isWritable: true },
    // ExtraAccountMeta resolution marks vault non-writable in the execute slice.
    { pubkey: params.redistributionVault, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: params.hookTaxDelegate, isSigner: false, isWritable: false },
    { pubkey: params.transferHookProgram, isSigner: false, isWritable: false },
    { pubkey: params.extraAccountMetaList, isSigner: false, isWritable: false },
  ];
}

function i64ToLeBuffer(value: BN): Buffer {
  // BN.toArrayLike works without writeBigUInt64LE (browser-safe).
  return value.toArrayLike(Buffer, "le", 8);
}

export function deriveAccountingStatePda(programId?: PublicKey, cluster?: SupportedCluster): PublicKey {
  const pid = programId ?? getPierronProgramId(cluster);
  return PublicKey.findProgramAddressSync([Buffer.from("accounting")], pid)[0];
}

export function deriveRedistributionAuthorityPda(
  programId?: PublicKey,
  cluster?: SupportedCluster
): PublicKey {
  const pid = programId ?? getPierronProgramId(cluster);
  return PublicKey.findProgramAddressSync([Buffer.from("redistribution-authority")], pid)[0];
}

export function deriveLotteryAuthorityPda(
  programId?: PublicKey,
  cluster?: SupportedCluster
): PublicKey {
  const pid = programId ?? getPierronProgramId(cluster);
  return PublicKey.findProgramAddressSync([Buffer.from("lottery-authority")], pid)[0];
}

export function deriveSettlementAuthorityPda(
  settlementProgramId?: PublicKey,
  cluster?: SupportedCluster
): PublicKey {
  const pid = settlementProgramId ?? getPierronSettlementProgramId(cluster);
  return PublicKey.findProgramAddressSync([Buffer.from("settlement-authority")], pid)[0];
}

export function derivePendingRedistributionClaimPda(params: {
  programId: PublicKey;
  user: PublicKey;
  redistributionCycleStartEpoch: BN | number | bigint;
}): PublicKey {
  const cycleStart =
    params.redistributionCycleStartEpoch instanceof BN
      ? params.redistributionCycleStartEpoch
      : new BN(params.redistributionCycleStartEpoch.toString());
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pending-redistribution-claim"),
      params.user.toBuffer(),
      i64ToLeBuffer(cycleStart),
    ],
    params.programId
  )[0];
}

/** Remaining accounts for `settle_redistribution_claim` Token-2022 transfer (same pattern as lottery). */
export async function resolveRedistributionSettlementTransferHookRemaining(params: {
  connection: Connection;
  mint: PublicKey;
  redistributionVault: PublicKey;
  userToken: PublicKey;
  settlementAuthority: PublicKey;
  cluster?: SupportedCluster;
  accounts: ReturnType<typeof resolveRedistributionClaimAccounts>;
}): Promise<AccountMeta[]> {
  void params.connection;
  void params.mint;
  void params.userToken;
  void params.settlementAuthority;
  return buildRedistributionSettlementHookRemainingAccounts({
    tradeConfig: params.accounts.tradeConfig,
    accountingState: params.accounts.accountingState,
    programId: params.accounts.programId,
    venueAllowlist: params.accounts.venueAllowlist,
    tradeBook: params.accounts.tradeBook,
    redistributionVault: params.redistributionVault,
    extraAccountMetaList: params.accounts.extraAccountMetaState,
    hookTaxDelegate: params.accounts.hookTaxDelegate,
    transferHookProgram: getPierronTransferHookProgramId(params.cluster),
  });
}

export function resolveRedistributionClaimAccounts(params: {
  mint: PublicKey;
  user: PublicKey;
  programId?: PublicKey;
  settlementProgramId?: PublicKey;
  cluster?: SupportedCluster;
}) {
  const programId = params.programId ?? getPierronProgramId(params.cluster);
  const settlementProgramId =
    params.settlementProgramId ?? getPierronSettlementProgramId(params.cluster);

  return {
    programId,
    settlementProgramId,
    tradeConfig: deriveTradeConfigPda(programId),
    tradeBook: deriveTradeBookPda(params.mint, programId, params.cluster),
    accountingState: deriveAccountingStatePda(programId),
    redistributionAuthority: deriveRedistributionAuthorityPda(programId),
    lotteryAuthority: deriveLotteryAuthorityPda(programId),
    settlementAuthority: deriveSettlementAuthorityPda(settlementProgramId),
    extraAccountMetaState: deriveExtraAccountMetaStatePda(
      params.mint,
      programId,
      params.cluster
    ),
    venueAllowlist: deriveVenueAllowlistPda(params.mint, programId, params.cluster),
    hookTaxDelegate: deriveHookTaxDelegatePda(params.mint, params.cluster),
  };
}
