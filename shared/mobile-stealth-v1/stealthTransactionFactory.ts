import { PublicKey } from '@solana/web3.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

import {
  buildClaimLightInputs,
  buildRegisterLightInputs,
  buildSendLightInputs,
  summarizeSerializedLightInputs,
  type SerializedLightInputs,
  type SimpleCompressedAccountMetaInput,
  type TaggedLightSerializationInput,
} from './stealthLightSerialization.ts';
import { decodeLiveLocalOpaqueEnvelopeFromBytes } from '../light/lightLiveLocalNormalization.ts';
import {
  buildClaimStealthPayoutTransactionInstruction,
  buildClaimStealthTransactionInstruction,
  buildRegisterStealthTransactionInstruction,
  buildSendStealthTransactionInstruction,
  deriveClaimVoucherPda,
  type ClaimStealthTxParams,
  type RegisterStealthTxParams,
  type RemainingAccountInput,
  type SendStealthTxParams,
} from './stealthInstructionBuilder.ts';
import {
  buildClaimStealthExecutionPlan,
  buildRegisterStealthExecutionPlan,
  buildSendStealthExecutionPlan,
  claimExecutionToPlan,
} from './stealthExecutionPlan.ts';
import type { ClaimStealthExecution } from './stealthActions.ts';
import {
  getPierronStealthProgramId,
  type SupportedCluster,
} from '../core/programIds.ts';
import type { LightSerializationKind } from '../light/lightClient.ts';
import { LIGHT_CANONICAL_EXTERNAL_INDEX } from '../light/lightClient.ts';
import {
  LOCALNET_LIGHT_ACCOUNTS,
  LOCAL_SEND_OUTPUT_TREE_INDEX,
  deriveStealthLightCpiSignerPda,
  resolveStealthOutputTreeIndex,
} from '../light/lightCanonicalConfig.ts';
import {
  REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT,
  REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX,
} from '../light/registerCanonicalContract.ts';
import { deriveStealthAuthorityPda } from '../stealth-base/stealthPda.ts';

type JsonRecord = Record<string, unknown>;

export type RegisterStealthInstructionDraft = {
  kind: 'register_stealth';
  buildable: boolean;
  executable: boolean;
  programId: string;
  accounts: {
    owner: string;
  };
  args: {
    outputTreeIndexInput: number;
    outputTreeIndexEffective?: number;
    nonce: string;
    registeredAt: string;
    transactionCount: string;
    spendPublicKey: number[];
    viewPublicKey: number[];
    provisionalRegisterAddressSeed: number[];
  };
  notes: string[];
  missing: string[];
};

export type SendStealthInstructionDraft = {
  kind: 'send_stealth';
  buildable: boolean;
  executable: boolean;
  programId: string;
  accounts: {
    sender: string;
    mint: string;
    stealthAddress: string;
    stealthAuthority: string;
  };
  args: {
    outputTreeIndexInput: number;
    outputTreeIndexEffective?: number;
    amount: string;
    senderHash: string;
    createdAt: string;
    claimed: boolean;
    intendedClaimer: string;
    ephemeralPublicKey: number[];
    recipientSpendKey: number[];
    recipientViewKey: number[];
    bump: number;
  };
  light: {
    proofReady: boolean;
    addressTreeInfoReady: boolean;
    newAddressReady: boolean;
  };
  notes: string[];
  missing: string[];
};

export type ClaimStealthInstructionDraft = {
  kind: 'claim_stealth';
  buildable: boolean;
  executable: boolean;
  programId: string;
  accounts: {
    claimer: string;
    mint: string;
    stealthAddress?: string;
    stealthAuthority?: string;
  };
  args: {
    bump?: number;
    amount?: string;
  };
  light: {
    proofReady: boolean;
    claimerMetaReady: boolean;
    paymentMetaReady: boolean;
    stealthAuthorityBumpReady: boolean;
  };
  notes: string[];
  missing: string[];
};

export type RegisterStealthInstructionFactoryParams = {
  owner: PublicKey;
  outputTreeIndex?: number;
  remainingAccounts?: RemainingAccountInput[];
  cluster?: SupportedCluster;

  stealthAddress?: PublicKey;
  lightAddressSeed?: Uint8Array;
  lightAddressSeedBytes?: Uint8Array;

  proof: Buffer | Uint8Array | number[] | TaggedLightSerializationInput;
  addressTreeInfo: Buffer | Uint8Array | number[] | TaggedLightSerializationInput;
  maybeNewAddress?:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | null;
  metaMeta?:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | SimpleCompressedAccountMetaInput
    | null;
};

export type SendStealthInstructionFactoryParams = {
  sender: PublicKey;
  mint: PublicKey;
  senderToken: PublicKey;
  stealthToken: PublicKey;
  tokenProgram: PublicKey;
  amount: bigint;
  outputTreeIndex?: number;
  remainingAccounts?: RemainingAccountInput[];
  cluster?: SupportedCluster;

  recipientSpendKey?: Uint8Array;
  recipientViewKey?: Uint8Array;
  /** Owner stealth meta odbiorcy — wiązanie claim on-chain. */
  intendedClaimer?: PublicKey | string;
  recipientBundle?: unknown;
  allowDebugRecipientGeneration?: boolean;
  stealthAddress?: PublicKey;
  lightAddressSeed?: Uint8Array;
  lightAddressSeedBytes?: Uint8Array;

  proof: Buffer | Uint8Array | number[] | TaggedLightSerializationInput;
  addressTreeInfo: Buffer | Uint8Array | number[] | TaggedLightSerializationInput;
  maybeNewPaymentAddress?:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | null;
};

export type ClaimStealthInstructionFactoryParams = {
  claimer: PublicKey;
  mint: PublicKey;
  stealthToken: PublicKey;
  claimerToken: PublicKey;
  tokenProgram: PublicKey;
  remainingAccounts?: RemainingAccountInput[];
  cluster?: SupportedCluster;

  proof: Buffer | Uint8Array | number[] | TaggedLightSerializationInput;
  claimerMeta:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | SimpleCompressedAccountMetaInput;
  paymentMeta:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | SimpleCompressedAccountMetaInput;
};

export type BuiltStealthInstructionResult = {
  instruction: import('@solana/web3.js').TransactionInstruction;
  /** Extra top-level ixs in the same tx (np. claim_stealth_payout — osobny heap BPF). */
  followUpInstructions?: import('@solana/web3.js').TransactionInstruction[];
  summaryLines: string[];
  buildable: boolean;
  executable: boolean;
  canonicalOnly: boolean;
  debugOnly: boolean;
  lightProvenanceKinds: LightSerializationKind[];
};

const LIGHT_SYSTEM_PROGRAM_ID = new PublicKey(
  'SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7'
);

const REGISTERED_PROGRAM_PDA = new PublicKey(
  '35hkDgaAKwMCaxRz2ocSZ6NaUrtKkyNqU6c4RV3tYJRh'
);

const ACCOUNT_COMPRESSION_AUTHORITY_PDA = new PublicKey(
  'HwXnGK3tPkkVY6P439H2p68AxpeuWXd5PcrAxFpbmfbA'
);

const ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  'compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq'
);

const SYSTEM_PROGRAM_ID = new PublicKey(
  '11111111111111111111111111111111'
);

/** Light CPI prefix (system program + PDAs) before tree accounts — required on devnet Helius too. */
function usesCanonicalLightRemainingAccounts(cluster?: SupportedCluster): boolean {
  return cluster === 'localnet' || cluster === 'devnet';
}

const LOCALNET_STATE_QUEUE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.stateQueue;
const LOCALNET_STATE_TREE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.stateTree;
const LOCALNET_ADDRESS_TREE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.addressTree;
const LOCALNET_ADDRESS_QUEUE_PUBKEY = LOCALNET_LIGHT_ACCOUNTS.addressQueue;

const HASH_TO_FIELD_SIZE_SEED = 0xff;
type RoleAwareRemainingAccount = RemainingAccountInput & {
  role?: string;
};

type MaybeNewPaymentAddressDecodeDebug = {
  used: boolean;
  llrb: boolean;
  descriptorOnly: boolean;
  directStructKeys: string[];
  firstValueRecordKeys: string[];
  payloadKind: string;
  seedFound: boolean;
  seedLength: number;
  nextIndex?: string;
  rootSeq?: string;
  address?: string;
  merkleTree?: string;
  tree?: string;
  usedPropagatedLightAddressSeed?: boolean;
  usedPropagatedLightAddressSeedBytes?: boolean;
};

type MaybeNewAddressDecodeDebug = {
  used: boolean;
  llrb: boolean;
  descriptorOnly: boolean;
  directStructKeys: string[];
  firstValueRecordKeys: string[];
  payloadKind: string;
  seedFound: boolean;
  seedLength: number;
  nextIndex?: string;
  rootSeq?: string;
  address?: string;
  merkleTree?: string;
  tree?: string;
  usedPropagatedLightAddressSeed?: boolean;
  usedPropagatedLightAddressSeedBytes?: boolean;
  rawAssignedToAccount?: boolean;
  rawAssignedAccountIndex?: number;
};

type PackedAddressTreeInfoDecodedDebug = {
  addressMerkleTreeIndex?: number;
  addressQueueIndex?: number;
  rootIndex?: number;
};

type MaybeNewPaymentAddressPackedDebug = {
  addressMerkleTreeIndex?: number;
  addressQueueIndex?: number;
  rootIndex?: number;
  assignedToAccount?: boolean;
  assignedAccountIndex?: number;
};

type MaybeNewAddressPackedDebug = {
  addressMerkleTreeIndex?: number;
  addressQueueIndex?: number;
  rootIndex?: number;
  assignedToAccount?: boolean;
  assignedAccountIndex?: number;
  rawAssignedToAccount?: boolean;
  rawAssignedAccountIndex?: number;
  forcedAssignedToAccount?: boolean;
  forcedAssignedAccountIndex?: number;
  assignedAccountIndexSource?: string;
};

type ResolvedCanonicalRegisterSeed = {
  preparedSeed: Buffer | null;
  planSeed: Buffer | null;
  maybeNewAddressSeed: Buffer | null;
  effectiveSeed: Buffer | null;
  effectiveSeedSource: 'maybeNewAddressSerialized' | 'propagatedLightAddressSeed' | 'none';
};

type RegisterDerivedAddressValidationResult = {
  recomputedFromMaybeNewAddressSeed: Uint8Array | null;
  recomputedFromPreparedSeed: Uint8Array | null;
  recomputedFromPlanSeed: Uint8Array | null;
  recomputedFromEffectiveSeed: Uint8Array | null;
  remainingAddressBytes: Uint8Array | null;
  preparedSeedMatchesMaybeNewAddress: boolean;
  planSeedMatchesMaybeNewAddress: boolean;
  effectiveSeedMatchesMaybeNewAddress: boolean;
  recomputedMatchesRemainingAddress: boolean;
  preparedSeedRecomputedMatchesRemainingAddress: boolean;
  planSeedRecomputedMatchesRemainingAddress: boolean;
  effectiveSeedRecomputedMatchesRemainingAddress: boolean;
};

let lastMaybeNewPaymentAddressDecodeDebug: MaybeNewPaymentAddressDecodeDebug = {
  used: false,
  llrb: false,
  descriptorOnly: false,
  directStructKeys: [],
  firstValueRecordKeys: [],
  payloadKind: 'none',
  seedFound: false,
  seedLength: 0,
  usedPropagatedLightAddressSeed: false,
  usedPropagatedLightAddressSeedBytes: false,
};

let lastMaybeNewAddressDecodeDebug: MaybeNewAddressDecodeDebug = {
  used: false,
  llrb: false,
  descriptorOnly: false,
  directStructKeys: [],
  firstValueRecordKeys: [],
  payloadKind: 'none',
  seedFound: false,
  seedLength: 0,
  usedPropagatedLightAddressSeed: false,
  usedPropagatedLightAddressSeedBytes: false,
};

let lastPackedAddressTreeInfoDecodedDebug: PackedAddressTreeInfoDecodedDebug = {};
let lastMaybeNewPaymentAddressPackedDebug: MaybeNewPaymentAddressPackedDebug = {};
let lastMaybeNewAddressPackedDebug: MaybeNewAddressPackedDebug = {};

function resetMaybeNewPaymentAddressDecodeDebug(): void {
  lastMaybeNewPaymentAddressDecodeDebug = {
    used: false,
    llrb: false,
    descriptorOnly: false,
    directStructKeys: [],
    firstValueRecordKeys: [],
    payloadKind: 'none',
    seedFound: false,
    seedLength: 0,
    usedPropagatedLightAddressSeed: false,
    usedPropagatedLightAddressSeedBytes: false,
  };
}

function resetMaybeNewAddressDecodeDebug(): void {
  lastMaybeNewAddressDecodeDebug = {
    used: false,
    llrb: false,
    descriptorOnly: false,
    directStructKeys: [],
    firstValueRecordKeys: [],
    payloadKind: 'none',
    seedFound: false,
    seedLength: 0,
    usedPropagatedLightAddressSeed: false,
    usedPropagatedLightAddressSeedBytes: false,
  };
}

function resetPackedAddressTreeInfoDecodedDebug(): void {
  lastPackedAddressTreeInfoDecodedDebug = {};
}

function resetMaybeNewPaymentAddressPackedDebug(): void {
  lastMaybeNewPaymentAddressPackedDebug = {};
}

function resetMaybeNewAddressPackedDebug(): void {
  lastMaybeNewAddressPackedDebug = {};
}

