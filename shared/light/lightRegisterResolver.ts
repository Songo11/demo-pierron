import type {
  LightBackendOutcome,
  LightRemainingAccountMeta,
  NewRegisterAddressParams,
  PackedAddressTreeInfoParams,
  RegisterCompressedMetaParams,
  RegisterProofParams,
  RegisterRemainingAccountsParams,
} from './lightClient.ts';
import { LightBackendResult } from './lightClient.ts';
import type { PartialLightLocalRuntimeConfig } from './lightLocalRuntime.ts';
import {
  fetchLiveNewRegisterAddress,
  fetchLivePackedAddressTreeInfo,
  fetchLiveRegisterMetaMeta,
  fetchLiveRemainingAccountsForRegister,
} from './lightLiveLocalClient.ts';
import {
  normalizeLiveNewRegisterAddressToBytes,
  normalizeLivePackedAddressTreeInfoToBytes,
  normalizeLiveRegisterMetaMetaToBytes,
  normalizeLiveRemainingAccounts,
} from './lightLiveLocalNormalization.ts';
import { buildRegisterValidityProofViaStatelessRpc } from './lightRegisterValidityProofV0.ts';
import { ensureCanonicalRegisterRemainingAccounts } from './registerRemainingAccounts.ts';

type MaybePromise<T> = T | Promise<T>;

export type LocalRegisterResolverProvider = {
  getPackedAddressTreeInfo(
    params: PackedAddressTreeInfoParams
  ): MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

  getValidityProofForRegister(
    params: RegisterProofParams
  ): MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

  getCompressedMetaForRegister(
    params: RegisterCompressedMetaParams
  ): MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

  getNewRegisterAddressParams(
    params: NewRegisterAddressParams
  ): MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

  getRemainingAccountsForRegister(
    params: RegisterRemainingAccountsParams
  ): MaybePromise<
    LightRemainingAccountMeta[] | LightBackendOutcome<LightRemainingAccountMeta[]>
  >;
};

export type LocalRegisterResolverMode = 'provider' | 'live-local';

let activeLocalRegisterResolverProvider: LocalRegisterResolverProvider | null = null;
let activeLocalRegisterResolverMode: LocalRegisterResolverMode = 'provider';
let activeLocalRegisterLiveRuntimeOverride: PartialLightLocalRuntimeConfig | null = null;

export function setLocalRegisterResolverProvider(
  provider: LocalRegisterResolverProvider
): void {
  activeLocalRegisterResolverProvider = provider;
}

export function getLocalRegisterResolverProvider(): LocalRegisterResolverProvider | null {
  return activeLocalRegisterResolverProvider;
}

export function resetLocalRegisterResolverProvider(): void {
  activeLocalRegisterResolverProvider = null;
}

export function setLocalRegisterResolverMode(
  mode: LocalRegisterResolverMode
): void {
  activeLocalRegisterResolverMode = mode;
}

export function getLocalRegisterResolverMode(): LocalRegisterResolverMode {
  return activeLocalRegisterResolverMode;
}

export function resetLocalRegisterResolverMode(): void {
  activeLocalRegisterResolverMode = 'provider';
}

export function setLocalRegisterLiveRuntimeOverride(
  override: PartialLightLocalRuntimeConfig | null
): void {
  activeLocalRegisterLiveRuntimeOverride = override ? { ...override } : null;
}

export function getLocalRegisterLiveRuntimeOverride():
  | PartialLightLocalRuntimeConfig
  | null {
  return activeLocalRegisterLiveRuntimeOverride
    ? { ...activeLocalRegisterLiveRuntimeOverride }
    : null;
}

