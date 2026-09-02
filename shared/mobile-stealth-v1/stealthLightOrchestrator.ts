import { Connection, PublicKey } from '@solana/web3.js';

import {
  buildClaimLightBundle,
  buildSendLightBundle,
  type ClaimLightBundle,
  type SendLightBundle,
} from '../light/lightClient.ts';
import { resolveStealthOutputTreeIndex } from '../light/lightCanonicalConfig.ts';
import {
  sendClaimStealthFromLightBundle,
  sendSendStealthFromLightBundle,
  simulateClaimStealthFromLightBundle,
  simulateSendStealthFromLightBundle,
} from './stealthLightReadyRunner.ts';
import type {
  RunInstructionResult,
  StealthWalletExecutor,
} from './stealthTransactionRunner.ts';
import type { RemainingAccountInput } from './stealthTransactionInstructionBuilder.ts';
import type { SupportedCluster } from '../core/programIds.ts';

export type SimulateSendStealthWithLightParams = {
  sender: PublicKey;
  mint: PublicKey;
  senderToken: PublicKey;
  stealthToken: PublicKey;
  tokenProgram: PublicKey;
  amount: bigint;
  outputTreeIndex?: number;
  remainingAccounts?: RemainingAccountInput[];
  stealthAddress: PublicKey;
  lightAddressSeed?: Uint8Array;
  cluster?: SupportedCluster;
};

export type SendSendStealthWithLightParams = {
  sender: PublicKey;
  mint: PublicKey;
  senderToken: PublicKey;
  stealthToken: PublicKey;
  tokenProgram: PublicKey;
  amount: bigint;
  outputTreeIndex?: number;
  remainingAccounts?: RemainingAccountInput[];
  stealthAddress: PublicKey;
  lightAddressSeed?: Uint8Array;
  recipientSpendKey?: Uint8Array;
  recipientViewKey?: Uint8Array;
  intendedClaimer?: PublicKey | string;
  recipientBundle?: unknown;
  cluster?: SupportedCluster;
};

export type SimulateClaimStealthWithLightParams = {
  claimer: PublicKey;
  mint: PublicKey;
  stealthToken: PublicKey;
  claimerToken: PublicKey;
  tokenProgram: PublicKey;
  remainingAccounts?: RemainingAccountInput[];
  metaOwner?: PublicKey;
  stealthAddress: PublicKey;
  cluster?: SupportedCluster;
};

export type SendClaimStealthWithLightParams = {
  claimer: PublicKey;
  mint: PublicKey;
  stealthToken: PublicKey;
  claimerToken: PublicKey;
  tokenProgram: PublicKey;
  remainingAccounts?: RemainingAccountInput[];
  metaOwner?: PublicKey;
  stealthAddress: PublicKey;
  cluster?: SupportedCluster;
};

function formatBlockingReasons(blockingReasons?: string[]): string {
  if (!blockingReasons || blockingReasons.length === 0) {
    return 'unknown reason';
  }

  return blockingReasons.join(' | ');
}

function assertSendLightBundleReady(bundle: SendLightBundle): void {
  if (bundle.status !== 'ready') {
    throw new Error(
      `Send Light bundle is not ready: ${formatBlockingReasons(bundle.blockingReasons)}`
    );
  }
}

function assertClaimLightBundleReady(bundle: ClaimLightBundle): void {
  if (bundle.status !== 'ready') {
    throw new Error(
      `Claim Light bundle is not ready: ${formatBlockingReasons(bundle.blockingReasons)}`
    );
  }
}

async function fetchSendLightBundle(params: {
  sender: PublicKey;
  stealthAddress: PublicKey;
  lightAddressSeed?: Uint8Array;
  cluster?: SupportedCluster;
}): Promise<SendLightBundle> {
  return await buildSendLightBundle({
    sender: params.sender,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    cluster: params.cluster,
  });
}

async function fetchClaimLightBundle(params: {
  claimer: PublicKey;
  metaOwner?: PublicKey;
  stealthAddress: PublicKey;
  cluster?: SupportedCluster;
}): Promise<ClaimLightBundle> {
  return await buildClaimLightBundle({
    claimer: params.claimer,
    metaOwner: params.metaOwner,
    stealthAddress: params.stealthAddress,
    cluster: params.cluster,
  });
}

export async function simulateSendStealthWithLight(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: SimulateSendStealthWithLightParams
): Promise<RunInstructionResult> {
  const bundle = await fetchSendLightBundle({
    sender: params.sender,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    cluster: params.cluster,
  });

  assertSendLightBundleReady(bundle);

  return simulateSendStealthFromLightBundle(connection, wallet, {
    sender: params.sender,
    mint: params.mint,
    senderToken: params.senderToken,
    stealthToken: params.stealthToken,
    tokenProgram: params.tokenProgram,
    amount: params.amount,
    outputTreeIndex: resolveStealthOutputTreeIndex({
      cluster: params.cluster,
      explicit: params.outputTreeIndex,
      flow: 'send',
    }),
    remainingAccounts: params.remainingAccounts,
    bundle,
  });
}

export async function sendSendStealthWithLight(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: SendSendStealthWithLightParams
): Promise<RunInstructionResult> {
  const bundle = await fetchSendLightBundle({
    sender: params.sender,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    cluster: params.cluster,
  });

  assertSendLightBundleReady(bundle);

  return sendSendStealthFromLightBundle(connection, wallet, {
    sender: params.sender,
    mint: params.mint,
    senderToken: params.senderToken,
    stealthToken: params.stealthToken,
    tokenProgram: params.tokenProgram,
    amount: params.amount,
    outputTreeIndex: resolveStealthOutputTreeIndex({
      cluster: params.cluster,
      explicit: params.outputTreeIndex,
      flow: 'send',
    }),
    remainingAccounts: params.remainingAccounts,
    bundle,
    recipientSpendKey: params.recipientSpendKey,
    recipientViewKey: params.recipientViewKey,
    intendedClaimer: params.intendedClaimer,
    recipientBundle: params.recipientBundle,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    cluster: params.cluster,
  });
}

export async function simulateClaimStealthWithLight(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: SimulateClaimStealthWithLightParams
): Promise<RunInstructionResult> {
  const bundle = await fetchClaimLightBundle({
    claimer: params.claimer,
    metaOwner: params.metaOwner,
    stealthAddress: params.stealthAddress,
    cluster: params.cluster,
  });

  assertClaimLightBundleReady(bundle);

  return simulateClaimStealthFromLightBundle(connection, wallet, {
    claimer: params.claimer,
    mint: params.mint,
    stealthToken: params.stealthToken,
    claimerToken: params.claimerToken,
    tokenProgram: params.tokenProgram,
    remainingAccounts: params.remainingAccounts,
    bundle,
  });
}

export async function sendClaimStealthWithLight(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: SendClaimStealthWithLightParams
): Promise<RunInstructionResult> {
  const bundle = await fetchClaimLightBundle({
    claimer: params.claimer,
    metaOwner: params.metaOwner,
    stealthAddress: params.stealthAddress,
    cluster: params.cluster,
  });

  assertClaimLightBundleReady(bundle);

  return sendClaimStealthFromLightBundle(connection, wallet, {
    claimer: params.claimer,
    mint: params.mint,
    stealthToken: params.stealthToken,
    claimerToken: params.claimerToken,
    tokenProgram: params.tokenProgram,
    remainingAccounts: params.remainingAccounts,
    bundle,
  });
}