function updateMaybeNewPaymentAddressDecodeDebug(
  patch: Partial<MaybeNewPaymentAddressDecodeDebug>
): void {
  lastMaybeNewPaymentAddressDecodeDebug = {
    ...lastMaybeNewPaymentAddressDecodeDebug,
    ...patch,
  };
}

function updateMaybeNewAddressDecodeDebug(
  patch: Partial<MaybeNewAddressDecodeDebug>
): void {
  lastMaybeNewAddressDecodeDebug = {
    ...lastMaybeNewAddressDecodeDebug,
    ...patch,
  };
}

function updatePackedAddressTreeInfoDecodedDebug(
  patch: Partial<PackedAddressTreeInfoDecodedDebug>
): void {
  lastPackedAddressTreeInfoDecodedDebug = {
    ...lastPackedAddressTreeInfoDecodedDebug,
    ...patch,
  };
}

function updateMaybeNewPaymentAddressPackedDebug(
  patch: Partial<MaybeNewPaymentAddressPackedDebug>
): void {
  lastMaybeNewPaymentAddressPackedDebug = {
    ...lastMaybeNewPaymentAddressPackedDebug,
    ...patch,
  };
}

function updateMaybeNewAddressPackedDebug(
  patch: Partial<MaybeNewAddressPackedDebug>
): void {
  lastMaybeNewAddressPackedDebug = {
    ...lastMaybeNewAddressPackedDebug,
    ...patch,
  };
}

function previewUnknown(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `array(len=${value.length})`;
  if (isRecord(value)) return `object(keys=${Object.keys(value).join(',')})`;
  return String(value);
}

function bufferToHexPreview(
  value: Buffer | Uint8Array | null | undefined,
  maxBytes = 24
): string {
  if (!value) return 'n/a';
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buf.subarray(0, Math.min(buf.length, maxBytes)).toString('hex');
}

function summarizeIndexedRemainingAccounts(
  accounts: RemainingAccountInput[] | undefined
): string[] {
  if (!accounts || accounts.length === 0) {
    return ['(none)'];
  }

  return accounts.map((account, index) => {
    const role = String(pickPath(account, ['role']) ?? 'unknown');
    const pubkey = toPubkeyString(account.pubkey);
    return `${index}:${role}:${pubkey}:signer=${account.isSigner ? '1' : '0'}:writable=${
      account.isWritable ? '1' : '0'
    }`;
  });
}

function fromRegisterPlan(
  plan: Awaited<ReturnType<typeof buildRegisterStealthExecutionPlan>>
): RegisterStealthInstructionDraft {
  return {
    kind: 'register_stealth',
    buildable: plan.readyForInstructionBuild,
    executable: plan.readyForOnchainExecution,
    programId: plan.programId,
    accounts: plan.accounts,
    args: {
      outputTreeIndexInput: plan.args.outputTreeIndexInput,
      outputTreeIndexEffective: plan.args.outputTreeIndexEffective,
      nonce: plan.args.nonce,
      registeredAt: plan.args.registeredAt,
      transactionCount: plan.args.transactionCount,
      spendPublicKey: plan.args.spendPublicKey,
      viewPublicKey: plan.args.viewPublicKey,
      provisionalRegisterAddressSeed: plan.args.provisionalRegisterAddressSeed,
    },
    notes: plan.notes,
    missing: plan.missing,
  };
}

function fromSendPlan(
  plan: Awaited<ReturnType<typeof buildSendStealthExecutionPlan>>
): SendStealthInstructionDraft {
  return {
    kind: 'send_stealth',
    buildable: plan.readyForInstructionBuild,
    executable: plan.readyForOnchainExecution,
    programId: plan.programId,
    accounts: plan.accounts,
    args: {
      outputTreeIndexInput: plan.args.outputTreeIndexInput,
      outputTreeIndexEffective: plan.args.outputTreeIndexEffective,
      amount: plan.args.amount,
      senderHash: plan.args.senderHash,
      createdAt: plan.args.createdAt,
      claimed: plan.args.claimed,
      intendedClaimer: plan.args.intendedClaimer,
      ephemeralPublicKey: plan.args.ephemeralPublicKey,
      recipientSpendKey: plan.args.recipientSpendKey,
      recipientViewKey: plan.args.recipientViewKey,
      bump: plan.args.bump,
    },
    light: plan.light,
    notes: plan.notes,
    missing: plan.missing,
  };
}

function fromClaimPlan(
  plan: Awaited<ReturnType<typeof buildClaimStealthExecutionPlan>>
): ClaimStealthInstructionDraft {
  return {
    kind: 'claim_stealth',
    buildable: plan.readyForInstructionBuild,
    executable: plan.readyForOnchainExecution,
    programId: plan.programId,
    accounts: plan.accounts,
    args: plan.args,
    light: plan.light,
    notes: plan.notes,
    missing: plan.missing,
  };
}

async function buildRegisterStealthInstructionDraftLocal(params: {
  owner: PublicKey;
  outputTreeIndex?: number;
  cluster?: SupportedCluster;
}): Promise<RegisterStealthInstructionDraft> {
  const plan = await buildRegisterStealthExecutionPlan(params);
  return fromRegisterPlan(plan);
}

export async function buildSendStealthInstructionDraft(params: {
  sender: PublicKey;
  mint: PublicKey;
  amount: bigint;
  outputTreeIndex?: number;
  recipientSpendKey?: Uint8Array;
  recipientViewKey?: Uint8Array;
  intendedClaimer?: PublicKey | string;
  recipientBundle?: unknown;
  allowDebugRecipientGeneration?: boolean;
  cluster?: SupportedCluster;
}): Promise<SendStealthInstructionDraft> {
  const plan = await buildSendStealthExecutionPlan(params);
  return fromSendPlan(plan);
}

export async function buildClaimStealthInstructionDraft(params: {
  claimer: PublicKey;
  mint: PublicKey;
  cluster?: SupportedCluster;
  /** Gdy już wywołano prepareClaimStealthExecution — unikaj drugiego Photon discovery. */
  execution?: ClaimStealthExecution;
}): Promise<ClaimStealthInstructionDraft> {
  const plan = params.execution
    ? claimExecutionToPlan(params.execution, params.cluster)
    : await buildClaimStealthExecutionPlan(params);
  return fromClaimPlan(plan);
}

export type StealthInstructionDraft =
  | RegisterStealthInstructionDraft
  | SendStealthInstructionDraft
  | ClaimStealthInstructionDraft;

export function summarizeInstructionDraft(draft: StealthInstructionDraft): {
  summaryLines: string[];
} {
  const lines: string[] = [
    `kind: ${draft.kind}`,
    `buildable: ${draft.buildable ? 'tak' : 'nie'}`,
    `executable: ${draft.executable ? 'tak' : 'nie'}`,
    `programId: ${draft.programId}`,
  ];

  if (draft.kind === 'register_stealth') {
    lines.push(`owner: ${draft.accounts.owner}`);
    lines.push(
      `outputTreeIndex: ${String(draft.args.outputTreeIndexEffective ?? draft.args.outputTreeIndexInput)}`
    );
  } else if (draft.kind === 'send_stealth') {
    lines.push(`sender: ${draft.accounts.sender}`);
    lines.push(`mint: ${draft.accounts.mint}`);
    lines.push(`stealthAddress: ${draft.accounts.stealthAddress}`);
    lines.push(`stealthAuthority: ${draft.accounts.stealthAuthority}`);
    lines.push(`amount: ${draft.args.amount}`);
    lines.push(`light.proofReady: ${draft.light.proofReady ? 'tak' : 'nie'}`);
    lines.push(
      `light.addressTreeInfoReady: ${draft.light.addressTreeInfoReady ? 'tak' : 'nie'}`
    );
    lines.push(`light.newAddressReady: ${draft.light.newAddressReady ? 'tak' : 'nie'}`);
  } else {
    lines.push(`claimer: ${draft.accounts.claimer}`);
    lines.push(`mint: ${draft.accounts.mint}`);
    if (draft.accounts.stealthAddress) {
      lines.push(`stealthAddress: ${draft.accounts.stealthAddress}`);
    }
    lines.push(`light.proofReady: ${draft.light.proofReady ? 'tak' : 'nie'}`);
    lines.push(
      `light.claimerMetaReady: ${draft.light.claimerMetaReady ? 'tak' : 'nie'}`
    );
    lines.push(
      `light.paymentMetaReady: ${draft.light.paymentMetaReady ? 'tak' : 'nie'}`
    );
  }

  if (draft.missing.length > 0) {
    lines.push('Brakujące elementy draftu:');
    for (const item of draft.missing) {
      lines.push(`- ${item}`);
    }
  }

  if (draft.notes.length > 0) {
    lines.push('Notatki draftu:');
    for (const note of draft.notes) {
      lines.push(`- ${note}`);
    }
  }

  return { summaryLines: lines };
}

function failIfNotBuildable(kind: string, missing: string[]): never {
  const msg = [
    `Nie da się jeszcze zbudować instrukcji ${kind}.`,
    ...(missing.length ? ['Brakujące elementy:', ...missing.map((m) => `- ${m}`)] : []),
  ].join('\n');

  throw new Error(msg);
}

function requireDefined<T>(value: T | undefined | null, label: string): T {
  if (value == null) {
    throw new Error(`Brakuje wymaganego pola ${label}.`);
  }

  return value;
}

function collectLightProvenanceKinds(input: SerializedLightInputs): LightSerializationKind[] {
  const kinds = [
    input.provenance.proof.kind,
    input.provenance.addressTreeInfo?.kind,
    input.provenance.claimerMeta?.kind,
    input.provenance.paymentMeta?.kind,
    input.provenance.metaMeta?.kind ?? undefined,
    input.provenance.maybeNewAddress?.kind ?? undefined,
    input.provenance.maybeNewPaymentAddress?.kind ?? undefined,
  ].filter((item): item is LightSerializationKind => !!item);

  return Array.from(new Set(kinds));
}

function buildLightMetaSummaryLines(
  input: SerializedLightInputs,
  extraKinds: LightSerializationKind[] = []
): string[] {
  const kinds = Array.from(
    new Set<LightSerializationKind>([
      ...collectLightProvenanceKinds(input),
      ...extraKinds,
    ])
  );

  return [
    ...summarizeSerializedLightInputs(input),
    `lightProvenanceKinds: ${kinds.length > 0 ? kinds.join(', ') : 'n/a'}`,
    `lightCanonicalOnly: ${input.canonicalOnly ? 'tak' : 'nie'}`,
    `lightDebugOnly: ${input.debugOnly || extraKinds.length > 0 ? 'tak' : 'nie'}`,
  ];
}

function buildStealthInstructionResult(params: {
  instruction: import('@solana/web3.js').TransactionInstruction;
  summaryLines: string[];
  buildable: boolean;
  executable: boolean;
  lightInputs: SerializedLightInputs;
  extraKinds?: LightSerializationKind[];
}): BuiltStealthInstructionResult {
  const extraKinds = params.extraKinds ?? [];
  const lightProvenanceKinds = Array.from(
    new Set<LightSerializationKind>([
      ...collectLightProvenanceKinds(params.lightInputs),
      ...extraKinds,
    ])
  );

  const debugOnly = params.lightInputs.debugOnly || extraKinds.length > 0;
  const canonicalOnly = params.lightInputs.canonicalOnly && extraKinds.length === 0;

  return {
    instruction: params.instruction,
    buildable: params.buildable,
    executable: params.executable,
    canonicalOnly,
    debugOnly,
    lightProvenanceKinds,
    summaryLines: params.summaryLines,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickPath(root: unknown, path: Array<string | number>): unknown {
  let current: unknown = root;

  for (const key of path) {
    if (Array.isArray(current)) {
      const index =
        typeof key === 'number'
          ? key
          : /^\d+$/.test(String(key))
            ? Number(key)
            : NaN;

      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }

      current = current[index];
      continue;
    }

    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }

    current = current[key as keyof typeof current];
  }

  return current;
}

function toPubkeyString(pubkey: PublicKey | string): string {
  return typeof pubkey === 'string' ? pubkey : pubkey.toBase58();
}

function toPublicKey(pubkey: PublicKey | string): PublicKey {
  return typeof pubkey === 'string' ? new PublicKey(pubkey) : pubkey;
}

function normalizeRemainingAccount(
  account:
    | RemainingAccountInput
    | (RemainingAccountInput & { role?: string })
    | {
        pubkey: PublicKey;
        isSigner: boolean;
        isWritable: boolean;
        role?: string;
      }
): RoleAwareRemainingAccount {
  return {
    pubkey: account.pubkey,
    isSigner: account.isSigner,
    isWritable: account.isWritable,
    role: 'role' in account ? account.role : undefined,
  };
}

function fingerprintRemainingAccount(account: {
  pubkey: PublicKey | string;
  isSigner: boolean;
  isWritable: boolean;
}): string {
  return [
    toPubkeyString(account.pubkey),
    account.isSigner ? '1' : '0',
    account.isWritable ? '1' : '0',
  ].join('|');
}

function dedupeRemainingAccounts(
  remainingAccounts?: RemainingAccountInput[]
): RemainingAccountInput[] | undefined {
  if (!remainingAccounts || remainingAccounts.length === 0) {
    return undefined;
  }

  const normalized = (remainingAccounts as Array<RemainingAccountInput & { role?: string }>)
    .map((account) => normalizeRemainingAccount(account));

  const deduped: RoleAwareRemainingAccount[] = [];
  const seen = new Set<string>();

  for (const account of normalized) {
    const fp = fingerprintRemainingAccount(account);
    if (seen.has(fp)) {
      continue;
    }
    seen.add(fp);
    deduped.push(account);
  }

  return deduped as RemainingAccountInput[];
}

