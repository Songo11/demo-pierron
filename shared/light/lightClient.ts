import { PublicKey } from '@solana/web3.js';
import type { SupportedCluster } from '../core/programIds.ts';
import {
  LIGHT_CANONICAL_EXTERNAL_INDEX,
  resolveStealthOutputTreeIndex,
} from './lightCanonicalConfig.ts';
import { REGISTER_CANONICAL_META_META_OPTION_NONE } from './registerCanonicalContract.ts';
import {
  extractPhotonValidityProofRootIndicesForClaim,
  alignClaimCompressedAccountMetaRootFromValidityProof,
} from './lightLiveLocalNormalization.ts';
import {
  alignSendNewPaymentAddressRoot,
  alignSendPackedAddressTreeInfoRoot,
  extractSendValidityProofRootIndexFromOutcome,
} from './lightSendRootAlignment.ts';
import {
  ensureCanonicalLightTreeRemainingAccounts,
  ensureSendLightTreeRemainingAccounts,
  stripLightAddressRemainingAccount,
} from './registerRemainingAccounts.ts';
import {
  normalizeOrRepairSendNewPaymentAddressBytes,
  repairSendLightBundleNewPaymentAddress,
} from './registerNewAddressPacked.ts';

export type LightClientStatus = 'missing' | 'ready' | 'error';
export type LightBundleStatus = 'missing' | 'ready' | 'error';
export type LightSerializationKind = 'canonical' | 'json_fallback' | 'placeholder';

export type LightSerializedReady = {
  status: 'ready';
  source: 'light-client';
  note: string;
  value: Uint8Array;
  serializationKind?: LightSerializationKind;
  /** Photon JSON-RPC envelope (or subset) used to reconstruct full account structs for claim. */
  photonPayload?: unknown;
};

export type LightSerializedMissing = {
  status: 'missing';
  source: 'light-client';
  note: string;
  value: null;
  code?: string;
};

export type LightSerializedError = {
  status: 'error';
  source: 'light-client';
  note: string;
  value: null;
  code?: string;
  cause?: unknown;
};

export type LightSerializedValue =
  | LightSerializedReady
  | LightSerializedMissing
  | LightSerializedError;

export type PackedAddressTreeInfoLike = LightSerializedValue;
export type CompressedAccountMetaLike = LightSerializedValue;
export type ValidityProofLike = LightSerializedValue;
export type NewAddressParamsAssignedPackedLike = LightSerializedValue;

export type LightRemainingAccountRole =
  | 'light-system-program'
  | 'cpi-authority'
  | 'registered-program-pda'
  | 'noop-program'
  | 'compression-authority'
  | 'account-compression-program'
  | 'self-program'
  | 'system-program'
  | 'merkle-tree'
  | 'address-tree'
  | 'address-queue'
  | 'state-queue'
  | 'state-tree'
  | 'address'
  | 'unknown'
  | string;

export type LightRemainingAccountMeta = {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
  role: LightRemainingAccountRole;
};

export { LIGHT_CANONICAL_EXTERNAL_INDEX, resolveStealthOutputTreeIndex };

export type RegisterCanonicalExternalIndex =
  typeof LIGHT_CANONICAL_EXTERNAL_INDEX.register;

export type SendCanonicalExternalIndex =
  typeof LIGHT_CANONICAL_EXTERNAL_INDEX.send;

/**
 * Canonical register bundle contract:
 * - packedAddressTreeInfo.value, if ready, must contain canonical serialized bytes
 *   in external instruction-space
 * - newAddress.value, if ready, must contain canonical serialized bytes
 *   in external instruction-space
 * - remainingAccounts must represent the final external account ordering inputs
 *   expected by the instruction builder / runner
 *
 * Downstream TS layers must not reinterpret these serialized payloads into local
 * program tree-account indices. Only on-chain Rust may remap external-space ->
 * tree_accounts().
 */
export type RegisterLightBundle = {
  kind: 'register';
  status: LightBundleStatus;
  packedAddressTreeInfo: PackedAddressTreeInfoLike;
  validityProof: ValidityProofLike;
  newAddress: NewAddressParamsAssignedPackedLike;
  metaMeta: CompressedAccountMetaLike;
  remainingAccounts: LightRemainingAccountMeta[];
  notes: string[];
  blockingReasons: string[];
};

/**
 * Canonical send bundle contract:
 * - packedAddressTreeInfo.value, if ready, should be canonical serialized bytes
 *   in external instruction-space
 * - newPaymentAddress.value, if ready, should be canonical serialized bytes
 *   in external instruction-space
 * - remainingAccounts should represent final external instruction ordering inputs
 */
export type SendLightBundle = {
  kind: 'send';
  status: LightBundleStatus;
  packedAddressTreeInfo: PackedAddressTreeInfoLike;
  validityProof: ValidityProofLike;
  newPaymentAddress: NewAddressParamsAssignedPackedLike;
  remainingAccounts: LightRemainingAccountMeta[];
  notes: string[];
  blockingReasons: string[];
};

export type ClaimLightBundle = {
  kind: 'claim';
  status: LightBundleStatus;
  claimerMeta: CompressedAccountMetaLike;
  paymentMeta: CompressedAccountMetaLike;
  validityProof: ValidityProofLike;
  remainingAccounts: LightRemainingAccountMeta[];
  notes: string[];
  blockingReasons: string[];
};

type LightBaseParams = {
  cluster?: SupportedCluster;
};

export type PackedAddressTreeInfoParams = LightBaseParams & {
  owner?: PublicKey;
  address?: PublicKey;
  lightAddressSeed?: Uint8Array;
  outputTreeIndex?: number;
};

export type SendProofParams = LightBaseParams & {
  sender?: PublicKey;
  stealthAddress?: PublicKey;
  lightAddressSeed?: Uint8Array;
  lightAddressSeedBytes?: Uint8Array;
  outputTreeIndex?: number;
};

export type ClaimProofParams = LightBaseParams & {
  claimer?: PublicKey;
  stealthAddress?: PublicKey;
  /** Local Photon: pass-through to `getValidityProof` (hash list), same style as send hints. */
  __liveLocalClaimHintSourceHashes?: string[];
};

export type RegisterProofParams = LightBaseParams & {
  owner?: PublicKey;
  lightAddressSeed?: Uint8Array;
  outputTreeIndex?: number;
};

