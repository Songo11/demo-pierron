import type {
  ClaimProofParams,
  ClaimRemainingAccountsParams,
  ClaimerCompressedMetaParams,
  LightBackendOutcome,
  LightRemainingAccountMeta,
  PaymentCompressedMetaParams,
} from './lightClient.ts';
import { LightBackendResult } from './lightClient.ts';
import type { PartialLightLocalRuntimeConfig } from './lightLocalRuntime.ts';
import {
  fetchLiveClaimerMeta,
  fetchLivePaymentMeta,
  fetchLiveClaimProof,
  fetchLiveRemainingAccountsForClaim,
} from './lightLiveLocalClient.ts';
import {
  normalizeLiveClaimerMetaToBytes,
  normalizeLiveClaimProofToBytes,
  normalizeLivePaymentMetaToBytes,
  normalizeLiveRemainingAccounts,
  pickPhotonRpcEnvelopeForNormalize,
} from './lightLiveLocalNormalization.ts';
import { discoveryHashesForPhotonRpc } from './discoveryHashRpc.ts';
import { buildClaimValidityProofViaStatelessRpc } from './lightRegisterValidityProofV0.ts';

type MaybePromise<T> = T | Promise<T>;

export type LocalClaimResolverProvider = {
  getCompressedMetaForClaimer(
    params: ClaimerCompressedMetaParams
  ): MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

  getCompressedMetaForPayment(
    params: PaymentCompressedMetaParams
  ): MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

  getValidityProofForClaim(
    params: ClaimProofParams
  ): MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

  getRemainingAccountsForClaim(
    params: ClaimRemainingAccountsParams
  ): MaybePromise<
    LightRemainingAccountMeta[] | LightBackendOutcome<LightRemainingAccountMeta[]>
  >;
};

export type LocalClaimResolverMode = 'provider' | 'live-local';

let activeLocalClaimResolverProvider: LocalClaimResolverProvider | null = null;
let activeLocalClaimResolverMode: LocalClaimResolverMode = 'provider';
let activeLocalClaimLiveRuntimeOverride: PartialLightLocalRuntimeConfig | null = null;

export function setLocalClaimResolverProvider(
  provider: LocalClaimResolverProvider
): void {
  activeLocalClaimResolverProvider = provider;
}

export function getLocalClaimResolverProvider(): LocalClaimResolverProvider | null {
  return activeLocalClaimResolverProvider;
}

export function resetLocalClaimResolverProvider(): void {
  activeLocalClaimResolverProvider = null;
}

export function setLocalClaimResolverMode(
  mode: LocalClaimResolverMode
): void {
  activeLocalClaimResolverMode = mode;
}

export function getLocalClaimResolverMode(): LocalClaimResolverMode {
  return activeLocalClaimResolverMode;
}

export function resetLocalClaimResolverMode(): void {
  activeLocalClaimResolverMode = 'provider';
}

export function setLocalClaimLiveRuntimeOverride(
  override: PartialLightLocalRuntimeConfig | null
): void {
  activeLocalClaimLiveRuntimeOverride = override ? { ...override } : null;
}

export function getLocalClaimLiveRuntimeOverride():
  | PartialLightLocalRuntimeConfig
  | null {
  return activeLocalClaimLiveRuntimeOverride
    ? { ...activeLocalClaimLiveRuntimeOverride }
    : null;
}

export function resetLocalClaimLiveRuntimeOverride(): void {
  activeLocalClaimLiveRuntimeOverride = null;
}

function isBackendOutcome<T>(value: unknown): value is LightBackendOutcome<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const status = (value as { status?: unknown }).status;
  return status === 'ready' || status === 'missing' || status === 'error';
}

function toOutcome<T>(
  value: T | LightBackendOutcome<T>,
  readyNote: string
): LightBackendOutcome<T> {
  if (isBackendOutcome<T>(value)) {
    return value;
  }

  return LightBackendResult.ready(value, readyNote);
}

function dedupeRemainingAccounts(
  accounts: LightRemainingAccountMeta[]
): LightRemainingAccountMeta[] {
  const merged = new Map<string, LightRemainingAccountMeta>();

  for (const account of accounts) {
    const key = account.pubkey.toBase58();
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        pubkey: account.pubkey,
        isSigner: account.isSigner,
        isWritable: account.isWritable,
        role: account.role,
      });
      continue;
    }

    existing.isSigner = existing.isSigner || account.isSigner;
    existing.isWritable = existing.isWritable || account.isWritable;

    if (!existing.role && account.role) {
      existing.role = account.role;
    }
  }

  return Array.from(merged.values());
}

