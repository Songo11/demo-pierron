import { PublicKey } from "@solana/web3.js";
import { deriveTradeBookPda } from "./resolveTransferHookAccounts.ts";
import { getPierronProgramId, type SupportedCluster } from "../core/programIds.ts";

export function deriveTradeConfigPda(
  programId?: PublicKey,
  cluster?: SupportedCluster
): PublicKey {
  const pid = programId ?? getPierronProgramId(cluster);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("trade-config")],
    pid
  );
  return pda;
}

/** Konta wymagane przez Anchor przy `initialize_user_trade_state` (RN nie rozwiąże tradeBook sam). */
export function resolveInitializeUserTradeAccounts(params: {
  mint: PublicKey;
  programId?: PublicKey;
  cluster?: SupportedCluster;
}) {
  const programId = params.programId ?? getPierronProgramId(params.cluster);
  return {
    tradeConfig: deriveTradeConfigPda(programId),
    tradeBook: deriveTradeBookPda(params.mint, programId),
  };
}
