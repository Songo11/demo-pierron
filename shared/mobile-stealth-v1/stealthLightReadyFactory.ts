import { PublicKey } from '@solana/web3.js';
import {
  type BuiltStealthInstructionResult,
  buildCanonicalLocalnetClaimRemainingAccounts,
  createRegisterStealthInstruction,
  createSendStealthInstruction,
  type RegisterStealthInstructionFactoryParams,
  type SendStealthInstructionFactoryParams,
} from './stealthTransactionFactory.ts';
import {
  buildClaimLightInputsFromBundle,
  buildRegisterLightInputsFromBundle,
  buildSendLightInputsFromBundle,
  optionalReadyLightValueInput,
  requireReadyCompressedMetaInput,
  requireReadyLightValueInput,
  summarizeMissingLightBundleParts,
} from './stealthLightAdapters.ts';
import type {
  ClaimLightBundle,
  LightSerializationKind,
  RegisterLightBundle,
  SendLightBundle,
} from '../light/lightClient.ts';
import {
  LIGHT_CANONICAL_EXTERNAL_INDEX,
  dedupeLightRemainingAccounts,
  isLightItemReady,
  type LightRemainingAccountMeta,
} from '../light/lightClient.ts';
import { resolveStealthOutputTreeIndex } from '../light/lightCanonicalConfig.ts';
import { ensureSendLightTreeRemainingAccounts } from '../light/registerRemainingAccounts.ts';
import { resolveClaimStealthAccountsFromPhoton } from '../light/claimStealthPhotonAccounts.ts';
import { refreshClaimLightBundleForSubmit } from '../light/refreshClaimBundle.ts';
import {
  getLightLocalRuntimeOverride,
  type PartialLightLocalRuntimeConfig,
} from '../light/lightLocalRuntime.ts';
import {
  buildClaimStealthPayoutTransactionInstruction,
  buildClaimStealthTransactionInstruction,
  deriveClaimVoucherPda,
  type ClaimStealthTxParams,
  type RemainingAccountInput,
} from './stealthTransactionInstructionBuilder.ts';
import {
  getPierronStealthProgramId,
  type SupportedCluster,
} from '../core/programIds.ts';
import { deriveStealthAuthorityPda } from '../stealth-base/stealthPda.ts';
import type { SerializedLightInputs } from './stealthLightSerialization.ts';
import { summarizeSerializedLightInputs } from './stealthLightSerialization.ts';

export type CreateRegisterStealthInstructionFromLightBundleParams = {
  owner: PublicKey;
  outputTreeIndex?: number;
  remainingAccounts?: RemainingAccountInput[];
  bundle: RegisterLightBundle;
  cluster?: SupportedCluster;
  stealthAddress?: PublicKey;
  lightAddressSeed?: Uint8Array;
  lightAddressSeedBytes?: Uint8Array;
};
export type CreateSendStealthInstructionFromLightBundleParams = {
  sender: PublicKey;
  mint: PublicKey;
  senderToken: PublicKey;
  stealthToken: PublicKey;
  tokenProgram: PublicKey;
  amount: bigint;
  outputTreeIndex?: number;
  remainingAccounts?: RemainingAccountInput[];
  bundle: SendLightBundle;
  cluster?: SupportedCluster;
  recipientSpendKey?: Uint8Array;
  recipientViewKey?: Uint8Array;
  /** Owner stealth meta odbiorcy — wymagany przy realnym send (wiąże claim). */
  intendedClaimer?: PublicKey | string;
  recipientBundle?: unknown;
  allowDebugRecipientGeneration?: boolean;
  stealthAddress?: PublicKey;
  lightAddressSeed?: Uint8Array;
};
export type CreateClaimStealthInstructionFromLightBundleParams = {
  claimer: PublicKey;
  mint: PublicKey;
  stealthToken: PublicKey;
  claimerToken: PublicKey;
  tokenProgram: PublicKey;
  remainingAccounts?: RemainingAccountInput[];
  bundle: ClaimLightBundle;
  cluster?: SupportedCluster;
  /** Meta then payment — do `getMultipleCompressedAccounts` gdy pojedyncze getCompressedAccount ma data:null. */
  claimValidityProofSourceHashes?: string[];
  lightRuntime?: PartialLightLocalRuntimeConfig;
  metaOwner?: PublicKey;
  stealthAddress?: PublicKey;
  claimerHintCompressedAddress?: PublicKey;
};

type RoleAwareRemainingAccount = RemainingAccountInput & {
  role?: string;
};