function validateRemainingAccounts(
  accounts: LightRemainingAccountMeta[]
): LightBackendOutcome<LightRemainingAccountMeta[]> {
  const deduped = dedupeRemainingAccounts(accounts);

  if (deduped.length === 0) {
    return LightBackendResult.missing(
      'local claim remainingAccounts resolved to an empty list',
      'LOCAL_CLAIM_REMAINING_ACCOUNTS_EMPTY'
    );
  }

  return LightBackendResult.ready(
    deduped,
    'local claim remainingAccounts resolved'
  );
}

async function resolveThroughProvider<T>(params: {
  label: string;
  resolver: () => MaybePromise<T | LightBackendOutcome<T>>;
  readyNote: string;
  errorCode: string;
}): Promise<LightBackendOutcome<T>> {
  try {
    const value = await params.resolver();
    return toOutcome(value, params.readyNote);
  } catch (cause) {
    return LightBackendResult.error(
      `${params.label} failed: ${String((cause as Error)?.message ?? cause)}`,
      cause,
      params.errorCode
    );
  }
}

async function resolveThroughLiveLocal<T>(params: {
  label: string;
  fetcher: () => Promise<unknown>;
  normalize: (input: unknown) => T;
  readyNote: string;
  errorCode: string;
}): Promise<LightBackendOutcome<T>> {
  try {
    const response = await params.fetcher();
    const forNormalize = pickPhotonRpcEnvelopeForNormalize(response);
    const normalized = params.normalize(forNormalize);
    return LightBackendResult.ready(normalized, params.readyNote, forNormalize);
  } catch (cause) {
    return LightBackendResult.error(
      `${params.label} failed: ${String((cause as Error)?.message ?? cause)}`,
      cause,
      params.errorCode
    );
  }
}

function getEffectiveRuntimeOverride(): PartialLightLocalRuntimeConfig | undefined {
  return activeLocalClaimLiveRuntimeOverride ?? undefined;
}

/** Order: claimer StealthMeta hash first, payment StealthPayment hash second (on-chain CPI). */
export function pickClaimValidityProofSourceHashes(
  params?: ClaimProofParams
): string[] {
  const hints = params?.__liveLocalClaimHintSourceHashes;
  if (!Array.isArray(hints)) {
    return [];
  }
  const trimmed = hints
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is string => item.length > 0);
  try {
    return discoveryHashesForPhotonRpc(trimmed);
  } catch {
    return trimmed;
  }
}

function readU16Le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 1 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32Le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 3 >= bytes.length) return null;
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function requireProvider(
  label: string,
  params?: unknown
): LightBackendOutcome<never> | null {
  if (activeLocalClaimResolverProvider) {
    return null;
  }

  return LightBackendResult.missing(
    `${label} provider not configured`,
    'LOCAL_CLAIM_PROVIDER_MISSING'
  );
}

function requireMetaOwner(
  metaOwner: unknown,
  label = 'metaOwner'
): LightBackendOutcome<never> | null {
  if (metaOwner) {
    return null;
  }

  return LightBackendResult.missing(
    `${label} is required for local claim resolver`,
    'LOCAL_CLAIM_META_OWNER_REQUIRED'
  );
}

export async function resolveLocalClaimClaimerMeta(
  params?: ClaimerCompressedMetaParams
): Promise<LightBackendOutcome<Uint8Array>> {
  const metaOwnerMissing = requireMetaOwner(params?.metaOwner, 'metaOwner');
  if (metaOwnerMissing) return metaOwnerMissing;

  if (activeLocalClaimResolverMode === 'live-local') {
    const outcome = await resolveThroughLiveLocal({
      label: 'resolveLocalClaimClaimerMeta',
      fetcher: () =>
        fetchLiveClaimerMeta({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        }),
      normalize: normalizeLiveClaimerMetaToBytes,
      readyNote: 'local claim claimerMeta resolved from live-local runtime',
      errorCode: 'LOCAL_CLAIM_CLAIMER_META_LIVE_LOCAL_ERROR',
    });
    if (outcome.status === 'ready') {
      const bytes = outcome.value;
      // eslint-disable-next-line no-console
      console.log(
        `[claim claimerMeta live-local debug] len=${bytes.length} rootIdx=${readU16Le(bytes, 0)} proveByIndex=${bytes[2] ?? 'n/a'} treeIdx=${bytes[3] ?? 'n/a'} queueIdx=${bytes[4] ?? 'n/a'} leafIdx=${readU32Le(bytes, 5)}`
      );
    }
    return outcome;
  }

  const providerMissing = requireProvider('local_claim_claimer_meta', params);
  if (providerMissing) return providerMissing;

  return resolveThroughProvider({
    label: 'resolveLocalClaimClaimerMeta',
    resolver: () =>
      activeLocalClaimResolverProvider!.getCompressedMetaForClaimer(
        params as ClaimerCompressedMetaParams
      ),
    readyNote: 'local claim claimerMeta resolved',
    errorCode: 'LOCAL_CLAIM_CLAIMER_META_ERROR',
  });
}

