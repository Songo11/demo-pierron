import {
  Connection,
  PublicKey,
  type Transaction,
  type VersionedTransaction,
} from '@solana/web3.js';

import { inferClusterFromRpcUrl, type SupportedCluster } from '../core/programIds.ts';
import { confirmSignatureViaHttp } from '../solana/confirmSignatureHttp.ts';
import {
  isRateLimitRpcError,
  isRpcBackendExhaustedError,
  PUBLIC_CLUSTER_RPC,
} from '../solana/rpcEndpoint.ts';
import type { AppCluster } from '../core/config.ts';
import type {
  ClaimLightBundle,
  RegisterLightBundle,
  SendLightBundle,
} from '../light/lightClient.ts';
import {
  LIGHT_CANONICAL_EXTERNAL_INDEX,
} from '../light/lightClient.ts';
import {
  REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
  REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
} from '../light/registerCanonicalContract.ts';
import {
  repairRegisterLightBundleNewAddress,
  repairSendLightBundleNewPaymentAddress,
} from '../light/registerNewAddressPacked.ts';
import {
  createClaimStealthInstructionFromLightBundle,
  createRegisterStealthInstructionFromLightBundle,
  createSendStealthInstructionFromLightBundle,
  type CreateClaimStealthInstructionFromLightBundleParams,
  type CreateRegisterStealthInstructionFromLightBundleParams,
  type CreateSendStealthInstructionFromLightBundleParams,
} from './stealthLightReadyFactory.ts';
import type { RemainingAccountInput } from './stealthTransactionInstructionBuilder.ts';
import type {
  RunInstructionResult,
  StealthWalletExecutor,
} from './stealthTransactionRunner.ts';

type SimulateLightReadyRegisterParams =
  CreateRegisterStealthInstructionFromLightBundleParams;
type SimulateLightReadySendParams = CreateSendStealthInstructionFromLightBundleParams;
type SimulateLightReadyClaimParams = CreateClaimStealthInstructionFromLightBundleParams;

type BuiltInstructionResult =
  | Awaited<ReturnType<typeof createRegisterStealthInstructionFromLightBundle>>
  | Awaited<ReturnType<typeof createSendStealthInstructionFromLightBundle>>
  | Awaited<ReturnType<typeof createClaimStealthInstructionFromLightBundle>>;

type RoleAwareRemainingAccount = RemainingAccountInput & {
  role?: string;
};

import {
  buildStealthVersionedTransaction,
  serializeStealthTransaction,
} from './stealthVersionedTransaction.ts';

type RemainingAccountLike =
  | RoleAwareRemainingAccount
  | {
      pubkey: PublicKey;
      isSigner: boolean;
      isWritable: boolean;
      role?: string;
    };

function isVerboseRegisterRunnerDebugEnabled(): boolean {
  const raw = process?.env?.PIERRON_REGISTER_RUNNER_DEBUG?.trim()?.toLowerCase() ?? '';
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function extractRpcLogs(err: unknown): string[] {
  const seen = new Set<unknown>();
  const queue: unknown[] = [err];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      if (current.every((item) => typeof item === 'string')) {
        return current as string[];
      }
      for (const item of current) queue.push(item);
      continue;
    }
    if (typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;
    if (Array.isArray(record.logs) && record.logs.every((item) => typeof item === 'string')) {
      return record.logs as string[];
    }
    queue.push(record.cause);
    queue.push(record.error);
    queue.push(record.value);
    queue.push(record.data);
  }
  return [];
}

function errMessage(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  const logs = extractRpcLogs(err);
  if (!logs.length) return base;
  return `${base}\nRPC logs:\n${logs.join('\n')}`;
}

function toBuildFailureResult(err: unknown): RunInstructionResult {
  return {
    ok: false,
    stage: 'build',
    instructionMeta: {
      keyCount: 0,
      dataLength: 0,
      buildable: false,
      executable: false,
      canonicalOnly: false,
      debugOnly: false,
      lightProvenanceKinds: [],
      summaryLines: [],
    },
    error: errMessage(err),
  };
}

function toInstructionMeta(
  built: Pick<
    BuiltInstructionResult,
    | 'instruction'
    | 'buildable'
    | 'executable'
    | 'canonicalOnly'
    | 'debugOnly'
    | 'lightProvenanceKinds'
    | 'summaryLines'
  >
): RunInstructionResult['instructionMeta'] {
  return {
    keyCount: built.instruction.keys.length,
    dataLength: built.instruction.data.length,
    buildable: built.buildable,
    executable: built.executable,
    canonicalOnly: built.canonicalOnly,
    debugOnly: built.debugOnly,
    lightProvenanceKinds: built.lightProvenanceKinds,
    summaryLines: built.summaryLines,
  };
}

function toPubkeyString(pubkey: PublicKey | string): string {
  return typeof pubkey === 'string' ? pubkey : pubkey.toBase58();
}

function normalizeRemainingAccount(account: RemainingAccountLike): RoleAwareRemainingAccount {
  return {
    pubkey: account.pubkey,
    isSigner: account.isSigner,
    isWritable: account.isWritable,
    ...(account.role ? { role: account.role } : {}),
  };
}

function fingerprintRemainingAccount(account: RoleAwareRemainingAccount): string {
  return [
    toPubkeyString(account.pubkey as PublicKey | string),
    account.isSigner ? '1' : '0',
    account.isWritable ? '1' : '0',
    account.role ?? '',
  ].join('|');
}

