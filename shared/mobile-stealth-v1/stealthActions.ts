import { Connection, PublicKey } from '@solana/web3.js';

import {
  buildRegisterStealthPayload,
  buildSendStealthPayload,
  serializeEphemeralKey,
  serializeStealthMetaAccount,
  serializeStealthPaymentAccount,
  serializeStealthKeys,
  type SendRecipientMode,
} from '../stealth-base/stealthPayloads.ts';
import { deriveStealthAuthorityPda } from '../stealth-base/stealthPda.ts';
import {
  getCurrentCluster,
  getPierronStealthProgramId,
  type SupportedCluster,
} from '../core/programIds.ts';
import type { ClaimLightBundle } from '../light/lightClient.ts';
import {
  LIGHT_CANONICAL_EXTERNAL_INDEX,
} from '../light/lightClient.ts';
import { resolveStealthOutputTreeIndex } from '../light/lightCanonicalConfig.ts';
import { resolveIndexedSendPaymentAddress } from '../light/claimLightDiscovery.ts';
import {
  buildClaimStealthProverInput,
  buildSendStealthProverInputFromPayload,
  summarizeClaimStealthProverInput,
  summarizeSendStealthProverInput,
} from './stealthProver.ts';
import {
  sendClaimStealthWithLight,
  sendSendStealthWithLight,
  simulateClaimStealthWithLight,
  simulateSendStealthWithLight,
} from './stealthLightOrchestrator.ts';
import type {
  RunInstructionResult,
  StealthWalletExecutor,
} from './stealthTransactionRunner.ts';
import type { RemainingAccountInput } from './stealthTransactionInstructionBuilder.ts';
import {
  normalizePrepareSendStealthExecutionInput,
  type FlexibleSendExecutionInput,
} from './sendExecutionInputResolver.ts';

export type RegisterStealthExecution = {
  kind: 'register_stealth';
  contract: 'canonical-register-flow';
  ready: {
    local: boolean;
    onchain: boolean;
  };
  payload: {
    outputTreeIndex: number;
    owner: string;
    nonce: string;
    registeredAt: string;
    transactionCount: string;
    spendPublicKey: number[];
    viewPublicKey: number[];
    viewSecretKey: number[];
    stealthAddress: string;
    lightAddressSeed: number[];
    lightAddressSeedBytes: number[];

    /**
     * IMPORTANT:
     * This is NOT the final canonical seed for on-chain register execution.
     * It is only a local/provisional seed (useful for UX/debug).
     *
     * Final canonical seed should come from Light bundle:
     * maybeNewAddress.value[0..32] (or equivalent canonical source).
     */
    provisionalRegisterAddressSeed: number[];

    lightAddressTree: string;
    lightAddressQueue: string;
  };
  indexContract: {
    canonicalExternal: {
      merkleTree: number;
      addressQueue: number;
      stateQueue: number;
      stateTree: number;
      address: number;
    };
  };
  notes: string[];
};

export type SendStealthExecution = {
  kind: 'send_stealth';
  contract: 'canonical-send-flow';
  ready: {
    local: boolean;
    onchain: boolean;
  };
  payload: {
    sender: string;
    mint: string;
    amount: string;
    outputTreeIndex: number;
    recipientMode: SendRecipientMode;
    stealthAddress: string;
    /** Lokalny adres z prepare — do debugu gdy różni się od stealthAddress. */
    preparedStealthAddress?: string;
    lightAddressSeed: number[];
    lightAddressSeedBytes: number[];
    canonicalLightAddressSeed: number[];
    lightAddressTree: string;
    lightAddressQueue: string;
    paymentAccount: {
      stealthAddress: string;
      amount: string;
      createdAt: string;
      claimed: boolean;
      senderHash: string;
      intendedClaimer: string;
    };
    ephemeralPublicKey: number[];
    recipientSpendKey: number[];
    recipientViewKey: number[];
  };
  escrow: {
    stealthAuthority: string;
    bump: number;
  };
  indexContract: {
    canonicalExternal: {
      merkleTree: number;
      addressQueue: number;
      stateQueue: number;
      stateTree: number;
      address: number;
    };
  };
  proof: {
    proofReady: boolean;
    addressTreeInfoReady: boolean;
    newAddressReady: boolean;
  };
  notes: string[];
  missing: string[];
};