export type ClaimerCompressedMetaParams = LightBaseParams & {
  claimer?: PublicKey;
  metaOwner?: PublicKey;
  /**
   * Local Photon: gdy getCompressedAccountsByOwner nic nie zwraca, użyj getCompressedAccount
   * dla tego adresu (np. rola `address` z rejestru).
   */
  __liveLocalClaimerHintCompressedAddress?: PublicKey;
};

export type PaymentCompressedMetaParams = LightBaseParams & {
  stealthAddress?: PublicKey;
  metaOwner?: PublicKey;
  /**
   * Local Photon hint: optional source hashes from claim validity proof. This lets
   * `fetchLivePaymentMeta` resolve accounts that are addressless but hash-addressable.
   */
  __liveLocalClaimHintSourceHashes?: string[];
};

export type RegisterCompressedMetaParams = LightBaseParams & {
  owner?: PublicKey;
  outputTreeIndex?: number;
};

export type NewPaymentAddressParams = LightBaseParams & {
  sender?: PublicKey;
  stealthAddress?: PublicKey;
  lightAddressSeed?: Uint8Array;
  lightAddressSeedBytes?: Uint8Array;
  outputTreeIndex?: number;
};

export type NewRegisterAddressParams = LightBaseParams & {
  owner?: PublicKey;
  lightAddressSeed?: Uint8Array;
  outputTreeIndex?: number;
};

export type SendRemainingAccountsParams = LightBaseParams & {
  sender?: PublicKey;
  stealthAddress?: PublicKey;
  lightAddressSeed?: Uint8Array;
  outputTreeIndex?: number;
};

export type ClaimRemainingAccountsParams = LightBaseParams & {
  claimer?: PublicKey;
  metaOwner?: PublicKey;
  stealthAddress?: PublicKey;
};

export type RegisterRemainingAccountsParams = LightBaseParams & {
  owner?: PublicKey;
  lightAddressSeed?: Uint8Array;
  outputTreeIndex?: number;
};

export type LightBackendReady<T> = {
  status: 'ready';
  value: T;
  note?: string;
  photonPayload?: unknown;
};

export type LightBackendMissing = {
  status: 'missing';
  note: string;
  code?: string;
};

export type LightBackendError = {
  status: 'error';
  note: string;
  code?: string;
  cause?: unknown;
};

export type LightBackendOutcome<T> =
  | LightBackendReady<T>
  | LightBackendMissing
  | LightBackendError;

export interface LightBackend {
  getPackedAddressTreeInfo(
    params?: PackedAddressTreeInfoParams
  ): Promise<LightBackendOutcome<Uint8Array>>;

  getValidityProofForSend(
    params?: SendProofParams
  ): Promise<LightBackendOutcome<Uint8Array>>;

  getValidityProofForClaim(
    params?: ClaimProofParams
  ): Promise<LightBackendOutcome<Uint8Array>>;

  getValidityProofForRegister(
    params?: RegisterProofParams
  ): Promise<LightBackendOutcome<Uint8Array>>;

  getCompressedMetaForClaimer(
    params?: ClaimerCompressedMetaParams
  ): Promise<LightBackendOutcome<Uint8Array>>;

  getCompressedMetaForPayment(
    params?: PaymentCompressedMetaParams
  ): Promise<LightBackendOutcome<Uint8Array>>;

  getCompressedMetaForRegister(
    params?: RegisterCompressedMetaParams
  ): Promise<LightBackendOutcome<Uint8Array>>;

  getNewPaymentAddressParams(
    params?: NewPaymentAddressParams
  ): Promise<LightBackendOutcome<Uint8Array>>;

  getNewRegisterAddressParams(
    params?: NewRegisterAddressParams
  ): Promise<LightBackendOutcome<Uint8Array>>;

  getRemainingAccountsForSend(
    params?: SendRemainingAccountsParams
  ): Promise<LightBackendOutcome<LightRemainingAccountMeta[]>>;

  getRemainingAccountsForClaim(
    params?: ClaimRemainingAccountsParams
  ): Promise<LightBackendOutcome<LightRemainingAccountMeta[]>>;

  getRemainingAccountsForRegister(
    params?: RegisterRemainingAccountsParams
  ): Promise<LightBackendOutcome<LightRemainingAccountMeta[]>>;
}

function finalizeLightTreeRemainingAccounts(
  accounts: LightRemainingAccountMeta[],
  cluster?: SupportedCluster,
  mode: 'register' | 'send-claim' = 'register'
): LightRemainingAccountMeta[] {
  const deduped = dedupeLightRemainingAccounts(accounts);
  if (cluster === 'devnet' || cluster === 'localnet') {
    return mode === 'register'
      ? ensureCanonicalLightTreeRemainingAccounts(deduped)
      : ensureSendLightTreeRemainingAccounts(deduped);
  }
  return mode === 'register' ? deduped : stripLightAddressRemainingAccount(deduped);
}

function clusterLabel(cluster?: SupportedCluster): string {
  return cluster ?? 'unspecified-cluster';
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

function uniqueSerializationKinds(
  values: Array<LightSerializationKind | null | undefined>
): LightSerializationKind[] {
  const out: LightSerializationKind[] = [];
  const seen = new Set<LightSerializationKind>();

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    out.push(value);
  }

  return out;
}

export function fingerprintLightRemainingAccount(
  account: LightRemainingAccountMeta
): string {
  return [
    account.pubkey.toBase58(),
    account.isSigner ? '1' : '0',
    account.isWritable ? '1' : '0',
    account.role ?? '',
  ].join('|');
}

export function dedupeLightRemainingAccounts(
  accounts: LightRemainingAccountMeta[]
): LightRemainingAccountMeta[] {
  const out: LightRemainingAccountMeta[] = [];
  const seen = new Set<string>();

  for (const account of accounts) {
    const fp = fingerprintLightRemainingAccount(account);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(account);
  }

  return out;
}

export function findLightRemainingAccountByRole(
  accounts: LightRemainingAccountMeta[],
  roles: string[]
): LightRemainingAccountMeta | undefined {
  return accounts.find((account) => roles.includes(account.role ?? ''));
}

export function describeCanonicalRegisterIndexContract(): RegisterCanonicalExternalIndex {
  return LIGHT_CANONICAL_EXTERNAL_INDEX.register;
}

export function describeCanonicalSendIndexContract(): SendCanonicalExternalIndex {
  return LIGHT_CANONICAL_EXTERNAL_INDEX.send;
}