export function resetLocalRegisterLiveRuntimeOverride(): void {
  activeLocalRegisterLiveRuntimeOverride = null;
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

function requireProvider<TParams>(
  label: string,
  _params?: TParams
): LightBackendOutcome<never> | null {
  if (activeLocalRegisterResolverProvider) {
    return null;
  }

  return LightBackendResult.missing(
    `${label} provider is not installed`,
    `${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_PROVIDER_NOT_INSTALLED`
  );
}

function requireOwner(
  value: unknown,
  label: string
): LightBackendOutcome<never> | null {
  if (value) return null;

  return LightBackendResult.missing(
    `${label} is required for local register resolver`,
    `${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_REQUIRED`
  );
}

function requireLightAddressSeed(
  value: Uint8Array | undefined,
  label: string
): LightBackendOutcome<never> | null {
  if (value && value.length > 0) return null;

  return LightBackendResult.missing(
    `${label} is required for local register validity proof resolver`,
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
      'local register remainingAccounts resolved to an empty list',
      'LOCAL_REGISTER_REMAINING_ACCOUNTS_EMPTY'
    );
  }

  const ensured = ensureCanonicalRegisterRemainingAccounts(deduped);

  return LightBackendResult.ready(
    ensured,
    'local register remainingAccounts resolved'
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
  fetcher: () => Promise<T>;
  readyNote: string;
  errorCode: string;
}): Promise<LightBackendOutcome<T>> {
  try {
    const normalized = await params.fetcher();
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
  return activeLocalRegisterLiveRuntimeOverride ?? undefined;
}

export async function resolveLocalRegisterPackedAddressTreeInfo(
  params?: PackedAddressTreeInfoParams
): Promise<LightBackendOutcome<Uint8Array>> {
  const ownerMissing = requireOwner(params?.owner, 'owner');
  if (ownerMissing) return ownerMissing;

  if (activeLocalRegisterResolverMode === 'live-local') {
    return resolveThroughLiveLocal({
      label: 'resolveLocalRegisterPackedAddressTreeInfo',
      fetcher: async () => {
        const raw = await fetchLivePackedAddressTreeInfo({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        });
        return normalizeLivePackedAddressTreeInfoToBytes(raw);
      },
      readyNote: 'local register packedAddressTreeInfo resolved from live-local runtime',
      errorCode: 'LOCAL_REGISTER_PACKED_ADDRESS_TREE_INFO_LIVE_LOCAL_ERROR',
    });
  }

  const providerMissing = requireProvider(
    'local_register_packed_address_tree_info',
    params
  );
  if (providerMissing) return providerMissing;

  return resolveThroughProvider({
    label: 'resolveLocalRegisterPackedAddressTreeInfo',
    resolver: () =>
      activeLocalRegisterResolverProvider!.getPackedAddressTreeInfo(
        params as PackedAddressTreeInfoParams
      ),
    readyNote: 'local register packedAddressTreeInfo resolved',
    errorCode: 'LOCAL_REGISTER_PACKED_ADDRESS_TREE_INFO_ERROR',
  });
}

export async function resolveLocalRegisterValidityProof(
  params?: RegisterProofParams
): Promise<LightBackendOutcome<Uint8Array>> {
  const ownerMissing = requireOwner(params?.owner, 'owner');
  if (ownerMissing) return ownerMissing;

  const seedMissing = requireLightAddressSeed(params?.lightAddressSeed, 'lightAddressSeed');
  if (seedMissing) return seedMissing;

  if (activeLocalRegisterResolverMode === 'live-local') {
    return resolveThroughLiveLocal({
      label: 'resolveLocalRegisterValidityProof',
      fetcher: async () => {
        const result = await buildRegisterValidityProofViaStatelessRpc({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        });
        return result.proofBytes;
      },
      readyNote: 'local register validityProof resolved from stateless.js getValidityProofV0',
      errorCode: 'LOCAL_REGISTER_VALIDITY_PROOF_LIVE_LOCAL_ERROR',
    });
  }

  const providerMissing = requireProvider('local_register_validity_proof', params);
  if (providerMissing) return providerMissing;

  return resolveThroughProvider({
    label: 'resolveLocalRegisterValidityProof',
    resolver: () =>
      activeLocalRegisterResolverProvider!.getValidityProofForRegister(
        params as RegisterProofParams
      ),
    readyNote: 'local register validityProof resolved',
    errorCode: 'LOCAL_REGISTER_VALIDITY_PROOF_ERROR',
  });
}

export async function resolveLocalRegisterMetaMeta(
  params?: RegisterCompressedMetaParams
): Promise<LightBackendOutcome<Uint8Array>> {
  const ownerMissing = requireOwner(params?.owner, 'owner');
  if (ownerMissing) return ownerMissing;

  if (activeLocalRegisterResolverMode === 'live-local') {
    const liveOutcome = await resolveThroughLiveLocal({
      label: 'resolveLocalRegisterMetaMeta',
      fetcher: async () => {
        const raw = await fetchLiveRegisterMetaMeta({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        });
        return normalizeLiveRegisterMetaMetaToBytes(raw);
      },
      readyNote: 'local register metaMeta resolved from live-local runtime',
      errorCode: 'LOCAL_REGISTER_META_META_LIVE_LOCAL_ERROR',
    });

    if (liveOutcome.status === 'ready') {
      return liveOutcome;
    }

    if (activeLocalRegisterResolverProvider) {
      const fallbackOutcome = await resolveThroughProvider({
        label: 'resolveLocalRegisterMetaMeta(provider-fallback)',
        resolver: () =>
          activeLocalRegisterResolverProvider!.getCompressedMetaForRegister(
            params as RegisterCompressedMetaParams
          ),
        readyNote: 'local register metaMeta resolved from provider fallback',
        errorCode: 'LOCAL_REGISTER_META_META_PROVIDER_FALLBACK_ERROR',
      });

      if (fallbackOutcome.status === 'ready') {
        return fallbackOutcome;
      }
    }

    return liveOutcome;
  }

  const providerMissing = requireProvider('local_register_meta_meta', params);
  if (providerMissing) return providerMissing;

  return resolveThroughProvider({
    label: 'resolveLocalRegisterMetaMeta',
    resolver: () =>
      activeLocalRegisterResolverProvider!.getCompressedMetaForRegister(
        params as RegisterCompressedMetaParams
      ),
    readyNote: 'local register metaMeta resolved',
    errorCode: 'LOCAL_REGISTER_META_META_ERROR',
  });
}

export async function resolveLocalRegisterNewAddress(
  params?: NewRegisterAddressParams
): Promise<LightBackendOutcome<Uint8Array>> {
  const ownerMissing = requireOwner(params?.owner, 'owner');
  if (ownerMissing) return ownerMissing;

  if (activeLocalRegisterResolverMode === 'live-local') {
    return resolveThroughLiveLocal({
      label: 'resolveLocalRegisterNewAddress',
      fetcher: async () => {
        const raw = await fetchLiveNewRegisterAddress({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        });
        return normalizeLiveNewRegisterAddressToBytes(raw);
      },
      readyNote: 'local register newAddress resolved from live-local runtime',
      errorCode: 'LOCAL_REGISTER_NEW_ADDRESS_LIVE_LOCAL_ERROR',
    });
  }

  const providerMissing = requireProvider('local_register_new_address', params);
  if (providerMissing) return providerMissing;

  return resolveThroughProvider({
    label: 'resolveLocalRegisterNewAddress',
    resolver: () =>
      activeLocalRegisterResolverProvider!.getNewRegisterAddressParams(
        params as NewRegisterAddressParams
      ),
    readyNote: 'local register newAddress resolved',
    errorCode: 'LOCAL_REGISTER_NEW_ADDRESS_ERROR',
  });
}

export async function resolveLocalRegisterRemainingAccounts(
  params?: RegisterRemainingAccountsParams
): Promise<LightBackendOutcome<LightRemainingAccountMeta[]>> {
  const ownerMissing = requireOwner(params?.owner, 'owner');
  if (ownerMissing) return ownerMissing;

  if (activeLocalRegisterResolverMode === 'live-local') {
    const outcome = await resolveThroughLiveLocal({
      label: 'resolveLocalRegisterRemainingAccounts',
      fetcher: async () => {
        const raw = await fetchLiveRemainingAccountsForRegister({
          runtime: getEffectiveRuntimeOverride(),
          request: params,
        });
        return normalizeLiveRemainingAccounts(raw);
      },
      readyNote: 'local register remainingAccounts resolved from live-local runtime',
      errorCode: 'LOCAL_REGISTER_REMAINING_ACCOUNTS_LIVE_LOCAL_ERROR',
    });

    if (outcome.status !== 'ready') {
      return outcome;
    }

    return validateRemainingAccounts(outcome.value);
  }

  const providerMissing = requireProvider('local_register_remaining_accounts', params);
  if (providerMissing) return providerMissing;

  const outcome = await resolveThroughProvider({
    label: 'resolveLocalRegisterRemainingAccounts',
    resolver: () =>
      activeLocalRegisterResolverProvider!.getRemainingAccountsForRegister(
        params as RegisterRemainingAccountsParams
      ),
    readyNote: 'local register remainingAccounts resolved',
    errorCode: 'LOCAL_REGISTER_REMAINING_ACCOUNTS_ERROR',
  });

  if (outcome.status !== 'ready') {
    return outcome;
  }

  return validateRemainingAccounts(outcome.value);
}
