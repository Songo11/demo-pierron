import { PublicKey } from '@solana/web3.js';

import type {
  LightBackendOutcome,
  LightRemainingAccountMeta,
  NewPaymentAddressParams,
  PackedAddressTreeInfoParams,
  SendProofParams,
  SendRemainingAccountsParams,
} from './lightClient.ts';
import { LightBackendResult } from './lightClient.ts';
import type { PartialLightLocalRuntimeConfig } from './lightLocalRuntime.ts';
import {
  fetchLiveNewPaymentAddress,
  fetchLivePackedAddressTreeInfo,
  fetchLiveRemainingAccountsForSend,
  fetchLiveSendProof,
} from './lightLiveLocalClient.ts';
import {
  normalizeLiveNewPaymentAddressToBytes,
  normalizeLivePackedAddressTreeInfoToBytes,
  normalizeLiveRemainingAccounts,
  normalizeLiveSendProofToBytes,
} from './lightLiveLocalNormalization.ts';

type MaybePromise<T> = T | Promise<T>;

export type LocalSendResolverProvider = {
  getPackedAddressTreeInfo(
    params: PackedAddressTreeInfoParams
  ): MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

  getValidityProofForSend(
    params: SendProofParams
  ): MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

  getNewPaymentAddressParams(
    params: NewPaymentAddressParams
  ): MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

  getRemainingAccountsForSend(
    params: SendRemainingAccountsParams
  ): MaybePromise<
    LightRemainingAccountMeta[] | LightBackendOutcome<LightRemainingAccountMeta[]>
  >;
};

export type LocalSendResolverMode = 'provider' | 'live-local';
export type LocalSendLiveStrictness = 'permissive' | 'strict';

let activeLocalSendResolverProvider: LocalSendResolverProvider | null = null;
let activeLocalSendResolverMode: LocalSendResolverMode = 'provider';
let activeLocalSendLiveRuntimeOverride: PartialLightLocalRuntimeConfig | null = null;
let activeLocalSendLiveStrictness: LocalSendLiveStrictness = 'permissive';

export function setLocalSendResolverProvider(
  provider: LocalSendResolverProvider
): void {
  activeLocalSendResolverProvider = provider;
}

export function getLocalSendResolverProvider(): LocalSendResolverProvider | null {
  return activeLocalSendResolverProvider;
}

export function resetLocalSendResolverProvider(): void {
  activeLocalSendResolverProvider = null;
}

export function setLocalSendResolverMode(
  mode: LocalSendResolverMode
): void {
  activeLocalSendResolverMode = mode;
}

export function getLocalSendResolverMode(): LocalSendResolverMode {
  return activeLocalSendResolverMode;
}

export function resetLocalSendResolverMode(): void {
  activeLocalSendResolverMode = 'provider';
}

export function setLocalSendLiveRuntimeOverride(
  override: PartialLightLocalRuntimeConfig | null
): void {
  activeLocalSendLiveRuntimeOverride = override ? { ...override } : null;
}

export function getLocalSendLiveRuntimeOverride():
  | PartialLightLocalRuntimeConfig
  | null {
  return activeLocalSendLiveRuntimeOverride
    ? { ...activeLocalSendLiveRuntimeOverride }
    : null;
}

export function resetLocalSendLiveRuntimeOverride(): void {
  activeLocalSendLiveRuntimeOverride = null;
}

export function setLocalSendLiveStrictness(
  strictness: LocalSendLiveStrictness
): void {
  activeLocalSendLiveStrictness = strictness;
}

export function getLocalSendLiveStrictness(): LocalSendLiveStrictness {
  return activeLocalSendLiveStrictness;
}

export function resetLocalSendLiveStrictness(): void {
  activeLocalSendLiveStrictness = 'permissive';
}

function isBackendOutcome<T>(value: unknown): value is LightBackendOutcome<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const status = (value as { status?: unknown }).status;
  return status === 'ready' || status === 'missing' || status === 'error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

function requireProvider<TParams>(
  label: string,
  _params?: TParams
): LightBackendOutcome<never> | null {
  if (activeLocalSendResolverProvider) {
    return null;
  }

  return LightBackendResult.missing(
    `${label} provider is not installed`,
    `${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_PROVIDER_NOT_INSTALLED`
  );
}