function mergeRemainingAccounts(
  bundleAccounts: RemainingAccountLike[] | undefined,
  extraAccounts?: RemainingAccountInput[]
): RemainingAccountInput[] | undefined {
  const merged: RoleAwareRemainingAccount[] = [
    ...(bundleAccounts ?? []).map((account) => normalizeRemainingAccount(account)),
    ...((extraAccounts ?? []) as RoleAwareRemainingAccount[]).map((account) =>
      normalizeRemainingAccount(account)
    ),
  ];

  if (merged.length === 0) {
    return undefined;
  }

  const deduped: RoleAwareRemainingAccount[] = [];
  const seen = new Set<string>();

  for (const account of merged) {
    const key = fingerprintRemainingAccount(account);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(account);
  }

  return deduped as RemainingAccountInput[];
}

function withMergedRegisterRemainingAccounts(
  params: CreateRegisterStealthInstructionFromLightBundleParams
): CreateRegisterStealthInstructionFromLightBundleParams {
  return {
    ...params,
    remainingAccounts: mergeRemainingAccounts(
      params.bundle.remainingAccounts,
      params.remainingAccounts
    ),
  };
}

function withMergedSendRemainingAccounts(
  params: CreateSendStealthInstructionFromLightBundleParams
): CreateSendStealthInstructionFromLightBundleParams {
  return {
    ...params,
    remainingAccounts: mergeRemainingAccounts(
      params.bundle.remainingAccounts,
      params.remainingAccounts
    ),
  };
}

function withMergedClaimRemainingAccounts(
  params: CreateClaimStealthInstructionFromLightBundleParams
): CreateClaimStealthInstructionFromLightBundleParams {
  return {
    ...params,
    remainingAccounts: mergeRemainingAccounts(
      params.bundle.remainingAccounts,
      params.remainingAccounts
    ),
  };
}

function shouldSendBuiltInstructionDirect(
  built: Pick<
    BuiltInstructionResult,
    'instruction' | 'buildable' | 'executable' | 'debugOnly'
  >
): boolean {
  return (
    built.buildable === true &&
    built.executable === true &&
    built.debugOnly === false &&
    built.instruction.keys.length > 0 &&
    built.instruction.data.length > 0
  );
}

function shouldSendRegisterBuiltInstructionDirect(
  built: Pick<
    BuiltInstructionResult,
    'instruction' | 'buildable' | 'debugOnly'
  >
): boolean {
  return (
    built.buildable === true &&
    built.debugOnly === false &&
    built.instruction.keys.length > 0 &&
    built.instruction.data.length > 0
  );
}

