import type {
  LightBackend,
  LightBackendOutcome,
  LightRemainingAccountMeta,
  NewRegisterAddressParams,
  PackedAddressTreeInfoParams,
  RegisterCompressedMetaParams,
  RegisterProofParams,
  RegisterRemainingAccountsParams,
} from './lightClient.ts';
import { LightBackendResult, createNoopLightBackend } from './lightClient.ts';

type MaybePromise<T> = T | Promise<T>;

export type RealLocalRegisterPackedAddressTreeInfoResolver = (
  params?: PackedAddressTreeInfoParams
) => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

export type RealLocalRegisterValidityProofResolver = (
  params?: RegisterProofParams
) => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

export type RealLocalRegisterMetaMetaResolver = (
  params?: RegisterCompressedMetaParams
) => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

export type RealLocalRegisterNewAddressResolver = (
  params?: NewRegisterAddressParams
) => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

export type RealLocalRegisterRemainingAccountsResolver = (
  params?: RegisterRemainingAccountsParams
) => MaybePromise<
  LightRemainingAccountMeta[] | LightBackendOutcome<LightRemainingAccountMeta[]>
>;

export type RealLocalRegisterLightBackendConfig = {
  label?: string;
  resolvePackedAddressTreeInfo: RealLocalRegisterPackedAddressTreeInfoResolver;
  resolveValidityProofForRegister: RealLocalRegisterValidityProofResolver;
  resolveMetaMeta: RealLocalRegisterMetaMetaResolver;
  resolveNewRegisterAddress: RealLocalRegisterNewAddressResolver;
  resolveRemainingAccountsForRegister: RealLocalRegisterRemainingAccountsResolver;
};

function backendLabel(config: RealLocalRegisterLightBackendConfig): string {
  return config.label ?? 'real-local-register-light-backend';
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

function makeCode(label: string, suffix: string): string {
  return `${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${suffix}`;
}

function validateSerializedBytesOutcome(
  outcome: LightBackendOutcome<Uint8Array>,
  label: string
): LightBackendOutcome<Uint8Array> {
  if (outcome.status !== 'ready') {
    return outcome;
  }

  if (!(outcome.value instanceof Uint8Array)) {
    return LightBackendResult.error(
      `${label} returned ready but value is not Uint8Array`,
      outcome.value,
      makeCode(label, 'INVALID_BYTES')
    );
  }

  if (outcome.value.length === 0) {
    return LightBackendResult.missing(
      `${label} returned ready but serialized bytes are empty`,
      makeCode(label, 'EMPTY_BYTES')
    );
  }

  return LightBackendResult.ready(
    outcome.value,
    outcome.note ?? `${label} ready`
  );
}

async function resolveSerializedOutcome(params: {
  label: string;
  resolver: () => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;
  errorCode: string;
}): Promise<LightBackendOutcome<Uint8Array>> {
  try {
    const value = await params.resolver();
    const outcome = toOutcome(value, `${params.label} ready`);
    return validateSerializedBytesOutcome(outcome, params.label);
  } catch (cause) {
    return LightBackendResult.error(
      `${params.label} failed: ${String((cause as Error)?.message ?? cause)}`,
      cause,
      params.errorCode
    );
  }
}

async function resolveOutcome<T>(params: {
  label: string;
  resolver: () => MaybePromise<T | LightBackendOutcome<T>>;
  errorCode: string;
}): Promise<LightBackendOutcome<T>> {
  try {
    const value = await params.resolver();
    return toOutcome(value, `${params.label} ready`);
  } catch (cause) {
    return LightBackendResult.error(
      `${params.label} failed: ${String((cause as Error)?.message ?? cause)}`,
      cause,
      params.errorCode
    );
  }
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

function validateRemainingAccountsOutcome(
  outcome: LightBackendOutcome<LightRemainingAccountMeta[]>,
  label: string
): LightBackendOutcome<LightRemainingAccountMeta[]> {
  if (outcome.status !== 'ready') {
    return outcome;
  }

  const deduped = dedupeRemainingAccounts(outcome.value);

  if (deduped.length === 0) {
    return LightBackendResult.missing(
      `${label} returned ready but remaining accounts are empty`,
      makeCode(label, 'EMPTY')
    );
  }

  return LightBackendResult.ready(
    deduped,
    outcome.note ?? `${label} ready`
  );
}

export function makeRealLocalRegisterLightBackend(
  config: RealLocalRegisterLightBackendConfig
): LightBackend {
  const fallback = createNoopLightBackend();
  const label = backendLabel(config);

  return {
    ...fallback,

    async getPackedAddressTreeInfo(params?: PackedAddressTreeInfoParams) {
      return resolveSerializedOutcome({
        label: `${label}.register.packedAddressTreeInfo`,
        resolver: () => config.resolvePackedAddressTreeInfo(params),
        errorCode: 'REAL_LOCAL_REGISTER_PACKED_ADDRESS_TREE_INFO_ERROR',
      });
    },

    async getValidityProofForRegister(params?: RegisterProofParams) {
      return resolveSerializedOutcome({
        label: `${label}.register.validityProof`,
        resolver: () => config.resolveValidityProofForRegister(params),
        errorCode: 'REAL_LOCAL_REGISTER_VALIDITY_PROOF_ERROR',
      });
    },

    async getCompressedMetaForRegister(params?: RegisterCompressedMetaParams) {
      return resolveSerializedOutcome({
        label: `${label}.register.metaMeta`,
        resolver: () => config.resolveMetaMeta(params),
        errorCode: 'REAL_LOCAL_REGISTER_META_META_ERROR',
      });
    },

    async getNewRegisterAddressParams(params?: NewRegisterAddressParams) {
      return resolveSerializedOutcome({
        label: `${label}.register.newAddress`,
        resolver: () => config.resolveNewRegisterAddress(params),
        errorCode: 'REAL_LOCAL_REGISTER_NEW_ADDRESS_ERROR',
      });
    },

    async getRemainingAccountsForRegister(params?: RegisterRemainingAccountsParams) {
      const outcome = await resolveOutcome({
        label: `${label}.register.remainingAccounts`,
        resolver: () => config.resolveRemainingAccountsForRegister(params),
        errorCode: 'REAL_LOCAL_REGISTER_REMAINING_ACCOUNTS_ERROR',
      });

      return validateRemainingAccountsOutcome(
        outcome,
        `${label}.register.remainingAccounts`
      );
    },
  };
}