export function validateCanonicalRegisterRoles(
  accounts: LightRemainingAccountMeta[]
): {
  merkleTree?: LightRemainingAccountMeta;
  addressQueue?: LightRemainingAccountMeta;
  stateQueue?: LightRemainingAccountMeta;
  stateTree?: LightRemainingAccountMeta;
  address?: LightRemainingAccountMeta;
} {
  return {
    merkleTree: findLightRemainingAccountByRole(accounts, ['merkle-tree', 'address-tree']),
    addressQueue: findLightRemainingAccountByRole(accounts, ['address-queue']),
    stateQueue: findLightRemainingAccountByRole(accounts, ['state-queue']),
    stateTree: findLightRemainingAccountByRole(accounts, ['state-tree']),
    address: findLightRemainingAccountByRole(accounts, ['address']),
  };
}

export const LightBackendResult = {
  ready<T>(value: T, note = 'ready', photonPayload?: unknown): LightBackendOutcome<T> {
    const base: LightBackendReady<T> = {
      status: 'ready',
      value,
      note,
    };
    if (photonPayload !== undefined) {
      base.photonPayload = photonPayload;
    }
    return base;
  },

  missing(note: string, code?: string): LightBackendMissing {
    return {
      status: 'missing',
      note,
      code,
    };
  },

  error(note: string, cause?: unknown, code?: string): LightBackendError {
    return {
      status: 'error',
      note,
      code,
      cause,
    };
  },
};

function makeMissing(note: string, code?: string): LightSerializedMissing {
  return {
    status: 'missing',
    source: 'light-client',
    note,
    value: null,
    code,
  };
}

function makeError(note: string, cause?: unknown, code?: string): LightSerializedError {
  return {
    status: 'error',
    source: 'light-client',
    note,
    value: null,
    code,
    cause,
  };
}

function looksLikeLiveLocalJsonFallback(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length === 0) {
    return false;
  }

  try {
    const text = new TextDecoder().decode(bytes).trim();

    if (!text.startsWith('{')) {
      return false;
    }

    const parsed = JSON.parse(text) as { kind?: unknown };

    return parsed?.kind === 'live-local-json-fallback';
  } catch {
    return false;
  }
}

function detectLightSerializationKindFromBytes(
  value: Uint8Array
): Exclude<LightSerializationKind, 'placeholder'> {
  return looksLikeLiveLocalJsonFallback(value) ? 'json_fallback' : 'canonical';
}

function makeReady(
  note: string,
  value: Uint8Array,
  serializationKind?: LightSerializationKind,
  photonPayload?: unknown
): LightSerializedReady {
  const out: LightSerializedReady = {
    status: 'ready',
    source: 'light-client',
    note,
    value,
    serializationKind: serializationKind ?? detectLightSerializationKindFromBytes(value),
  };
  if (photonPayload !== undefined) {
    out.photonPayload = photonPayload;
  }
  return out;
}

function ensureNonEmptyBytes(
  label: string,
  outcome: LightBackendOutcome<Uint8Array>
): LightBackendOutcome<Uint8Array> {
  if (outcome.status !== 'ready') {
    return outcome;
  }

  if (!(outcome.value instanceof Uint8Array) || outcome.value.length === 0) {
    return LightBackendResult.missing(
      `${label} zwróciło status=ready, ale bytes są puste.`,
      `${label.toUpperCase()}_EMPTY_BYTES`
    );
  }

  return outcome;
}

function ensureNonEmptyRemainingAccounts(
  label: string,
  outcome: LightBackendOutcome<LightRemainingAccountMeta[]>
): LightBackendOutcome<LightRemainingAccountMeta[]> {
  if (outcome.status !== 'ready') {
    return outcome;
  }

  if (!Array.isArray(outcome.value) || outcome.value.length === 0) {
    return LightBackendResult.missing(
      `${label} zwróciło status=ready, ale remaining accounts są puste.`,
      `${label.toUpperCase()}_EMPTY`
    );
  }

  return outcome;
}

function toSerializedValue(
  label: string,
  outcome: LightBackendOutcome<Uint8Array>
): LightSerializedValue {
  const normalized = ensureNonEmptyBytes(label, outcome);

  switch (normalized.status) {
    case 'ready': {
      const photonPayload =
        'photonPayload' in normalized &&
        (normalized as LightBackendReady<Uint8Array>).photonPayload !== undefined
          ? (normalized as LightBackendReady<Uint8Array>).photonPayload
          : undefined;
      return makeReady(
        normalized.note ?? `${label} ready`,
        normalized.value,
        undefined,
        photonPayload
      );
    }
    case 'missing':
      return makeMissing(normalized.note, normalized.code);
    case 'error':
      return makeError(normalized.note, normalized.cause, normalized.code);
  }
}

function backendStatusToBundleStatus(
  outcomes: Array<LightBackendOutcome<unknown>>
): LightBundleStatus {
  if (outcomes.some((item) => item.status === 'error')) {
    return 'error';
  }

  if (outcomes.every((item) => item.status === 'ready')) {
    return 'ready';
  }

  return 'missing';
}

function noteOfBackendOutcome(outcome: LightBackendOutcome<unknown>, fallback: string): string {
  return outcome.note ?? fallback;
}

function blockingReasonFromOutcome(
  label: string,
  outcome: LightBackendOutcome<unknown>
): string | null {
  if (outcome.status === 'ready') {
    return null;
  }

  return `${label}: ${outcome.note}`;
}

/**
 * Register init on-chain always uses metaMeta = None; Helius by-owner fetch is best-effort only.
 */
function coerceRegisterMetaMetaOutcomeForInitPath(
  outcome: LightBackendOutcome<Uint8Array>
): LightBackendOutcome<Uint8Array> {
  if (outcome.status === 'ready') {
    return outcome;
  }

  return LightBackendResult.ready(
    REGISTER_CANONICAL_META_META_OPTION_NONE,
    `register metaMeta optional None (canonical init); skipped fetch: ${outcome.note ?? outcome.status}`
  );
}

export function isLightItemReady(
  item: LightSerializedValue
): item is LightSerializedReady {
  return item.status === 'ready' && item.value instanceof Uint8Array && item.value.length > 0;
}

export function hasSerializedLightValue(item: { value: Uint8Array | null }) {
  return !!item.value && item.value.length > 0;
}

export function getLightSerializedValueSerializationKind(
  item: LightSerializedValue
): LightSerializationKind | null {
  if (!isLightItemReady(item) || !hasSerializedLightValue(item)) {
    return null;
  }

  return item.serializationKind ?? detectLightSerializationKindFromBytes(item.value);
}

