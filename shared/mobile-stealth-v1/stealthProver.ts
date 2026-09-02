import { PublicKey } from '@solana/web3.js';
import {
  buildSendStealthPayload,
  serializeEphemeralKey,
  serializeStealthPaymentAccount,
  serializeStealthKeys,
  type SendRecipientMode,
  type SendStealthPayload,
} from '../stealth-base/stealthPayloads.ts';
import {
  getStealthClaimable,
  getStealthMeta,
  type StoredStealthClaimableItem,
} from './stealthStorage.ts';
import {
  buildClaimLightBundle,
  buildSendLightBundle,
  summarizeClaimLightBundle,
  summarizeSendLightBundle,
  type ClaimLightBundle,
  type LightBundleStatus,
} from '../light/lightClient.ts';
import { discoverClaimLightBundleHints } from '../light/claimLightDiscovery.ts';
import { getLightLocalRuntimeOverride } from '../light/lightLocalRuntime.ts';
import { deriveStealthAuthorityPda } from '../stealth-base/stealthPda.ts';
import {
  getCurrentCluster,
  getPierronStealthProgramId,
  type SupportedCluster,
} from '../core/programIds.ts';
import { resolveStealthOutputTreeIndex } from '../light/lightCanonicalConfig.ts';

const LIGHT_BUNDLE_TIMEOUT_MS = 10_000;
const SEND_LIGHT_BUNDLE_TIMEOUT_MS = 90_000;
const CLAIM_LIGHT_BUNDLE_TIMEOUT_MS = 45_000;

export type ClaimTargetResolutionMode =
  | 'legacy_local_state'
  | 'explicit_target'
  | 'light_bundle';

export type SendStealthProverInput = {
  senderPubkey: string;
  amount: string;
  outputTreeIndex: number;
  recipientMode: 'debug-generated' | 'provided';

  recipientSpendKey: number[];
  recipientViewKey: number[];

  ephemeralPublicKey: number[];

  stealthAddress: string;
  lightAddressSeed: number[];
  lightAddressSeedBytes: number[];
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

  lightInputs: {
    bundleStatus: LightBundleStatus;
    proofReady: boolean;
    addressTreeInfoReady: boolean;
    newAddressReady: boolean;
    remainingAccountsReady: boolean;
    blockingReasons: string[];
    notes: string[];
  };

  localStatus: {
    payloadReady: boolean;
    readyForOnchainSend: boolean;
  };
};

export type ClaimStealthProverInput = {
  claimerPubkey: string;
  mint: string;

  target: {
    mode: ClaimTargetResolutionMode;
    metaOwner?: string;
    stealthAddress?: string;
    notes: string[];
  };

  meta: {
    present: boolean;
    owner?: string;
    nonce?: string;
    registeredAt?: string;
    transactionCount?: string;
  };

  claimablePayment: {
    present: boolean;
    id?: string;
    stealthAddress?: string;
    amount?: string;
    createdAt?: string;
    claimed?: boolean;
    senderHash?: string;
    owner?: string;
    mint?: string;
    recipientMode?: SendRecipientMode;
  };

  lightInputs: {
    bundleStatus: LightBundleStatus;
    proofReady: boolean;
    claimerMetaReady: boolean;
    paymentMetaReady: boolean;
    remainingAccountsReady: boolean;
    stealthAuthorityBumpReady: boolean;
    blockingReasons: string[];
    notes: string[];
  };

  localStatus: {
    localDataReady: boolean;
    readyForOnchainClaim: boolean;
  };
};

export type SendStealthProverSummary = {
  senderPubkey: string;
  amount: string;
  stealthAddress: string;
  outputTreeIndex: number;
  recipientMode: 'debug-generated' | 'provided';
  bundleStatus: LightBundleStatus;
  proofReady: boolean;
  addressTreeInfoReady: boolean;
  newAddressReady: boolean;
  remainingAccountsReady: boolean;
  readyForOnchainSend: boolean;
  blockingReasons: string[];
  notes: string[];
};