export type ClaimExecutionSource =
  | 'legacy_local_state'
  | 'explicit_target'
  | 'light_bundle';

export type ClaimStealthExecution = {
  kind: 'claim_stealth';
  contract: 'claim-flow';
  ready: {
    local: boolean;
    onchain: boolean;
  };
  localData: {
    source: ClaimExecutionSource;
    claimer: string;
    mint: string;
    metaPresent: boolean;
    paymentPresent: boolean;
    claimTargetResolved: boolean;
    metaOwner?: string;
    metaNonce?: string;
    claimableStealthAddress?: string;
    claimableAmount?: string;
    recipientMode?: SendRecipientMode;
  };
  claimerMetaAccount?: {
    owner: string;
    nonce: string;
    registeredAt: string;
    transactionCount: string;
  };
  paymentAccount?: {
    stealthAddress: string;
    amount: string;
    createdAt: string;
    claimed: boolean;
    senderHash: string;
    intendedClaimer: string;
  };
  escrow?: {
    stealthAuthority: string;
    bump: number;
  };
  proof: {
    proofReady: boolean;
    claimerMetaReady: boolean;
    paymentMetaReady: boolean;
    remainingAccountsReady: boolean;
    stealthAuthorityBumpReady: boolean;
  };
  notes: string[];
  missing: string[];
};

export type PrepareSendStealthExecutionParams = FlexibleSendExecutionInput;

function pushMissing(target: string[], label: string, ready: boolean) {
  if (!ready) {
    target.push(label);
  }
}

function resolveCluster(cluster?: SupportedCluster): SupportedCluster {
  return cluster ?? getCurrentCluster();
}

