import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { getPierronProgramId } from "../core/programIds.ts";
import {
  allocU8,
  toBuffer,
  writeU64LE,
} from "../solana/browserSafeBuffer.ts";
import {
  userLimitFromClaimCount,
  epochTurnoverLimitFromTotalClaims,
} from "./claimTiers.ts";
import {
  fetchTradeBookParticipantForDexPolicy,
  fetchTradeBookParticipantForDexPolicyFast,
} from "./tradeBookParticipant.ts";
import { grossFromNet } from "./tradeTax.ts";
import { MIN_FIRST_BUY_AMOUNT, SECONDS_PER_EPOCH } from "./tokenomicsConstants.ts";
import { isFirstProtocolSwap } from "./swapPolicyLimits.ts";
import {
  swapCooldownRemainingSeconds,
  epochTransactionCooldownSeconds,
} from "./epochTransactionCooldown.ts";
import type { Connection } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { countConsumedRedistributionClaimsForUser } from "./redistributionClaimEligibility.ts";
import { swapPolicyRedistributionClaimCount, swapPolicyClaimsForDexLimit } from "./swapPolicyClaims.ts";

import idl from "../idl/pierron.json" with { type: "json" };

/** Discriminator from shared IDL — avoids stale hardcoded bytes after rebuild. */
function assertDexSwapPolicyDiscriminator(): Buffer {
  const ix = idl.instructions.find(
    (i: { name: string; discriminator: number[] }) =>
      i.name === "assert_dex_swap_policy"
  );
  if (!ix) {
    throw new Error("IDL missing assert_dex_swap_policy — run anchor build");
  }
  return Buffer.from(ix.discriminator);
}

/** Mirrors on-chain `protocol_epoch_from_time`. */
export function protocolEpochFromTime(
  genesisEpochTimestamp: number,
  unixTimestamp: number
): number {
  if (genesisEpochTimestamp <= 0) return 0;
  const elapsed = Math.max(0, unixTimestamp - genesisEpochTimestamp);
  return Math.floor(elapsed / SECONDS_PER_EPOCH);
}

/**
 * Sell volume for cap checks — mirrors `assert_dex_swap_policy`, which rolls over
 * accounting before validating when wall-clock epoch is ahead of on-chain epoch.
 */
export function effectiveEpochSellVolume(
  accounting: Record<string, unknown>,
  nowSec = Math.floor(Date.now() / 1000)
): bigint {
  const stored = BigInt(
    (accounting.epochSellVolumeCurrent ??
      accounting.epoch_sell_volume_current ??
      0) as string | number | bigint
  );
  const genesis = Number(
    accounting.genesisEpochTimestamp ?? accounting.genesis_epoch_timestamp ?? 0
  );
  const onChainEpoch = Number(
    accounting.currentEpoch ?? accounting.current_epoch ?? 0
  );
  const wallEpoch = protocolEpochFromTime(genesis, nowSec);
  if (onChainEpoch < wallEpoch) return 0n;
  return stored;
}

export function buildAssertDexSwapPolicyIx(params: {
  user: PublicKey;
  mint: PublicKey;
  amount: bigint;
  isSell: boolean;
  cluster?: SupportedCluster;
  /** Consumed redistribution voucher PDAs — on-chain tier fallback when trade book lags. */
  consumedRedistributionVouchers?: PublicKey[];
}): TransactionInstruction {
  if (params.amount <= 0n) {
    throw new Error("assert_dex_swap_policy amount must be positive");
  }
  const programId = getPierronProgramId(params.cluster);
  const [tradeBook] = PublicKey.findProgramAddressSync(
    [Buffer.from("trade-book"), params.mint.toBuffer()],
    programId
  );
  const [accounting] = PublicKey.findProgramAddressSync(
    [Buffer.from("accounting")],
    programId
  );
  const [tradeConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("trade-config")],
    programId
  );

  const raw = allocU8(17);
  raw.set(assertDexSwapPolicyDiscriminator(), 0);
  writeU64LE(raw, params.amount, 8);
  raw[16] = params.isSell ? 1 : 0;
  const data = toBuffer(raw);

  const voucherKeys = params.consumedRedistributionVouchers ?? [];

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.user, isSigner: true, isWritable: false },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: tradeBook, isSigner: false, isWritable: false },
      { pubkey: accounting, isSigner: false, isWritable: true },
      { pubkey: tradeConfig, isSigner: false, isWritable: false },
      ...voucherKeys.map((pubkey) => ({
        pubkey,
        isSigner: false,
        isWritable: false,
      })),
    ],
    data,
  });
}

