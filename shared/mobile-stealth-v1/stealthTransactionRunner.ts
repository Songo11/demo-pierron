import * as web3 from '@solana/web3.js';
import type {
  SimulatedTransactionResponse,
  TransactionSignature,
} from '@solana/web3.js';
import type { SupportedCluster } from '../core/programIds.ts';
import {
  buildStealthVersionedTransaction,
  serializeStealthTransaction,
  type StealthSignableTransaction,
} from './stealthVersionedTransaction.ts';
import { confirmSignatureViaHttp } from '../solana/confirmSignatureHttp.ts';

import {
  createClaimStealthInstruction,
  createRegisterStealthInstruction,
  createSendStealthInstruction,
  type BuiltStealthInstructionResult,
  type ClaimStealthInstructionFactoryParams,
  type RegisterStealthInstructionFactoryParams,
  type SendStealthInstructionFactoryParams,
} from './stealthTransactionFactory.ts';
import type { LightSerializationKind } from '../light/lightClient.ts';

const { Connection, PublicKey, TransactionInstruction } = web3;

export type StealthWalletExecutor = {
  payer: InstanceType<typeof PublicKey>;
  signTransaction: (tx: StealthSignableTransaction) => Promise<StealthSignableTransaction>;
  sendRawTransaction?: (rawTx: Buffer) => Promise<TransactionSignature>;
};

export type RunInstructionResult = {
  ok: boolean;
  stage: 'build' | 'simulate' | 'send';
  signature?: string;
  simulation?: SimulatedTransactionResponse;
  instructionMeta: {
    keyCount: number;
    dataLength: number;
    buildable: boolean;
    executable: boolean;
    canonicalOnly: boolean;
    debugOnly: boolean;
    lightProvenanceKinds: LightSerializationKind[];
    summaryLines: string[];
  };
  error?: string;
  /** Adres płatności do powiadomienia odbiorcy (z Photon newAddressProof, jeśli ≠ prepare). */
  notificationStealthAddress?: string;
  /** Po claim: kwota z meta potwierdzonej transakcji (Token-2022 → ATA claimera). */
  claimTransferSummary?: string;
};

export type BuildOnlyResult = {
  instruction: InstanceType<typeof TransactionInstruction>;
  instructionMeta: {
    keyCount: number;
    dataLength: number;
    buildable: boolean;
    executable: boolean;
    canonicalOnly: boolean;
    debugOnly: boolean;
    lightProvenanceKinds: LightSerializationKind[];
    summaryLines: string[];
  };
};

type BuiltTxEnvelope = {
  tx: StealthSignableTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
};

function toBuildOnly(result: BuiltStealthInstructionResult): BuildOnlyResult {
  return {
    instruction: result.instruction,
    instructionMeta: {
      keyCount: result.instruction.keys.length,
      dataLength: result.instruction.data.length,
      buildable: result.buildable,
      executable: result.executable,
      canonicalOnly: result.canonicalOnly,
      debugOnly: result.debugOnly,
      lightProvenanceKinds: result.lightProvenanceKinds,
      summaryLines: result.summaryLines,
    },
  };
}

