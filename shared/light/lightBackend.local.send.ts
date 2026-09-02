import type {
  LightBackend,
  LightBackendOutcome,
  LightRemainingAccountMeta,
  PackedAddressTreeInfoParams,
  SendProofParams,
  NewPaymentAddressParams,
  SendRemainingAccountsParams,
} from './lightClient.ts';
import {
  LightBackendResult,
  createNoopLightBackend,
} from './lightClient.ts';

type MaybePromise<T> = T | Promise<T>;

export type RealLocalSendPackedAddressTreeInfoResolver = (
  params?: PackedAddressTreeInfoParams
) => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

export type RealLocalSendValidityProofResolver = (
  params?: SendProofParams
) => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

export type RealLocalSendNewPaymentAddressResolver = (
  params?: NewPaymentAddressParams
) => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

export type RealLocalSendRemainingAccountsResolver = (
  params?: SendRemainingAccountsParams
) => MaybePromise<
  LightRemainingAccountMeta[] | LightBackendOutcome<LightRemainingAccountMeta[]>
>;

export type RealLocalSendLightBackendConfig = {
  label?: string;

  resolvePackedAddressTreeInfo: RealLocalSendPackedAddressTreeInfoResolver;
  resolveValidityProofForSend: RealLocalSendValidityProofResolver;
  resolveNewPaymentAddressParams: RealLocalSendNewPaymentAddressResolver;
  resolveRemainingAccountsForSend: RealLocalSendRemainingAccountsResolver;
};

function backendLabel(config: RealLocalSendLightBackendConfig): string {
  return config.label ?? 'real-local-send-light-backend';
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
      `${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_EMPTY`
    );
  }

  return LightBackendResult.ready(deduped, outcome.note ?? `${label} ready`);
}

export function makeRealLocalSendLightBackend(
  config: RealLocalSendLightBackendConfig
): LightBackend {
  const fallback = createNoopLightBackend();
  const label = backendLabel(config);

  return {
    ...fallback,

    async getPackedAddressTreeInfo(params?: PackedAddressTreeInfoParams) {
      const isSendPath = !!params?.address;

      if (!isSendPath) {
        return fallback.getPackedAddressTreeInfo(params);
      }

      return resolveOutcome({
        label: `${label}.send.packedAddressTreeInfo`,
        resolver: () => config.resolvePackedAddressTreeInfo(params),
        errorCode: 'REAL_LOCAL_SEND_PACKED_ADDRESS_TREE_INFO_ERROR',
      });
    },

    async getValidityProofForSend(params?: SendProofParams) {
      return resolveOutcome({
        label: `${label}.send.validityProof`,
        resolver: () => config.resolveValidityProofForSend(params),
        errorCode: 'REAL_LOCAL_SEND_VALIDITY_PROOF_ERROR',
      });
    },

    async getNewPaymentAddressParams(params?: NewPaymentAddressParams) {
      return resolveOutcome({
        label: `${label}.send.newPaymentAddress`,
        resolver: () => config.resolveNewPaymentAddressParams(params),
        errorCode: 'REAL_LOCAL_SEND_NEW_PAYMENT_ADDRESS_ERROR',
      });
    },

    async getRemainingAccountsForSend(params?: SendRemainingAccountsParams) {
      const outcome = await resolveOutcome({
        label: `${label}.send.remainingAccounts`,
        resolver: () => config.resolveRemainingAccountsForSend(params),
        errorCode: 'REAL_LOCAL_SEND_REMAINING_ACCOUNTS_ERROR',
      });

      return validateRemainingAccountsOutcome(
        outcome,
        `${label}.send.remainingAccounts`
      );
    },
  };
}