export async function resolveLocalClaimPaymentMeta(
  params?: PaymentCompressedMetaParams
): Promise<LightBackendOutcome<Uint8Array>> {
  if (activeLocalClaimResolverMode === 'live-local') {
    const outcome = await resolveThroughLiveLocal({
      label: 'resolveLocalClaimPaymentMeta',
      fetcher: () =>
        fetchLivePaymentMeta({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        }),
      normalize: normalizeLivePaymentMetaToBytes,
      readyNote: 'local claim paymentMeta resolved from live-local runtime',
      errorCode: 'LOCAL_CLAIM_PAYMENT_META_LIVE_LOCAL_ERROR',
    });
    if (outcome.status === 'ready') {
      const bytes = outcome.value;
      // eslint-disable-next-line no-console
      console.log(
        `[claim paymentMeta live-local debug] len=${bytes.length} rootIdx=${readU16Le(bytes, 0)} proveByIndex=${bytes[2] ?? 'n/a'} treeIdx=${bytes[3] ?? 'n/a'} queueIdx=${bytes[4] ?? 'n/a'} leafIdx=${readU32Le(bytes, 5)}`
      );
    }
    return outcome;
  }

  const providerMissing = requireProvider('local_claim_payment_meta', params);
  if (providerMissing) return providerMissing;

  return resolveThroughProvider({
    label: 'resolveLocalClaimPaymentMeta',
    resolver: () =>
      activeLocalClaimResolverProvider!.getCompressedMetaForPayment(
        params as PaymentCompressedMetaParams
      ),
    readyNote: 'local claim paymentMeta resolved',
    errorCode: 'LOCAL_CLAIM_PAYMENT_META_ERROR',
  });
}

async function fetchClaimValidityProofViaPhoton(
  params?: ClaimProofParams
): Promise<LightBackendOutcome<Uint8Array>> {
  return resolveThroughLiveLocal({
    label: 'resolveLocalClaimValidityProof',
    fetcher: () =>
      fetchLiveClaimProof({
        runtime: getEffectiveRuntimeOverride(),
        request: params,
      }),
    normalize: normalizeLiveClaimProofToBytes,
    readyNote: 'local claim validityProof resolved from Photon getValidityProof',
    errorCode: 'LOCAL_CLAIM_VALIDITY_PROOF_PHOTON_ERROR',
  });
}

async function fetchClaimValidityProofViaStateless(
  hintHashes: string[]
): Promise<LightBackendOutcome<Uint8Array>> {
  try {
    const built = await buildClaimValidityProofViaStatelessRpc({
      sourceHashes: hintHashes,
      runtime: getEffectiveRuntimeOverride(),
    });
    return LightBackendResult.ready(
      built.proofBytes,
      'local claim validityProof resolved from Helius JSON-RPC (inclusion hashes)',
      built.validityEnvelope
    );
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return LightBackendResult.error(
      `Helius JSON-RPC validity proof: ${detail}`,
      cause,
      'LOCAL_CLAIM_VALIDITY_PROOF_STATELESS_ERROR'
    );
  }
}

/**
 * Claim validity proof: raw JSON-RPC (Helius) + direct encode, then Photon normalize fallback.
 * Avoids @lightprotocol/stateless.js on React Native (Hermes toString crash).
 */