function findRemainingAccountByRole(
  remainingAccounts: RemainingAccountInput[] | undefined,
  desiredRole: string
): RoleAwareRemainingAccount | null {
  if (!remainingAccounts || remainingAccounts.length === 0) {
    return null;
  }

  for (const account of remainingAccounts as Array<RemainingAccountInput & { role?: string }>) {
    const normalized = normalizeRemainingAccount(account);
    if (normalized.role === desiredRole) {
      return normalized;
    }
  }

  return null;
}

function buildVerifierRegisterAddressAccounts(
  remainingAccounts?: RemainingAccountInput[]
): RemainingAccountInput[] | undefined {
  if (!remainingAccounts || remainingAccounts.length === 0) {
    return undefined;
  }

  const address = findRemainingAccountByRole(remainingAccounts, 'address');
  const merkleTree =
    findRemainingAccountByRole(remainingAccounts, 'merkle-tree') ??
    findRemainingAccountByRole(remainingAccounts, 'address-tree');
  const addressQueue = findRemainingAccountByRole(remainingAccounts, 'address-queue');

  const ordered: RemainingAccountInput[] = [];

  if (address) {
    ordered.push({
      pubkey: address.pubkey,
      isSigner: address.isSigner,
      isWritable: address.isWritable,
      role: 'address',
    } as RemainingAccountInput);
  }

  if (merkleTree) {
    ordered.push({
      pubkey: merkleTree.pubkey,
      isSigner: merkleTree.isSigner,
      isWritable: merkleTree.isWritable,
      role: 'merkle-tree',
    } as RemainingAccountInput);
  }

  if (addressQueue) {
    ordered.push({
      pubkey: addressQueue.pubkey,
      isSigner: addressQueue.isSigner,
      isWritable: addressQueue.isWritable,
      role: 'address-queue',
    } as RemainingAccountInput);
  }

  return ordered.length > 0 ? ordered : undefined;
}

function buildRegisterAddressContextRemainingAccounts(
  remainingAccounts?: RemainingAccountInput[]
): RemainingAccountInput[] | undefined {
  return buildVerifierRegisterAddressAccounts(remainingAccounts);
}

function buildVerifierSendAddressAccounts(
  remainingAccounts?: RemainingAccountInput[]
): RemainingAccountInput[] | undefined {
  if (!remainingAccounts || remainingAccounts.length === 0) {
    return undefined;
  }

  const merkleTree =
    findRemainingAccountByRole(remainingAccounts, 'merkle-tree') ??
    findRemainingAccountByRole(remainingAccounts, 'address-tree');

  const addressQueue = findRemainingAccountByRole(remainingAccounts, 'address-queue');

  const ordered: RemainingAccountInput[] = [];

  if (merkleTree) {
    ordered.push({
      pubkey: merkleTree.pubkey,
      isSigner: merkleTree.isSigner,
      isWritable: merkleTree.isWritable,
      role: 'merkle-tree',
    } as RemainingAccountInput);
  }

  if (addressQueue) {
    ordered.push({
      pubkey: addressQueue.pubkey,
      isSigner: addressQueue.isSigner,
      isWritable: addressQueue.isWritable,
      role: 'address-queue',
    } as RemainingAccountInput);
  }

  return ordered.length > 0 ? ordered : undefined;
}

function resolveCanonicalLocalnetStateQueuePubkey(
  remainingAccounts: RemainingAccountInput[] | undefined
): PublicKey {
  const explicit =
    findRemainingAccountByRole(remainingAccounts, 'state-queue') ??
    findRemainingAccountByRole(remainingAccounts, 'nullifier-queue');
  if (explicit) {
    const pubkey = toPublicKey(explicit.pubkey);
    if (!pubkey.equals(LOCALNET_STATE_QUEUE_PUBKEY)) {
      throw new Error(
        `localnet state-queue mismatch: expected=${LOCALNET_STATE_QUEUE_PUBKEY.toBase58()} actual=${pubkey.toBase58()}`
      );
    }
  }
  return LOCALNET_STATE_QUEUE_PUBKEY;
}

function resolveCanonicalLocalnetStateTreePubkey(
  remainingAccounts: RemainingAccountInput[] | undefined
): PublicKey {
  const explicit = findRemainingAccountByRole(remainingAccounts, 'state-tree');
  if (explicit) {
    const pubkey = toPublicKey(explicit.pubkey);
    if (!pubkey.equals(LOCALNET_STATE_TREE_PUBKEY)) {
      throw new Error(
        `localnet state-tree mismatch: expected=${LOCALNET_STATE_TREE_PUBKEY.toBase58()} actual=${pubkey.toBase58()}`
      );
    }
  }
  return LOCALNET_STATE_TREE_PUBKEY;
}

function resolveCanonicalLocalnetAddressTreePubkey(
  remainingAccounts: RemainingAccountInput[] | undefined
): PublicKey {
  const explicit =
    findRemainingAccountByRole(remainingAccounts, 'merkle-tree') ??
    findRemainingAccountByRole(remainingAccounts, 'address-tree');

  return explicit ? toPublicKey(explicit.pubkey) : LOCALNET_ADDRESS_TREE_PUBKEY;
}

function resolveCanonicalLocalnetAddressQueuePubkey(
  remainingAccounts: RemainingAccountInput[] | undefined
): PublicKey {
  const explicit = findRemainingAccountByRole(remainingAccounts, 'address-queue');
  return explicit ? toPublicKey(explicit.pubkey) : LOCALNET_ADDRESS_QUEUE_PUBKEY;
}

function resolveCanonicalLocalnetAddressPubkey(
  remainingAccounts: RemainingAccountInput[] | undefined
): PublicKey | null {
  const explicit = findRemainingAccountByRole(remainingAccounts, 'address');
  return explicit ? toPublicKey(explicit.pubkey) : null;
}

function buildCanonicalLocalnetRegisterRemainingAccounts(
  programId: PublicKey,
  remainingAccounts?: RemainingAccountInput[]
): RemainingAccountInput[] {
  const cpiAuthority = deriveStealthLightCpiSignerPda(programId);
  const stateQueuePubkey = resolveCanonicalLocalnetStateQueuePubkey(remainingAccounts);
  const stateTreePubkey = resolveCanonicalLocalnetStateTreePubkey(remainingAccounts);
  const addressTreePubkey = resolveCanonicalLocalnetAddressTreePubkey(remainingAccounts);
  const addressQueuePubkey = resolveCanonicalLocalnetAddressQueuePubkey(remainingAccounts);
  const addressPubkey = resolveCanonicalLocalnetAddressPubkey(remainingAccounts);

  const canonical: RoleAwareRemainingAccount[] = [
    { pubkey: LIGHT_SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false, role: 'light-system-program' },
    { pubkey: cpiAuthority, isSigner: false, isWritable: false, role: 'cpi-authority' },
    { pubkey: REGISTERED_PROGRAM_PDA, isSigner: false, isWritable: false, role: 'registered-program-pda' },
    { pubkey: ACCOUNT_COMPRESSION_AUTHORITY_PDA, isSigner: false, isWritable: false, role: 'compression-authority' },
    { pubkey: ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false, role: 'account-compression-program' },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false, role: 'system-program' },
    { pubkey: addressTreePubkey, isSigner: false, isWritable: true, role: 'merkle-tree' },
    { pubkey: addressQueuePubkey, isSigner: false, isWritable: true, role: 'address-queue' },
    { pubkey: stateQueuePubkey, isSigner: false, isWritable: true, role: 'state-queue' },
    { pubkey: stateTreePubkey, isSigner: false, isWritable: true, role: 'state-tree' },
    ...(addressPubkey
      ? [{ pubkey: addressPubkey, isSigner: false, isWritable: true, role: 'address' } as RoleAwareRemainingAccount]
      : []),
  ];

  const passthrough =
    (remainingAccounts as Array<RemainingAccountInput & { role?: string }> | undefined)
      ?.map((account) => normalizeRemainingAccount(account))
      .filter((account) => {
        const role = account.role ?? '';
        return ![
          'nullifier-queue',
          'state-queue',
          'state-tree',
          'merkle-tree',
          'address-tree',
          'address-queue',
          'address',
        ].includes(role);
      }) ?? [];

  return (
    dedupeRemainingAccounts([
      ...(canonical as RemainingAccountInput[]),
      ...(passthrough as RemainingAccountInput[]),
    ]) ?? []
  );
}

function buildCanonicalLocalnetSendRemainingAccounts(
  programId: PublicKey,
  remainingAccounts?: RemainingAccountInput[]
): RemainingAccountInput[] {
  const treeAccountsOnly =
    (remainingAccounts as Array<RemainingAccountInput & { role?: string }> | undefined)?.filter(
      (account) => account.role !== 'address'
    ) ?? undefined;

  const cpiAuthority = deriveStealthLightCpiSignerPda(programId);
  const stateQueuePubkey = resolveCanonicalLocalnetStateQueuePubkey(treeAccountsOnly);
  const stateTreePubkey = resolveCanonicalLocalnetStateTreePubkey(treeAccountsOnly);
  const addressTreePubkey = resolveCanonicalLocalnetAddressTreePubkey(treeAccountsOnly);
  const addressQueuePubkey = resolveCanonicalLocalnetAddressQueuePubkey(treeAccountsOnly);

  const canonical: RoleAwareRemainingAccount[] = [
    { pubkey: LIGHT_SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false, role: 'light-system-program' },
    { pubkey: cpiAuthority, isSigner: false, isWritable: false, role: 'cpi-authority' },
    { pubkey: REGISTERED_PROGRAM_PDA, isSigner: false, isWritable: false, role: 'registered-program-pda' },
    { pubkey: ACCOUNT_COMPRESSION_AUTHORITY_PDA, isSigner: false, isWritable: false, role: 'compression-authority' },
    { pubkey: ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false, role: 'account-compression-program' },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false, role: 'system-program' },
    { pubkey: addressTreePubkey, isSigner: false, isWritable: true, role: 'merkle-tree' },
    { pubkey: addressQueuePubkey, isSigner: false, isWritable: true, role: 'address-queue' },
    { pubkey: stateQueuePubkey, isSigner: false, isWritable: true, role: 'state-queue' },
    { pubkey: stateTreePubkey, isSigner: false, isWritable: true, role: 'state-tree' },
  ];

  const passthrough =
    treeAccountsOnly
      ?.map((account) => normalizeRemainingAccount(account))
      .filter((account) => {
        const role = account.role ?? '';
        return ![
          'nullifier-queue',
          'state-queue',
          'state-tree',
          'merkle-tree',
          'address-tree',
          'address-queue',
          'address',
        ].includes(role);
      }) ?? [];

  return (
    dedupeRemainingAccounts([
      ...(canonical as RemainingAccountInput[]),
      ...(passthrough as RemainingAccountInput[]),
    ]) ?? []
  );
}

/** Same tree-account spine as register/send; required for claim Light v2 CPI on localnet. */
export function buildCanonicalLocalnetClaimRemainingAccounts(
  programId: PublicKey,
  remainingAccounts?: RemainingAccountInput[]
): RemainingAccountInput[] {
  return buildCanonicalLocalnetSendRemainingAccounts(programId, remainingAccounts);
}

function buildRegisterProgramTreeAccounts(
  programId: PublicKey,
  resolvedRemainingAccounts?: RemainingAccountInput[]
): RemainingAccountInput[] | undefined {
  if (!resolvedRemainingAccounts || resolvedRemainingAccounts.length === 0) {
    return undefined;
  }

  const selfProgram =
    findRemainingAccountByRole(resolvedRemainingAccounts, 'self-program') ??
    ({ pubkey: programId, isSigner: false, isWritable: false, role: 'self-program' } as RoleAwareRemainingAccount);

  const systemProgram =
    findRemainingAccountByRole(resolvedRemainingAccounts, 'system-program') ??
    ({ pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false, role: 'system-program' } as RoleAwareRemainingAccount);

  const merkleTree =
    findRemainingAccountByRole(resolvedRemainingAccounts, 'merkle-tree') ??
    findRemainingAccountByRole(resolvedRemainingAccounts, 'address-tree');
  const addressQueue = findRemainingAccountByRole(resolvedRemainingAccounts, 'address-queue');
  const stateQueue =
    findRemainingAccountByRole(resolvedRemainingAccounts, 'state-queue') ??
    findRemainingAccountByRole(resolvedRemainingAccounts, 'nullifier-queue');
  const stateTree = findRemainingAccountByRole(resolvedRemainingAccounts, 'state-tree');
  const address = findRemainingAccountByRole(resolvedRemainingAccounts, 'address');

  const ordered = [
    selfProgram,
    systemProgram,
    merkleTree,
    addressQueue,
    stateQueue,
    stateTree,
    address,
  ].filter((item): item is RoleAwareRemainingAccount => !!item);

  return ordered.length > 0 ? (ordered as RemainingAccountInput[]) : undefined;
}

function toBuffer(
  input:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | null
    | undefined,
  label: string
): Buffer | null {
  if (input == null) return null;
  if (Buffer.isBuffer(input)) return Buffer.from(input);
  if (input instanceof Uint8Array || Array.isArray(input)) return Buffer.from(input);

  if (isRecord(input) && 'bytes' in input) {
    const bytes = (input as TaggedLightSerializationInput).bytes;
    if (Buffer.isBuffer(bytes)) return Buffer.from(bytes);
    if (bytes instanceof Uint8Array || Array.isArray(bytes)) return Buffer.from(bytes);
  }

  throw new Error(`${label} ma nieobsługiwany format wejścia.`);
}

function isLlrbBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0x4c &&
    buf[1] === 0x4c &&
    buf[2] === 0x52 &&
    buf[3] === 0x42
  );
}

function decodeLlrbEnvelope(
  input:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | null
    | undefined
): { label: string; payload: unknown } | null {
  const raw = toBuffer(input, 'LLRB');
  if (!raw || !isLlrbBuffer(raw)) return null;

  const decoded = decodeLiveLocalOpaqueEnvelopeFromBytes(raw);
  if (!decoded) {
    throw new Error('Nie udało się odczytać koperty LLRB (nagłówek uszkodzony).');
  }

  if (
    typeof decoded.payload === 'string' &&
    decoded.payload.trim().length > 0 &&
    !decoded.payload.trim().startsWith('{') &&
    !decoded.payload.trim().startsWith('[')
  ) {
    throw new Error(
      [
        `Nie udało się sparsować payloadu LLRB (${decoded.label}).`,
        'Odpowiedź Helius/Photon wygląda na surową listę bajtów zamiast JSON.',
        'Sprawdź klucz Helius (Ustawienia) i ponów przygotuj send_stealth.',
      ].join(' ')
    );
  }

  return decoded;
}

function requireNumberField(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} nie jest poprawną liczbą.`);
  }
  return value;
}

function requireBooleanField(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} nie jest poprawnym bool.`);
  }
  return value;
}

function isByteNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'number' &&
        Number.isFinite(item) &&
        item >= 0 &&
        item <= 255
    )
  );
}

function firstRecordFromUnknownArray(value: unknown): JsonRecord | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return isRecord(first) ? first : null;
}