function failNonExecutableBuiltInstruction(params: {
  built: Pick<
    BuiltInstructionResult,
    'buildable' | 'executable' | 'debugOnly'
  >;
  instructionMeta: RunInstructionResult['instructionMeta'];
  kind: 'register_stealth' | 'send_stealth' | 'claim_stealth';
  relaxedExecutableCheck?: boolean;
}): RunInstructionResult {
  const reasons: string[] = [];

  if (!params.built.buildable) {
    reasons.push('instruction nie jest buildable');
  }
  if (!params.relaxedExecutableCheck && !params.built.executable) {
    reasons.push('instruction nie jest executable');
  }
  if (params.built.debugOnly) {
    reasons.push('instruction jest oznaczona jako debugOnly');
  }

  return {
    ok: false,
    stage: 'send',
    instructionMeta: params.instructionMeta,
    error: [
      `${params.kind} nie może zostać wysłane bezpośrednio z light-ready runnera.`,
      reasons.length > 0 ? `Powód: ${reasons.join(', ')}.` : undefined,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function decodePackedAddressTreeInfo(
  bytes: Uint8Array | null | undefined
): {
  treeIndex: number | null;
  queueIndex: number | null;
  rootIndex: number | null;
} {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) {
    return {
      treeIndex: null,
      queueIndex: null,
      rootIndex: null,
    };
  }

  return {
    treeIndex: bytes[0] ?? null,
    queueIndex: bytes[1] ?? null,
    rootIndex: (bytes[2] ?? 0) | ((bytes[3] ?? 0) << 8),
  };
}

function decodeRegisterNewAddressAssignedInfo(
  bytes: Uint8Array | null | undefined
): {
  assignedToAccount: boolean | null;
  assignedAccountIndex: number | null;
  treeIndex: number | null;
  queueIndex: number | null;
  rootIndex: number | null;
} {
  if (!(bytes instanceof Uint8Array) || bytes.length < 38) {
    return {
      assignedToAccount: null,
      assignedAccountIndex: null,
      treeIndex: null,
      queueIndex: null,
      rootIndex: null,
    };
  }
  return {
    queueIndex: bytes[32] ?? null,
    treeIndex: bytes[33] ?? null,
    rootIndex:
      bytes.length >= 36 ? ((bytes[34] ?? 0) | ((bytes[35] ?? 0) << 8)) : null,
    assignedToAccount: bytes[36] === 1,
    assignedAccountIndex: bytes[37] ?? null,
  };
}

function assertRegisterBundleReadyForCanonicalOutputFlow(
  bundle: RegisterLightBundle
): void {
  const value = bundle.newAddress.value;
  if (!(value instanceof Uint8Array) || value.length < 38) {
    throw new Error(
      'register bundle newAddress is missing or too short for canonical packed params'
    );
  }

  const decoded = decodeRegisterNewAddressAssignedInfo(value);
  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.register;

  const isCanonicalRegisterFlow =
    decoded.assignedToAccount === REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT &&
    decoded.assignedAccountIndex === REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX;

  if (!isCanonicalRegisterFlow) {
    throw new Error(
      `register bundle newAddress is not normalized for canonical register flow (assignedToAccount=${String(
        decoded.assignedToAccount
      )}, assignedAccountIndex=${String(decoded.assignedAccountIndex)}; expected assignedToAccount=${String(
        REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT
      )}, assignedAccountIndex=${String(REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX)})`
    );
  }

  if (decoded.treeIndex !== canonical.merkleTree) {
    throw new Error(
      `register bundle newAddress.treeIndex=${String(decoded.treeIndex)} but expected canonical merkleTree index=${canonical.merkleTree}`
    );
  }

  if (decoded.queueIndex !== canonical.addressQueue) {
    throw new Error(
      `register bundle newAddress.queueIndex=${String(decoded.queueIndex)} but expected canonical addressQueue index=${canonical.addressQueue}`
    );
  }

  const packedDecoded = decodePackedAddressTreeInfo(bundle.packedAddressTreeInfo.value);

  if (packedDecoded.treeIndex !== null && packedDecoded.treeIndex !== canonical.merkleTree) {
    throw new Error(
      `register bundle packedAddressTreeInfo.treeIndex=${String(
        packedDecoded.treeIndex
      )} but expected canonical merkleTree index=${canonical.merkleTree}`
    );
  }

  if (
    packedDecoded.queueIndex !== null &&
    packedDecoded.queueIndex !== canonical.addressQueue
  ) {
    throw new Error(
      `register bundle packedAddressTreeInfo.queueIndex=${String(
        packedDecoded.queueIndex
      )} but expected canonical addressQueue index=${canonical.addressQueue}`
    );
  }

  if (
    packedDecoded.rootIndex !== null &&
    decoded.rootIndex !== null &&
    packedDecoded.rootIndex !== decoded.rootIndex
  ) {
    throw new Error(
      `register bundle rootIndex mismatch: packedAddressTreeInfo.rootIndex=${packedDecoded.rootIndex}, newAddress.rootIndex=${decoded.rootIndex}`
    );
  }
}

function registerBundleSummaryLines(
  bundle: RegisterLightBundle
): string[] {
  const decoded = decodeRegisterNewAddressAssignedInfo(bundle.newAddress.value);
  const packedDecoded = decodePackedAddressTreeInfo(bundle.packedAddressTreeInfo.value);
  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.register;

  return [
    `registerBundle.newAddress.assignedToAccount=${String(decoded.assignedToAccount)}`,
    `registerBundle.newAddress.assignedAccountIndex=${String(decoded.assignedAccountIndex)}`,
    `registerBundle.newAddress.treeIndex=${String(decoded.treeIndex)}`,
    `registerBundle.newAddress.queueIndex=${String(decoded.queueIndex)}`,
    `registerBundle.newAddress.rootIndex=${String(decoded.rootIndex)}`,
    `registerBundle.packedAddressTreeInfo.treeIndex=${String(packedDecoded.treeIndex)}`,
    `registerBundle.packedAddressTreeInfo.queueIndex=${String(packedDecoded.queueIndex)}`,
    `registerBundle.packedAddressTreeInfo.rootIndex=${String(packedDecoded.rootIndex)}`,
    `registerBundle.contract=canonical-register-flow`,
    `registerBundle.expected.assignedToAccount=${String(REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT)}`,
    `registerBundle.expected.assignedAccountIndex=${String(REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX)}`,
    `registerBundle.expected.treeIndex=${String(canonical.merkleTree)}`,
    `registerBundle.expected.queueIndex=${String(canonical.addressQueue)}`,
    `registerBundle.expected.stateQueueIndex=${String(canonical.stateQueue)}`,
    `registerBundle.expected.stateTreeIndex=${String(canonical.stateTree)}`,
    `registerBundle.expected.addressIndex=${String(canonical.address)}`,
  ];
}

/** ==================== CRITICAL DEBUG FOR REGISTER ==================== */
function printCriticalRegisterDebug(
  bundle: RegisterLightBundle,
  instruction: any
) {
  if (!isVerboseRegisterRunnerDebugEnabled()) {
    return;
  }

  const packedInfo = decodePackedAddressTreeInfo(bundle.packedAddressTreeInfo?.value);
  const newAddress = decodeRegisterNewAddressAssignedInfo(bundle.newAddress?.value);
  const canonical = LIGHT_CANONICAL_EXTERNAL_INDEX.register;

  console.log('\n' + '='.repeat(90));
  console.log('CRITICAL CANONICAL REGISTER DEBUG');
  console.log('='.repeat(90));

  if (bundle.packedAddressTreeInfo?.value) {
    console.log(
      'packedAddressTreeInfo (bytes):',
      Array.from(bundle.packedAddressTreeInfo.value)
    );
    console.log(
      'packedAddressTreeInfo (hex) :',
      Buffer.from(bundle.packedAddressTreeInfo.value).toString('hex')
    );
    console.log(
      'packedAddressTreeInfo decoded:',
      packedInfo
    );
  } else {
    console.log('packedAddressTreeInfo: missing');
  }

  if (bundle.newAddress?.value) {
    console.log(
      'maybeNewAddressSerialized (hex):',
      Buffer.from(bundle.newAddress.value).toString('hex')
    );
    console.log('newAddress length:', bundle.newAddress.value.length);
    console.log('newAddress decoded:', newAddress);
  } else {
    console.log('newAddress: missing');
  }

  console.log('\n=== CANONICAL EXPECTED CONTRACT ===');
  console.log(canonical);

  console.log('\n=== REMAINING ACCOUNTS / INSTRUCTION KEYS ===');
  instruction.keys.forEach((acc: any, i: number) => {
    const role = acc.role || 'no-role';
    console.log(
      `${i.toString().padStart(2)} | ${acc.pubkey.toBase58()} | signer:${acc.isSigner} | writable:${acc.isWritable} | role:${role}`
    );
  });

  console.log('='.repeat(90) + '\n');
}
/** ================================================================== */

async function simulateBuiltInstruction(params: {
  connection: Connection;
  wallet: StealthWalletExecutor;
  instruction: BuiltInstructionResult['instruction'];
  followUpInstructions?: BuiltInstructionResult['instruction'][];
  instructionMeta: RunInstructionResult['instructionMeta'];
}): Promise<RunInstructionResult> {
  try {
    const cluster = inferClusterFromRpcUrl(params.connection.rpcEndpoint ?? '');
    const { tx, blockhash, lastValidBlockHeight } = await buildStealthVersionedTransaction({
      connection: params.connection,
      payer: params.wallet.payer,
      instructions: [
        params.instruction,
        ...(params.followUpInstructions ?? []),
      ],
      cluster,
    });
    const signed = await params.wallet.signTransaction(tx);
    const simulation = await params.connection.simulateTransaction(signed);
    return {
      ok: true,
      stage: 'simulate',
      simulation: simulation.value,
      instructionMeta: params.instructionMeta,
      error: simulation.value.err ? JSON.stringify(simulation.value.err) : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      stage: 'simulate',
      instructionMeta: params.instructionMeta,
      error: errMessage(err),
    };
  }
}

const MOBILE_CONFIRM_TIMEOUT_MS = 35_000;

async function confirmTransactionWithTimeout(
  connection: Connection,
  params: {
    signature: string;
    blockhash: string;
    lastValidBlockHeight: number;
  },
  ms = MOBILE_CONFIRM_TIMEOUT_MS
): Promise<{ timedOut: boolean; chainErr?: unknown; thrown?: unknown }> {
  // Never use connection.confirmTransaction — it opens WSS and Cloudflare Worker
  // surfaces LogBox "ws error: undefined" on React Native.
  void params.blockhash;
  void params.lastValidBlockHeight;
  const result = await confirmSignatureViaHttp(connection, params.signature, {
    timeoutMs: ms,
    gracePeriodMs: 12_000,
    minConfirmation: 'processed',
  });
  if (result.ok) return { timedOut: false };
  if ('timedOut' in result && result.timedOut) return { timedOut: true };
  if ('err' in result) return { timedOut: false, chainErr: result.err };
  return { timedOut: true };
}

function formatSimulationFailure(
  instruction: BuiltInstructionResult['instruction'],
  simulation: Awaited<ReturnType<Connection['simulateTransaction']>>
): string {
  const simulationLogs = Array.isArray(simulation.value.logs)
    ? simulation.value.logs.join('\n')
    : '';
  const dataHexPreview = Buffer.from(instruction.data).toString('hex').slice(0, 128);
  return simulationLogs
    ? `Simulation failed.\nError: ${JSON.stringify(
        simulation.value.err
      )}\nInstruction debug: keys=${instruction.keys.length} dataLen=${
        instruction.data.length
      } dataHexPreview=${dataHexPreview}\nLogs:\n${simulationLogs}`
    : `Simulation failed.\nError: ${JSON.stringify(
        simulation.value.err
      )}\nInstruction debug: keys=${instruction.keys.length} dataLen=${
        instruction.data.length
      } dataHexPreview=${dataHexPreview}`;
}

/** Symulacja przed sesją Phantom (MWA timeout id=2 gdy simulate trwa w transact). */
export async function simulateStealthInstructionBeforeWallet(params: {
  connection: Connection;
  payer: PublicKey;
  instruction: BuiltInstructionResult['instruction'];
}): Promise<RunInstructionResult> {
  try {
    const cluster = inferClusterFromRpcUrl(params.connection.rpcEndpoint ?? '');
    const { tx } = await buildStealthVersionedTransaction({
      connection: params.connection,
      payer: params.payer,
      instructions: [params.instruction],
      cluster,
    });
    const simulation = await params.connection.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    if (simulation.value.err) {
      return {
        ok: false,
        stage: 'simulate',
        simulation: simulation.value,
        instructionMeta: {
          keyCount: params.instruction.keys.length,
          dataLength: params.instruction.data.length,
          buildable: true,
          executable: false,
          canonicalOnly: false,
          debugOnly: false,
          lightProvenanceKinds: [],
          summaryLines: ['simulate: before wallet session'],
        },
        error: formatSimulationFailure(params.instruction, simulation),
      };
    }
    return {
      ok: true,
      stage: 'simulate',
      simulation: simulation.value,
      instructionMeta: {
        keyCount: params.instruction.keys.length,
        dataLength: params.instruction.data.length,
        buildable: true,
        executable: true,
        canonicalOnly: false,
        debugOnly: false,
        lightProvenanceKinds: [],
        summaryLines: ['simulate: ok before wallet session'],
      },
    };
  } catch (err) {
    return {
      ok: false,
      stage: 'simulate',
      instructionMeta: {
        keyCount: params.instruction.keys.length,
        dataLength: params.instruction.data.length,
        buildable: true,
        executable: false,
        canonicalOnly: false,
        debugOnly: false,
        lightProvenanceKinds: [],
        summaryLines: [],
      },
      error: errMessage(err),
    };
  }
}

export type SignedStealthTransactionPackage = {
  signed: Transaction | VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
  instructionMeta: RunInstructionResult['instructionMeta'];
};

export type SignStealthInstructionResult =
  | { ok: true; package: SignedStealthTransactionPackage }
  | {
      ok: false;
      stage: 'sign';
      instructionMeta?: RunInstructionResult['instructionMeta'];
      error: string;
    };

/** Tylko podpis w sesji MWA — wysyłkę/potwierdzenie zrób poza `transact` (mniej timeoutów Phantom id=2). */
export async function signBuiltStealthInstructionInWallet(params: {
  connection: Connection;
  wallet: StealthWalletExecutor;
  instruction: BuiltInstructionResult['instruction'];
  followUpInstructions?: BuiltInstructionResult['instruction'][];
  instructionMeta: RunInstructionResult['instructionMeta'];
  skipPreSendSimulation?: boolean;
}): Promise<SignStealthInstructionResult> {
  try {
    const unsigned = await prepareUnsignedStealthSignPackage({
      connection: params.connection,
      payer: params.wallet.payer,
      instruction: params.instruction,
      followUpInstructions: params.followUpInstructions,
      instructionMeta: params.instructionMeta,
      skipPreSendSimulation: params.skipPreSendSimulation,
    });
    return signUnsignedStealthPackageInWallet(params.wallet, unsigned);
  } catch (err) {
    return {
      ok: false,
      stage: 'sign',
      instructionMeta: params.instructionMeta,
      error: errMessage(err),
    };
  }
}

/**
 * Zbuduj v0 + blockhash + LUT **poza** sesją MWA.
 * Na Samsungie RPC w tle (Phantom na pierwszym planie) wisi — wtedy nie ma ekranu POTWIERDŹ.
 */
export async function prepareUnsignedStealthSignPackage(params: {
  connection: Connection;
  payer: PublicKey;
  instruction: BuiltInstructionResult['instruction'];
  followUpInstructions?: BuiltInstructionResult['instruction'][];
  instructionMeta: RunInstructionResult['instructionMeta'];
  cluster?: SupportedCluster;
  skipPreSendSimulation?: boolean;
}): Promise<{
  tx: VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
  instructionMeta: RunInstructionResult['instructionMeta'];
}> {
  const cluster =
    params.cluster ?? inferClusterFromRpcUrl(params.connection.rpcEndpoint ?? '');
  const instructions = [
    params.instruction,
    ...(params.followUpInstructions ?? []),
  ];
  const { tx, blockhash, lastValidBlockHeight } = await buildStealthVersionedTransaction({
    connection: params.connection,
    payer: params.payer,
    instructions,
    cluster,
  });

  if (!params.skipPreSendSimulation) {
    const simulation = await params.connection.simulateTransaction(tx);
    if (simulation.value.err) {
      throw new Error(formatSimulationFailure(params.instruction, simulation));
    }
  }

  return {
    tx,
    blockhash,
    lastValidBlockHeight,
    instructionMeta: params.instructionMeta,
  };
}

/** Natychmiastowy signTransactions — bez RPC w callbacku MWA. */
export async function signUnsignedStealthPackageInWallet(
  wallet: StealthWalletExecutor,
  unsigned: {
    tx: VersionedTransaction;
    blockhash: string;
    lastValidBlockHeight: number;
    instructionMeta: RunInstructionResult['instructionMeta'];
  }
): Promise<SignStealthInstructionResult> {
  try {
    const signed = await wallet.signTransaction(unsigned.tx);
    return {
      ok: true,
      package: {
        signed,
        blockhash: unsigned.blockhash,
        lastValidBlockHeight: unsigned.lastValidBlockHeight,
        instructionMeta: unsigned.instructionMeta,
      },
    };
  } catch (err) {
    return {
      ok: false,
      stage: 'sign',
      instructionMeta: unsigned.instructionMeta,
      error: errMessage(err),
    };
  }
}

async function sendRawViaPublicClusterFallback(
  raw: Buffer | Uint8Array,
  cluster: AppCluster
): Promise<string> {
  const publicUrl = PUBLIC_CLUSTER_RPC[cluster];
  if (!publicUrl) {
    throw new Error(`Brak publicznego RPC dla klastra ${cluster}`);
  }
  // Broadcast-only fallback when Worker masks sendTransaction app-errors as -32004.
  const fallback = new Connection(publicUrl, {
    commitment: 'confirmed',
    wsEndpoint: 'wss://127.0.0.1:1',
    disableRetryOnRateLimit: true,
  });
  return fallback.sendRawTransaction(raw, {
    skipPreflight: true,
    preflightCommitment: 'confirmed',
    maxRetries: 3,
  });
}

async function sendRawStealthTransactionWithRetry(
  connection: Connection,
  raw: Buffer | Uint8Array
): Promise<string> {
  const maxAttempts = 4;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      // skipPreflight: Light register/send was already proven via Photon; Worker
      // simulate on send is slow and often hangs (same as pre-wallet step 2b).
      return await connection.sendRawTransaction(raw, {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
    } catch (err) {
      lastError = err;
      const message = errMessage(err);
      const retryable =
        isRpcBackendExhaustedError(message) ||
        isRateLimitRpcError(message) ||
        /503|502|fetch failed|network request failed|ECONNRESET|ETIMEDOUT/i.test(
          message
        );
      if (!retryable || attempt >= maxAttempts - 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_500 * (attempt + 1)));
    }
  }

  const lastMessage = errMessage(lastError);
  if (isRpcBackendExhaustedError(lastMessage) || lastMessage.includes('DEX_RPC_BACKEND_EXHAUSTED')) {
    const cluster = inferClusterFromRpcUrl(connection.rpcEndpoint ?? '');
    if (cluster === 'devnet' || cluster === 'testnet') {
      try {
        return await sendRawViaPublicClusterFallback(raw, cluster);
      } catch (publicErr) {
        // Prefer the public RPC error (real tx rejection) over masked Photon exhaustion.
        throw publicErr;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function submitSignedStealthTransaction(
  connection: Connection,
  signedPackage: SignedStealthTransactionPackage,
  params?: { onTransactionSubmitted?: (signature: string) => void }
): Promise<RunInstructionResult> {
  let signature: string | undefined;
  const instructionMeta = signedPackage.instructionMeta;
  try {
    const raw = serializeStealthTransaction(signedPackage.signed);
    signature = await sendRawStealthTransactionWithRetry(connection, raw);
    params?.onTransactionSubmitted?.(signature);

    const confirmation = await confirmTransactionWithTimeout(connection, {
      signature,
      blockhash: signedPackage.blockhash,
      lastValidBlockHeight: signedPackage.lastValidBlockHeight,
    });
    if (confirmation.timedOut) {
      // Soft-success only if the network actually saw the tx (Samsung often got a
      // local signature while send never landed — status stays null forever).
      try {
        const statuses = await connection.getSignatureStatuses([signature], {
          searchTransactionHistory: true,
        });
        const status = statuses.value[0];
        if (status && !status.err) {
          return {
            ok: true,
            stage: 'send',
            signature,
            instructionMeta,
            error:
              'Transakcja wysłana; potwierdzenie sieci trwało zbyt długo. Sprawdź signature w explorerze.',
          };
        }
        if (status?.err) {
          return {
            ok: false,
            stage: 'send',
            signature,
            instructionMeta,
            error: JSON.stringify(status.err),
          };
        }
      } catch {
        // fall through to hard fail
      }
      return {
        ok: false,
        stage: 'send',
        signature,
        instructionMeta,
        error:
          'Transakcja nie pojawiła się w sieci (brak statusu RPC). Na Samsungu zrób Reload Metro / npm run metro:samsung:fresh i spróbuj ponownie.',
      };
    }
    if (confirmation.chainErr) {
      return {
        ok: false,
        stage: 'send',
        signature,
        instructionMeta,
        error: JSON.stringify(confirmation.chainErr),
      };
    }
    if (confirmation.thrown) {
      throw confirmation.thrown;
    }
    return {
      ok: true,
      stage: 'send',
      signature,
      instructionMeta,
    };
  } catch (err) {
    return {
      ok: false,
      stage: 'send',
      signature,
      instructionMeta,
      error: errMessage(err),
    };
  }
}

async function sendBuiltInstructionDirect(params: {
  connection: Connection;
  wallet: StealthWalletExecutor;
  instruction: BuiltInstructionResult['instruction'];
  followUpInstructions?: BuiltInstructionResult['instruction'][];
  instructionMeta: RunInstructionResult['instructionMeta'];
  onTransactionSubmitted?: (signature: string) => void;
  /** Gdy symulacja już wykonana przed `transact` (mobile register). */
  skipPreSendSimulation?: boolean;
}): Promise<RunInstructionResult> {
  const signed = await signBuiltStealthInstructionInWallet({
    connection: params.connection,
    wallet: params.wallet,
    instruction: params.instruction,
    followUpInstructions: params.followUpInstructions,
    instructionMeta: params.instructionMeta,
    skipPreSendSimulation: params.skipPreSendSimulation,
  });
  if (!signed.ok) {
    return {
      ok: false,
      stage: signed.stage,
      instructionMeta: signed.instructionMeta,
      error: signed.error,
    };
  }
  return submitSignedStealthTransaction(params.connection, signed.package, {
    onTransactionSubmitted: params.onTransactionSubmitted,
  });
}

export async function simulateRegisterStealthFromLightBundle(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: SimulateLightReadyRegisterParams
): Promise<RunInstructionResult> {
  try {
    const mergedParams = withRepairedRegisterBundle(
      withMergedRegisterRemainingAccounts(params)
    );
    const built = await createRegisterStealthInstructionFromLightBundle(mergedParams);
    return simulateBuiltInstruction({
      connection,
      wallet,
      instruction: built.instruction,
      instructionMeta: toInstructionMeta(built),
    });
  } catch (err) {
    return toBuildFailureResult(err);
  }
}

export async function simulateSendStealthFromLightBundle(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: SimulateLightReadySendParams
): Promise<RunInstructionResult> {
  try {
    const mergedParams = withRepairedSendBundle(withMergedSendRemainingAccounts(params));
    const built = await createSendStealthInstructionFromLightBundle(mergedParams);
    return simulateBuiltInstruction({
      connection,
      wallet,
      instruction: built.instruction,
      instructionMeta: toInstructionMeta(built),
    });
  } catch (err) {
    return toBuildFailureResult(err);
  }
}

export async function simulateClaimStealthFromLightBundle(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: SimulateLightReadyClaimParams
): Promise<RunInstructionResult> {
  try {
    const mergedParams = withMergedClaimRemainingAccounts(params);
    const built = await createClaimStealthInstructionFromLightBundle(mergedParams);
    return simulateBuiltInstruction({
      connection,
      wallet,
      instruction: built.instruction,
      followUpInstructions: built.followUpInstructions,
      instructionMeta: toInstructionMeta(built),
    });
  } catch (err) {
    return toBuildFailureResult(err);
  }
}

function withRepairedRegisterBundle(
  params: CreateRegisterStealthInstructionFromLightBundleParams
): CreateRegisterStealthInstructionFromLightBundleParams {
  const bundle = repairRegisterLightBundleNewAddress(
    params.bundle,
    params.lightAddressSeed ?? params.lightAddressSeedBytes
  );
  if (bundle === params.bundle) {
    return params;
  }
  return { ...params, bundle };
}

function withRepairedSendBundle(
  params: CreateSendStealthInstructionFromLightBundleParams
): CreateSendStealthInstructionFromLightBundleParams {
  const bundle = repairSendLightBundleNewPaymentAddress(
    params.bundle,
    params.lightAddressSeed
  );
  if (bundle === params.bundle) {
    return params;
  }
  return { ...params, bundle };
}

export async function sendRegisterStealthFromLightBundle(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: CreateRegisterStealthInstructionFromLightBundleParams & {
    onTransactionSubmitted?: (signature: string) => void;
  }
): Promise<RunInstructionResult> {
  const mergedParams = withRepairedRegisterBundle(
    withMergedRegisterRemainingAccounts(params)
  );

  try {
    assertRegisterBundleReadyForCanonicalOutputFlow(mergedParams.bundle);
  } catch (err) {
    return {
      ok: false,
      stage: 'build',
      instructionMeta: {
        keyCount: 0,
        dataLength: 0,
        buildable: false,
        executable: false,
        canonicalOnly: false,
        debugOnly: false,
        lightProvenanceKinds: [],
        summaryLines: registerBundleSummaryLines(mergedParams.bundle),
      },
      error: errMessage(err),
    };
  }

  let built: BuiltInstructionResult;
  try {
    built = await createRegisterStealthInstructionFromLightBundle(mergedParams);
  } catch (err) {
    return toBuildFailureResult(err);
  }

  printCriticalRegisterDebug(mergedParams.bundle, built.instruction);

  const baseInstructionMeta = toInstructionMeta(built);
  const canSendDirect = shouldSendRegisterBuiltInstructionDirect(built);

  const instructionMeta: RunInstructionResult['instructionMeta'] = {
    ...baseInstructionMeta,
    summaryLines: [
      ...(baseInstructionMeta.summaryLines ?? []),
      ...registerBundleSummaryLines(mergedParams.bundle),
      `registerRunner.sendPath=direct-built-instruction`,
      `registerRunner.contract=canonical-register-flow`,
      `registerRunner.shouldSendBuiltInstructionDirect=${String(canSendDirect)}`,
      `registerRunner.executableBypassedForCanonicalRegister=true`,
    ],
  };

  if (!canSendDirect) {
    return failNonExecutableBuiltInstruction({
      built,
      instructionMeta,
      kind: 'register_stealth',
      relaxedExecutableCheck: true,
    });
  }

  return await sendBuiltInstructionDirect({
    connection,
    wallet,
    instruction: built.instruction,
    instructionMeta,
    onTransactionSubmitted: params.onTransactionSubmitted,
  });
}

function prebuiltRegisterInstructionMeta(
  built: BuiltInstructionResult
): RunInstructionResult['instructionMeta'] {
  const baseInstructionMeta = toInstructionMeta(built);
  return {
    ...baseInstructionMeta,
    summaryLines: [
      ...(baseInstructionMeta.summaryLines ?? []),
      `registerRunner.sendPath=prebuilt-instruction`,
    ],
  };
}

/** Podpis send w sesji Phantom (bez wysyłki — mobile: submit poza transact). */
export async function signPrebuiltSendStealthInstruction(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: {
    built: BuiltInstructionResult;
    skipPreSendSimulation?: boolean;
  }
): Promise<SignStealthInstructionResult> {
  const baseInstructionMeta = toInstructionMeta(params.built);
  const canSendDirect =
    params.built.buildable === true &&
    params.built.debugOnly === false &&
    params.built.instruction.keys.length > 0 &&
    params.built.instruction.data.length > 0;
  const instructionMeta: RunInstructionResult['instructionMeta'] = {
    ...baseInstructionMeta,
    summaryLines: [
      ...(baseInstructionMeta.summaryLines ?? []),
      `sendRunner.sendPath=prebuilt-instruction`,
      `sendRunner.shouldSendBuiltInstructionDirect=${String(canSendDirect)}`,
    ],
  };
  if (!canSendDirect) {
    const failed = failNonExecutableBuiltInstruction({
      built: params.built,
      instructionMeta,
      kind: 'send_stealth',
      relaxedExecutableCheck: true,
    });
    return {
      ok: false,
      stage: 'sign',
      instructionMeta: failed.instructionMeta,
      error: failed.error ?? 'send instruction not executable',
    };
  }

  return signBuiltStealthInstructionInWallet({
    connection,
    wallet,
    instruction: params.built.instruction,
    instructionMeta,
    skipPreSendSimulation: params.skipPreSendSimulation ?? true,
  });
}

/** Podpis register w sesji Phantom (bez wysyłki — mobile: submit poza transact). */
export async function signPrebuiltRegisterStealthInstruction(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: {
    built: BuiltInstructionResult;
    skipPreSendSimulation?: boolean;
  }
): Promise<SignStealthInstructionResult> {
  const instructionMeta = prebuiltRegisterInstructionMeta(params.built);
  const canSendDirect = shouldSendRegisterBuiltInstructionDirect(params.built);
  if (!canSendDirect) {
    const failed = failNonExecutableBuiltInstruction({
      built: params.built,
      instructionMeta,
      kind: 'register_stealth',
      relaxedExecutableCheck: true,
    });
    return {
      ok: false,
      stage: 'sign',
      instructionMeta: failed.instructionMeta,
      error: failed.error ?? 'register instruction not executable',
    };
  }

  return signBuiltStealthInstructionInWallet({
    connection,
    wallet,
    instruction: params.built.instruction,
    instructionMeta,
    skipPreSendSimulation: params.skipPreSendSimulation,
  });
}

/** Podpis + wysyłka już zbudowanej instrukcji (Helius/build poza sesją MWA). */
export async function sendPrebuiltRegisterStealthInstruction(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: {
    built: BuiltInstructionResult;
    onTransactionSubmitted?: (signature: string) => void;
    skipPreSendSimulation?: boolean;
  }
): Promise<RunInstructionResult> {
  const instructionMeta = prebuiltRegisterInstructionMeta(params.built);
  const canSendDirect = shouldSendRegisterBuiltInstructionDirect(params.built);
  if (!canSendDirect) {
    return failNonExecutableBuiltInstruction({
      built: params.built,
      instructionMeta,
      kind: 'register_stealth',
      relaxedExecutableCheck: true,
    });
  }

  return sendBuiltInstructionDirect({
    connection,
    wallet,
    instruction: params.built.instruction,
    instructionMeta,
    onTransactionSubmitted: params.onTransactionSubmitted,
    skipPreSendSimulation: params.skipPreSendSimulation,
  });
}

export async function sendSendStealthFromLightBundle(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: CreateSendStealthInstructionFromLightBundleParams
): Promise<RunInstructionResult> {
  const mergedParams = withRepairedSendBundle(withMergedSendRemainingAccounts(params));
  let built: BuiltInstructionResult;
  try {
    built = await createSendStealthInstructionFromLightBundle(mergedParams);
  } catch (err) {
    return toBuildFailureResult(err);
  }
  const baseInstructionMeta = toInstructionMeta(built);
  // Light bundle already carried a ready proof + remaining accounts; createSendStealthInstruction
  // still runs prepareSendStealthExecution (second buildSendLightBundle) which can lag the indexer
  // and set draft.executable=false. Same bypass as claim when the built ix is non-empty and buildable.
  const canSendDirect =
    built.buildable === true &&
    built.debugOnly === false &&
    built.instruction.keys.length > 0 &&
    built.instruction.data.length > 0;
  const instructionMeta: RunInstructionResult['instructionMeta'] = {
    ...baseInstructionMeta,
    summaryLines: [
      ...(baseInstructionMeta.summaryLines ?? []),
      `sendRunner.shouldSendBuiltInstructionDirect=${String(canSendDirect)}`,
      `sendRunner.executableBypassedForLightBundleSend=true`,
    ],
  };
  if (!canSendDirect) {
    return failNonExecutableBuiltInstruction({
      built,
      instructionMeta,
      kind: 'send_stealth',
      relaxedExecutableCheck: true,
    });
  }
  // Same as register: Photon already proved the Light bundle. Worker
  // simulateTransaction often hangs / returns -32004 and surfaces as
  // "Photon wyczerpane" at stage sign even though proof prep succeeded.
  return await sendBuiltInstructionDirect({
    connection,
    wallet,
    instruction: built.instruction,
    instructionMeta,
    skipPreSendSimulation: true,
  });
}

/** Podpis claim w sesji Phantom (bez wysyłki — mobile: Photon/build poza transact). */
export async function signPrebuiltClaimStealthInstruction(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: {
    built: BuiltInstructionResult;
    skipPreSendSimulation?: boolean;
  }
): Promise<SignStealthInstructionResult> {
  const baseInstructionMeta = toInstructionMeta(params.built);
  const canSendDirect =
    params.built.buildable === true &&
    params.built.instruction.keys.length > 0 &&
    params.built.instruction.data.length > 0;
  const instructionMeta: RunInstructionResult['instructionMeta'] = {
    ...baseInstructionMeta,
    summaryLines: [
      ...(baseInstructionMeta.summaryLines ?? []),
      `claimRunner.sendPath=prebuilt-instruction`,
      `claimRunner.shouldSendBuiltInstructionDirect=${String(canSendDirect)}`,
    ],
  };
  if (!canSendDirect) {
    const failed = failNonExecutableBuiltInstruction({
      built: params.built,
      instructionMeta,
      kind: 'claim_stealth',
      relaxedExecutableCheck: true,
    });
    return {
      ok: false,
      stage: 'sign',
      instructionMeta: failed.instructionMeta,
      error: failed.error ?? 'claim instruction not executable',
    };
  }

  return signBuiltStealthInstructionInWallet({
    connection,
    wallet,
    instruction: params.built.instruction,
    followUpInstructions: params.built.followUpInstructions,
    instructionMeta,
    skipPreSendSimulation: params.skipPreSendSimulation ?? true,
  });
}

export async function sendClaimStealthFromLightBundle(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: CreateClaimStealthInstructionFromLightBundleParams
): Promise<RunInstructionResult> {
  const mergedParams = withMergedClaimRemainingAccounts(params);
  let built: BuiltInstructionResult;
  try {
    built = await createClaimStealthInstructionFromLightBundle(mergedParams);
  } catch (err) {
    return toBuildFailureResult(err);
  }
  const baseInstructionMeta = toInstructionMeta(built);
  const canSendDirect =
    built.buildable === true &&
    built.instruction.keys.length > 0 &&
    built.instruction.data.length > 0;
  const instructionMeta: RunInstructionResult['instructionMeta'] = {
    ...baseInstructionMeta,
    summaryLines: [
      ...(baseInstructionMeta.summaryLines ?? []),
      `claimRunner.shouldSendBuiltInstructionDirect=${String(canSendDirect)}`,
      `claimRunner.executableBypassedForLightBundleClaim=true`,
    ],
  };
  if (!canSendDirect) {
    return failNonExecutableBuiltInstruction({
      built,
      instructionMeta,
      kind: 'claim_stealth',
      relaxedExecutableCheck: true,
    });
  }
  return sendBuiltInstructionDirect({
    connection,
    wallet,
    instruction: built.instruction,
    followUpInstructions: built.followUpInstructions,
    instructionMeta,
    skipPreSendSimulation: true,
  });
}

export type {
  RegisterLightBundle,
  SendLightBundle,
  ClaimLightBundle,
};