function failIfLightBundleIncomplete(params: {
  kind: 'register' | 'send' | 'claim';
  bundle: RegisterLightBundle | SendLightBundle | ClaimLightBundle;
}): void {
  const missing = summarizeMissingLightBundleParts({
    kind: params.kind,
    bundle: params.bundle,
  });
  if (missing.length > 0) {
    throw new Error(
      [
        `Bundle Light dla ${params.kind} nie jest kompletny.`,
        'Brakujące elementy:',
        ...missing.map((item) => `- ${item}`),
      ].join('\n')
    );
  }
}

function toPubkeyString(pubkey: PublicKey | string): string {
  return typeof pubkey === 'string' ? pubkey : pubkey.toBase58();
}

function normalizeRemainingAccount(
  account:
    | RoleAwareRemainingAccount
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
  bundleAccounts: Array<{
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
    role?: string;
  }>,
  extraAccounts?: RemainingAccountInput[]
): RemainingAccountInput[] | undefined {
  const merged: RoleAwareRemainingAccount[] = [
    ...bundleAccounts.map((account) => normalizeRemainingAccount(account)),
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

function findBundleAccountByRole(
  accounts: Array<{
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
    role?: string;
  }>,
  role: string
): PublicKey | undefined {
  return accounts.find((item) => item.role === role)?.pubkey;
}

function collectRemainingAccountRoles(
  accounts: Array<{
    role?: string;
  }> | undefined
): string[] {
  return (accounts ?? []).map((item) => item.role ?? 'unknown');
}

function ensureRequiredRoles(
  accounts: Array<{
    role?: string;
  }> | undefined,
  roles: string[],
  label: string
): void {
  const present = new Set(collectRemainingAccountRoles(accounts));
  const missing = roles.filter((role) => !present.has(role));

  if (missing.length > 0) {
    throw new Error(
      `${label}: missing required remaining account roles: ${missing.join(', ')}`
    );
  }
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
    `lightCanonicalOnly: ${input.canonicalOnly && extraKinds.length === 0 ? 'tak' : 'nie'}`,
    `lightDebugOnly: ${input.debugOnly || extraKinds.length > 0 ? 'tak' : 'nie'}`,
  ];
}

function buildCanonicalRegisterSummaryLines(
  mergedRemainingAccounts: RemainingAccountInput[] | undefined
): string[] {
  const roles = collectRemainingAccountRoles(mergedRemainingAccounts as RoleAwareRemainingAccount[]);

  return [
    `registerFactory.contract=canonical-register-flow`,
    `registerFactory.expected.treeIndex=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.merkleTree}`,
    `registerFactory.expected.queueIndex=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.addressQueue}`,
    `registerFactory.expected.stateQueueIndex=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateQueue}`,
    `registerFactory.expected.stateTreeIndex=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateTree}`,
    `registerFactory.expected.addressIndex=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.address}`,
    `registerFactory.remainingAccounts.roles=${roles.join(',') || 'none'}`,
  ];
}

function buildCanonicalSendSummaryLines(
  mergedRemainingAccounts: RemainingAccountInput[] | undefined
): string[] {
  const roles = collectRemainingAccountRoles(mergedRemainingAccounts as RoleAwareRemainingAccount[]);

  return [
    `sendFactory.contract=canonical-send-flow`,
    `sendFactory.expected.treeIndex=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.merkleTree}`,
    `sendFactory.expected.queueIndex=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.addressQueue}`,
    `sendFactory.expected.stateQueueIndex=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateQueue}`,
    `sendFactory.expected.stateTreeIndex=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateTree}`,
    `sendFactory.expected.addressIndex=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.address}`,
    `sendFactory.remainingAccounts.roles=${roles.join(',') || 'none'}`,
  ];
}

export async function createRegisterStealthInstructionFromLightBundle(
  params: CreateRegisterStealthInstructionFromLightBundleParams
): Promise<BuiltStealthInstructionResult> {
  failIfLightBundleIncomplete({
    kind: 'register',
    bundle: params.bundle,
  });

  const mergedRemainingAccounts = mergeRemainingAccounts(
    params.bundle.remainingAccounts,
    params.remainingAccounts
  );

  ensureRequiredRoles(
    mergedRemainingAccounts as RoleAwareRemainingAccount[] | undefined,
    ['merkle-tree', 'address-queue', 'state-queue', 'state-tree', 'address'],
    'createRegisterStealthInstructionFromLightBundle'
  );

  const bundleLightInputs = buildRegisterLightInputsFromBundle(params.bundle);

  const factoryParams: RegisterStealthInstructionFactoryParams = {
    owner: params.owner,
    outputTreeIndex: params.outputTreeIndex,
    remainingAccounts: mergedRemainingAccounts,
    cluster: params.cluster,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    lightAddressSeedBytes: params.lightAddressSeedBytes,
    proof: requireReadyLightValueInput('register.validityProof', params.bundle.validityProof),
    addressTreeInfo: requireReadyLightValueInput(
      'register.packedAddressTreeInfo',
      params.bundle.packedAddressTreeInfo
    ),
    maybeNewAddress: requireReadyLightValueInput('register.newAddress', params.bundle.newAddress),
    metaMeta: optionalReadyLightValueInput('register.metaMeta', params.bundle.metaMeta),
  };

  const built = await createRegisterStealthInstruction(factoryParams);

  return {
    ...built,
    summaryLines: [
      ...built.summaryLines,
      ...buildCanonicalRegisterSummaryLines(mergedRemainingAccounts),
      'sourceFlow: light_bundle',
      `bundleLightCanonicalOnly: ${bundleLightInputs.canonicalOnly ? 'tak' : 'nie'}`,
      `bundleLightDebugOnly: ${bundleLightInputs.debugOnly ? 'tak' : 'nie'}`,
    ],
  };
}

export async function createSendStealthInstructionFromLightBundle(
  params: CreateSendStealthInstructionFromLightBundleParams
): Promise<BuiltStealthInstructionResult> {
  failIfLightBundleIncomplete({
    kind: 'send',
    bundle: params.bundle,
  });

  let mergedRemainingAccounts = mergeRemainingAccounts(
    params.bundle.remainingAccounts,
    params.remainingAccounts
  );

  if (params.cluster === 'devnet' || params.cluster === 'localnet') {
    mergedRemainingAccounts = ensureSendLightTreeRemainingAccounts(
      dedupeLightRemainingAccounts(
        (mergedRemainingAccounts ?? []) as LightRemainingAccountMeta[]
      )
    ) as RemainingAccountInput[];
  }

  ensureRequiredRoles(
    mergedRemainingAccounts as RoleAwareRemainingAccount[] | undefined,
    ['merkle-tree', 'address-queue', 'state-queue', 'state-tree'],
    'createSendStealthInstructionFromLightBundle'
  );

  const bundleLightInputs = buildSendLightInputsFromBundle(params.bundle);

  const factoryParams: SendStealthInstructionFactoryParams = {
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
    remainingAccounts: mergedRemainingAccounts,
    cluster: params.cluster,
    recipientSpendKey: params.recipientSpendKey,
    recipientViewKey: params.recipientViewKey,
    intendedClaimer: params.intendedClaimer,
    recipientBundle: params.recipientBundle,
    allowDebugRecipientGeneration: params.allowDebugRecipientGeneration,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    proof: requireReadyLightValueInput('send.validityProof', params.bundle.validityProof),
    addressTreeInfo: requireReadyLightValueInput(
      'send.packedAddressTreeInfo',
      params.bundle.packedAddressTreeInfo
    ),
    maybeNewPaymentAddress: requireReadyLightValueInput(
      'send.newPaymentAddress',
      params.bundle.newPaymentAddress
    ),
  };

  const built = await createSendStealthInstruction(factoryParams);

  return {
    ...built,
    summaryLines: [
      ...built.summaryLines,
      ...buildCanonicalSendSummaryLines(mergedRemainingAccounts),
      'sourceFlow: light_bundle',
      `bundleLightCanonicalOnly: ${bundleLightInputs.canonicalOnly ? 'tak' : 'nie'}`,
      `bundleLightDebugOnly: ${bundleLightInputs.debugOnly ? 'tak' : 'nie'}`,
    ],
  };
}

export async function createClaimStealthInstructionFromLightBundle(
  params: CreateClaimStealthInstructionFromLightBundleParams
): Promise<BuiltStealthInstructionResult> {
  let bundle = params.bundle;
  if (
    params.claimValidityProofSourceHashes &&
    params.claimValidityProofSourceHashes.length >= 2
  ) {
    bundle = await refreshClaimLightBundleForSubmit({
      bundle: params.bundle,
      sourceHashes: params.claimValidityProofSourceHashes,
      runtime: params.lightRuntime ?? getLightLocalRuntimeOverride() ?? undefined,
      claimer: params.claimer,
      metaOwner: params.metaOwner,
      stealthAddress: params.stealthAddress,
      claimerHintCompressedAddress: params.claimerHintCompressedAddress,
    });
  }

  failIfLightBundleIncomplete({
    kind: 'claim',
    bundle,
  });

  const lightInputs = buildClaimLightInputsFromBundle(bundle);

  const mergedRemainingAccounts = mergeRemainingAccounts(
    bundle.remainingAccounts,
    params.remainingAccounts
  );
  const programId = getPierronStealthProgramId(params.cluster);
  const resolvedClaimRemaining =
    params.cluster === 'localnet' || params.cluster === 'devnet'
      ? buildCanonicalLocalnetClaimRemainingAccounts(
          programId,
          mergedRemainingAccounts as RemainingAccountInput[]
        )
      : mergedRemainingAccounts;
  const escrow = deriveStealthAuthorityPda({
    programId,
    mint: params.mint,
  });
  const metaOwner =
    params.metaOwner ??
    findBundleAccountByRole(bundle.remainingAccounts, 'meta-owner') ??
    params.claimer;
  const paymentLikeAddress =
    params.stealthAddress ??
    findBundleAccountByRole(bundle.remainingAccounts, 'payment') ??
    params.claimer;

  let claimerMetaAccount: ClaimStealthTxParams['claimerMetaAccount'] = {
    owner: metaOwner,
    nonce: 0n,
    registeredAt: 0n,
    transactionCount: 0n,
  };
  let paymentAccount: ClaimStealthTxParams['paymentAccount'] = {
    stealthAddress: paymentLikeAddress,
    amount: 0n,
    createdAt: 0n,
    claimed: false,
    senderHash: 0n,
    intendedClaimer: params.claimer,
  };

  const claimerPhoton =
    isLightItemReady(bundle.claimerMeta) && bundle.claimerMeta.photonPayload !== undefined
      ? bundle.claimerMeta.photonPayload
      : undefined;
  const paymentPhoton =
    isLightItemReady(bundle.paymentMeta) && bundle.paymentMeta.photonPayload !== undefined
      ? bundle.paymentMeta.photonPayload
      : undefined;

  const wantsDecoded = claimerPhoton !== undefined || paymentPhoton !== undefined;
  if (wantsDecoded) {
    if (claimerPhoton === undefined || paymentPhoton === undefined) {
      throw new Error(
        'Claim light bundle: dla dekodowania kont z Photon wymagane są photonPayload na claimerMeta i paymentMeta jednocześnie.'
      );
    }
    const resolved = await resolveClaimStealthAccountsFromPhoton({
      claimer: params.claimer,
      claimerPhoton,
      paymentPhoton,
      sourceHashes: params.claimValidityProofSourceHashes,
      stealthAddress: params.stealthAddress,
      metaOwner: params.metaOwner,
      runtime: params.lightRuntime ?? getLightLocalRuntimeOverride() ?? undefined,
    });
    if (!resolved) {
      throw new Error(
        [
          'Claim light bundle: Photon jeszcze nie zwraca pełnych danych leaf (StealthMeta / StealthPayment) — często data:null zaraz po indeksacji.',
          'Poczekaj 30–90 s i naciśnij „Odbierz stealth on-chain” ponownie (bez nowego Send).',
          'Jeśli wraca: na Sony zrób nowy Send OK → świeże powiadomienie ze seedem → wklej na Samsungu.',
        ].join(' ')
      );
    }
    if (
      params.stealthAddress &&
      !resolved.payment.stealthAddress.equals(params.stealthAddress)
    ) {
      throw new Error(
        `Claim: leaf płatności (${resolved.payment.stealthAddress.toBase58()}) nie pasuje do oczekiwanego adresu (${params.stealthAddress.toBase58()}). ` +
          'Wklej powiadomienie po Send OK z Sony lub poczekaj na indeks Photon.'
      );
    }
    claimerMetaAccount = resolved.meta;
    paymentAccount = resolved.payment;
  }

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
    remainingAccounts: resolvedClaimRemaining,
    proofSerialized: lightInputs.proofSerialized,
    claimerMetaAccount,
    claimerMetaSerialized: lightInputs.claimerMetaSerialized,
    paymentAccount,
    paymentMetaSerialized: lightInputs.paymentMetaSerialized,
    stealthAuthorityBump: escrow.bump,
    cluster: params.cluster,
  };

  const instruction = buildClaimStealthTransactionInstruction(txParams);
  const payoutInstruction = buildClaimStealthPayoutTransactionInstruction(txParams);

  return {
    instruction,
    followUpInstructions: [payoutInstruction],
    buildable: true,
    executable: true,
    canonicalOnly: false,
    debugOnly: false,
    lightProvenanceKinds: collectLightProvenanceKinds(lightInputs),
    summaryLines: [
      'claim: Light ix + claim_stealth_payout (osobny heap BPF)',
      `claimVoucher: ${claimVoucher.toBase58()}`,
      'sourceFlow: light_bundle',
      ...buildLightMetaSummaryLines(lightInputs),
      `instruction.keys: ${instruction.keys.length}`,
      `instruction.data: ${instruction.data.length} B`,
    ],
  };
}