export async function resolveClaimValidityProofFromHints(
  params?: ClaimProofParams
): Promise<LightBackendOutcome<Uint8Array>> {
  const hintHashes = pickClaimValidityProofSourceHashes(params);
  if (hintHashes.length < 2) {
    return LightBackendResult.missing(
      'claim validity proof requires __liveLocalClaimHintSourceHashes (meta then payment)',
      'LOCAL_CLAIM_VALIDITY_PROOF_HINTS_MISSING'
    );
  }

  const encoded = await fetchClaimValidityProofViaStateless(hintHashes);
  if (encoded.status === 'ready') {
    // eslint-disable-next-line no-console
    console.log(
      `[claim proof debug] len=${encoded.value.length} source=helius-rpc hashCount=${hintHashes.length}`
    );
    return encoded;
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[claim proof encode] ${encoded.status}${encoded.note ? `: ${encoded.note}` : ''}`
  );

  const photon = await fetchClaimValidityProofViaPhoton(params);
  if (photon.status === 'ready') {
    // eslint-disable-next-line no-console
    console.log(
      `[claim proof debug] len=${photon.value.length} source=photon-normalize hashCount=${hintHashes.length}`
    );
    return photon;
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[claim proof photon] ${photon.status}${photon.note ? `: ${photon.note}` : ''}`
  );

  return LightBackendResult.error(
    [
      'resolveLocalClaimValidityProof failed',
      encoded.note ? `RPC encode: ${encoded.note}` : `RPC encode: ${encoded.status}`,
      photon.note ? `normalize: ${photon.note}` : `normalize: ${photon.status}`,
    ].join('; '),
    undefined,
    'LOCAL_CLAIM_VALIDITY_PROOF_ERROR'
  );
}

export async function resolveLocalClaimValidityProof(
  params?: ClaimProofParams
): Promise<LightBackendOutcome<Uint8Array>> {
  const hintHashes = pickClaimValidityProofSourceHashes(params);
  if (hintHashes.length >= 2) {
    return resolveClaimValidityProofFromHints(params);
  }

  if (activeLocalClaimResolverMode === 'live-local') {
    const outcome = await resolveThroughLiveLocal({
      label: 'resolveLocalClaimValidityProof',
      fetcher: () =>
        fetchLiveClaimProof({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        }),
      normalize: normalizeLiveClaimProofToBytes,
      readyNote: 'local claim validityProof resolved from live-local runtime',
      errorCode: 'LOCAL_CLAIM_VALIDITY_PROOF_LIVE_LOCAL_ERROR',
    });
    if (outcome.status === 'ready') {
      // eslint-disable-next-line no-console
      console.log(`[claim proof live-local debug] len=${outcome.value.length}`);
    }
    return outcome;
  }

  const providerMissing = requireProvider('local_claim_validity_proof', params);
  if (providerMissing) return providerMissing;

  return resolveThroughProvider({
    label: 'resolveLocalClaimValidityProof',
    resolver: () =>
      activeLocalClaimResolverProvider!.getValidityProofForClaim(
        params as ClaimProofParams
      ),
    readyNote: 'local claim validityProof resolved',
    errorCode: 'LOCAL_CLAIM_VALIDITY_PROOF_ERROR',
  });
}

export async function resolveLocalClaimRemainingAccounts(
  params?: ClaimRemainingAccountsParams
): Promise<LightBackendOutcome<LightRemainingAccountMeta[]>> {
  const metaOwnerMissing = requireMetaOwner(params?.metaOwner, 'metaOwner');
  if (metaOwnerMissing) return metaOwnerMissing;

  if (activeLocalClaimResolverMode === 'live-local') {
    const outcome = await resolveThroughLiveLocal({
      label: 'resolveLocalClaimRemainingAccounts',
      fetcher: () =>
        fetchLiveRemainingAccountsForClaim({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        }),
      normalize: normalizeLiveRemainingAccounts,
      readyNote: 'local claim remainingAccounts resolved from live-local runtime',
      errorCode: 'LOCAL_CLAIM_REMAINING_ACCOUNTS_LIVE_LOCAL_ERROR',
    });

    if (outcome.status !== 'ready') {
      return outcome;
    }
    // eslint-disable-next-line no-console
    console.log(
      '[claim remainingAccounts live-local debug]',
      outcome.value.map((a, i) => ({
        i,
        pubkey: a.pubkey.toBase58(),
        isWritable: a.isWritable,
        role: a.role ?? null,
      }))
    );
    return validateRemainingAccounts(outcome.value);
  }

  const providerMissing = requireProvider('local_claim_remaining_accounts', params);
  if (providerMissing) return providerMissing;

  const outcome = await resolveThroughProvider({
    label: 'resolveLocalClaimRemainingAccounts',
    resolver: () =>
      activeLocalClaimResolverProvider!.getRemainingAccountsForClaim(
        params as ClaimRemainingAccountsParams
      ),
    readyNote: 'local claim remainingAccounts resolved',
    errorCode: 'LOCAL_CLAIM_REMAINING_ACCOUNTS_ERROR',
  });

  if (outcome.status !== 'ready') {
    return outcome;
  }

  return validateRemainingAccounts(outcome.value);
}