function summarizeSerializationKinds(items: LightSerializedValue[]): {
  serializationKinds: LightSerializationKind[];
  hasJsonFallback: boolean;
  hasPlaceholder: boolean;
  canonicalOnly: boolean;
} {
  const kinds = uniqueSerializationKinds(
    items.map((item) => getLightSerializedValueSerializationKind(item))
  );

  return {
    serializationKinds: kinds,
    hasJsonFallback: kinds.includes('json_fallback'),
    hasPlaceholder: kinds.includes('placeholder'),
    canonicalOnly: kinds.length > 0 && kinds.every((kind) => kind === 'canonical'),
  };
}

export function createNoopLightBackend(): LightBackend {
  return {
    async getPackedAddressTreeInfo(params) {
      return LightBackendResult.missing(
        `PackedAddressTreeInfo nie jest jeszcze pobierane z warstwy Light (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_PACKED_ADDRESS_TREE_INFO_UNAVAILABLE'
      );
    },

    async getValidityProofForSend(params) {
      return LightBackendResult.missing(
        `ValidityProof dla send_stealth nie jest jeszcze generowany (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_SEND_PROOF_UNAVAILABLE'
      );
    },

    async getValidityProofForClaim(params) {
      return LightBackendResult.missing(
        `ValidityProof dla claim_stealth nie jest jeszcze generowany (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_CLAIM_PROOF_UNAVAILABLE'
      );
    },

    async getValidityProofForRegister(params) {
      return LightBackendResult.missing(
        `ValidityProof dla register_stealth nie jest jeszcze generowany (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_REGISTER_PROOF_UNAVAILABLE'
      );
    },

    async getCompressedMetaForClaimer(params) {
      return LightBackendResult.missing(
        `CompressedAccountMeta claimera nie jest jeszcze pobierane (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_CLAIMER_META_UNAVAILABLE'
      );
    },

    async getCompressedMetaForPayment(params) {
      return LightBackendResult.missing(
        `CompressedAccountMeta płatności nie jest jeszcze pobierane (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_PAYMENT_META_UNAVAILABLE'
      );
    },

    async getCompressedMetaForRegister(params) {
      return LightBackendResult.missing(
        `CompressedAccountMeta dla register_stealth nie jest jeszcze pobierane (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_REGISTER_META_UNAVAILABLE'
      );
    },

    async getNewPaymentAddressParams(params) {
      return LightBackendResult.missing(
        `NewAddressParamsAssignedPacked dla send_stealth nie jest jeszcze przygotowywane (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_NEW_PAYMENT_ADDRESS_UNAVAILABLE'
      );
    },

    async getNewRegisterAddressParams(params) {
      return LightBackendResult.missing(
        `NewAddressParamsAssignedPacked dla register_stealth nie jest jeszcze przygotowywane (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_NEW_REGISTER_ADDRESS_UNAVAILABLE'
      );
    },

    async getRemainingAccountsForSend(params) {
      return LightBackendResult.missing(
        `Remaining accounts dla send_stealth nie są jeszcze rozwiązywane (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_SEND_REMAINING_ACCOUNTS_UNAVAILABLE'
      );
    },

    async getRemainingAccountsForClaim(params) {
      return LightBackendResult.missing(
        `Remaining accounts dla claim_stealth nie są jeszcze rozwiązywane (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_CLAIM_REMAINING_ACCOUNTS_UNAVAILABLE'
      );
    },

    async getRemainingAccountsForRegister(params) {
      return LightBackendResult.missing(
        `Remaining accounts dla register_stealth nie są jeszcze rozwiązywane (${clusterLabel(
          params?.cluster
        )}).`,
        'LIGHT_REGISTER_REMAINING_ACCOUNTS_UNAVAILABLE'
      );
    },
  };
}

let activeLightBackend: LightBackend = createNoopLightBackend();

export function setLightBackend(backend: LightBackend): void {
  activeLightBackend = backend;
}

export function getLightBackend(): LightBackend {
  return activeLightBackend;
}

export function resetLightBackendForTests(): void {
  activeLightBackend = createNoopLightBackend();
}

/**
 * Low-level wrappers zachowane dla kompatybilności.
 * These wrappers only fetch + normalize transport shape.
 * They do NOT guarantee canonical external index normalization by themselves.
 */
export async function getPackedAddressTreeInfo(
  params?: PackedAddressTreeInfoParams
): Promise<PackedAddressTreeInfoLike> {
  try {
    const outcome = await activeLightBackend.getPackedAddressTreeInfo(params);
    return toSerializedValue('PackedAddressTreeInfo', outcome);
  } catch (cause) {
    return makeError(
      `Błąd podczas pobierania PackedAddressTreeInfo (${clusterLabel(params?.cluster)}).`,
      cause,
      'LIGHT_PACKED_ADDRESS_TREE_INFO_ERROR'
    );
  }
}

export async function getValidityProofForSend(
  params?: SendProofParams
): Promise<ValidityProofLike> {
  try {
    const outcome = await activeLightBackend.getValidityProofForSend(params);
    return toSerializedValue('ValidityProof.send', outcome);
  } catch (cause) {
    return makeError(
      `Błąd podczas pobierania ValidityProof dla send_stealth (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_SEND_PROOF_ERROR'
    );
  }
}

export async function getValidityProofForClaim(
  params?: ClaimProofParams
): Promise<ValidityProofLike> {
  try {
    const outcome = await activeLightBackend.getValidityProofForClaim(params);
    return toSerializedValue('ValidityProof.claim', outcome);
  } catch (cause) {
    return makeError(
      `Błąd podczas pobierania ValidityProof dla claim_stealth (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_CLAIM_PROOF_ERROR'
    );
  }
}

export async function getValidityProofForRegister(
  params?: RegisterProofParams
): Promise<ValidityProofLike> {
  try {
    const outcome = await activeLightBackend.getValidityProofForRegister(params);
    return toSerializedValue('ValidityProof.register', outcome);
  } catch (cause) {
    return makeError(
      `Błąd podczas pobierania ValidityProof dla register_stealth (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_REGISTER_PROOF_ERROR'
    );
  }
}

export async function getCompressedMetaForClaimer(
  params?: ClaimerCompressedMetaParams
): Promise<CompressedAccountMetaLike> {
  try {
    const outcome = await activeLightBackend.getCompressedMetaForClaimer(params);
    return toSerializedValue('CompressedMeta.claimer', outcome);
  } catch (cause) {
    return makeError(
      `Błąd podczas pobierania CompressedAccountMeta claimera (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_CLAIMER_META_ERROR'
    );
  }
}

export async function getCompressedMetaForPayment(
  params?: PaymentCompressedMetaParams
): Promise<CompressedAccountMetaLike> {
  try {
    const outcome = await activeLightBackend.getCompressedMetaForPayment(params);
    return toSerializedValue('CompressedMeta.payment', outcome);
  } catch (cause) {
    return makeError(
      `Błąd podczas pobierania CompressedAccountMeta płatności (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_PAYMENT_META_ERROR'
    );
  }
}

export async function getCompressedMetaForRegister(
  params?: RegisterCompressedMetaParams
): Promise<CompressedAccountMetaLike> {
  try {
    const outcome = await activeLightBackend.getCompressedMetaForRegister(params);
    return toSerializedValue('CompressedMeta.register', outcome);
  } catch (cause) {
    return makeError(
      `Błąd podczas pobierania CompressedAccountMeta dla register_stealth (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_REGISTER_META_ERROR'
    );
  }
}

export async function getNewPaymentAddressParams(
  params?: NewPaymentAddressParams
): Promise<NewAddressParamsAssignedPackedLike> {
  try {
    const outcome = await activeLightBackend.getNewPaymentAddressParams(params);
    return toSerializedValue('NewPaymentAddress', outcome);
  } catch (cause) {
    return makeError(
      `Błąd podczas pobierania NewAddressParamsAssignedPacked dla send_stealth (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_NEW_PAYMENT_ADDRESS_ERROR'
    );
  }
}

export async function getNewRegisterAddressParams(
  params?: NewRegisterAddressParams
): Promise<NewAddressParamsAssignedPackedLike> {
  try {
    const outcome = await activeLightBackend.getNewRegisterAddressParams(params);
    return toSerializedValue('NewAddress.register', outcome);
  } catch (cause) {
    return makeError(
      `Błąd podczas pobierania NewAddressParamsAssignedPacked dla register_stealth (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_NEW_REGISTER_ADDRESS_ERROR'
    );
  }
}

async function resolveRemainingAccountsForSend(
  params?: SendRemainingAccountsParams
): Promise<LightBackendOutcome<LightRemainingAccountMeta[]>> {
  try {
    const outcome = await activeLightBackend.getRemainingAccountsForSend(params);
    return ensureNonEmptyRemainingAccounts('remainingAccounts.send', outcome);
  } catch (cause) {
    return LightBackendResult.error(
      `Błąd podczas pobierania remaining accounts dla send_stealth (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_SEND_REMAINING_ACCOUNTS_ERROR'
    );
  }
}

async function resolveRemainingAccountsForClaim(
  params?: ClaimRemainingAccountsParams
): Promise<LightBackendOutcome<LightRemainingAccountMeta[]>> {
  try {
    const outcome = await activeLightBackend.getRemainingAccountsForClaim(params);
    return ensureNonEmptyRemainingAccounts('remainingAccounts.claim', outcome);
  } catch (cause) {
    return LightBackendResult.error(
      `Błąd podczas pobierania remaining accounts dla claim_stealth (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_CLAIM_REMAINING_ACCOUNTS_ERROR'
    );
  }
}

async function resolveRemainingAccountsForRegister(
  params?: RegisterRemainingAccountsParams
): Promise<LightBackendOutcome<LightRemainingAccountMeta[]>> {
  try {
    const outcome = await activeLightBackend.getRemainingAccountsForRegister(params);
    return ensureNonEmptyRemainingAccounts('remainingAccounts.register', outcome);
  } catch (cause) {
    return LightBackendResult.error(
      `Błąd podczas pobierania remaining accounts dla register_stealth (${clusterLabel(
        params?.cluster
      )}).`,
      cause,
      'LIGHT_REGISTER_REMAINING_ACCOUNTS_ERROR'
    );
  }
}

export async function buildSendLightBundle(
  params?: LightBaseParams & {
    sender?: PublicKey;
    stealthAddress?: PublicKey;
    lightAddressSeed?: Uint8Array;
    outputTreeIndex?: number;
  }
): Promise<SendLightBundle> {
  const outputTreeIndex = resolveStealthOutputTreeIndex({
    cluster: params?.cluster,
    explicit: params?.outputTreeIndex,
    flow: 'send',
  });

  let packedAddressTreeInfoOutcome = await activeLightBackend.getPackedAddressTreeInfo({
    cluster: params?.cluster,
    owner: params?.sender,
    address: params?.stealthAddress,
    lightAddressSeed: params?.lightAddressSeed,
    outputTreeIndex,
  });

  // Fetch validity proof before new-address params so we can align root indices (Helius
  // new-address payload vs Groth16 public inputs — mismatch → Light CPI Custom 6042/6043).
  let validityProofOutcome = await activeLightBackend.getValidityProofForSend({
    cluster: params?.cluster,
    sender: params?.sender,
    stealthAddress: params?.stealthAddress,
    lightAddressSeed: params?.lightAddressSeed,
    outputTreeIndex,
  });

  const proofRootIndex = extractSendValidityProofRootIndexFromOutcome(validityProofOutcome);

  let newPaymentAddressOutcome = await activeLightBackend.getNewPaymentAddressParams({
    cluster: params?.cluster,
    sender: params?.sender,
    stealthAddress: params?.stealthAddress,
    lightAddressSeed: params?.lightAddressSeed,
    outputTreeIndex,
  });

  if (newPaymentAddressOutcome.status === 'ready') {
    newPaymentAddressOutcome = {
      ...newPaymentAddressOutcome,
      value: normalizeOrRepairSendNewPaymentAddressBytes(
        newPaymentAddressOutcome.value,
        params?.lightAddressSeed,
        packedAddressTreeInfoOutcome.status === 'ready'
          ? packedAddressTreeInfoOutcome.value
          : null,
        proofRootIndex
      ),
      note: `${newPaymentAddressOutcome.note ?? 'ready'} | newPaymentAddress normalized/repaired`,
    };
  }

  if (proofRootIndex != null) {
    if (packedAddressTreeInfoOutcome.status === 'ready') {
      packedAddressTreeInfoOutcome = {
        ...packedAddressTreeInfoOutcome,
        value: alignSendPackedAddressTreeInfoRoot(
          packedAddressTreeInfoOutcome.value,
          proofRootIndex
        ),
        note: `${packedAddressTreeInfoOutcome.note ?? 'ready'} | rootIndex aligned to validityProof=${proofRootIndex}`,
      };
    }
    if (
      newPaymentAddressOutcome.status === 'ready' &&
      newPaymentAddressOutcome.value.length === 38
    ) {
      newPaymentAddressOutcome = {
        ...newPaymentAddressOutcome,
        value: alignSendNewPaymentAddressRoot(
          newPaymentAddressOutcome.value,
          proofRootIndex
        ),
        note: `${newPaymentAddressOutcome.note ?? 'ready'} | rootIndex aligned to validityProof=${proofRootIndex}`,
      };
    }
  }

  const remainingAccountsOutcome = await resolveRemainingAccountsForSend({
    cluster: params?.cluster,
    sender: params?.sender,
    stealthAddress: params?.stealthAddress,
    lightAddressSeed: params?.lightAddressSeed,
    outputTreeIndex,
  });

  const packedAddressTreeInfo = toSerializedValue(
    'PackedAddressTreeInfo.send',
    packedAddressTreeInfoOutcome
  );
  const validityProof = toSerializedValue('ValidityProof.send', validityProofOutcome);
  const newPaymentAddress = toSerializedValue(
    'NewPaymentAddress.send',
    newPaymentAddressOutcome
  );

  const backendOutcomes: Array<LightBackendOutcome<unknown>> = [
    ensureNonEmptyBytes('PackedAddressTreeInfo.send', packedAddressTreeInfoOutcome),
    ensureNonEmptyBytes('NewPaymentAddress.send', newPaymentAddressOutcome),
    ensureNonEmptyBytes('ValidityProof.send', validityProofOutcome),
    remainingAccountsOutcome,
  ];

  const notes = uniqueStrings([
    noteOfBackendOutcome(packedAddressTreeInfoOutcome, 'packedAddressTreeInfo'),
    noteOfBackendOutcome(newPaymentAddressOutcome, 'newPaymentAddress'),
    noteOfBackendOutcome(validityProofOutcome, 'validityProof'),
    noteOfBackendOutcome(remainingAccountsOutcome, 'remainingAccounts'),
    `canonicalExternalIndex.send.merkleTree=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.merkleTree}`,
    `canonicalExternalIndex.send.addressQueue=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.addressQueue}`,
    `canonicalExternalIndex.send.stateQueue=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateQueue}`,
    `canonicalExternalIndex.send.stateTree=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateTree}`,
    `canonicalExternalIndex.send.address=${LIGHT_CANONICAL_EXTERNAL_INDEX.send.address}`,
    `sendOutputTreeIndexEffective: ${outputTreeIndex}`,
  ]);

  const blockingReasons = uniqueStrings([
    blockingReasonFromOutcome('packedAddressTreeInfo', backendOutcomes[0]),
    blockingReasonFromOutcome('newPaymentAddress', backendOutcomes[1]),
    blockingReasonFromOutcome('validityProof', backendOutcomes[2]),
    blockingReasonFromOutcome('remainingAccounts', backendOutcomes[3]),
  ]);

  const bundle: SendLightBundle = {
    kind: 'send',
    status: backendStatusToBundleStatus(backendOutcomes),
    packedAddressTreeInfo,
    validityProof,
    newPaymentAddress,
    remainingAccounts:
      remainingAccountsOutcome.status === 'ready'
        ? finalizeLightTreeRemainingAccounts(
            remainingAccountsOutcome.value,
            params?.cluster,
            'send-claim'
          )
        : [],
    notes,
    blockingReasons,
  };

  return repairSendLightBundleNewPaymentAddress(bundle, params?.lightAddressSeed);
}

export async function buildClaimLightBundle(
  params?: LightBaseParams & {
    claimer?: PublicKey;
    metaOwner?: PublicKey;
    stealthAddress?: PublicKey;
    /**
     * Merged into `__liveLocalClaimHintSourceHashes` for local Photon `getValidityProof`.
     * Order must match on-chain CPI compressed inputs: claimer (StealthMeta) first, payment second.
     */
    claimValidityProofSourceHashes?: string[];
    /**
     * Lokalne przejęcie: preferuj getCompressedAccount(adres) gdy by-owner puste.
     */
    claimerHintCompressedAddress?: PublicKey;
  }
): Promise<ClaimLightBundle> {
  const claimHintHashes =
    params?.claimValidityProofSourceHashes && params.claimValidityProofSourceHashes.length > 0
      ? params.claimValidityProofSourceHashes
      : undefined;

  const claimerMetaOutcome = await activeLightBackend.getCompressedMetaForClaimer({
    cluster: params?.cluster,
    claimer: params?.claimer,
    metaOwner: params?.metaOwner,
    ...(params?.claimerHintCompressedAddress
      ? { __liveLocalClaimerHintCompressedAddress: params.claimerHintCompressedAddress }
      : {}),
  });

  const paymentMetaOutcome = await activeLightBackend.getCompressedMetaForPayment({
    cluster: params?.cluster,
    stealthAddress: params?.stealthAddress,
    metaOwner: params?.metaOwner,
    ...(claimHintHashes ? { __liveLocalClaimHintSourceHashes: claimHintHashes } : {}),
  });

  const validityProofOutcome = await activeLightBackend.getValidityProofForClaim({
    cluster: params?.cluster,
    claimer: params?.claimer,
    stealthAddress: params?.stealthAddress,
    ...(claimHintHashes ? { __liveLocalClaimHintSourceHashes: claimHintHashes } : {}),
  });

  const remainingAccountsOutcome = await resolveRemainingAccountsForClaim({
    cluster: params?.cluster,
    claimer: params?.claimer,
    metaOwner: params?.metaOwner,
    stealthAddress: params?.stealthAddress,
  });

  let alignedClaimerOutcome = claimerMetaOutcome;
  let alignedPaymentOutcome = paymentMetaOutcome;
  if (
    validityProofOutcome.status === 'ready' &&
    claimerMetaOutcome.status === 'ready' &&
    paymentMetaOutcome.status === 'ready'
  ) {
    const vkEnvelope =
      validityProofOutcome.photonPayload !== undefined
        ? validityProofOutcome.photonPayload
        : null;
    const rootIndices =
      vkEnvelope != null ? extractPhotonValidityProofRootIndicesForClaim(vkEnvelope) : null;
    if (rootIndices && rootIndices.length > 0 && vkEnvelope != null) {
      const rClaimer = rootIndices[0];
      const rPayment = rootIndices.length > 1 ? rootIndices[1] : rootIndices[0];
      const patchedClaimer = alignClaimCompressedAccountMetaRootFromValidityProof(
        claimerMetaOutcome.value,
        rClaimer
      );
      const patchedPayment = alignClaimCompressedAccountMetaRootFromValidityProof(
        paymentMetaOutcome.value,
        rPayment
      );
      alignedClaimerOutcome = LightBackendResult.ready(
        patchedClaimer,
        `${claimerMetaOutcome.note ?? ''} | aligned rootIndex to validityProof rootIndices[0]=${String(rClaimer)}`,
        claimerMetaOutcome.photonPayload
      );
      alignedPaymentOutcome = LightBackendResult.ready(
        patchedPayment,
        `${paymentMetaOutcome.note ?? ''} | aligned rootIndex to validityProof rootIndices[${rootIndices.length > 1 ? '1' : '0'}]=${String(rPayment)}`,
        paymentMetaOutcome.photonPayload
      );
    }
  }

  const claimerMeta = toSerializedValue('CompressedMeta.claimer', alignedClaimerOutcome);
  const paymentMeta = toSerializedValue('CompressedMeta.payment', alignedPaymentOutcome);
  const validityProof = toSerializedValue('ValidityProof.claim', validityProofOutcome);

  const backendOutcomes: Array<LightBackendOutcome<unknown>> = [
    ensureNonEmptyBytes('CompressedMeta.claimer', claimerMetaOutcome),
    ensureNonEmptyBytes('CompressedMeta.payment', paymentMetaOutcome),
    ensureNonEmptyBytes('ValidityProof.claim', validityProofOutcome),
    remainingAccountsOutcome,
  ];

  const notes = uniqueStrings([
    noteOfBackendOutcome(claimerMetaOutcome, 'claimerMeta'),
    noteOfBackendOutcome(paymentMetaOutcome, 'paymentMeta'),
    noteOfBackendOutcome(validityProofOutcome, 'validityProof'),
    noteOfBackendOutcome(remainingAccountsOutcome, 'remainingAccounts'),
  ]);

  const blockingReasons = uniqueStrings([
    blockingReasonFromOutcome('claimerMeta', backendOutcomes[0]),
    blockingReasonFromOutcome('paymentMeta', backendOutcomes[1]),
    blockingReasonFromOutcome('validityProof', backendOutcomes[2]),
    blockingReasonFromOutcome('remainingAccounts', backendOutcomes[3]),
  ]);

  return {
    kind: 'claim',
    status: backendStatusToBundleStatus(backendOutcomes),
    claimerMeta,
    paymentMeta,
    validityProof,
    remainingAccounts:
      remainingAccountsOutcome.status === 'ready'
        ? finalizeLightTreeRemainingAccounts(
            remainingAccountsOutcome.value,
            params?.cluster,
            'send-claim'
          )
        : [],
    notes,
    blockingReasons,
  };
}

export async function buildRegisterLightBundle(
  params?: LightBaseParams & {
    owner?: PublicKey;
    lightAddressSeed?: Uint8Array;
    outputTreeIndex?: number;
  }
): Promise<RegisterLightBundle> {
  const outputTreeIndex = resolveStealthOutputTreeIndex({
    cluster: params?.cluster,
    explicit: params?.outputTreeIndex,
    flow: 'register',
  });

  const packedAddressTreeInfoOutcome = await activeLightBackend.getPackedAddressTreeInfo({
    cluster: params?.cluster,
    owner: params?.owner,
    lightAddressSeed: params?.lightAddressSeed,
    outputTreeIndex,
  });

  const validityProofOutcome = await activeLightBackend.getValidityProofForRegister({
    cluster: params?.cluster,
    owner: params?.owner,
    lightAddressSeed: params?.lightAddressSeed,
    outputTreeIndex,
  });

  const newAddressOutcome = await activeLightBackend.getNewRegisterAddressParams({
    cluster: params?.cluster,
    owner: params?.owner,
    lightAddressSeed: params?.lightAddressSeed,
    outputTreeIndex,
  });

  const metaMetaOutcome = coerceRegisterMetaMetaOutcomeForInitPath(
    await activeLightBackend.getCompressedMetaForRegister({
      cluster: params?.cluster,
      owner: params?.owner,
      outputTreeIndex,
    })
  );

  const remainingAccountsOutcome = await resolveRemainingAccountsForRegister({
    cluster: params?.cluster,
    owner: params?.owner,
    lightAddressSeed: params?.lightAddressSeed,
    outputTreeIndex,
  });

  const packedAddressTreeInfo = toSerializedValue(
    'PackedAddressTreeInfo.register',
    packedAddressTreeInfoOutcome
  );
  const validityProof = toSerializedValue(
    'ValidityProof.register',
    validityProofOutcome
  );
  const newAddress = toSerializedValue('NewAddress.register', newAddressOutcome);
  const metaMeta = toSerializedValue('CompressedMeta.register', metaMetaOutcome);

  const backendOutcomes: Array<LightBackendOutcome<unknown>> = [
    ensureNonEmptyBytes('PackedAddressTreeInfo.register', packedAddressTreeInfoOutcome),
    ensureNonEmptyBytes('ValidityProof.register', validityProofOutcome),
    ensureNonEmptyBytes('NewAddress.register', newAddressOutcome),
    ensureNonEmptyBytes('CompressedMeta.register', metaMetaOutcome),
    remainingAccountsOutcome,
  ];

  const notes = uniqueStrings([
    noteOfBackendOutcome(packedAddressTreeInfoOutcome, 'packedAddressTreeInfo'),
    noteOfBackendOutcome(validityProofOutcome, 'validityProof'),
    noteOfBackendOutcome(newAddressOutcome, 'newAddress'),
    noteOfBackendOutcome(metaMetaOutcome, 'metaMeta'),
    noteOfBackendOutcome(remainingAccountsOutcome, 'remainingAccounts'),
    `canonicalExternalIndex.register.merkleTree=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.merkleTree}`,
    `canonicalExternalIndex.register.addressQueue=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.addressQueue}`,
    `canonicalExternalIndex.register.stateQueue=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateQueue}`,
    `canonicalExternalIndex.register.stateTree=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateTree}`,
    `canonicalExternalIndex.register.address=${LIGHT_CANONICAL_EXTERNAL_INDEX.register.address}`,
    `registerOutputTreeIndexEffective: ${outputTreeIndex}`,
  ]);

  const blockingReasons = uniqueStrings([
    blockingReasonFromOutcome('packedAddressTreeInfo', backendOutcomes[0]),
    blockingReasonFromOutcome('validityProof', backendOutcomes[1]),
    blockingReasonFromOutcome('newAddress', backendOutcomes[2]),
    blockingReasonFromOutcome('metaMeta', backendOutcomes[3]),
    blockingReasonFromOutcome('remainingAccounts', backendOutcomes[4]),
  ]);

  return {
    kind: 'register',
    status: backendStatusToBundleStatus(backendOutcomes),
    packedAddressTreeInfo,
    validityProof,
    newAddress,
    metaMeta,
    remainingAccounts:
      remainingAccountsOutcome.status === 'ready'
        ? finalizeLightTreeRemainingAccounts(
            remainingAccountsOutcome.value,
            params?.cluster
          )
        : [],
    notes,
    blockingReasons,
  };
}

/**
 * Backward-compatible aliases.
 */
export const getSendLightBundle = buildSendLightBundle;
export const getClaimLightBundle = buildClaimLightBundle;
export const getRegisterLightBundle = buildRegisterLightBundle;

export function summarizeSendLightBundle(bundle: SendLightBundle) {
  const serialization = summarizeSerializationKinds([
    bundle.packedAddressTreeInfo,
    bundle.validityProof,
    bundle.newPaymentAddress,
  ]);

  return {
    status: bundle.status,
    packedAddressTreeInfoReady:
      isLightItemReady(bundle.packedAddressTreeInfo) &&
      hasSerializedLightValue(bundle.packedAddressTreeInfo),
    validityProofReady:
      isLightItemReady(bundle.validityProof) &&
      hasSerializedLightValue(bundle.validityProof),
    newPaymentAddressReady:
      isLightItemReady(bundle.newPaymentAddress) &&
      hasSerializedLightValue(bundle.newPaymentAddress),
    packedAddressTreeInfoSerializationKind:
      getLightSerializedValueSerializationKind(bundle.packedAddressTreeInfo),
    validityProofSerializationKind:
      getLightSerializedValueSerializationKind(bundle.validityProof),
    newPaymentAddressSerializationKind:
      getLightSerializedValueSerializationKind(bundle.newPaymentAddress),
    serializationKinds: serialization.serializationKinds,
    hasJsonFallback: serialization.hasJsonFallback,
    hasPlaceholder: serialization.hasPlaceholder,
    canonicalOnly: serialization.canonicalOnly,
    remainingAccountsReady: bundle.remainingAccounts.length > 0,
    blockingReasons: bundle.blockingReasons,
    notes: bundle.notes,
  };
}

export function summarizeClaimLightBundle(bundle: ClaimLightBundle) {
  const serialization = summarizeSerializationKinds([
    bundle.claimerMeta,
    bundle.paymentMeta,
    bundle.validityProof,
  ]);

  return {
    status: bundle.status,
    claimerMetaReady:
      isLightItemReady(bundle.claimerMeta) &&
      hasSerializedLightValue(bundle.claimerMeta),
    paymentMetaReady:
      isLightItemReady(bundle.paymentMeta) &&
      hasSerializedLightValue(bundle.paymentMeta),
    validityProofReady:
      isLightItemReady(bundle.validityProof) &&
      hasSerializedLightValue(bundle.validityProof),
    claimerMetaSerializationKind:
      getLightSerializedValueSerializationKind(bundle.claimerMeta),
    paymentMetaSerializationKind:
      getLightSerializedValueSerializationKind(bundle.paymentMeta),
    validityProofSerializationKind:
      getLightSerializedValueSerializationKind(bundle.validityProof),
    serializationKinds: serialization.serializationKinds,
    hasJsonFallback: serialization.hasJsonFallback,
    hasPlaceholder: serialization.hasPlaceholder,
    canonicalOnly: serialization.canonicalOnly,
    remainingAccountsReady: bundle.remainingAccounts.length > 0,
    blockingReasons: bundle.blockingReasons,
    notes: bundle.notes,
  };
}

export function summarizeRegisterLightBundle(bundle: RegisterLightBundle) {
  const serialization = summarizeSerializationKinds([
    bundle.packedAddressTreeInfo,
    bundle.validityProof,
    bundle.newAddress,
    bundle.metaMeta,
  ]);

  return {
    status: bundle.status,
    packedAddressTreeInfoReady:
      isLightItemReady(bundle.packedAddressTreeInfo) &&
      hasSerializedLightValue(bundle.packedAddressTreeInfo),
    validityProofReady:
      isLightItemReady(bundle.validityProof) &&
      hasSerializedLightValue(bundle.validityProof),
    newAddressReady:
      isLightItemReady(bundle.newAddress) &&
      hasSerializedLightValue(bundle.newAddress),
    metaMetaReady:
      isLightItemReady(bundle.metaMeta) &&
      hasSerializedLightValue(bundle.metaMeta),
    packedAddressTreeInfoSerializationKind:
      getLightSerializedValueSerializationKind(bundle.packedAddressTreeInfo),
    validityProofSerializationKind:
      getLightSerializedValueSerializationKind(bundle.validityProof),
    newAddressSerializationKind:
      getLightSerializedValueSerializationKind(bundle.newAddress),
    metaMetaSerializationKind:
      getLightSerializedValueSerializationKind(bundle.metaMeta),
    serializationKinds: serialization.serializationKinds,
    hasJsonFallback: serialization.hasJsonFallback,
    hasPlaceholder: serialization.hasPlaceholder,
    canonicalOnly: serialization.canonicalOnly,
    remainingAccountsReady: bundle.remainingAccounts.length > 0,
    blockingReasons: bundle.blockingReasons,
    notes: bundle.notes,
  };
}

/**
 * Zachowane jako helper pod ręczne budowanie gotowych wartości.
 */
export const LightClientReady = {
  packedAddressTreeInfo(
    note: string,
    value: Uint8Array,
    serializationKind: LightSerializationKind = 'canonical'
  ): PackedAddressTreeInfoLike {
    return makeReady(note, value, serializationKind);
  },

  validityProof(
    note: string,
    value: Uint8Array,
    serializationKind: LightSerializationKind = 'canonical'
  ): ValidityProofLike {
    return makeReady(note, value, serializationKind);
  },

  compressedAccountMeta(
    note: string,
    value: Uint8Array,
    serializationKind: LightSerializationKind = 'canonical'
  ): CompressedAccountMetaLike {
    return makeReady(note, value, serializationKind);
  },

  newAddressParams(
    note: string,
    value: Uint8Array,
    serializationKind: LightSerializationKind = 'canonical'
  ): NewAddressParamsAssignedPackedLike {
    return makeReady(note, value, serializationKind);
  },
};
