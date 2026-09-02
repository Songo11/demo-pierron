/**
 * Deploy price-floor SOL into single-sided Meteora DLMM liquidity (active bin).
 */
import { BN } from "@coral-xyz/anchor";
import { StrategyType } from "@meteora-ag/dlmm";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  type Connection,
  type Transaction,
} from "@solana/web3.js";
import type { SupportedCluster } from "../core/programIds.ts";
import { createPierronDlmmPool } from "./createPierronDlmmPool.ts";
import {
  buildPierronDlmmAddLiquidityPlan,
  buildPierronDlmmAddLiquidityTx,
} from "./buildPierronDlmmAddLiquidityTx.ts";

export type PriceFloorPositionRecord = {
  pool: string;
  positionPubkey: string;
  positionSecretKey: number[];
};

export type BuildPriceFloorSolLiquidityParams = {
  connection: Connection;
  pool: PublicKey;
  user: PublicKey;
  solLamports: bigint;
  cluster?: SupportedCluster;
  position?: PriceFloorPositionRecord;
  slippage?: number;
};

export type PriceFloorSolLiquidityPlan = {
  position: Keypair;
  positionRecord: PriceFloorPositionRecord;
  /** Empty when reusing an existing position with ATAs already created. */
  setupTransaction: Transaction | null;
  liquidityTransaction: Transaction;
};

export async function buildPriceFloorSolLiquidityPlan(
  params: BuildPriceFloorSolLiquidityParams
): Promise<PriceFloorSolLiquidityPlan> {
  if (params.solLamports <= 0n) {
    throw new Error("price floor SOL amount must be positive");
  }
  if (params.solLamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("price floor SOL amount exceeds safe limit");
  }

  const dlmmPool = await createPierronDlmmPool(params.connection, params.pool, {
    cluster: params.cluster,
  });
  const active = await dlmmPool.getActiveBin();
  const tokenX = dlmmPool.tokenX.publicKey.toBase58();
  const tokenY = dlmmPool.tokenY.publicKey.toBase58();
  const solLamports = new BN(params.solLamports.toString());

  let totalXAmount: BN;
  let totalYAmount: BN;
  let strategy: {
    minBinId: number;
    maxBinId: number;
    strategyType: typeof StrategyType.Spot;
    singleSidedX?: boolean;
  };

  if (tokenX === NATIVE_MINT.toBase58()) {
    totalXAmount = solLamports;
    totalYAmount = new BN(0);
    strategy = {
      minBinId: active.binId,
      maxBinId: active.binId,
      strategyType: StrategyType.Spot,
      singleSidedX: true,
    };
  } else if (tokenY === NATIVE_MINT.toBase58()) {
    totalXAmount = new BN(0);
    totalYAmount = solLamports;
    strategy = {
      minBinId: active.binId,
      maxBinId: active.binId,
      strategyType: StrategyType.Spot,
    };
  } else {
    throw new Error("price floor pool must include wrapped SOL");
  }

  const reuse =
    params.position != null && params.position.pool === params.pool.toBase58();
  const position = reuse
    ? Keypair.fromSecretKey(Uint8Array.from(params.position!.positionSecretKey))
    : Keypair.generate();
  if (reuse && position.publicKey.toBase58() !== params.position!.positionPubkey) {
    throw new Error("price floor position secret does not match pubkey");
  }

  const liqParams = {
    position,
    skipPositionInit: reuse,
    totalXAmount,
    totalYAmount,
    strategy,
    user: params.user,
    slippage: params.slippage ?? 1,
    cluster: params.cluster,
  };

  if (reuse) {
    const liquidityTransaction = await buildPierronDlmmAddLiquidityTx(
      dlmmPool,
      liqParams
    );
    return {
      position,
      positionRecord: params.position!,
      setupTransaction: null,
      liquidityTransaction,
    };
  }

  const plan = await buildPierronDlmmAddLiquidityPlan(dlmmPool, liqParams);
  const positionRecord: PriceFloorPositionRecord = {
    pool: params.pool.toBase58(),
    positionPubkey: position.publicKey.toBase58(),
    positionSecretKey: Array.from(position.secretKey),
  };
  return {
    position,
    positionRecord,
    setupTransaction: plan.setupTransaction,
    liquidityTransaction: plan.liquidityTransaction,
  };
}
