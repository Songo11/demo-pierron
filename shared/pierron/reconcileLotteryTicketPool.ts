import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { deriveTradeBookPda } from "./resolveTransferHookAccounts.ts";
import type { SupportedCluster } from "../core/programIds.ts";

/** Anchor `reconcile_lottery_ticket_pool` discriminator. */
const RECONCILE_LOTTERY_TICKET_POOL_DISCRIMINATOR = Buffer.from([
  4, 204, 146, 78, 167, 141, 157, 242,
]);

export function buildReconcileLotteryTicketPoolIx(params: {
  programId: PublicKey;
  mint: PublicKey;
  requester: PublicKey;
  cluster?: SupportedCluster;
}): TransactionInstruction {
  const [accountingState] = PublicKey.findProgramAddressSync(
    [Buffer.from("accounting")],
    params.programId
  );
  const tradeBook = deriveTradeBookPda(
    params.mint,
    params.programId,
    params.cluster
  );
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: accountingState, isSigner: false, isWritable: true },
      { pubkey: tradeBook, isSigner: false, isWritable: true },
      { pubkey: params.requester, isSigner: true, isWritable: false },
    ],
    data: RECONCILE_LOTTERY_TICKET_POOL_DISCRIMINATOR,
  });
}

/** True when on-chain global pool lags participant ticket range after a swap. */
export function lotteryGlobalPoolNeedsReconcile(params: {
  onChainTotalTickets: number;
  ticketStart: number;
  ticketCount: number;
  tradeBookCycleTotal: number;
  activeTicketCycleStart: number;
  participantLotteryCycleStart: number;
}): boolean {
  if (params.ticketCount <= 0) {
    return (
      params.tradeBookCycleTotal > 0 &&
      params.onChainTotalTickets < params.tradeBookCycleTotal
    );
  }
  const rangeEnd = params.ticketStart + params.ticketCount;
  if (params.onChainTotalTickets < rangeEnd) {
    return true;
  }
  if (
    params.participantLotteryCycleStart === params.activeTicketCycleStart &&
    params.tradeBookCycleTotal > params.onChainTotalTickets
  ) {
    return true;
  }
  return false;
}