function requirePublicKey(
  label: string,
  value: unknown
): LightBackendOutcome<never> | null {
  if (value) {
    return null;
  }

  return LightBackendResult.missing(
    `${label} is required for local send resolver`,
    `${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_REQUIRED`
  );
}

function requireSeed(
  label: string,
  value: Uint8Array | undefined
): LightBackendOutcome<never> | null {
  if (value && value.length > 0) {
    return null;
  }

  return LightBackendResult.missing(
    `${label} is required for local send resolver`,
    `${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_REQUIRED`
  );
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
      'local send remainingAccounts resolved to an empty list',
      'LOCAL_SEND_REMAINING_ACCOUNTS_EMPTY'
    );
  }

  return LightBackendResult.ready(
    deduped,
    'local send remainingAccounts resolved'
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

function extractLiveLocalJsonFallbackReason(input: unknown): string | null {
  if (isRecord(input) && input.kind === 'live-local-json-fallback') {
    return typeof input.reason === 'string'
      ? input.reason
      : 'live-local JSON fallback envelope detected';
  }

  if (isRecord(input) && isRecord(input.raw) && input.raw.kind === 'live-local-json-fallback') {
    return typeof input.raw.reason === 'string'
      ? input.raw.reason
      : 'live-local JSON fallback wrapper detected';
  }

  return null;
}

async function resolveThroughLiveLocal<T>(params: {
  label: string;
  fetcher: () => Promise<unknown>;
  normalize: (raw: unknown) => T;
  readyNote: string;
  errorCode: string;
  rejectJsonFallback?: boolean;
  jsonFallbackAsMissing?: boolean;
  jsonFallbackMissingCode?: string;
}): Promise<LightBackendOutcome<T>> {
  try {
    const raw = await params.fetcher();
    const fallbackReason = extractLiveLocalJsonFallbackReason(raw);
    const rejectJsonFallback =
      params.rejectJsonFallback ?? activeLocalSendLiveStrictness === 'strict';

    if (fallbackReason && rejectJsonFallback) {
      if (params.jsonFallbackAsMissing) {
        return LightBackendResult.missing(
          `${params.label} unavailable: ${fallbackReason}`,
          params.jsonFallbackMissingCode ?? `${params.errorCode}_JSON_FALLBACK_MISSING`
        );
      }

      return LightBackendResult.error(
        `${params.label} rejected live-local JSON fallback: ${fallbackReason}`,
        new Error(fallbackReason),
        `${params.errorCode}_JSON_FALLBACK_REJECTED`
      );
    }

    const normalized = params.normalize(raw);
    return LightBackendResult.ready(normalized, params.readyNote);
  } catch (cause) {
    return LightBackendResult.error(
      `${params.label} failed: ${String((cause as Error)?.message ?? cause)}`,
      cause,
      params.errorCode
    );
  }
}

function getEffectiveRuntimeOverride(): PartialLightLocalRuntimeConfig | undefined {
  return activeLocalSendLiveRuntimeOverride ?? undefined;
}

export async function collectLiveLocalSendHints(
  params?: SendProofParams
): Promise<Record<string, unknown>> {
  const runtime = getEffectiveRuntimeOverride();
  const hints: Record<string, unknown> = {};

  try {
    const remainingAccounts = await fetchLiveRemainingAccountsForSend({
      runtime,
      request: params as SendRemainingAccountsParams,
    });
    hints.__liveLocalSendHintRemainingAccounts = remainingAccounts;
  } catch {
    // ignore
  }

  try {
    const newPaymentAddressRaw = await fetchLiveNewPaymentAddress({
      runtime,
      request: params as any,
    });
    hints.__liveLocalSendHintNewPaymentAddressRaw = newPaymentAddressRaw;

    try {
      const newPaymentAddressBytes =
        normalizeLiveNewPaymentAddressToBytes(newPaymentAddressRaw);
      hints.__liveLocalSendHintNewPaymentAddressBytes = newPaymentAddressBytes;
    } catch {
      // ignore normalization failure
    }
  } catch {
    // ignore
  }

  try {
    const packedTreeInfoRaw = await fetchLivePackedAddressTreeInfo({
      runtime,
      request: {
        owner: params?.sender as PublicKey | undefined,
        address: params?.stealthAddress as PublicKey | undefined,
        lightAddressSeed: params?.lightAddressSeed,
      } as PackedAddressTreeInfoParams,
    });
    hints.__liveLocalSendHintPackedAddressTreeInfoRaw = packedTreeInfoRaw;

    try {
      const packedTreeInfoBytes =
        normalizeLivePackedAddressTreeInfoToBytes(packedTreeInfoRaw);
      hints.__liveLocalSendHintPackedAddressTreeInfoBytes = packedTreeInfoBytes;
    } catch {
      // ignore normalization failure
    }
  } catch {
    // ignore
  }

  return hints;
}

export async function resolveLocalSendPackedAddressTreeInfo(
  params?: PackedAddressTreeInfoParams
): Promise<LightBackendOutcome<Uint8Array>> {
  const senderMissing = requirePublicKey('owner', params?.owner);
  if (senderMissing) {
    return senderMissing;
  }

  const stealthAddressMissing = requirePublicKey('address', params?.address);
  if (stealthAddressMissing) {
    return stealthAddressMissing;
  }

  const seedMissing = requireSeed('lightAddressSeed', params?.lightAddressSeed);
  if (seedMissing) {
    return seedMissing;
  }

  if (activeLocalSendResolverMode === 'live-local') {
    return resolveThroughLiveLocal({
      label: 'resolveLocalSendPackedAddressTreeInfo',
      fetcher: () =>
        fetchLivePackedAddressTreeInfo({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        }),
      normalize: (fetched) =>
        normalizeLivePackedAddressTreeInfoToBytes(
          typeof fetched === 'object' &&
            fetched != null &&
            'raw' in (fetched as object) &&
            (fetched as { raw?: unknown }).raw != null
            ? (fetched as { raw: unknown }).raw
            : fetched
        ),
      readyNote: 'local send packedAddressTreeInfo resolved from live-local runtime',
      errorCode: 'LOCAL_SEND_PACKED_ADDRESS_TREE_INFO_LIVE_LOCAL_ERROR',
    });
  }

  const providerMissing = requireProvider('local_send_packed_address_tree_info', params);
  if (providerMissing) {
    return providerMissing;
  }

  return resolveThroughProvider({
    label: 'resolveLocalSendPackedAddressTreeInfo',
    resolver: () =>
      activeLocalSendResolverProvider!.getPackedAddressTreeInfo(params!),
    readyNote: 'local send packedAddressTreeInfo resolved',
    errorCode: 'LOCAL_SEND_PACKED_ADDRESS_TREE_INFO_PROVIDER_ERROR',
  });
}

export async function resolveLocalSendValidityProof(
  params?: SendProofParams
): Promise<LightBackendOutcome<Uint8Array>> {
  const senderMissing = requirePublicKey('sender', params?.sender);
  if (senderMissing) {
    return senderMissing;
  }

  const stealthAddressMissing = requirePublicKey('stealthAddress', params?.stealthAddress);
  if (stealthAddressMissing) {
    return stealthAddressMissing;
  }

  const seedMissing = requireSeed('lightAddressSeed', params?.lightAddressSeed);
  if (seedMissing) {
    return seedMissing;
  }

  if (activeLocalSendResolverMode === 'live-local') {
    return resolveThroughLiveLocal({
      label: 'resolveLocalSendValidityProof',
      fetcher: () =>
        fetchLiveSendProof({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        }),
      normalize: (fetched) =>
        normalizeLiveSendProofToBytes(
          typeof fetched === 'object' &&
            fetched != null &&
            'raw' in (fetched as object) &&
            (fetched as { raw?: unknown }).raw != null
            ? (fetched as { raw: unknown }).raw
            : fetched
        ),
      readyNote: 'local send validityProof resolved from live-local runtime',
      errorCode: 'LOCAL_SEND_VALIDITY_PROOF_LIVE_LOCAL_ERROR',
      rejectJsonFallback: true,
      jsonFallbackAsMissing: true,
      jsonFallbackMissingCode: 'LOCAL_SEND_VALIDITY_PROOF_UNAVAILABLE',
    });
  }

  const providerMissing = requireProvider('local_send_validity_proof', params);
  if (providerMissing) {
    return providerMissing;
  }

  return resolveThroughProvider({
    label: 'resolveLocalSendValidityProof',
    resolver: () =>
      activeLocalSendResolverProvider!.getValidityProofForSend(params!),
    readyNote: 'local send validityProof resolved',
    errorCode: 'LOCAL_SEND_VALIDITY_PROOF_PROVIDER_ERROR',
  });
}

export async function resolveLocalSendNewPaymentAddress(
  params?: NewPaymentAddressParams
): Promise<LightBackendOutcome<Uint8Array>> {
  const stealthAddressMissing = requirePublicKey('stealthAddress', params?.stealthAddress);
  if (stealthAddressMissing) {
    return stealthAddressMissing;
  }

  const resolvedSeed =
    params?.lightAddressSeed && params.lightAddressSeed.length === 32
      ? params.lightAddressSeed
      : params?.lightAddressSeedBytes && params.lightAddressSeedBytes.length === 32
        ? params.lightAddressSeedBytes
        : undefined;

  const seedMissing = requireSeed('lightAddressSeed', resolvedSeed);
  if (seedMissing) {
    return seedMissing;
  }

  const paramsWithSeed: NewPaymentAddressParams = {
    ...params,
    lightAddressSeed: resolvedSeed,
  };

  if (activeLocalSendResolverMode === 'live-local') {
    return resolveThroughLiveLocal({
      label: 'resolveLocalSendNewPaymentAddress',
      fetcher: () =>
        fetchLiveNewPaymentAddress({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        }),
      normalize: normalizeLiveNewPaymentAddressToBytes,
      readyNote: 'local send newPaymentAddress resolved from live-local runtime',
      errorCode: 'LOCAL_SEND_NEW_PAYMENT_ADDRESS_LIVE_LOCAL_ERROR',
    });
  }

  const providerMissing = requireProvider('local_send_new_payment_address', params);
  if (providerMissing) {
    return providerMissing;
  }

  return resolveThroughProvider({
    label: 'resolveLocalSendNewPaymentAddress',
    resolver: () =>
      activeLocalSendResolverProvider!.getNewPaymentAddressParams(paramsWithSeed!),
    readyNote: 'local send newPaymentAddress resolved',
    errorCode: 'LOCAL_SEND_NEW_PAYMENT_ADDRESS_PROVIDER_ERROR',
  });
}

export async function resolveLocalSendRemainingAccounts(
  params?: SendRemainingAccountsParams
): Promise<LightBackendOutcome<LightRemainingAccountMeta[]>> {
  const senderMissing = requirePublicKey('sender', params?.sender);
  if (senderMissing) {
    return senderMissing;
  }

  const stealthAddressMissing = requirePublicKey('stealthAddress', params?.stealthAddress);
  if (stealthAddressMissing) {
    return stealthAddressMissing;
  }

  const seedMissing = requireSeed('lightAddressSeed', params?.lightAddressSeed);
  if (seedMissing) {
    return seedMissing;
  }

  if (activeLocalSendResolverMode === 'live-local') {
    return resolveThroughLiveLocal({
      label: 'resolveLocalSendRemainingAccounts',
      fetcher: () =>
        fetchLiveRemainingAccountsForSend({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        }),
      normalize: normalizeLiveRemainingAccounts,
      readyNote: 'local send remainingAccounts resolved from live-local runtime',
      errorCode: 'LOCAL_SEND_REMAINING_ACCOUNTS_LIVE_LOCAL_ERROR',
    }).then((outcome) => {
      if (outcome.status !== 'ready') {
        return outcome;
      }
      return validateRemainingAccounts(outcome.value);
    });
  }

  const providerMissing = requireProvider('local_send_remaining_accounts', params);
  if (providerMissing) {
    return providerMissing;
  }

  return resolveThroughProvider({
    label: 'resolveLocalSendRemainingAccounts',
    resolver: () =>
      activeLocalSendResolverProvider!.getRemainingAccountsForSend(params!),
    readyNote: 'local send remainingAccounts resolved',
    errorCode: 'LOCAL_SEND_REMAINING_ACCOUNTS_PROVIDER_ERROR',
  }).then((outcome) => {
    if (outcome.status !== 'ready') {
      return outcome;
    }
    return validateRemainingAccounts(outcome.value);
  });
}

export const resolveLocalSendNewPaymentAddressParams =
  resolveLocalSendNewPaymentAddress;
