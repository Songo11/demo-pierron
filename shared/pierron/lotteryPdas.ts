import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY, type AccountMeta, type Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  deriveAccountingStatePda,
  deriveLotteryAuthorityPda,
  deriveSettlementAuthorityPda,
} from "./redistributionPdas.ts";
import { deriveTradeBookPda } from "./resolveTransferHookAccounts.ts";
import { deriveTradeConfigPda } from "./initUserTradeAccounts.ts";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronProgramId, getPierronSettlementProgramId, getPierronTransferHookProgramId } from "../core/programIds.ts";
import { deriveHookTaxDelegatePda } from "./hookTaxDelegate.ts";

function i64ToLeBuffer(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  const asBig = typeof value === "bigint" ? value : BigInt(value);
  new DataView(buf.buffer, buf.byteOffset, 8).setBigInt64(0, asBig, true);
  return buf;
}

export function derivePendingLotteryPayoutPda(params: {
  programId: PublicKey;
  lotteryDrawEpoch: number | bigint;
}): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pending-lottery-payout"), i64ToLeBuffer(params.lotteryDrawEpoch)],
    params.programId
  )[0];
}

export function deriveExtraAccountMetaStatePda(
  mint: PublicKey,
  _programId?: PublicKey,
  cluster?: SupportedCluster
): PublicKey {
  const hookProgram = getPierronTransferHookProgramId(cluster);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    hookProgram
  )[0];
}

export function deriveVenueAllowlistPda(
  mint: PublicKey,
  programId?: PublicKey,
  cluster?: SupportedCluster
): PublicKey {
  const pid = programId ?? getPierronProgramId(cluster);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("venue-allowlist"), mint.toBuffer()],
    pid
  )[0];
}

export function deriveSettlementUserTradeStatePda(
  settlementAuthority: PublicKey,
  programId?: PublicKey,
  cluster?: SupportedCluster
): PublicKey {
  const pid = programId ?? getPierronProgramId(cluster);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user-trade"), settlementAuthority.toBuffer()],
    pid
  )[0];
}

export function resolveLotteryClaimAccounts(params: {
  mint: PublicKey;
  programId?: PublicKey;
  settlementProgramId?: PublicKey;
  cluster?: SupportedCluster;
}) {
  const programId = params.programId ?? getPierronProgramId(params.cluster);
  const settlementProgramId =
    params.settlementProgramId ?? getPierronSettlementProgramId(params.cluster);
  const settlementAuthority = deriveSettlementAuthorityPda(settlementProgramId);

  return {
    programId,
    settlementProgramId,
    tradeConfig: deriveTradeConfigPda(programId),
    tradeBook: deriveTradeBookPda(params.mint, programId, params.cluster),
    accountingState: deriveAccountingStatePda(programId),
    lotteryAuthority: deriveLotteryAuthorityPda(programId),
    settlementAuthority,
    settlementUserTradeState: deriveSettlementUserTradeStatePda(
      settlementAuthority,
      programId
    ),
    extraAccountMetaState: deriveExtraAccountMetaStatePda(
      params.mint,
      programId,
      params.cluster
    ),
    venueAllowlist: deriveVenueAllowlistPda(params.mint, programId, params.cluster),
    hookTaxDelegate: deriveHookTaxDelegatePda(params.mint, params.cluster),
  };
}

/** Remaining accounts for `settle_lottery_payout` Token-2022 transfer (same TLV order as redistribution). */
export async function resolveLotterySettlementTransferHookRemaining(params: {
  connection: Connection;
  mint: PublicKey;
  lotteryVault: PublicKey;
  winnerToken: PublicKey;
  settlementAuthority: PublicKey;
  redistributionVault: PublicKey;
  cluster?: SupportedCluster;
  accounts: ReturnType<typeof resolveLotteryClaimAccounts>;
}): Promise<AccountMeta[]> {
  // Avoid addExtraAccountMetasForExecute — Buffer.writeBigUInt64LE breaks in Next browser.
  void params.connection;
  void params.mint;
  void params.lotteryVault;
  void params.winnerToken;
  void params.settlementAuthority;
  const transferHookProgram = getPierronTransferHookProgramId(params.cluster);
  return [
    { pubkey: params.accounts.extraAccountMetaState, isSigner: false, isWritable: false },
    { pubkey: params.accounts.tradeConfig, isSigner: false, isWritable: true },
    { pubkey: params.accounts.accountingState, isSigner: false, isWritable: true },
    { pubkey: params.accounts.programId, isSigner: false, isWritable: false },
    { pubkey: params.accounts.venueAllowlist, isSigner: false, isWritable: true },
    { pubkey: params.accounts.tradeBook, isSigner: false, isWritable: true },
    { pubkey: params.accounts.tradeBook, isSigner: false, isWritable: true },
    { pubkey: params.redistributionVault, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: params.accounts.hookTaxDelegate, isSigner: false, isWritable: false },
    { pubkey: transferHookProgram, isSigner: false, isWritable: false },
    { pubkey: params.accounts.extraAccountMetaState, isSigner: false, isWritable: false },
  ];
}

/** @deprecated Use resolveLotterySettlementTransferHookRemaining — kept for tests. */
export function buildLotterySettlementHookRemainingAccounts(params: {
  programId: PublicKey;
  extraAccountMetaState: PublicKey;
  tradeConfig: PublicKey;
  accountingState: PublicKey;
  settlementUserTradeState: PublicKey;
}): AccountMeta[] {
  return [
    { pubkey: params.extraAccountMetaState, isSigner: false, isWritable: false },
    { pubkey: params.tradeConfig, isSigner: false, isWritable: true },
    { pubkey: params.accountingState, isSigner: false, isWritable: true },
    { pubkey: params.programId, isSigner: false, isWritable: false },
    { pubkey: params.settlementUserTradeState, isSigner: false, isWritable: true },
  ];
}