async function buildTx(params: {
  connection: InstanceType<typeof Connection>;
  payer: InstanceType<typeof PublicKey>;
  instruction: InstanceType<typeof TransactionInstruction>;
  followUpInstructions?: InstanceType<typeof TransactionInstruction>[];
  cluster?: SupportedCluster;
}): Promise<BuiltTxEnvelope> {
  const built = await buildStealthVersionedTransaction({
    connection: params.connection,
    payer: params.payer,
    instructions: [
      params.instruction,
      ...(params.followUpInstructions ?? []),
    ],
    cluster: params.cluster,
  });

  return {
    tx: built.tx,
    blockhash: built.blockhash,
    lastValidBlockHeight: built.lastValidBlockHeight,
  };
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function makeInstructionMeta(result: BuiltStealthInstructionResult) {
  return {
    keyCount: result.instruction.keys.length,
    dataLength: result.instruction.data.length,
    buildable: result.buildable,
    executable: result.executable,
    canonicalOnly: result.canonicalOnly,
    debugOnly: result.debugOnly,
    lightProvenanceKinds: result.lightProvenanceKinds,
    summaryLines: result.summaryLines,
  };
}

function emptyInstructionMeta() {
  return {
    keyCount: 0,
    dataLength: 0,
    buildable: false,
    executable: false,
    canonicalOnly: false,
    debugOnly: false,
    lightProvenanceKinds: [] as LightSerializationKind[],
    summaryLines: [],
  };
}

function requireBuildable(result: BuiltStealthInstructionResult, kind: string): void {
  if (!result.buildable) {
    throw new Error(
      `${kind} nie jest jeszcze buildable. Najpierw uzupełnij brakujące dane wymagane do zbudowania instrukcji.`
    );
  }
}

function hasInstructionPayload(result: BuiltStealthInstructionResult): boolean {
  return result.instruction.keys.length > 0 && result.instruction.data.length > 0;
}

function canForceRegisterOnchainExecution(
  result: BuiltStealthInstructionResult,
  kind: string
): boolean {
  return (
    kind === 'register_stealth' &&
    result.buildable === true &&
    result.debugOnly === false &&
    hasInstructionPayload(result)
  );
}

function requireExecutable(result: BuiltStealthInstructionResult, kind: string): void {
  if (result.executable) {
    return;
  }

  if (canForceRegisterOnchainExecution(result, kind)) {
    return;
  }

  const reasons: string[] = [];

  if (result.debugOnly) {
    reasons.push('instruction jest oznaczona jako debugOnly');
  }

  if (!hasInstructionPayload(result)) {
    reasons.push('instruction nie ma kompletnego payloadu');
  }

  throw new Error(
    [
      `${kind} nie jest jeszcze executable. To nadal draft/debug path, a nie real on-chain execution.`,
      reasons.length > 0 ? `Szczegóły: ${reasons.join(', ')}.` : undefined,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

async function simulateBuiltInstruction(params: {
  kind: 'register_stealth' | 'send_stealth' | 'claim_stealth';
  connection: InstanceType<typeof Connection>;
  wallet: StealthWalletExecutor;
  built: BuiltStealthInstructionResult;
}): Promise<RunInstructionResult> {
  try {
    requireBuildable(params.built, params.kind);

    const builtTx = await buildTx({
      connection: params.connection,
      payer: params.wallet.payer,
      instruction: params.built.instruction,
      followUpInstructions: params.built.followUpInstructions,
    });

    const signed = await params.wallet.signTransaction(builtTx.tx);
    const simulation = await params.connection.simulateTransaction(signed);

    return {
      ok: !simulation.value.err,
      stage: 'simulate',
      simulation: simulation.value,
      instructionMeta: makeInstructionMeta(params.built),
      error: simulation.value.err
        ? JSON.stringify(simulation.value.err)
        : !params.built.executable
          ? 'Symulacja została wykonana dla buildable draftu, ale instruction nie jest jeszcze executable.'
          : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      stage: 'simulate',
      instructionMeta: makeInstructionMeta(params.built),
      error: errMessage(err),
    };
  }
}

async function sendBuiltInstruction(params: {
  kind: 'register_stealth' | 'send_stealth' | 'claim_stealth';
  connection: InstanceType<typeof Connection>;
  wallet: StealthWalletExecutor;
  built: BuiltStealthInstructionResult;
}): Promise<RunInstructionResult> {
  let signature: string | undefined;

  try {
    requireBuildable(params.built, params.kind);
    requireExecutable(params.built, params.kind);

    const builtTx = await buildTx({
      connection: params.connection,
      payer: params.wallet.payer,
      instruction: params.built.instruction,
      followUpInstructions: params.built.followUpInstructions,
    });

    const signed = await params.wallet.signTransaction(builtTx.tx);
    const raw = serializeStealthTransaction(signed);

    signature = params.wallet.sendRawTransaction
      ? await params.wallet.sendRawTransaction(raw)
      : await params.connection.sendRawTransaction(raw, {
          skipPreflight: true,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });

    const confirmation = await confirmSignatureViaHttp(params.connection, signature, {
      timeoutMs: 45_000,
      gracePeriodMs: 15_000,
      minConfirmation: 'confirmed',
    });

    if (!confirmation.ok) {
      if ('timedOut' in confirmation && confirmation.timedOut) {
        return {
          ok: true,
          stage: 'send',
          signature,
          instructionMeta: makeInstructionMeta(params.built),
          error:
            'Transakcja wysłana; potwierdzenie sieci trwało zbyt długo. Sprawdź signature w explorerze.',
        };
      }
      return {
        ok: false,
        stage: 'send',
        signature,
        instructionMeta: makeInstructionMeta(params.built),
        error: JSON.stringify('err' in confirmation ? confirmation.err : 'confirm failed'),
      };
    }

    return {
      ok: true,
      stage: 'send',
      signature,
      instructionMeta: makeInstructionMeta(params.built),
    };
  } catch (err) {
    return {
      ok: false,
      stage: 'send',
      signature,
      instructionMeta: makeInstructionMeta(params.built),
      error: errMessage(err),
    };
  }
}

export async function buildRegisterStealthInstructionOnly(
  params: RegisterStealthInstructionFactoryParams
): Promise<BuildOnlyResult> {
  const built = await createRegisterStealthInstruction(params);
  return toBuildOnly(built);
}

export async function buildSendStealthInstructionOnly(
  params: SendStealthInstructionFactoryParams
): Promise<BuildOnlyResult> {
  const built = await createSendStealthInstruction(params);
  return toBuildOnly(built);
}

export async function buildClaimStealthInstructionOnly(
  params: ClaimStealthInstructionFactoryParams
): Promise<BuildOnlyResult> {
  const built = await createClaimStealthInstruction(params);
  return toBuildOnly(built);
}

export async function simulateRegisterStealth(
  connection: InstanceType<typeof Connection>,
  wallet: StealthWalletExecutor,
  params: RegisterStealthInstructionFactoryParams
): Promise<RunInstructionResult> {
  let built: BuiltStealthInstructionResult | null = null;

  try {
    built = await createRegisterStealthInstruction(params);

    return await simulateBuiltInstruction({
      kind: 'register_stealth',
      connection,
      wallet,
      built,
    });
  } catch (err) {
    return {
      ok: false,
      stage: built ? 'simulate' : 'build',
      instructionMeta: built ? makeInstructionMeta(built) : emptyInstructionMeta(),
      error: errMessage(err),
    };
  }
}

export async function simulateSendStealth(
  connection: InstanceType<typeof Connection>,
  wallet: StealthWalletExecutor,
  params: SendStealthInstructionFactoryParams
): Promise<RunInstructionResult> {
  let built: BuiltStealthInstructionResult | null = null;

  try {
    built = await createSendStealthInstruction(params);

    return await simulateBuiltInstruction({
      kind: 'send_stealth',
      connection,
      wallet,
      built,
    });
  } catch (err) {
    return {
      ok: false,
      stage: built ? 'simulate' : 'build',
      instructionMeta: built ? makeInstructionMeta(built) : emptyInstructionMeta(),
      error: errMessage(err),
    };
  }
}

export async function simulateClaimStealth(
  connection: InstanceType<typeof Connection>,
  wallet: StealthWalletExecutor,
  params: ClaimStealthInstructionFactoryParams
): Promise<RunInstructionResult> {
  let built: BuiltStealthInstructionResult | null = null;

  try {
    built = await createClaimStealthInstruction(params);

    return await simulateBuiltInstruction({
      kind: 'claim_stealth',
      connection,
      wallet,
      built,
    });
  } catch (err) {
    return {
      ok: false,
      stage: built ? 'simulate' : 'build',
      instructionMeta: built ? makeInstructionMeta(built) : emptyInstructionMeta(),
      error: errMessage(err),
    };
  }
}

export async function sendRegisterStealth(
  connection: InstanceType<typeof Connection>,
  wallet: StealthWalletExecutor,
  params: RegisterStealthInstructionFactoryParams
): Promise<RunInstructionResult> {
  let built: BuiltStealthInstructionResult | null = null;

  try {
    built = await createRegisterStealthInstruction(params);

    return await sendBuiltInstruction({
      kind: 'register_stealth',
      connection,
      wallet,
      built,
    });
  } catch (err) {
    return {
      ok: false,
      stage: built ? 'send' : 'build',
      instructionMeta: built ? makeInstructionMeta(built) : emptyInstructionMeta(),
      error: errMessage(err),
    };
  }
}

export async function sendSendStealth(
  connection: InstanceType<typeof Connection>,
  wallet: StealthWalletExecutor,
  params: SendStealthInstructionFactoryParams
): Promise<RunInstructionResult> {
  let built: BuiltStealthInstructionResult | null = null;

  try {
    built = await createSendStealthInstruction(params);

    return await sendBuiltInstruction({
      kind: 'send_stealth',
      connection,
      wallet,
      built,
    });
  } catch (err) {
    return {
      ok: false,
      stage: built ? 'send' : 'build',
      instructionMeta: built ? makeInstructionMeta(built) : emptyInstructionMeta(),
      error: errMessage(err),
    };
  }
}

export async function sendClaimStealth(
  connection: InstanceType<typeof Connection>,
  wallet: StealthWalletExecutor,
  params: ClaimStealthInstructionFactoryParams
): Promise<RunInstructionResult> {
  let built: BuiltStealthInstructionResult | null = null;

  try {
    built = await createClaimStealthInstruction(params);

    return await sendBuiltInstruction({
      kind: 'claim_stealth',
      connection,
      wallet,
      built,
    });
  } catch (err) {
    return {
      ok: false,
      stage: built ? 'send' : 'build',
      instructionMeta: built ? makeInstructionMeta(built) : emptyInstructionMeta(),
      error: errMessage(err),
    };
  }
}