function normalizeNumberishString(
  value: bigint | number | string | undefined,
  fallback: string
): string {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function pickCanonicalLightSeed(params: {
  lightAddressSeed?: Uint8Array;
  lightAddressSeedBytes?: Uint8Array;
}): Uint8Array {
  const preferred =
    params.lightAddressSeedBytes && params.lightAddressSeedBytes.length === 32
      ? params.lightAddressSeedBytes
      : params.lightAddressSeed && params.lightAddressSeed.length === 32
        ? params.lightAddressSeed
        : params.lightAddressSeedBytes ??
          params.lightAddressSeed ??
          new Uint8Array();

  return Uint8Array.from(preferred);
}

export async function prepareRegisterStealthExecution(params: {
  owner: PublicKey;
  outputTreeIndex?: number;
  cluster?: SupportedCluster;
}): Promise<RegisterStealthExecution> {
  const cluster = resolveCluster(params.cluster);
  const programId = getPierronStealthProgramId(cluster);
  const outputTreeIndex = resolveStealthOutputTreeIndex({
    cluster,
    explicit: params.outputTreeIndex,
    flow: 'register',
  });

  const payload = buildRegisterStealthPayload({
    owner: params.owner,
    programId,
    outputTreeIndex,
    cluster,
  });

  const metaSerialized = serializeStealthMetaAccount(payload.metaAccount);
  const keysSerialized = serializeStealthKeys(payload.keys);

  /**
   * Important:
   * In register flow, the true canonical seed may later come from live
   * Light maybeNewAddress.seed (maybeNewAddress.value[0..32]) rather than from
   * this local provisional payload.
   *
   * So here we expose ONLY the local/provisional seed for UX/debug,
   * but we do NOT claim it is the final canonical seed source.
   */
  const provisionalRegisterAddressSeed = pickCanonicalLightSeed({
    lightAddressSeed: payload.lightAddressSeed,
    lightAddressSeedBytes: payload.lightAddressSeedBytes,
  });

  return {
    kind: 'register_stealth',
    contract: 'canonical-register-flow',
    ready: {
      local: true,
      onchain: false,
    },
    payload: {
      outputTreeIndex: payload.outputTreeIndex,
      owner: metaSerialized.owner.toBase58(),
      nonce: String(metaSerialized.nonce),
      registeredAt: String(metaSerialized.registered_at),
      transactionCount: String(metaSerialized.transaction_count),
      spendPublicKey: keysSerialized.spend_public_key,
      viewPublicKey: keysSerialized.view_public_key,
      viewSecretKey: Array.from(payload.keys.viewSecretKey),
      stealthAddress: payload.stealthAddress.toBase58(),
      lightAddressSeed: Array.from(payload.lightAddressSeed),
      lightAddressSeedBytes: Array.from(payload.lightAddressSeedBytes),
      provisionalRegisterAddressSeed: Array.from(provisionalRegisterAddressSeed),
      lightAddressTree: payload.lightAddressTree.toBase58(),
      lightAddressQueue: payload.lightAddressQueue.toBase58(),
    },
    indexContract: {
      canonicalExternal: {
        merkleTree: LIGHT_CANONICAL_EXTERNAL_INDEX.register.merkleTree,
        addressQueue: LIGHT_CANONICAL_EXTERNAL_INDEX.register.addressQueue,
        stateQueue: LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateQueue,
        stateTree: LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateTree,
        address: LIGHT_CANONICAL_EXTERNAL_INDEX.register.address,
      },
    },
    notes: [
      'Dane register_stealth zostały przygotowane lokalnie.',
      'Warstwa on-chain wymaga jeszcze pełnego podpięcia Light do wykonania transakcji.',
      'Stealth address dla register został przygotowany lokalnie jako provisional Light-native candidate.',
      'Local register seed is provisional; final canonical seed should come from Light bundle maybeNewAddress.value[0..32].',
      `registerCanonicalExternalIndex.merkleTree=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.merkleTree}`,
      `registerCanonicalExternalIndex.addressQueue=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.addressQueue}`,
      `registerCanonicalExternalIndex.stateQueue=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateQueue}`,
      `registerCanonicalExternalIndex.stateTree=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateTree}`,
      `registerCanonicalExternalIndex.address=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.address}`,
      `registerOutputTreeIndexEffective: ${outputTreeIndex}`,
    ],
  };
}

export async function prepareSendStealthExecution(
  params: PrepareSendStealthExecutionParams
): Promise<SendStealthExecution> {
  const normalized = normalizePrepareSendStealthExecutionInput(params);

  if (
    !normalized.hasProvidedRecipientKeys &&
    !normalized.allowDebugRecipientGeneration
  ) {
    throw new Error(
      'Brakuje recipientSpendKey/recipientViewKey. W realnym flow odbiorca musi przekazać public stealth bundle.'
    );
  }

  const cluster = resolveCluster(normalized.cluster);
  const programId = getPierronStealthProgramId(cluster);
  const outputTreeIndex = resolveStealthOutputTreeIndex({
    cluster,
    explicit: normalized.outputTreeIndex,
    flow: 'send',
  });

  const payload = await buildSendStealthPayload({
    sender: normalized.sender,
    programId,
    recipientSpendKey: normalized.recipientSpendKey,
    recipientViewKey: normalized.recipientViewKey,
    intendedClaimer: normalized.intendedClaimer,
    amount: normalized.amount,
    outputTreeIndex,
    cluster,
    senderHashMode:
      params.senderHashMode === 'debug' || params.senderHashMode === 'onchain'
        ? params.senderHashMode
        : 'onchain',
  });

  const serializedPayment = serializeStealthPaymentAccount(payload.paymentAccount);
  const serializedEphemeral = serializeEphemeralKey(payload.ephemeralKey);
  const serializedRecipientKeys = serializeStealthKeys(payload.recipientKeys);

  const proverInput = await buildSendStealthProverInputFromPayload({
    sender: normalized.sender,
    payload,
  });
  const proverSummary = summarizeSendStealthProverInput(proverInput);

  const pda = deriveStealthAuthorityPda({
    programId,
    mint: normalized.mint,
  });

  const missing: string[] = [];
  pushMissing(missing, 'Brakuje ValidityProof', proverSummary.proofReady);
  pushMissing(
    missing,
    'Brakuje PackedAddressTreeInfo',
    proverSummary.addressTreeInfoReady
  );
  pushMissing(
    missing,
    'Brakuje NewAddressParamsAssignedPacked',
    proverSummary.newAddressReady
  );
  pushMissing(
    missing,
    'Brakuje canonical mint w send_stealth input',
    !normalized.usedFallbackMint
  );
  pushMissing(
    missing,
    'Brakuje canonical amount w send_stealth input',
    !normalized.usedFallbackAmount
  );

  const readyForOnchainSend =
    proverSummary.readyForOnchainSend &&
    !normalized.usedFallbackMint &&
    !normalized.usedFallbackAmount;

  const canonicalLightAddressSeed = pickCanonicalLightSeed({
    lightAddressSeed: payload.lightAddressSeed,
    lightAddressSeedBytes: payload.lightAddressSeedBytes,
  });

  const indexedPayment = await resolveIndexedSendPaymentAddress({
    preparedStealthAddress: payload.stealthAddress,
    proofOwner: normalized.sender,
    lightAddressSeed: canonicalLightAddressSeed,
    cluster,
  });

  const stealthAddressForFlow = indexedPayment.address;

  return {
    kind: 'send_stealth',
    contract: 'canonical-send-flow',
    ready: {
      local: true,
      onchain: readyForOnchainSend,
    },
    payload: {
      sender: normalized.sender.toBase58(),
      mint: normalized.mint.toBase58(),
      amount: String(normalized.amount),
      outputTreeIndex: payload.outputTreeIndex,
      recipientMode: payload.recipientMode,
      stealthAddress: stealthAddressForFlow.toBase58(),
      preparedStealthAddress: payload.stealthAddress.toBase58(),
      lightAddressSeed: Array.from(payload.lightAddressSeed),
      lightAddressSeedBytes: Array.from(payload.lightAddressSeedBytes),
      canonicalLightAddressSeed: Array.from(canonicalLightAddressSeed),
      lightAddressTree: payload.lightAddressTree.toBase58(),
      lightAddressQueue: payload.lightAddressQueue.toBase58(),
      paymentAccount: {
        stealthAddress: serializedPayment.stealth_address.toBase58(),
        amount: String(serializedPayment.amount),
        createdAt: String(serializedPayment.created_at),
        claimed: serializedPayment.claimed,
        senderHash: String(serializedPayment.sender_hash),
        intendedClaimer: serializedPayment.intended_claimer.toBase58(),
      },
      ephemeralPublicKey: serializedEphemeral.ephemeral_public_key,
      recipientSpendKey: serializedRecipientKeys.spend_public_key,
      recipientViewKey: serializedRecipientKeys.view_public_key,
    },
    escrow: {
      stealthAuthority: pda.stealthAuthority.toBase58(),
      bump: pda.bump,
    },
    indexContract: {
      canonicalExternal: {
        merkleTree: LIGHT_CANONICAL_EXTERNAL_INDEX.send.merkleTree,
        addressQueue: LIGHT_CANONICAL_EXTERNAL_INDEX.send.addressQueue,
        stateQueue: LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateQueue,
        stateTree: LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateTree,
        address: LIGHT_CANONICAL_EXTERNAL_INDEX.send.address,
      },
    },
    proof: {
      proofReady: proverSummary.proofReady,
      addressTreeInfoReady: proverSummary.addressTreeInfoReady,
      newAddressReady: proverSummary.newAddressReady,
    },
    notes: [
      ...normalized.resolutionNotes,
      ...indexedPayment.notes,
      ...proverSummary.notes,
      normalized.hasProvidedRecipientKeys
        ? 'Użyto jawnie przekazanych kluczy odbiorcy.'
        : 'Użyto lokalnie wygenerowanych kluczy odbiorcy do debug/test flow.',
      'Stealth address dla send został przygotowany w modelu Light-native.',
      'Canonical send seed preference: lightAddressSeedBytes > lightAddressSeed.',
      `sendCanonicalExternalIndex.merkleTree=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.merkleTree}`,
      `sendCanonicalExternalIndex.addressQueue=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.addressQueue}`,
      `sendCanonicalExternalIndex.stateQueue=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateQueue}`,
      `sendCanonicalExternalIndex.stateTree=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateTree}`,
      `sendCanonicalExternalIndex.address=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.address}`,
      `sendOutputTreeIndexEffective: ${outputTreeIndex}`,
    ],
    missing,
  };
}

export async function prepareClaimStealthExecution(params: {
  claimer: PublicKey;
  mint: PublicKey;
  metaOwner?: PublicKey;
  stealthAddress?: PublicKey;
  registerCompressedAddress?: PublicKey;
  lightAddressSeed?: Uint8Array;
  amount?: bigint | string;
  createdAt?: bigint | string;
  claimed?: boolean;
  senderHash?: bigint | string;
  recipientMode?: SendRecipientMode;
  bundle?: ClaimLightBundle;
  allowStorageFallback?: boolean;
  cluster?: SupportedCluster;
}): Promise<ClaimStealthExecution> {
  const proverInput = await buildClaimStealthProverInput({
    claimer: params.claimer,
    mint: params.mint,
    metaOwner: params.metaOwner,
    stealthAddress: params.stealthAddress,
    registerCompressedAddress: params.registerCompressedAddress,
    lightAddressSeed: params.lightAddressSeed,
    amount: params.amount,
    createdAt: params.createdAt,
    claimed: params.claimed,
    senderHash: params.senderHash,
    recipientMode: params.recipientMode,
    bundle: params.bundle,
    allowStorageFallback: params.allowStorageFallback,
    cluster: params.cluster,
  });
  const proverSummary = summarizeClaimStealthProverInput(proverInput);

  const missing: string[] = [];
  pushMissing(
    missing,
    'Brakuje resolved metaOwner dla claim_stealth',
    proverSummary.metaPresent
  );
  pushMissing(
    missing,
    'Brakuje resolved stealthAddress dla claim_stealth',
    proverSummary.paymentPresent
  );
  pushMissing(missing, 'Brakuje ValidityProof', proverSummary.proofReady);
  pushMissing(
    missing,
    'Brakuje CompressedAccountMeta claimera',
    proverSummary.claimerMetaReady
  );
  pushMissing(
    missing,
    'Brakuje CompressedAccountMeta płatności',
    proverSummary.paymentMetaReady
  );
  pushMissing(
    missing,
    'Brakuje remaining accounts do wykonania claim',
    proverSummary.remainingAccountsReady
  );
  pushMissing(
    missing,
    'Brakuje gotowego bump/PDA do wykonania',
    proverSummary.stealthAuthorityBumpReady
  );

  const cluster = resolveCluster(params.cluster);
  const programId = getPierronStealthProgramId(cluster);

  const escrow = deriveStealthAuthorityPda({
    programId,
    mint: params.mint,
  });

  const claimerMetaAccount = proverInput.meta.owner
    ? {
        owner: proverInput.meta.owner,
        nonce: proverInput.meta.nonce ?? '0',
        registeredAt: proverInput.meta.registeredAt ?? '0',
        transactionCount: proverInput.meta.transactionCount ?? '0',
      }
    : undefined;

  const paymentAccount = proverInput.claimablePayment.stealthAddress
    ? {
        stealthAddress: proverInput.claimablePayment.stealthAddress,
        amount:
          proverInput.claimablePayment.amount ??
          normalizeNumberishString(params.amount, '0'),
        createdAt:
          proverInput.claimablePayment.createdAt ??
          normalizeNumberishString(params.createdAt, '0'),
        claimed: proverInput.claimablePayment.claimed ?? Boolean(params.claimed),
        senderHash:
          proverInput.claimablePayment.senderHash ??
          normalizeNumberishString(params.senderHash, '0'),
        intendedClaimer:
          proverInput.meta.owner ??
          params.metaOwner?.toBase58() ??
          params.claimer.toBase58(),
      }
    : undefined;

  return {
    kind: 'claim_stealth',
    contract: 'claim-flow',
    ready: {
      local: proverSummary.localDataReady,
      onchain: proverSummary.readyForOnchainClaim,
    },
    localData: {
      source: proverInput.target.mode,
      claimer: params.claimer.toBase58(),
      mint: params.mint.toBase58(),
      metaPresent: proverSummary.metaPresent,
      paymentPresent: proverSummary.paymentPresent,
      claimTargetResolved: proverSummary.localDataReady,
      metaOwner: proverInput.meta.owner,
      metaNonce: proverInput.meta.nonce,
      claimableStealthAddress: proverInput.claimablePayment.stealthAddress,
      claimableAmount: proverInput.claimablePayment.amount,
      recipientMode: proverInput.claimablePayment.recipientMode,
    },
    claimerMetaAccount,
    paymentAccount,
    escrow: {
      stealthAuthority: escrow.stealthAuthority.toBase58(),
      bump: escrow.bump,
    },
    proof: {
      proofReady: proverSummary.proofReady,
      claimerMetaReady: proverSummary.claimerMetaReady,
      paymentMetaReady: proverSummary.paymentMetaReady,
      remainingAccountsReady: proverSummary.remainingAccountsReady,
      stealthAuthorityBumpReady: proverSummary.stealthAuthorityBumpReady,
    },
    notes: proverSummary.notes,
    missing,
  };
}

export async function simulateSendStealthWithLightAction(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: {
    sender: PublicKey;
    mint: PublicKey;
    senderToken: PublicKey;
    stealthToken: PublicKey;
    tokenProgram: PublicKey;
    amount: bigint;
    stealthAddress: PublicKey;
    lightAddressSeed?: Uint8Array;
    outputTreeIndex?: number;
    remainingAccounts?: RemainingAccountInput[];
  }
): Promise<RunInstructionResult> {
  return simulateSendStealthWithLight(connection, wallet, {
    sender: params.sender,
    mint: params.mint,
    senderToken: params.senderToken,
    stealthToken: params.stealthToken,
    tokenProgram: params.tokenProgram,
    amount: params.amount,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    outputTreeIndex: params.outputTreeIndex,
    remainingAccounts: params.remainingAccounts,
  });
}

export async function sendSendStealthWithLightAction(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: {
    sender: PublicKey;
    mint: PublicKey;
    senderToken: PublicKey;
    stealthToken: PublicKey;
    tokenProgram: PublicKey;
    amount: bigint;
    stealthAddress: PublicKey;
    lightAddressSeed?: Uint8Array;
    outputTreeIndex?: number;
    remainingAccounts?: RemainingAccountInput[];
  }
): Promise<RunInstructionResult> {
  return sendSendStealthWithLight(connection, wallet, {
    sender: params.sender,
    mint: params.mint,
    senderToken: params.senderToken,
    stealthToken: params.stealthToken,
    tokenProgram: params.tokenProgram,
    amount: params.amount,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    outputTreeIndex: params.outputTreeIndex,
    remainingAccounts: params.remainingAccounts,
  });
}

export async function simulateClaimStealthWithLightAction(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: {
    claimer: PublicKey;
    mint: PublicKey;
    stealthToken: PublicKey;
    claimerToken: PublicKey;
    tokenProgram: PublicKey;
    stealthAddress: PublicKey;
    metaOwner?: PublicKey;
    remainingAccounts?: RemainingAccountInput[];
  }
): Promise<RunInstructionResult> {
  return simulateClaimStealthWithLight(connection, wallet, {
    claimer: params.claimer,
    mint: params.mint,
    stealthToken: params.stealthToken,
    claimerToken: params.claimerToken,
    tokenProgram: params.tokenProgram,
    stealthAddress: params.stealthAddress,
    metaOwner: params.metaOwner,
    remainingAccounts: params.remainingAccounts,
  });
}

export async function sendClaimStealthWithLightAction(
  connection: Connection,
  wallet: StealthWalletExecutor,
  params: {
    claimer: PublicKey;
    mint: PublicKey;
    stealthToken: PublicKey;
    claimerToken: PublicKey;
    tokenProgram: PublicKey;
    stealthAddress: PublicKey;
    metaOwner?: PublicKey;
    remainingAccounts?: RemainingAccountInput[];
  }
): Promise<RunInstructionResult> {
  return sendClaimStealthWithLight(connection, wallet, {
    claimer: params.claimer,
    mint: params.mint,
    stealthToken: params.stealthToken,
    claimerToken: params.claimerToken,
    tokenProgram: params.tokenProgram,
    stealthAddress: params.stealthAddress,
    metaOwner: params.metaOwner,
    remainingAccounts: params.remainingAccounts,
  });
}