/** Client-side mirror before building Meteora swap (same gross/net semantics as on-chain). */
export async function assertDexSwapAmountWithinPolicy(params: {
  connection: Connection;
  program: Program;
  mint: PublicKey;
  owner: PublicKey;
  programId: PublicKey;
  amountBaseUnits: bigint;
  isSell: boolean;
  /** Skip slow voucher scan when caller already resolved tier PDAs. */
  consumedRedistributionVouchers?: PublicKey[];
  /** Skip trade-book refetch when caller already loaded cooldown/prep state. */
  participant?: Awaited<
    ReturnType<typeof fetchTradeBookParticipantForDexPolicyFast>
  > | null;
  /** Skip accounting refetch when caller already loaded tax/epoch caps. */
  accounting?: Record<string, unknown> | null;
}): Promise<void> {
  const accountingPda = PublicKey.findProgramAddressSync(
    [Buffer.from("accounting")],
    params.programId
  )[0];
  const accounting: any =
    params.accounting ??
    (await params.program.account.accountingState.fetch(accountingPda));
  const globalClaims = Number(
    accounting.totalRedistributionClaims ??
      accounting.total_redistribution_claims ??
      0
  );
  let participant =
    params.participant !== undefined
      ? params.participant
      : await fetchTradeBookParticipantForDexPolicyFast({
          mint: params.mint,
          owner: params.owner,
          programId: params.programId,
          connection: params.connection,
        });
  // Fast raw scan can miss the row if Buffer BigInt helpers are incomplete —
  // fall back to Anchor + raw so cooldown is not skipped (Custom:6030 on-chain).
  if (params.participant === undefined && participant == null) {
    participant = await fetchTradeBookParticipantForDexPolicy({
      program: params.program,
      mint: params.mint,
      owner: params.owner,
      programId: params.programId,
      connection: params.connection,
    }).catch(() => null);
  }
  const tradeBookClaims = participant?.redistributionClaimCount ?? 0;
  const consumedVoucherCount =
    params.consumedRedistributionVouchers != null
      ? params.consumedRedistributionVouchers.length
      : await countConsumedRedistributionClaimsForUser({
          connection: params.connection,
          programId: params.programId,
          user: params.owner,
        });
  const pid = params.programId.toBase58();
  const userClaims = swapPolicyClaimsForDexLimit(
    tradeBookClaims,
    consumedVoucherCount,
    pid
  );

  const taxRemainder = BigInt(
    accounting.taxRemainder ?? accounting.tax_remainder ?? 0
  );
  const gross = params.isSell
    ? grossFromNet(params.amountBaseUnits, taxRemainder).gross
    : params.amountBaseUnits;

  const userLimit = userLimitFromClaimCount(userClaims, pid);
  if (isFirstProtocolSwap(participant) && gross < MIN_FIRST_BUY_AMOUNT) {
    throw new Error(
      `FIRST_SWAP_TOO_SMALL:min=${MIN_FIRST_BUY_AMOUNT} gross=${gross}`
    );
  }
  if (gross > userLimit) {
    throw new Error(
      `SWAP_LIMIT_EXCEEDED:user=${userLimit} gross=${gross} claims=${userClaims}`
    );
  }

  const lastActivity = Number(participant?.lastActivity ?? 0);
  const cooldownRemaining = swapCooldownRemainingSeconds({
    lastActivityUnix: lastActivity,
    redistributionClaimCount: userClaims,
    programId: pid,
    // Prefer failing in UI over simulate Custom:6030 when wall clock leads cluster.
    skewSecs: 2,
  });
  if (cooldownRemaining > 0) {
    const cooldownSec = epochTransactionCooldownSeconds(userClaims, pid);
    throw new Error(
      `TRANSACTION_COOLDOWN_ACTIVE:remaining=${cooldownRemaining} tier=${cooldownSec}s claims=${userClaims}`
    );
  }

  if (params.isSell) {
    const epochCap = epochTurnoverLimitFromTotalClaims(globalClaims, pid);
    const epochSell = effectiveEpochSellVolume(accounting);
    if (epochSell + gross > epochCap) {
      const onChainEpoch = Number(
        accounting.currentEpoch ?? accounting.current_epoch ?? 0
      );
      const genesis = Number(
        accounting.genesisEpochTimestamp ?? accounting.genesis_epoch_timestamp ?? 0
      );
      const wallEpoch = protocolEpochFromTime(genesis);
      throw new Error(
        `EPOCH_SELL_CAP_EXCEEDED:cap=${epochCap} current=${epochSell} gross=${gross} on_chain_epoch=${onChainEpoch} wall_epoch=${wallEpoch}`
      );
    }
  }
}