function encodeU16LE(value: number, label: string): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${label} nie mieści się w u16.`);
  }

  const out = Buffer.alloc(2);
  out.writeUInt16LE(value, 0);
  return out;
}

function encodePackedAddressTreeInfo(args: {
  addressMerkleTreePubkeyIndex: number;
  addressQueuePubkeyIndex: number;
  rootIndex: number;
}): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt8(args.addressMerkleTreePubkeyIndex, 0);
  out.writeUInt8(args.addressQueuePubkeyIndex, 1);
  out.writeUInt16LE(args.rootIndex, 2);
  return out;
}

function findRemainingAccountIndex(
  remainingAccounts: RemainingAccountInput[] | undefined,
  desiredRole: string
): number | null {
  if (!remainingAccounts || remainingAccounts.length === 0) {
    return null;
  }

  for (let i = 0; i < remainingAccounts.length; i += 1) {
    const maybeRole = pickPath(remainingAccounts[i], ['role']);
    if (maybeRole === desiredRole) {
      return i;
    }
  }

  return null;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

function deriveLightLegacyAddressBytes(args: {
  seed: Uint8Array;
  addressTreePubkey: PublicKey;
}): Uint8Array {
  const payload = concatBytes([
    args.addressTreePubkey.toBytes(),
    Uint8Array.from(args.seed),
    Uint8Array.from([HASH_TO_FIELD_SIZE_SEED]),
  ]);

  const digest = Uint8Array.from(keccak_256(payload));
  digest[0] = 0;
  return digest;
}

function bytesEqual(
  a: Uint8Array | Buffer | null | undefined,
  b: Uint8Array | Buffer | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * SEND path still derives verifier/local indexes from actual remaining accounts.
 */
function decodePackedAddressTreeInfoCore(
  rawInput: Buffer | Uint8Array | number[] | TaggedLightSerializationInput,
  indexSpaceAccounts: RemainingAccountInput[] | undefined,
  labelPrefix: string
): Buffer {
  resetPackedAddressTreeInfoDecodedDebug();

  const raw = requireDefined(
    toBuffer(rawInput, `${labelPrefix}.addressTreeInfo`),
    `${labelPrefix}.addressTreeInfo`
  );

  const computedMerkleTreeIndex =
    findRemainingAccountIndex(indexSpaceAccounts, 'merkle-tree') ??
    findRemainingAccountIndex(indexSpaceAccounts, 'address-tree');

  const computedQueueIndex =
    findRemainingAccountIndex(indexSpaceAccounts, 'address-queue');

  const onlyOneRemaining = indexSpaceAccounts?.length === 1;

  const fallbackMerkleTreeIndex =
    computedMerkleTreeIndex ?? (onlyOneRemaining ? 0 : null);

  const fallbackQueueIndex =
    computedQueueIndex ?? (onlyOneRemaining ? 0 : null);

  if (!isLlrbBuffer(raw)) {
    if (raw.length === 4) {
      let addressMerkleTreeIndex = raw.readUInt8(0);
      let addressQueueIndex = raw.readUInt8(1);
      const rootIndex = raw.readUInt16LE(2);

      if (labelPrefix === 'register_stealth') {
        addressMerkleTreeIndex = requireDefined(
          fallbackMerkleTreeIndex,
          `${labelPrefix}.fallbackMerkleTreeIndex`
        );
        addressQueueIndex = requireDefined(
          fallbackQueueIndex,
          `${labelPrefix}.fallbackQueueIndex`
        );
      } else {
        if (fallbackMerkleTreeIndex == null) {
          throw new Error(
            `Brakuje index-space accounts z rolą "merkle-tree" / "address-tree" potrzebnego do ${labelPrefix}.PackedAddressTreeInfo.`
          );
        }

        if (fallbackQueueIndex == null) {
          throw new Error(
            `Brakuje index-space accounts z rolą "address-queue" potrzebnego do ${labelPrefix}.PackedAddressTreeInfo.`
          );
        }

        addressMerkleTreeIndex = fallbackMerkleTreeIndex;
        addressQueueIndex = fallbackQueueIndex;
      }

      const encoded = encodePackedAddressTreeInfo({
        addressMerkleTreePubkeyIndex: addressMerkleTreeIndex,
        addressQueuePubkeyIndex: addressQueueIndex,
        rootIndex,
      });

      updatePackedAddressTreeInfoDecodedDebug({
        addressMerkleTreeIndex: encoded.readUInt8(0),
        addressQueueIndex: encoded.readUInt8(1),
        rootIndex: encoded.readUInt16LE(2),
      });

      return encoded;
    }

    throw new Error(
      `${labelPrefix}.addressTreeInfo ma nieprawidłową długość ${raw.length}. Oczekiwano 4 albo LLRB.`
    );
  }

  const llrb = decodeLlrbEnvelope(raw);
  const directStruct = isRecord(llrb?.payload) ? llrb.payload : null;

  const directAddressMerkleTreePubkeyIndex =
    pickPath(directStruct, ['addressMerkleTreePubkeyIndex']) ??
    pickPath(directStruct, ['address_merkle_tree_pubkey_index']);

  const directAddressQueuePubkeyIndex =
    pickPath(directStruct, ['addressQueuePubkeyIndex']) ??
    pickPath(directStruct, ['address_queue_pubkey_index']);

  const directRootIndex =
    pickPath(directStruct, ['rootIndex']) ?? pickPath(directStruct, ['root_index']);

  if (
    directAddressMerkleTreePubkeyIndex != null &&
    directAddressQueuePubkeyIndex != null &&
    directRootIndex != null
  ) {
    let addressMerkleTreePubkeyIndex = requireNumberField(
      directAddressMerkleTreePubkeyIndex,
      `${labelPrefix}.addressTreeInfo.addressMerkleTreePubkeyIndex`
    );

    let addressQueuePubkeyIndex = requireNumberField(
      directAddressQueuePubkeyIndex,
      `${labelPrefix}.addressTreeInfo.addressQueuePubkeyIndex`
    );

    const rootIndex = requireNumberField(
      directRootIndex,
      `${labelPrefix}.addressTreeInfo.rootIndex`
    );

    if (labelPrefix === 'register_stealth') {
      addressMerkleTreePubkeyIndex = requireDefined(
        fallbackMerkleTreeIndex,
        `${labelPrefix}.fallbackMerkleTreeIndex`
      );
      addressQueuePubkeyIndex = requireDefined(
        fallbackQueueIndex,
        `${labelPrefix}.fallbackQueueIndex`
      );
    } else {
      if (fallbackMerkleTreeIndex == null) {
        throw new Error(
          `Brakuje index-space accounts z rolą "merkle-tree" / "address-tree" potrzebnego do ${labelPrefix}.PackedAddressTreeInfo.`
        );
      }

      if (fallbackQueueIndex == null) {
        throw new Error(
          `Brakuje index-space accounts z rolą "address-queue" potrzebnego do ${labelPrefix}.PackedAddressTreeInfo.`
        );
      }

      addressMerkleTreePubkeyIndex = fallbackMerkleTreeIndex;
      addressQueuePubkeyIndex = fallbackQueueIndex;
    }

    const encoded = encodePackedAddressTreeInfo({
      addressMerkleTreePubkeyIndex,
      addressQueuePubkeyIndex,
      rootIndex,
    });

    updatePackedAddressTreeInfoDecodedDebug({
      addressMerkleTreeIndex: encoded.readUInt8(0),
      addressQueueIndex: encoded.readUInt8(1),
      rootIndex: encoded.readUInt16LE(2),
    });

    return encoded;
  }

  const firstEntry =
    pickPath(llrb?.payload, ['value', 0]) ?? pickPath(llrb?.payload, ['value', '0']);

  const rootIndex =
    pickPath(firstEntry, ['rootIndex']) ??
    pickPath(firstEntry, ['root_index']) ??
    pickPath(firstEntry, ['rootSeq']);

  if (rootIndex == null) {
    throw new Error(`Nie udało się odczytać rootIndex/rootSeq z ${labelPrefix}.addressTreeInfo.`);
  }

  let addressMerkleTreePubkeyIndex: number;
  let addressQueuePubkeyIndex: number;

  if (labelPrefix === 'register_stealth') {
    addressMerkleTreePubkeyIndex = requireDefined(
      fallbackMerkleTreeIndex,
      `${labelPrefix}.fallbackMerkleTreeIndex`
    );
    addressQueuePubkeyIndex = requireDefined(
      fallbackQueueIndex,
      `${labelPrefix}.fallbackQueueIndex`
    );
  } else {
    if (fallbackMerkleTreeIndex == null) {
      throw new Error(
        `Brakuje index-space accounts z rolą "merkle-tree" / "address-tree" potrzebnego do ${labelPrefix}.PackedAddressTreeInfo.`
      );
    }

    if (fallbackQueueIndex == null) {
      throw new Error(
        `Brakuje index-space accounts z rolą "address-queue" potrzebnego do ${labelPrefix}.PackedAddressTreeInfo.`
      );
    }

    addressMerkleTreePubkeyIndex = fallbackMerkleTreeIndex;
    addressQueuePubkeyIndex = fallbackQueueIndex;
  }

  const encoded = encodePackedAddressTreeInfo({
    addressMerkleTreePubkeyIndex,
    addressQueuePubkeyIndex,
    rootIndex: requireNumberField(rootIndex, `${labelPrefix}.addressTreeInfo.rootIndex`),
  });

  updatePackedAddressTreeInfoDecodedDebug({
    addressMerkleTreeIndex: encoded.readUInt8(0),
    addressQueueIndex: encoded.readUInt8(1),
    rootIndex: encoded.readUInt16LE(2),
  });

  return encoded;
}

/**
 * REGISTER path must preserve canonical external serialized bytes.
 * Do NOT remap to verifier/local-space here.
 */
function decodePackedAddressTreeInfoCanonicalForRegister(
  input: Buffer | Uint8Array | number[] | TaggedLightSerializationInput
): Buffer {
  resetPackedAddressTreeInfoDecodedDebug();

  const raw = requireDefined(
    toBuffer(input, 'register_stealth.addressTreeInfo'),
    'register_stealth.addressTreeInfo'
  );

  if (raw.length !== 4) {
    throw new Error(
      `register_stealth.addressTreeInfo canonical payload must be 4 bytes, got ${raw.length}.`
    );
  }

  updatePackedAddressTreeInfoDecodedDebug({
    addressMerkleTreeIndex: raw.readUInt8(0),
    addressQueueIndex: raw.readUInt8(1),
    rootIndex: raw.readUInt16LE(2),
  });

  return Buffer.from(raw);
}

export function decodePackedAddressTreeInfoForRegisterFromTaggedInput(
  input: Buffer | Uint8Array | number[] | TaggedLightSerializationInput,
  verifierRegisterAddressAccounts: RemainingAccountInput[] | undefined
): {
  serialized: Buffer;
  decoded: {
    addressMerkleTreeIndex: number;
    addressQueueIndex: number;
    rootIndex: number;
  };
  source: string;
} {
  const raw = requireDefined(
    toBuffer(input, 'register_stealth.addressTreeInfo'),
    'register_stealth.addressTreeInfo'
  );

  const serialized = decodePackedAddressTreeInfoCore(
    raw,
    verifierRegisterAddressAccounts,
    'register_stealth'
  );

  return {
    serialized,
    decoded: {
      addressMerkleTreeIndex: serialized.readUInt8(0),
      addressQueueIndex: serialized.readUInt8(1),
      rootIndex: serialized.readUInt16LE(2),
    },
    source: isLlrbBuffer(raw) ? 'llrb-decoder' : 'raw-4b',
  };
}

function decodePackedAddressTreeInfoForSend(
  input: Buffer | Uint8Array | number[] | TaggedLightSerializationInput,
  verifierAddressAccounts: RemainingAccountInput[] | undefined
): Buffer {
  const decoded = decodePackedAddressTreeInfoCore(input, verifierAddressAccounts, 'send_stealth');
  return encodePackedAddressTreeInfo({
    addressMerkleTreePubkeyIndex: LIGHT_CANONICAL_EXTERNAL_INDEX.send.merkleTree,
    addressQueuePubkeyIndex: LIGHT_CANONICAL_EXTERNAL_INDEX.send.addressQueue,
    rootIndex: decoded.readUInt16LE(2),
  });
}

export function decodePackedAddressTreeInfoForSendFromTaggedInput(
  input: Buffer | Uint8Array | number[] | TaggedLightSerializationInput,
  verifierAddressAccounts: RemainingAccountInput[] | undefined
): {
  serialized: Buffer;
  decoded: {
    addressMerkleTreeIndex: number;
    addressQueueIndex: number;
    rootIndex: number;
  };
  source: string;
} {
  const raw = requireDefined(
    toBuffer(input, 'send_stealth.addressTreeInfo'),
    'send_stealth.addressTreeInfo'
  );
  const serialized = decodePackedAddressTreeInfoForSend(raw, verifierAddressAccounts);
  return {
    serialized,
    decoded: {
      addressMerkleTreeIndex: serialized.readUInt8(0),
      addressQueueIndex: serialized.readUInt8(1),
      rootIndex: serialized.readUInt16LE(2),
    },
    source: isLlrbBuffer(raw) ? 'llrb-decoder' : 'raw-4b',
  };
}

function encodeNewAddressParamsAssignedPackedPayload(args: {
  seed: Buffer;
  addressQueueAccountIndex: number;
  addressMerkleTreeAccountIndex: number;
  addressMerkleTreeRootIndex: number;
  assignedToAccount: boolean;
  assignedAccountIndex: number;
}): Buffer {
  if (args.seed.length !== 32) {
    throw new Error(`newAddress.seed musi mieć 32 bajty, ma ${args.seed.length}.`);
  }

  const packed = Buffer.concat([
    args.seed,
    Buffer.from([args.addressQueueAccountIndex]),
    Buffer.from([args.addressMerkleTreeAccountIndex]),
    encodeU16LE(
      args.addressMerkleTreeRootIndex,
      'newAddress.addressMerkleTreeRootIndex'
    ),
    Buffer.from([args.assignedToAccount ? 1 : 0]),
    Buffer.from([args.assignedAccountIndex]),
  ]);

  if (packed.length !== 38) {
    throw new Error(
      `Błąd wewnętrzny serializacji newAddress payload: oczekiwano 38 B, jest ${packed.length} B.`
    );
  }

  return packed;
}

function seed32FromCompactSeed(raw: Buffer): Buffer {
  if (raw.length === 32) return Buffer.from(raw);

  const seed = Buffer.alloc(32);
  raw.copy(seed, 0, 0, Math.min(raw.length, 32));
  return seed;
}

function pickPreferredSeedBuffer(
  lightAddressSeedBytes?: Uint8Array,
  lightAddressSeed?: Uint8Array
): Buffer | null {
  if (lightAddressSeedBytes && lightAddressSeedBytes.length > 0) {
    return seed32FromCompactSeed(Buffer.from(lightAddressSeedBytes));
  }

  if (lightAddressSeed && lightAddressSeed.length > 0) {
    return seed32FromCompactSeed(Buffer.from(lightAddressSeed));
  }

  return null;
}

function resolveCanonicalRegisterSeed(params: {
  preparedSeed?: Uint8Array | number[] | null;
  planSeed?: Uint8Array | number[] | null;
  lightAddressSeedBytes?: Uint8Array;
  lightAddressSeed?: Uint8Array;
  maybeNewAddressSerialized?: Buffer | null;
}): ResolvedCanonicalRegisterSeed {
  const preparedSeed =
    params.preparedSeed && params.preparedSeed.length > 0
      ? seed32FromCompactSeed(Buffer.from(params.preparedSeed))
      : null;

  const planSeed =
    params.planSeed && params.planSeed.length > 0
      ? seed32FromCompactSeed(Buffer.from(params.planSeed))
      : null;

  const maybeNewAddressSeed =
    params.maybeNewAddressSerialized && params.maybeNewAddressSerialized.length >= 32
      ? Buffer.from(params.maybeNewAddressSerialized.subarray(0, 32))
      : null;

  const propagatedPreferredSeed = pickPreferredSeedBuffer(
    params.lightAddressSeedBytes,
    params.lightAddressSeed
  );

  const effectiveSeed = maybeNewAddressSeed ?? propagatedPreferredSeed ?? null;

  const effectiveSeedSource: ResolvedCanonicalRegisterSeed['effectiveSeedSource'] =
    maybeNewAddressSeed
      ? 'maybeNewAddressSerialized'
      : propagatedPreferredSeed
        ? 'propagatedLightAddressSeed'
        : 'none';

  return {
    preparedSeed,
    planSeed,
    maybeNewAddressSeed,
    effectiveSeed,
    effectiveSeedSource,
  };
}

function validateRegisterDerivedAddress(params: {
  maybeNewAddressSeed: Buffer | null;
  preparedSeed: Buffer | null;
  planSeed: Buffer | null;
  effectiveSeed: Buffer | null;
  resolvedMerkleTreeAccount: RoleAwareRemainingAccount | null;
  resolvedAddressAccount: RoleAwareRemainingAccount | null;
}): RegisterDerivedAddressValidationResult {
  const remainingAddressBytes = params.resolvedAddressAccount
    ? toPublicKey(params.resolvedAddressAccount.pubkey).toBytes()
    : null;

  const recompute = (seed: Buffer | null): Uint8Array | null => {
    if (!seed || !params.resolvedMerkleTreeAccount) return null;
    return deriveLightLegacyAddressBytes({
      seed,
      addressTreePubkey: toPublicKey(params.resolvedMerkleTreeAccount.pubkey),
    });
  };

  const recomputedFromMaybeNewAddressSeed = recompute(params.maybeNewAddressSeed);
  const recomputedFromPreparedSeed = recompute(params.preparedSeed);
  const recomputedFromPlanSeed = recompute(params.planSeed);
  const recomputedFromEffectiveSeed = recompute(params.effectiveSeed);

  const preparedSeedMatchesMaybeNewAddress =
    params.preparedSeed != null && params.maybeNewAddressSeed != null
      ? bytesEqual(params.preparedSeed, params.maybeNewAddressSeed)
      : false;

  const planSeedMatchesMaybeNewAddress =
    params.planSeed != null && params.maybeNewAddressSeed != null
      ? bytesEqual(params.planSeed, params.maybeNewAddressSeed)
      : false;

  const effectiveSeedMatchesMaybeNewAddress =
    params.effectiveSeed != null && params.maybeNewAddressSeed != null
      ? bytesEqual(params.effectiveSeed, params.maybeNewAddressSeed)
      : false;

  const recomputedMatchesRemainingAddress =
    recomputedFromMaybeNewAddressSeed != null && remainingAddressBytes != null
      ? bytesEqual(recomputedFromMaybeNewAddressSeed, remainingAddressBytes)
      : false;

  const preparedSeedRecomputedMatchesRemainingAddress =
    recomputedFromPreparedSeed != null && remainingAddressBytes != null
      ? bytesEqual(recomputedFromPreparedSeed, remainingAddressBytes)
      : false;

  const planSeedRecomputedMatchesRemainingAddress =
    recomputedFromPlanSeed != null && remainingAddressBytes != null
      ? bytesEqual(recomputedFromPlanSeed, remainingAddressBytes)
      : false;

  const effectiveSeedRecomputedMatchesRemainingAddress =
    recomputedFromEffectiveSeed != null && remainingAddressBytes != null
      ? bytesEqual(recomputedFromEffectiveSeed, remainingAddressBytes)
      : false;

  return {
    recomputedFromMaybeNewAddressSeed,
    recomputedFromPreparedSeed,
    recomputedFromPlanSeed,
    recomputedFromEffectiveSeed,
    remainingAddressBytes,
    preparedSeedMatchesMaybeNewAddress,
    planSeedMatchesMaybeNewAddress,
    effectiveSeedMatchesMaybeNewAddress,
    recomputedMatchesRemainingAddress,
    preparedSeedRecomputedMatchesRemainingAddress,
    planSeedRecomputedMatchesRemainingAddress,
    effectiveSeedRecomputedMatchesRemainingAddress,
  };
}

function looksLikeDescriptorOnlyNewAddressPayload(
  directStruct: JsonRecord | null,
  firstValueRecord: JsonRecord | null,
  payloadValue: unknown
): boolean {
  const probeTargets = [directStruct, firstValueRecord, isRecord(payloadValue) ? payloadValue : null];

  for (const target of probeTargets) {
    if (!target) continue;

    const hasDescriptorShape =
      pickPath(target, ['address']) != null ||
      pickPath(target, ['root']) != null ||
      pickPath(target, ['proof']) != null ||
      pickPath(target, ['merkleTree']) != null ||
      pickPath(target, ['tree']) != null ||
      pickPath(target, ['nextIndex']) != null ||
      pickPath(target, ['rootSeq']) != null;

    if (hasDescriptorShape) return true;
  }

  if (Array.isArray(payloadValue) && firstValueRecord) {
    const hasDescriptorShape =
      pickPath(firstValueRecord, ['address']) != null ||
      pickPath(firstValueRecord, ['root']) != null ||
      pickPath(firstValueRecord, ['proof']) != null ||
      pickPath(firstValueRecord, ['merkleTree']) != null ||
      pickPath(firstValueRecord, ['tree']) != null ||
      pickPath(firstValueRecord, ['nextIndex']) != null ||
      pickPath(firstValueRecord, ['rootSeq']) != null;

    if (hasDescriptorShape) return true;
  }

  return false;
}

function decodeMaybeNewPaymentAddressForSend(
  input:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | null
    | undefined,
  verifierAddressAccounts: RemainingAccountInput[] | undefined,
  addressTreeInfoInput: Buffer | Uint8Array | number[] | TaggedLightSerializationInput,
  lightAddressSeed?: Uint8Array,
  lightAddressSeedBytes?: Uint8Array
): Buffer | null {
  resetMaybeNewPaymentAddressDecodeDebug();
  resetMaybeNewPaymentAddressPackedDebug();

  const raw = toBuffer(input, 'send_stealth.maybeNewPaymentAddress');
  if (raw == null) {
    updateMaybeNewPaymentAddressDecodeDebug({
      used: false,
      payloadKind: 'null',
    });
    return null;
  }

  updateMaybeNewPaymentAddressDecodeDebug({
    used: true,
    llrb: isLlrbBuffer(raw),
    payloadKind: isLlrbBuffer(raw) ? 'llrb' : `raw(${raw.length})`,
  });

  const packedAddressTreeInfo = decodePackedAddressTreeInfoForSend(
    addressTreeInfoInput,
    verifierAddressAccounts
  );

  const addressMerkleTreeAccountIndex = packedAddressTreeInfo.readUInt8(0);
  const addressQueueAccountIndex = packedAddressTreeInfo.readUInt8(1);
  const addressMerkleTreeRootIndex = packedAddressTreeInfo.readUInt16LE(2);

  updateMaybeNewPaymentAddressPackedDebug({
    addressMerkleTreeIndex: addressMerkleTreeAccountIndex,
    addressQueueIndex: addressQueueAccountIndex,
    rootIndex: addressMerkleTreeRootIndex,
  });

  if (!isLlrbBuffer(raw)) {
    if (raw.length === 1) {
      if (raw[0] === 0) return null;
      throw new Error(
        'send_stealth.maybeNewPaymentAddress ma 1-bajtowy payload różny od None-marker (0).'
      );
    }

    if (raw.length === 38) return raw;
    if (raw.length === 39 && raw[0] === 1) return raw.subarray(1);

    if (raw.length > 1 && raw.length <= 32) {
      updateMaybeNewPaymentAddressDecodeDebug({
        seedFound: true,
        seedLength: raw.length,
      });

      updateMaybeNewPaymentAddressPackedDebug({
        assignedToAccount: true,
        assignedAccountIndex: 0,
      });

      return encodeNewAddressParamsAssignedPackedPayload({
        seed: seed32FromCompactSeed(raw),
        addressQueueAccountIndex,
        addressMerkleTreeAccountIndex,
        addressMerkleTreeRootIndex,
        assignedToAccount: true,
        assignedAccountIndex: 0,
      });
    }

    throw new Error(
      `send_stealth.maybeNewPaymentAddress ma nieprawidłową długość ${raw.length}. Dozwolone wejścia lokalne: 0-marker, 38, 39 lub compact-seed.`
    );
  }

  const llrb = decodeLlrbEnvelope(raw);
  const directStruct = isRecord(llrb?.payload) ? llrb.payload : null;

  const payloadValue =
    pickPath(llrb?.payload, ['value']) ??
    pickPath(llrb?.payload, ['newAddress']) ??
    pickPath(llrb?.payload, ['newPaymentAddress']);

  const firstValueRecord =
    (isRecord(payloadValue) ? payloadValue : null) ?? firstRecordFromUnknownArray(payloadValue);

  const nestedNewAddress =
    pickPath(directStruct, ['newAddress']) ?? pickPath(directStruct, ['newPaymentAddress']);

  const nestedNewAddressRecord = isRecord(nestedNewAddress) ? nestedNewAddress : null;

  const seedValue =
    pickPath(directStruct, ['seed']) ??
    pickPath(nestedNewAddressRecord, ['seed']) ??
    pickPath(firstValueRecord, ['seed']) ??
    (isByteNumberArray(payloadValue) ? payloadValue : undefined);

  const descriptorOnly = looksLikeDescriptorOnlyNewAddressPayload(
    directStruct,
    firstValueRecord,
    payloadValue
  );

  const nextIndexValue =
    pickPath(directStruct, ['nextIndex']) ??
    pickPath(firstValueRecord, ['nextIndex']);

  updateMaybeNewPaymentAddressDecodeDebug({
    directStructKeys: directStruct ? Object.keys(directStruct).sort() : [],
    firstValueRecordKeys: firstValueRecord ? Object.keys(firstValueRecord).sort() : [],
    descriptorOnly,
    payloadKind: Array.isArray(payloadValue)
      ? `array(${payloadValue.length})`
      : isRecord(payloadValue)
        ? 'record'
        : typeof payloadValue,
    seedFound: isByteNumberArray(seedValue),
    seedLength: isByteNumberArray(seedValue) ? seedValue.length : 0,
    nextIndex: previewUnknown(nextIndexValue),
    rootSeq: previewUnknown(
      pickPath(directStruct, ['rootSeq']) ?? pickPath(firstValueRecord, ['rootSeq'])
    ),
    address: previewUnknown(
      pickPath(directStruct, ['address']) ?? pickPath(firstValueRecord, ['address'])
    ),
    merkleTree: previewUnknown(
      pickPath(directStruct, ['merkleTree']) ?? pickPath(firstValueRecord, ['merkleTree'])
    ),
    tree: previewUnknown(
      pickPath(directStruct, ['tree']) ?? pickPath(firstValueRecord, ['tree'])
    ),
  });

  if (!isByteNumberArray(seedValue)) {
    if (descriptorOnly) {
      const propagatedSeed = pickPreferredSeedBuffer(
        lightAddressSeedBytes,
        lightAddressSeed
      );

      updateMaybeNewPaymentAddressDecodeDebug({
        seedFound: !!propagatedSeed,
        seedLength: propagatedSeed?.length ?? 0,
        usedPropagatedLightAddressSeed: !(lightAddressSeedBytes && lightAddressSeedBytes.length > 0) && !!propagatedSeed,
        usedPropagatedLightAddressSeedBytes: !!lightAddressSeedBytes && lightAddressSeedBytes.length > 0,
      });

      if (!propagatedSeed) {
        throw new Error(
          'Descriptor-like maybeNewPaymentAddress nie zawiera seed, a lightAddressSeed/lightAddressSeedBytes nie został przekazany downstream.'
        );
      }

      updateMaybeNewPaymentAddressPackedDebug({
        assignedToAccount: true,
        assignedAccountIndex: 0,
      });

      return encodeNewAddressParamsAssignedPackedPayload({
        seed: propagatedSeed,
        addressQueueAccountIndex,
        addressMerkleTreeAccountIndex,
        addressMerkleTreeRootIndex,
        assignedToAccount: true,
        assignedAccountIndex: 0,
      });
    }

    throw new Error(
      'Nie udało się odczytać seed bytes z send_stealth.maybeNewPaymentAddress. LLRB payload nie zawiera seed ani rozpoznawalnego descriptor-like fallback.'
    );
  }

  const seed = seed32FromCompactSeed(Buffer.from(seedValue));

  const assignedToAccount =
    pickPath(directStruct, ['assignedToAccount']) ??
    pickPath(directStruct, ['assigned_to_account']) ??
    pickPath(firstValueRecord, ['assignedToAccount']) ??
    pickPath(firstValueRecord, ['assigned_to_account']) ??
    true;

  const assignedAccountIndex =
    pickPath(directStruct, ['assignedAccountIndex']) ??
    pickPath(directStruct, ['assigned_account_index']) ??
    pickPath(firstValueRecord, ['assignedAccountIndex']) ??
    pickPath(firstValueRecord, ['assigned_account_index']) ??
    0;

  updateMaybeNewPaymentAddressPackedDebug({
    assignedToAccount: requireBooleanField(
      assignedToAccount,
      'send_stealth.maybeNewPaymentAddress.assignedToAccount'
    ),
    assignedAccountIndex: requireNumberField(
      assignedAccountIndex,
      'send_stealth.maybeNewPaymentAddress.assignedAccountIndex'
    ),
  });

  return encodeNewAddressParamsAssignedPackedPayload({
    seed,
    addressQueueAccountIndex,
    addressMerkleTreeAccountIndex,
    addressMerkleTreeRootIndex,
    assignedToAccount: requireBooleanField(
      assignedToAccount,
      'send_stealth.maybeNewPaymentAddress.assignedToAccount'
    ),
    assignedAccountIndex: requireNumberField(
      assignedAccountIndex,
      'send_stealth.maybeNewPaymentAddress.assignedAccountIndex'
    ),
  });
}

function decodeRegisterMaybeNewAddressPackedRaw(
  raw: Buffer
): {
  seed: Buffer;
  addressMerkleTreeAccountIndex: number;
  addressQueueAccountIndex: number;
  addressMerkleTreeRootIndex: number;
  assignedToAccount: boolean;
  assignedAccountIndex: number;
} | null {
  if (raw.length !== 38) return null;

  return {
    seed: Buffer.from(raw.subarray(0, 32)),
    addressQueueAccountIndex: raw.readUInt8(32),
    addressMerkleTreeAccountIndex: raw.readUInt8(33),
    addressMerkleTreeRootIndex: raw.readUInt16LE(34),
    assignedToAccount: raw.readUInt8(36) === 1,
    assignedAccountIndex: raw.readUInt8(37),
  };
}

/**
 * REGISTER path must preserve canonical external serialized bytes.
 * For raw 38B canonical payload we return it as-is.
 * For compact seed / descriptor-like fallbacks we rebuild CANONICAL external payload,
 * not verifier/local payload.
 */
function decodeMaybeNewAddressForRegister(
  input:
    | Buffer
    | Uint8Array
    | number[]
    | TaggedLightSerializationInput
    | null
    | undefined,
  _verifierRegisterAddressAccounts: RemainingAccountInput[] | undefined,
  addressTreeInfoInput: Buffer | Uint8Array | number[] | TaggedLightSerializationInput,
  lightAddressSeed?: Uint8Array,
  lightAddressSeedBytes?: Uint8Array
): Buffer | null {
  resetMaybeNewAddressDecodeDebug();
  resetMaybeNewAddressPackedDebug();

  const raw = toBuffer(input, 'register_stealth.maybeNewAddress');
  if (raw == null) {
    updateMaybeNewAddressDecodeDebug({
      used: false,
      payloadKind: 'null',
    });
    return null;
  }

  updateMaybeNewAddressDecodeDebug({
    used: true,
    llrb: isLlrbBuffer(raw),
    payloadKind: isLlrbBuffer(raw) ? 'llrb' : `raw(${raw.length})`,
  });

  const canonicalPackedAddressTreeInfo = decodePackedAddressTreeInfoCanonicalForRegister(
    addressTreeInfoInput
  );

  const addressMerkleTreeAccountIndex = canonicalPackedAddressTreeInfo.readUInt8(0);
  const addressQueueAccountIndex = canonicalPackedAddressTreeInfo.readUInt8(1);
  const addressMerkleTreeRootIndex = canonicalPackedAddressTreeInfo.readUInt16LE(2);

  updateMaybeNewAddressPackedDebug({
    addressMerkleTreeIndex: addressMerkleTreeAccountIndex,
    addressQueueIndex: addressQueueAccountIndex,
    rootIndex: addressMerkleTreeRootIndex,
  });

  const forcedAssignedToAccount = REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT;
  const forcedAssignedAccountIndex = REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX;
  const assignedAccountIndexSource = 'canonical-assigned-register-flow';

  const repackCanonicalRegisterPayload = (seed: Buffer): Buffer => {
    updateMaybeNewAddressPackedDebug({
      addressMerkleTreeIndex: addressMerkleTreeAccountIndex,
      addressQueueIndex: addressQueueAccountIndex,
      rootIndex: addressMerkleTreeRootIndex,
      assignedToAccount: forcedAssignedToAccount,
      assignedAccountIndex: forcedAssignedAccountIndex,
      rawAssignedToAccount: undefined,
      rawAssignedAccountIndex: undefined,
      forcedAssignedToAccount,
      forcedAssignedAccountIndex,
      assignedAccountIndexSource,
    });

    return encodeNewAddressParamsAssignedPackedPayload({
      seed,
      addressQueueAccountIndex,
      addressMerkleTreeAccountIndex,
      addressMerkleTreeRootIndex,
      assignedToAccount: forcedAssignedToAccount,
      assignedAccountIndex: forcedAssignedAccountIndex,
    });
  };

  if (!isLlrbBuffer(raw)) {
    if (raw.length === 1) {
      if (raw[0] === 0) return null;

      throw new Error(
        'register_stealth.maybeNewAddress ma 1-bajtowy payload różny od None-marker (0).'
      );
    }

    if (raw.length === 38) {
      const decoded = decodeRegisterMaybeNewAddressPackedRaw(raw);
      if (!decoded) {
        throw new Error('Nie udało się zdekodować raw register maybeNewAddress(38).');
      }

      updateMaybeNewAddressDecodeDebug({
        rawAssignedToAccount: decoded.assignedToAccount,
        rawAssignedAccountIndex: decoded.assignedAccountIndex,
      });

      updateMaybeNewAddressPackedDebug({
        addressMerkleTreeIndex: decoded.addressMerkleTreeAccountIndex,
        addressQueueIndex: decoded.addressQueueAccountIndex,
        rootIndex: decoded.addressMerkleTreeRootIndex,
        assignedToAccount: decoded.assignedToAccount,
        assignedAccountIndex: decoded.assignedAccountIndex,
        rawAssignedToAccount: decoded.assignedToAccount,
        rawAssignedAccountIndex: decoded.assignedAccountIndex,
        forcedAssignedToAccount,
        forcedAssignedAccountIndex,
        assignedAccountIndexSource,
      });

      return Buffer.from(raw);
    }

    if (raw.length === 39 && raw[0] === 1) {
      const payload = raw.subarray(1);
      const decoded = decodeRegisterMaybeNewAddressPackedRaw(payload);
      if (!decoded) {
        throw new Error('Nie udało się zdekodować tagged register maybeNewAddress(39).');
      }

      updateMaybeNewAddressDecodeDebug({
        rawAssignedToAccount: decoded.assignedToAccount,
        rawAssignedAccountIndex: decoded.assignedAccountIndex,
      });

      updateMaybeNewAddressPackedDebug({
        addressMerkleTreeIndex: decoded.addressMerkleTreeAccountIndex,
        addressQueueIndex: decoded.addressQueueAccountIndex,
        rootIndex: decoded.addressMerkleTreeRootIndex,
        assignedToAccount: decoded.assignedToAccount,
        assignedAccountIndex: decoded.assignedAccountIndex,
        rawAssignedToAccount: decoded.assignedToAccount,
        rawAssignedAccountIndex: decoded.assignedAccountIndex,
        forcedAssignedToAccount,
        forcedAssignedAccountIndex,
        assignedAccountIndexSource,
      });

      return Buffer.from(payload);
    }

    if (raw.length > 1 && raw.length <= 32) {
      updateMaybeNewAddressDecodeDebug({
        seedFound: true,
        seedLength: raw.length,
      });

      return repackCanonicalRegisterPayload(seed32FromCompactSeed(raw));
    }

    throw new Error(
      `register_stealth.maybeNewAddress ma nieprawidłową długość ${raw.length}. Dozwolone wejścia lokalne: 0-marker, 38, 39 lub compact-seed.`
    );
  }

  const llrb = decodeLlrbEnvelope(raw);
  const directStruct = isRecord(llrb?.payload) ? llrb.payload : null;

  const payloadValue =
    pickPath(llrb?.payload, ['value']) ??
    pickPath(llrb?.payload, ['newAddress']) ??
    pickPath(llrb?.payload, ['newPaymentAddress']);

  const firstValueRecord =
    (isRecord(payloadValue) ? payloadValue : null) ?? firstRecordFromUnknownArray(payloadValue);

  const nestedNewAddress =
    pickPath(directStruct, ['newAddress']) ?? pickPath(directStruct, ['newPaymentAddress']);

  const nestedNewAddressRecord = isRecord(nestedNewAddress) ? nestedNewAddress : null;

  const seedValue =
    pickPath(directStruct, ['seed']) ??
    pickPath(nestedNewAddressRecord, ['seed']) ??
    pickPath(firstValueRecord, ['seed']) ??
    (isByteNumberArray(payloadValue) ? payloadValue : undefined);

  const descriptorOnly = looksLikeDescriptorOnlyNewAddressPayload(
    directStruct,
    firstValueRecord,
    payloadValue
  );

  const nextIndexValue =
    pickPath(directStruct, ['nextIndex']) ??
    pickPath(firstValueRecord, ['nextIndex']);

  const rawAssignedToAccount =
    pickPath(directStruct, ['assignedToAccount']) ??
    pickPath(directStruct, ['assigned_to_account']) ??
    pickPath(firstValueRecord, ['assignedToAccount']) ??
    pickPath(firstValueRecord, ['assigned_to_account']);

  const rawAssignedAccountIndex =
    pickPath(directStruct, ['assignedAccountIndex']) ??
    pickPath(directStruct, ['assigned_account_index']) ??
    pickPath(firstValueRecord, ['assignedAccountIndex']) ??
    pickPath(firstValueRecord, ['assigned_account_index']);

  updateMaybeNewAddressDecodeDebug({
    directStructKeys: directStruct ? Object.keys(directStruct).sort() : [],
    firstValueRecordKeys: firstValueRecord ? Object.keys(firstValueRecord).sort() : [],
    descriptorOnly,
    payloadKind: Array.isArray(payloadValue)
      ? `array(${payloadValue.length})`
      : isRecord(payloadValue)
        ? 'record'
        : typeof payloadValue,
    seedFound: isByteNumberArray(seedValue),
    seedLength: isByteNumberArray(seedValue) ? seedValue.length : 0,
    nextIndex: previewUnknown(nextIndexValue),
    rootSeq: previewUnknown(
      pickPath(directStruct, ['rootSeq']) ?? pickPath(firstValueRecord, ['rootSeq'])
    ),
    address: previewUnknown(
      pickPath(directStruct, ['address']) ?? pickPath(firstValueRecord, ['address'])
    ),
    merkleTree: previewUnknown(
      pickPath(directStruct, ['merkleTree']) ?? pickPath(firstValueRecord, ['merkleTree'])
    ),
    tree: previewUnknown(
      pickPath(directStruct, ['tree']) ?? pickPath(firstValueRecord, ['tree'])
    ),
    rawAssignedToAccount:
      typeof rawAssignedToAccount === 'boolean' ? rawAssignedToAccount : undefined,
    rawAssignedAccountIndex:
      typeof rawAssignedAccountIndex === 'number' ? rawAssignedAccountIndex : undefined,
  });

  if (!isByteNumberArray(seedValue)) {
    if (descriptorOnly) {
      const propagatedSeed = pickPreferredSeedBuffer(
        lightAddressSeedBytes,
        lightAddressSeed
      );

      updateMaybeNewAddressDecodeDebug({
        seedFound: !!propagatedSeed,
        seedLength: propagatedSeed?.length ?? 0,
        usedPropagatedLightAddressSeed: !(lightAddressSeedBytes && lightAddressSeedBytes.length > 0) && !!propagatedSeed,
        usedPropagatedLightAddressSeedBytes: !!lightAddressSeedBytes && lightAddressSeedBytes.length > 0,
      });

      if (!propagatedSeed) {
        throw new Error(
          'Descriptor-like maybeNewAddress nie zawiera seed, a lightAddressSeed/lightAddressSeedBytes nie został przekazany downstream.'
        );
      }

      return repackCanonicalRegisterPayload(propagatedSeed);
    }

    throw new Error(
      'Nie udało się odczytać seed bytes z register_stealth.maybeNewAddress. LLRB payload nie zawiera seed ani rozpoznawalnego descriptor-like fallback.'
    );
  }

  const seed = seed32FromCompactSeed(Buffer.from(seedValue));
  return repackCanonicalRegisterPayload(seed);
}

export async function createRegisterStealthInstruction(
  params: RegisterStealthInstructionFactoryParams
): Promise<BuiltStealthInstructionResult> {
  const draft = await buildRegisterStealthInstructionDraftLocal({
    owner: params.owner,
    outputTreeIndex: resolveStealthOutputTreeIndex({
      cluster: params.cluster,
      explicit: params.outputTreeIndex,
      flow: 'register',
    }),
    cluster: params.cluster,
  });

  if (!draft.buildable) {
    failIfNotBuildable('register_stealth', draft.missing);
  }

  const lightInputs = buildRegisterLightInputs({
    proof: params.proof,
    addressTreeInfo: params.addressTreeInfo,
    maybeNewAddress: params.maybeNewAddress ?? null,
    metaMeta: params.metaMeta ?? null,
  });

  const programId = getPierronStealthProgramId(params.cluster);

  const runtimeRemainingAccounts = dedupeRemainingAccounts(params.remainingAccounts);

  const resolvedRemainingAccounts = usesCanonicalLightRemainingAccounts(params.cluster)
      ? buildCanonicalLocalnetRegisterRemainingAccounts(programId, runtimeRemainingAccounts)
      : runtimeRemainingAccounts;

  const verifierRegisterAddressAccounts =
    buildVerifierRegisterAddressAccounts(resolvedRemainingAccounts) ??
    buildVerifierRegisterAddressAccounts(runtimeRemainingAccounts);

  const registerAddressContextRemainingAccounts =
    verifierRegisterAddressAccounts ??
    buildRegisterAddressContextRemainingAccounts(runtimeRemainingAccounts) ??
    buildRegisterAddressContextRemainingAccounts(resolvedRemainingAccounts);

  const registerProgramTreeAccounts =
    buildRegisterProgramTreeAccounts(programId, resolvedRemainingAccounts);

  const proofSerialized = Buffer.from(lightInputs.proofSerialized);

  // CRITICAL FIX:
  // preserve canonical external serialized bytes for register
  const addressTreeInfoSerialized = decodePackedAddressTreeInfoCanonicalForRegister(
    params.addressTreeInfo
  );

  const maybeNewAddressSerialized = decodeMaybeNewAddressForRegister(
    params.maybeNewAddress ?? null,
    verifierRegisterAddressAccounts,
    params.addressTreeInfo,
    params.lightAddressSeed,
    params.lightAddressSeedBytes
  );

  const forcedMetaMetaSerialized: Buffer | null = null;

  const initMetaOwner = new PublicKey('11111111111111111111111111111111');
  const initMetaNonce = 0n;
  const initMetaRegisteredAt = 0n;
  const initMetaTransactionCount = 0n;

  const runtimeRoles =
    (runtimeRemainingAccounts as Array<RemainingAccountInput & { role?: string }> | undefined)
      ?.map((account) => account.role ?? 'unknown')
      .join(', ') ?? 'none';

  const addressContextRoles =
    (registerAddressContextRemainingAccounts as Array<
      RemainingAccountInput & { role?: string }
    > | undefined)
      ?.map((account) => account.role ?? 'unknown')
      .join(', ') ?? 'none';

  const finalRoles =
    (resolvedRemainingAccounts as Array<RemainingAccountInput & { role?: string }> | undefined)
      ?.map((account) => account.role ?? 'unknown')
      .join(', ') ?? 'none';

  const verifierRoles =
    (verifierRegisterAddressAccounts as Array<
      RemainingAccountInput & { role?: string }
    > | undefined)
      ?.map((account) => account.role ?? 'unknown')
      .join(', ') ?? 'none';

  const programTreeRoles =
    (registerProgramTreeAccounts as Array<
      RemainingAccountInput & { role?: string }
    > | undefined)
      ?.map((account) => account.role ?? 'unknown')
      .join(', ') ?? 'none';

  const runtimeIndexed = summarizeIndexedRemainingAccounts(runtimeRemainingAccounts);
  const addressContextIndexed = summarizeIndexedRemainingAccounts(
    registerAddressContextRemainingAccounts
  );
  const finalIndexed = summarizeIndexedRemainingAccounts(resolvedRemainingAccounts);
  const verifierIndexed = summarizeIndexedRemainingAccounts(verifierRegisterAddressAccounts);
  const programTreeIndexed = summarizeIndexedRemainingAccounts(registerProgramTreeAccounts);

  const resolvedSeeds = resolveCanonicalRegisterSeed({
    preparedSeed: draft.args.provisionalRegisterAddressSeed,
    planSeed: draft.args.provisionalRegisterAddressSeed,
    lightAddressSeedBytes: params.lightAddressSeedBytes,
    lightAddressSeed: params.lightAddressSeed,
    maybeNewAddressSerialized,
  });

  const resolvedAddressAccount =
    findRemainingAccountByRole(resolvedRemainingAccounts, 'address');
  const resolvedMerkleTreeAccount =
    findRemainingAccountByRole(resolvedRemainingAccounts, 'merkle-tree') ??
    findRemainingAccountByRole(resolvedRemainingAccounts, 'address-tree');

  const derivedAddressValidation = validateRegisterDerivedAddress({
    maybeNewAddressSeed: resolvedSeeds.maybeNewAddressSeed,
    preparedSeed: resolvedSeeds.preparedSeed,
    planSeed: resolvedSeeds.planSeed,
    effectiveSeed: resolvedSeeds.effectiveSeed,
    resolvedMerkleTreeAccount,
    resolvedAddressAccount,
  });

  const effectiveRegisterOutputTreeIndex = resolveStealthOutputTreeIndex({
    cluster: params.cluster,
    explicit:
      params.outputTreeIndex ??
      draft.args.outputTreeIndexEffective ??
      draft.args.outputTreeIndexInput,
    flow: 'register',
  });

  const txParams: RegisterStealthTxParams = {
    programId: new PublicKey(draft.programId),
    user: new PublicKey(draft.accounts.owner),
    systemProgram: undefined,
    remainingAccounts: resolvedRemainingAccounts,
    proofSerialized,
    outputTreeIndex: effectiveRegisterOutputTreeIndex,
    metaAccount: {
      owner: initMetaOwner,
      nonce: initMetaNonce,
      registeredAt: initMetaRegisteredAt,
      transactionCount: initMetaTransactionCount,
    },
    keys: {
      spendPublicKey: draft.args.spendPublicKey,
      viewPublicKey: draft.args.viewPublicKey,
    },
    addressTreeInfoSerialized,
    metaMetaSerialized: forcedMetaMetaSerialized,
    maybeNewAddressSerialized,
  };

  const instruction = buildRegisterStealthTransactionInstruction(txParams);

  return buildStealthInstructionResult({
    instruction,
    buildable: draft.buildable,
    executable: draft.executable,
    lightInputs,
    summaryLines: [
      ...draft.notes,
      ...buildLightMetaSummaryLines(lightInputs),
      'registerMode: init_path_forced',
      'registerMetaMetaIgnored: tak',
      'registerIndexSource: canonical-external-serialized',
      'registerAssignedAccountIndexSource: canonical-assigned-register-flow',
      'registerDecodeContextSource: verifier-register-address-accounts',
      'registerDebugStageTarget: create_outputs',
      `registerForcedNewAddressAssignment: assignedToAccount=${
        REGISTER_CANONICAL_ASSIGNED_TO_ACCOUNT ? 'enabled' : 'disabled'
      } assignedAccountIndex=${REGISTER_CANONICAL_ASSIGNED_ACCOUNT_INDEX}`,
      'registerSeedPreference: maybeNewAddressSerialized > lightAddressSeedBytes > lightAddressSeed',
      `registerOutputTreeIndexDraft: ${draft.args.outputTreeIndexInput}`,
      `registerOutputTreeIndexInput: ${params.outputTreeIndex ?? 'n/a'}`,
      `registerOutputTreeIndexEffective: ${effectiveRegisterOutputTreeIndex}`,
      `registerOutputTreeIndexMode: explicit-or-plan-then-canonical-default`,
      `registerCanonicalExternalIndex.tree=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.merkleTree}`,
      `registerCanonicalExternalIndex.queue=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.addressQueue}`,
      `registerCanonicalExternalIndex.stateQueue=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateQueue}`,
      `registerCanonicalExternalIndex.stateTree=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateTree}`,
      `registerCanonicalExternalIndex.address=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.address}`,
      `lightAddressSeedLength: ${params.lightAddressSeed?.length ?? 0}`,
      `lightAddressSeedPreview: ${
        params.lightAddressSeed
          ? Array.from(params.lightAddressSeed).slice(0, 8).join(',')
          : 'n/a'
      }`,
      `lightAddressSeedBytesLength: ${params.lightAddressSeedBytes?.length ?? 0}`,
      `lightAddressSeedBytesPreview: ${
        params.lightAddressSeedBytes
          ? Array.from(params.lightAddressSeedBytes).slice(0, 8).join(',')
          : 'n/a'
      }`,
      `registerRemainingAccountsRuntimeCount: ${runtimeRemainingAccounts?.length ?? 0}`,
      `registerAddressContextCount: ${registerAddressContextRemainingAccounts?.length ?? 0}`,
      `registerProgramTreeAccountsCount: ${registerProgramTreeAccounts?.length ?? 0}`,
      `registerRemainingAccountsFinalCount: ${resolvedRemainingAccounts?.length ?? 0}`,
      `registerVerifierAddressAccountsCount: ${verifierRegisterAddressAccounts?.length ?? 0}`,
      `registerRemainingAccountsRuntimeRoles: ${runtimeRoles}`,
      `registerAddressContextRoles: ${addressContextRoles}`,
      `registerProgramTreeAccountsRoles: ${programTreeRoles}`,
      `registerRemainingAccountsFinalRoles: ${finalRoles}`,
      `registerVerifierAddressAccountsRoles: ${verifierRoles}`,
      'registerLightTechAccountsAttached: canonical-localnet-register-fixed',
      'registerAddressContextOrder: address,merkle-tree,address-queue',
      'registerVerifierAddressAccountsOrder: address,merkle-tree,address-queue',
      'registerProgramTreeAccountsOrder: self-program,system-program,merkle-tree,address-queue,state-queue,state-tree,address',
      `decodedProofSerialized: ${proofSerialized.length} B`,
      `decodedProofSerializedHexPreview: ${bufferToHexPreview(proofSerialized)}`,
      `decodedAddressTreeInfoSerialized: ${addressTreeInfoSerialized.length} B`,
      `decodedAddressTreeInfoSerializedHexPreview: ${bufferToHexPreview(addressTreeInfoSerialized)}`,
      'decodedMetaMetaSerialized: 0 B (forced null for init path)',
      `decodedMaybeNewAddressSerialized: ${maybeNewAddressSerialized?.length ?? 0} B`,
      `decodedMaybeNewAddressSerializedHexPreview: ${bufferToHexPreview(
        maybeNewAddressSerialized ?? null
      )}`,
      'registerStructuredValidityProofUsed: nie',
      'registerStructuredPackedAddressTreeInfoUsed: nie',
      'registerStructuredMaybeNewAddressUsed: nie',
      'registerSerializationSource: canonical-serialized-only',
      'registerStructuredPackedAddressTreeInfo.programLocalMerkleTreeIndex: n/a',
      'registerStructuredPackedAddressTreeInfo.programLocalQueueIndex: n/a',
      'registerStructuredMaybeNewAddress.programLocalMerkleTreeIndex: n/a',
      'registerStructuredMaybeNewAddress.programLocalQueueIndex: n/a',
      'registerStructuredMaybeNewAddress.assignedToAccount: n/a',
      'registerStructuredMaybeNewAddress.assignedAccountIndex: n/a',
      `packedAddressTreeInfoDecoded.addressMerkleTreeIndex: ${lastPackedAddressTreeInfoDecodedDebug.addressMerkleTreeIndex ?? -1}`,
      `packedAddressTreeInfoDecoded.addressQueueIndex: ${lastPackedAddressTreeInfoDecodedDebug.addressQueueIndex ?? -1}`,
      `packedAddressTreeInfoDecoded.rootIndex: ${lastPackedAddressTreeInfoDecodedDebug.rootIndex ?? -1}`,
      `maybeNewAddressDecoded.addressMerkleTreeIndex: ${lastMaybeNewAddressPackedDebug.addressMerkleTreeIndex ?? -1}`,
      `maybeNewAddressDecoded.addressQueueIndex: ${lastMaybeNewAddressPackedDebug.addressQueueIndex ?? -1}`,
      `maybeNewAddressDecoded.rootIndex: ${lastMaybeNewAddressPackedDebug.rootIndex ?? -1}`,
      `maybeNewAddressDecoded.assignedToAccount: ${
        lastMaybeNewAddressPackedDebug.assignedToAccount === undefined
          ? 'n/a'
          : lastMaybeNewAddressPackedDebug.assignedToAccount
            ? 'tak'
            : 'nie'
      }`,
      `maybeNewAddressDecoded.assignedAccountIndex: ${lastMaybeNewAddressPackedDebug.assignedAccountIndex ?? -1}`,
      `maybeNewAddressDecoded.forcedAssignedToAccount: ${
        lastMaybeNewAddressPackedDebug.forcedAssignedToAccount === undefined
          ? 'n/a'
          : lastMaybeNewAddressPackedDebug.forcedAssignedToAccount
            ? 'tak'
            : 'nie'
      }`,
      `maybeNewAddressDecoded.forcedAssignedAccountIndex: ${lastMaybeNewAddressPackedDebug.forcedAssignedAccountIndex ?? -1}`,
      `maybeNewAddressDecode.used: ${lastMaybeNewAddressDecodeDebug.used ? 'tak' : 'nie'}`,
      `maybeNewAddressDecode.llrb: ${lastMaybeNewAddressDecodeDebug.llrb ? 'tak' : 'nie'}`,
      `maybeNewAddressDecode.payloadKind: ${lastMaybeNewAddressDecodeDebug.payloadKind}`,
      `maybeNewAddressDecode.descriptorOnly: ${lastMaybeNewAddressDecodeDebug.descriptorOnly ? 'tak' : 'nie'}`,
      `maybeNewAddressDecode.seedFound: ${lastMaybeNewAddressDecodeDebug.seedFound ? 'tak' : 'nie'}`,
      `maybeNewAddressDecode.seedLength: ${lastMaybeNewAddressDecodeDebug.seedLength}`,
      `maybeNewAddressDecode.usedPropagatedLightAddressSeed: ${
        lastMaybeNewAddressDecodeDebug.usedPropagatedLightAddressSeed ? 'tak' : 'nie'
      }`,
      `maybeNewAddressDecode.usedPropagatedLightAddressSeedBytes: ${
        lastMaybeNewAddressDecodeDebug.usedPropagatedLightAddressSeedBytes ? 'tak' : 'nie'
      }`,
      `maybeNewAddressDecode.directStructKeys: ${
        lastMaybeNewAddressDecodeDebug.directStructKeys.join(',') || 'none'
      }`,
      `maybeNewAddressDecode.firstValueRecordKeys: ${
        lastMaybeNewAddressDecodeDebug.firstValueRecordKeys.join(',') || 'none'
      }`,
      `maybeNewAddressDecode.nextIndex: ${lastMaybeNewAddressDecodeDebug.nextIndex ?? 'n/a'}`,
      `maybeNewAddressDecode.rootSeq: ${lastMaybeNewAddressDecodeDebug.rootSeq ?? 'n/a'}`,
      `maybeNewAddressDecode.address: ${lastMaybeNewAddressDecodeDebug.address ?? 'n/a'}`,
      `maybeNewAddressDecode.merkleTree: ${lastMaybeNewAddressDecodeDebug.merkleTree ?? 'n/a'}`,
      `maybeNewAddressDecode.tree: ${lastMaybeNewAddressDecodeDebug.tree ?? 'n/a'}`,
      `registerEffectiveSeedSource: ${resolvedSeeds.effectiveSeedSource}`,
      `registerRuntimeIndexed[0]: ${runtimeIndexed[0] ?? '(none)'}`,
      `registerAddressContextIndexed[0]: ${addressContextIndexed[0] ?? '(none)'}`,
      `registerFinalIndexed[0]: ${finalIndexed[0] ?? '(none)'}`,
      `registerVerifierIndexed[0]: ${verifierIndexed[0] ?? '(none)'}`,
      `registerProgramTreeIndexed[0]: ${programTreeIndexed[0] ?? '(none)'}`,
      `instruction.keys: ${instruction.keys.length}`,
      `instruction.data: ${instruction.data.length} B`,
    ],
  });
}

export async function createSendStealthInstruction(
  params: SendStealthInstructionFactoryParams
): Promise<BuiltStealthInstructionResult> {
  const draft = await buildSendStealthInstructionDraft({
    sender: params.sender,
    mint: params.mint,
    amount: params.amount,
    outputTreeIndex: resolveStealthOutputTreeIndex({
      cluster: params.cluster,
      explicit: params.outputTreeIndex,
      flow: 'send',
    }),
    recipientSpendKey: params.recipientSpendKey,
    recipientViewKey: params.recipientViewKey,
    intendedClaimer: params.intendedClaimer,
    recipientBundle: params.recipientBundle,
    allowDebugRecipientGeneration: params.allowDebugRecipientGeneration,
    cluster: params.cluster,
  });

  if (!draft.buildable) {
    failIfNotBuildable('send_stealth', draft.missing);
  }

  const lightInputs = buildSendLightInputs({
    proof: params.proof,
    addressTreeInfo: params.addressTreeInfo,
    maybeNewPaymentAddress: params.maybeNewPaymentAddress ?? null,
  });

  const programId = getPierronStealthProgramId(params.cluster);

  const runtimeRemainingAccounts = dedupeRemainingAccounts(params.remainingAccounts);

  const resolvedRemainingAccounts = usesCanonicalLightRemainingAccounts(params.cluster)
      ? buildCanonicalLocalnetSendRemainingAccounts(programId, runtimeRemainingAccounts)
      : runtimeRemainingAccounts;

  const verifierSendAddressAccounts =
    buildVerifierSendAddressAccounts(resolvedRemainingAccounts) ??
    buildVerifierSendAddressAccounts(runtimeRemainingAccounts);

  const proofSerialized = lightInputs.proofSerialized;

  const addressTreeInfoSerialized = decodePackedAddressTreeInfoForSend(
    params.addressTreeInfo,
    verifierSendAddressAccounts
  );

  const maybeNewPaymentAddressSerialized = decodeMaybeNewPaymentAddressForSend(
    params.maybeNewPaymentAddress ?? null,
    verifierSendAddressAccounts,
    params.addressTreeInfo,
    params.lightAddressSeed,
    params.lightAddressSeedBytes
  );

  const stealthAuthority = deriveStealthAuthorityPda({
    programId,
    mint: params.mint,
  }).stealthAuthority;

  const resolvedStealthAddress =
    params.stealthAddress ?? new PublicKey(draft.accounts.stealthAddress);

  const resolvedRecipientSpendKey =
    params.recipientSpendKey ?? Uint8Array.from(draft.args.recipientSpendKey);

  const effectiveSendOutputTreeIndex = resolveStealthOutputTreeIndex({
    cluster: params.cluster,
    explicit:
      params.outputTreeIndex ??
      draft.args.outputTreeIndexEffective ??
      draft.args.outputTreeIndexInput,
    flow: 'send',
  });

  const txParams: SendStealthTxParams = {
    programId,
    sender: params.sender,
    mint: params.mint,
    senderToken: params.senderToken,
    stealthToken: params.stealthToken,
    stealthAuthority,
    tokenProgram: params.tokenProgram,
    systemProgram: undefined,
    remainingAccounts: resolvedRemainingAccounts,
    cluster: params.cluster,
    amount: params.amount,
    proofSerialized,
    validityProof: lightInputs.validityProofInput ?? undefined,
    addressTreeInfoSerialized,
    packedAddressTreeInfo: lightInputs.packedAddressTreeInfoInput ?? undefined,
    outputTreeIndex: effectiveSendOutputTreeIndex,
    recipientSpendKey: resolvedRecipientSpendKey,
    ephemeralKey: {
      ephemeralPublicKey: draft.args.ephemeralPublicKey,
    },
    paymentAccount: {
      stealthAddress: resolvedStealthAddress,
      amount: params.amount,
      createdAt: BigInt(draft.args.createdAt),
      claimed: draft.args.claimed,
      senderHash: BigInt(draft.args.senderHash),
      intendedClaimer: new PublicKey(draft.args.intendedClaimer),
    },
    maybeNewPaymentAddressSerialized,
    maybeNewPaymentAddress: lightInputs.maybeNewPaymentAddressInput ?? undefined,
  };

  const instruction = buildSendStealthTransactionInstruction(txParams);

  return buildStealthInstructionResult({
    instruction,
    buildable: draft.buildable,
    executable: draft.executable,
    lightInputs,
    summaryLines: [
      ...draft.notes,
      ...buildLightMetaSummaryLines(lightInputs),
      `sendCanonicalExternalIndex.tree=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.merkleTree}`,
      `sendCanonicalExternalIndex.queue=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.addressQueue}`,
      `sendCanonicalExternalIndex.stateQueue=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateQueue}`,
      `sendCanonicalExternalIndex.stateTree=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateTree}`,
      `sendCanonicalExternalIndex.address=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.address}`,
      `sendOutputTreeIndexDraft: ${draft.args.outputTreeIndexInput}`,
      `sendOutputTreeIndexInput: ${params.outputTreeIndex ?? 'n/a'}`,
      `sendOutputTreeIndexEffective: ${effectiveSendOutputTreeIndex}`,
      `sendOutputTreeIndexDefaultDevnetStateTree: ${LOCAL_SEND_OUTPUT_TREE_INDEX}`,
      `instruction.keys: ${instruction.keys.length}`,
      `instruction.data: ${instruction.data.length} B`,
    ],
  });
}

export async function createClaimStealthInstruction(
  params: ClaimStealthInstructionFactoryParams
): Promise<BuiltStealthInstructionResult> {
  const draft = await buildClaimStealthInstructionDraft({
    claimer: params.claimer,
    mint: params.mint,
    cluster: params.cluster,
  });

  if (!draft.buildable) {
    failIfNotBuildable('claim_stealth', draft.missing);
  }

  const lightInputs = buildClaimLightInputs({
    proof: params.proof,
    claimerMeta: params.claimerMeta,
    paymentMeta: params.paymentMeta,
  });

  const programId = getPierronStealthProgramId(params.cluster);

  const runtimeRemainingAccounts = dedupeRemainingAccounts(params.remainingAccounts);
  const resolvedRemainingAccounts = usesCanonicalLightRemainingAccounts(params.cluster)
      ? buildCanonicalLocalnetClaimRemainingAccounts(
          programId,
          runtimeRemainingAccounts
        )
      : runtimeRemainingAccounts;

  const escrow = deriveStealthAuthorityPda({
    programId,
    mint: params.mint,
  });
  const { claimVoucher } = deriveClaimVoucherPda({
    programId,
    claimer: params.claimer,
  });

  const txParams: ClaimStealthTxParams = {
    programId,
    claimer: params.claimer,
    mint: params.mint,
    stealthToken: params.stealthToken,
    claimerToken: params.claimerToken,
    stealthAuthority: escrow.stealthAuthority,
    tokenProgram: params.tokenProgram,
    claimVoucher,
    remainingAccounts: resolvedRemainingAccounts,
    cluster: params.cluster,
    proofSerialized: Buffer.from(lightInputs.proofSerialized),
    claimerMetaAccount: {
      owner: params.claimer,
      nonce: 0n,
      registeredAt: 0n,
      transactionCount: 0n,
    },
    claimerMetaSerialized: Buffer.from(lightInputs.claimerMetaSerialized),
    paymentAccount: {
      stealthAddress: params.claimer,
      amount: 0n,
      createdAt: 0n,
      claimed: false,
      senderHash: 0n,
      intendedClaimer: params.claimer,
    },
    paymentMetaSerialized: Buffer.from(lightInputs.paymentMetaSerialized),
    stealthAuthorityBump: escrow.bump,
  };

  const instruction = buildClaimStealthTransactionInstruction(txParams);
  const payoutInstruction = buildClaimStealthPayoutTransactionInstruction(txParams);

  return {
    ...buildStealthInstructionResult({
      instruction,
      buildable: draft.buildable,
      executable: draft.executable,
      lightInputs,
      summaryLines: [
        ...draft.notes,
        ...buildLightMetaSummaryLines(lightInputs),
        'claim: Light ix + claim_stealth_payout',
      ],
    }),
    followUpInstructions: [payoutInstruction],
  };
}