export type ClaimStealthProverSummary = {
  claimerPubkey: string;
  mint: string;
  source: ClaimTargetResolutionMode;
  metaPresent: boolean;
  paymentPresent: boolean;
  bundleStatus: LightBundleStatus;
  proofReady: boolean;
  claimerMetaReady: boolean;
  paymentMetaReady: boolean;
  remainingAccountsReady: boolean;
  stealthAuthorityBumpReady: boolean;
  localDataReady: boolean;
  readyForOnchainClaim: boolean;
  claimableStealthAddress?: string;
  claimableAmount?: string;
  blockingReasons: string[];
  notes: string[];
};

function resolveCluster(cluster?: SupportedCluster): SupportedCluster {
  return cluster ?? getCurrentCluster();
}

function pickFirstUnclaimedForMint(
  items: StoredStealthClaimableItem[],
  mint: PublicKey
): StoredStealthClaimableItem | undefined {
  const mintBase58 = mint.toBase58();
  return items.find((item) => !item.claimed && (!item.mint || item.mint === mintBase58));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
    ),
  ]);
}

function normalizeNumberishString(
  value: bigint | number | string | undefined,
  fallback = '0'
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

function toBase58OrUndefined(value: PublicKey | undefined): string | undefined {
  return value ? value.toBase58() : undefined;
}

function findBundleAccountByRole(
  bundle: ClaimLightBundle,
  role: string
): string | undefined {
  return bundle.remainingAccounts.find((item) => item.role === role)?.pubkey.toBase58();
}

function compactNotes(...chunks: Array<string[] | undefined>): string[] {
  const merged = chunks.flatMap((chunk) => chunk ?? []);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of merged) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

export async function buildSendStealthProverInputFromPayload(params: {
  sender: PublicKey;
  payload: SendStealthPayload;
  cluster?: SupportedCluster;
}): Promise<SendStealthProverInput> {
  const cluster = resolveCluster(params.cluster);

  const serializedPayment = serializeStealthPaymentAccount(params.payload.paymentAccount);
  const serializedEphemeral = serializeEphemeralKey(params.payload.ephemeralKey);
  const serializedRecipientKeys = serializeStealthKeys(params.payload.recipientKeys);

  let bundleStatus: LightBundleStatus = 'missing';
  let proofReady = false;
  let addressTreeInfoReady = false;
  let newAddressReady = false;
  let remainingAccountsReady = false;
  let blockingReasons: string[] = [];
  let notes: string[] = [];

  try {
    const lightBundle = await withTimeout(
      buildSendLightBundle({
        sender: params.sender,
        stealthAddress: params.payload.stealthAddress,
        lightAddressSeed: params.payload.lightAddressSeed,
        cluster,
      }),
      SEND_LIGHT_BUNDLE_TIMEOUT_MS,
      'buildSendLightBundle'
    );

    const lightSummary = summarizeSendLightBundle(lightBundle);

    bundleStatus = lightSummary.status;
    proofReady = lightSummary.validityProofReady;
    addressTreeInfoReady = lightSummary.packedAddressTreeInfoReady;
    newAddressReady = lightSummary.newPaymentAddressReady;
    remainingAccountsReady = lightSummary.remainingAccountsReady;
    blockingReasons = lightSummary.blockingReasons;
    notes = lightSummary.notes;
  } catch (err: any) {
    bundleStatus = 'error';
    proofReady = false;
    addressTreeInfoReady = false;
    newAddressReady = false;
    remainingAccountsReady = false;
    blockingReasons = [`sendLightBundle: ${String(err?.message || err)}`];
    notes = [
      'Nie udało się pobrać danych Light dla send_stealth.',
      `Powód: ${String(err?.message || err)}`,
      'Payload lokalny został przygotowany mimo braku danych Light.',
    ];
  }

  return {
    senderPubkey: params.sender.toBase58(),
    amount: String(params.payload.amount),
    outputTreeIndex: params.payload.outputTreeIndex,
    recipientMode: params.payload.recipientMode,

    recipientSpendKey: serializedRecipientKeys.spend_public_key,
    recipientViewKey: serializedRecipientKeys.view_public_key,

    ephemeralPublicKey: serializedEphemeral.ephemeral_public_key,

    stealthAddress: params.payload.stealthAddress.toBase58(),
    lightAddressSeed: Array.from(params.payload.lightAddressSeed),
    lightAddressSeedBytes: Array.from(params.payload.lightAddressSeedBytes),
    lightAddressTree: params.payload.lightAddressTree.toBase58(),
    lightAddressQueue: params.payload.lightAddressQueue.toBase58(),

    paymentAccount: {
      stealthAddress: serializedPayment.stealth_address.toBase58(),
      amount: String(serializedPayment.amount),
      createdAt: String(serializedPayment.created_at),
      claimed: serializedPayment.claimed,
      senderHash: String(serializedPayment.sender_hash),
      intendedClaimer: serializedPayment.intended_claimer.toBase58(),
    },

    lightInputs: {
      bundleStatus,
      proofReady,
      addressTreeInfoReady,
      newAddressReady,
      remainingAccountsReady,
      blockingReasons,
      notes,
    },

    localStatus: {
      payloadReady: true,
      readyForOnchainSend: bundleStatus === 'ready' && remainingAccountsReady,
    },
  };
}

export async function buildSendStealthProverInput(params: {
  sender: PublicKey;
  amount: bigint;
  outputTreeIndex?: number;
  recipientSpendKey?: Uint8Array;
  recipientViewKey?: Uint8Array;
  intendedClaimer?: PublicKey;
  senderHashMode?: 'debug' | 'onchain';
  cluster?: SupportedCluster;
}): Promise<SendStealthProverInput> {
  const cluster = resolveCluster(params.cluster);
  const programId = getPierronStealthProgramId(cluster);

  const payload = await buildSendStealthPayload({
    sender: params.sender,
    programId,
    amount: params.amount,
    outputTreeIndex: resolveStealthOutputTreeIndex({
      cluster,
      explicit: params.outputTreeIndex,
      flow: 'send',
    }),
    cluster,
    recipientSpendKey: params.recipientSpendKey,
    recipientViewKey: params.recipientViewKey,
    intendedClaimer: params.intendedClaimer,
    senderHashMode: params.senderHashMode ?? 'onchain',
  });

  return buildSendStealthProverInputFromPayload({
    sender: params.sender,
    payload,
    cluster,
  });
}

export function summarizeSendStealthProverInput(
  input: SendStealthProverInput
): SendStealthProverSummary {
  return {
    senderPubkey: input.senderPubkey,
    amount: input.amount,
    stealthAddress: input.stealthAddress,
    outputTreeIndex: input.outputTreeIndex,
    recipientMode: input.recipientMode,
    bundleStatus: input.lightInputs.bundleStatus,
    proofReady: input.lightInputs.proofReady,
    addressTreeInfoReady: input.lightInputs.addressTreeInfoReady,
    newAddressReady: input.lightInputs.newAddressReady,
    remainingAccountsReady: input.lightInputs.remainingAccountsReady,
    readyForOnchainSend: input.localStatus.readyForOnchainSend,
    blockingReasons: input.lightInputs.blockingReasons,
    notes: input.lightInputs.notes,
  };
}

export async function buildClaimStealthProverInput(params: {
  claimer: PublicKey;
  mint: PublicKey;
  metaOwner?: PublicKey;
  stealthAddress?: PublicKey;
  /** Skompresowany adres StealthMeta z register (Photon by-owner często pusty). */
  registerCompressedAddress?: PublicKey;
  /** Seed z powiadomienia o płatności — dokładniejszy newAddressProof. */
  lightAddressSeed?: Uint8Array;
  amount?: bigint | string;
  createdAt?: bigint | string;
  claimed?: boolean;
  senderHash?: bigint | string;
  recipientMode?: SendRecipientMode;
  bundle?: ClaimLightBundle;
  allowStorageFallback?: boolean;
  /** UI readiness — bez Photon discovery / buildClaimLightBundle (szybkie odświeżenie stanu). */
  skipLightBundleProbe?: boolean;
  cluster?: SupportedCluster;
}): Promise<ClaimStealthProverInput> {
  const cluster = resolveCluster(params.cluster);
  const explicitMetaOwner = toBase58OrUndefined(params.metaOwner);
  const explicitStealthAddress = toBase58OrUndefined(params.stealthAddress);

  let meta:
    | {
        owner?: string;
        nonce?: string;
        registeredAt?: string;
        transactionCount?: string;
      }
    | undefined;
  let payment:
    | {
        id?: string;
        stealthAddress?: string;
        amount?: string;
        createdAt?: string;
        claimed?: boolean;
        senderHash?: string;
        owner?: string;
        mint?: string;
        recipientMode?: SendRecipientMode;
      }
    | undefined;
  let targetMode: ClaimTargetResolutionMode = 'explicit_target';
  let targetNotes: string[] = [];

  if (params.bundle) {
    targetMode = 'light_bundle';

    const bundleMetaOwner =
      explicitMetaOwner ??
      findBundleAccountByRole(params.bundle, 'meta-owner') ??
      params.claimer.toBase58();

    const bundleStealthAddress =
      explicitStealthAddress ?? findBundleAccountByRole(params.bundle, 'payment');

    meta = {
      owner: bundleMetaOwner,
      nonce: '0',
      registeredAt: '0',
      transactionCount: '0',
    };

    payment = {
      stealthAddress: bundleStealthAddress,
      amount: normalizeNumberishString(params.amount, '0'),
      createdAt: normalizeNumberishString(params.createdAt, '0'),
      claimed: Boolean(params.claimed),
      senderHash: normalizeNumberishString(params.senderHash, '0'),
      recipientMode: params.recipientMode,
      mint: params.mint.toBase58(),
    };

    targetNotes = [
      'Claim target został wyprowadzony bezpośrednio z Claim Light bundle.',
      'Ścieżka claim nie wymaga legacy local storage.',
    ];
  } else if (explicitMetaOwner || explicitStealthAddress) {
    targetMode = 'explicit_target';

    meta = explicitMetaOwner
      ? {
          owner: explicitMetaOwner,
          nonce: '0',
          registeredAt: '0',
          transactionCount: '0',
        }
      : undefined;

    payment = explicitStealthAddress
      ? {
          stealthAddress: explicitStealthAddress,
          amount: normalizeNumberishString(params.amount, '0'),
          createdAt: normalizeNumberishString(params.createdAt, '0'),
          claimed: Boolean(params.claimed),
          senderHash: normalizeNumberishString(params.senderHash, '0'),
          recipientMode: params.recipientMode,
          mint: params.mint.toBase58(),
        }
      : undefined;

    targetNotes = [
      'Claim target został przekazany jawnie przez metaOwner/stealthAddress.',
      'Legacy local storage nie było używane do przygotowania claim.',
    ];
  } else if (params.allowStorageFallback !== false) {
    targetMode = 'legacy_local_state';

    const [storedMeta, claimable] = await Promise.all([
      getStealthMeta(),
      getStealthClaimable(),
    ]);

    const firstClaimable = pickFirstUnclaimedForMint(claimable, params.mint);

    meta = storedMeta
      ? {
          owner: storedMeta.owner,
          nonce: storedMeta.nonce,
          registeredAt: storedMeta.registeredAt,
          transactionCount: storedMeta.transactionCount,
        }
      : undefined;

    payment = firstClaimable
      ? {
          id: firstClaimable.id,
          stealthAddress: firstClaimable.stealthAddress,
          amount: firstClaimable.amount,
          createdAt: firstClaimable.createdAt,
          claimed: firstClaimable.claimed,
          senderHash: firstClaimable.senderHash,
          owner: firstClaimable.owner,
          mint: firstClaimable.mint,
          recipientMode: firstClaimable.recipientMode,
        }
      : undefined;

    targetNotes = [
      'Claim target został odczytany z legacy local storage.',
    ];
  } else {
    targetMode = 'explicit_target';
    targetNotes = [
      'Nie przekazano jawnego claim targetu i wyłączono storage fallback.',
    ];
  }

  const metaPresent = Boolean(meta?.owner);
  const paymentPresent = Boolean(payment?.stealthAddress);

  let bundleStatus: LightBundleStatus = 'missing';
  let proofReady = false;
  let claimerMetaReady = false;
  let paymentMetaReady = false;
  let remainingAccountsReady = false;
  let claimBlockingReasons: string[] = [];
  let claimNotes: string[] = [];

  if (params.bundle) {
    const lightSummary = summarizeClaimLightBundle(params.bundle);

    bundleStatus = lightSummary.status;
    proofReady = lightSummary.validityProofReady;
    claimerMetaReady = lightSummary.claimerMetaReady;
    paymentMetaReady = lightSummary.paymentMetaReady;
    remainingAccountsReady = lightSummary.remainingAccountsReady;
    claimBlockingReasons = lightSummary.blockingReasons;
    claimNotes = lightSummary.notes;
  } else if (metaPresent && paymentPresent && !params.skipLightBundleProbe) {
    try {
      const paymentPk = new PublicKey(payment!.stealthAddress!);
      const metaOwnerPk = new PublicKey(meta!.owner!);

      const hints = await withTimeout(
        discoverClaimLightBundleHints({
          metaOwner: metaOwnerPk,
          stealthAddress: paymentPk,
          registerCompressedAddress: params.registerCompressedAddress,
          lightAddressSeed: params.lightAddressSeed,
          intendedClaimer: params.claimer,
          runtime: getLightLocalRuntimeOverride() ?? undefined,
          cluster,
          skipProgramScan: false,
          skipLongPaymentWait: true,
          // Ze seedem: krótki poll. Bez seeda discovery i tak nie znajdzie płatności szybko.
          maxAttempts: params.lightAddressSeed?.length === 32
            ? cluster === 'devnet'
              ? 6
              : 4
            : 1,
          delayMs: cluster === 'devnet' ? 1500 : 800,
          maxHeavyRediscoveryRuns: 1,
        }),
        CLAIM_LIGHT_BUNDLE_TIMEOUT_MS,
        'discoverClaimLightBundleHints'
      );

      const stealthForBundle =
        hints.resolvedStealthAddress ?? paymentPk;

      const lightBundle = await withTimeout(
        buildClaimLightBundle({
          claimer: params.claimer,
          metaOwner: metaOwnerPk,
          stealthAddress: stealthForBundle,
          cluster,
          ...(hints.claimValidityProofSourceHashes.length >= 2
            ? {
                claimValidityProofSourceHashes:
                  hints.claimValidityProofSourceHashes,
              }
            : {}),
          ...(hints.claimerHintCompressedAddress
            ? {
                claimerHintCompressedAddress:
                  hints.claimerHintCompressedAddress,
              }
            : {}),
        }),
        CLAIM_LIGHT_BUNDLE_TIMEOUT_MS,
        'buildClaimLightBundle'
      );

      const lightSummary = summarizeClaimLightBundle(lightBundle);

      bundleStatus = lightSummary.status;
      proofReady = lightSummary.validityProofReady;
      claimerMetaReady = lightSummary.claimerMetaReady;
      paymentMetaReady = lightSummary.paymentMetaReady;
      remainingAccountsReady = lightSummary.remainingAccountsReady;
      claimBlockingReasons = lightSummary.blockingReasons;
      claimNotes = [
        ...hints.notes.slice(-6),
        ...lightSummary.notes,
      ];
    } catch (err: any) {
      bundleStatus = 'error';
      proofReady = false;
      claimerMetaReady = false;
      paymentMetaReady = false;
      remainingAccountsReady = false;
      claimBlockingReasons = [`claimLightBundle: ${String(err?.message || err)}`];
      claimNotes = [
        'Nie udało się pobrać danych Light dla claim_stealth.',
        `Powód: ${String(err?.message || err)}`,
      ];
    }
  } else {
    bundleStatus = 'missing';
    proofReady = false;
    claimerMetaReady = false;
    paymentMetaReady = false;
    remainingAccountsReady = false;
    claimBlockingReasons = [
      'claimLightBundle: brak resolved metaOwner lub stealthAddress dla claim',
    ];
    claimNotes = [
      'Claim bundle nie został zbudowany, bo nie udało się rozwiązać pełnego targetu claim.',
    ];
  }

  const programId = getPierronStealthProgramId(cluster);

  const pda = deriveStealthAuthorityPda({
    programId,
    mint: params.mint,
  });

  const stealthAuthorityBumpReady = Number.isInteger(pda.bump);

  const localDataReady = metaPresent && paymentPresent;
  const readyForOnchainClaim =
    localDataReady &&
    bundleStatus === 'ready' &&
    remainingAccountsReady &&
    stealthAuthorityBumpReady;

  return {
    claimerPubkey: params.claimer.toBase58(),
    mint: params.mint.toBase58(),

    target: {
      mode: targetMode,
      metaOwner: meta?.owner,
      stealthAddress: payment?.stealthAddress,
      notes: targetNotes,
    },

    meta: {
      present: metaPresent,
      owner: meta?.owner,
      nonce: meta?.nonce,
      registeredAt: meta?.registeredAt,
      transactionCount: meta?.transactionCount,
    },

    claimablePayment: {
      present: paymentPresent,
      id: payment?.id,
      stealthAddress: payment?.stealthAddress,
      amount: payment?.amount,
      createdAt: payment?.createdAt,
      claimed: payment?.claimed,
      senderHash: payment?.senderHash,
      owner: payment?.owner,
      mint: payment?.mint,
      recipientMode: payment?.recipientMode,
    },

    lightInputs: {
      bundleStatus,
      proofReady,
      claimerMetaReady,
      paymentMetaReady,
      remainingAccountsReady,
      stealthAuthorityBumpReady,
      blockingReasons: claimBlockingReasons,
      notes: compactNotes(targetNotes, claimNotes),
    },

    localStatus: {
      localDataReady,
      readyForOnchainClaim,
    },
  };
}

export function summarizeClaimStealthProverInput(
  input: ClaimStealthProverInput
): ClaimStealthProverSummary {
  return {
    claimerPubkey: input.claimerPubkey,
    mint: input.mint,
    source: input.target.mode,
    metaPresent: input.meta.present,
    paymentPresent: input.claimablePayment.present,
    bundleStatus: input.lightInputs.bundleStatus,
    proofReady: input.lightInputs.proofReady,
    claimerMetaReady: input.lightInputs.claimerMetaReady,
    paymentMetaReady: input.lightInputs.paymentMetaReady,
    remainingAccountsReady: input.lightInputs.remainingAccountsReady,
    stealthAuthorityBumpReady: input.lightInputs.stealthAuthorityBumpReady,
    localDataReady: input.localStatus.localDataReady,
    readyForOnchainClaim: input.localStatus.readyForOnchainClaim,
    claimableStealthAddress: input.claimablePayment.stealthAddress,
    claimableAmount: input.claimablePayment.amount,
    blockingReasons: input.lightInputs.blockingReasons,
    notes: compactNotes(input.target.notes, input.lightInputs.notes),
  };
}
