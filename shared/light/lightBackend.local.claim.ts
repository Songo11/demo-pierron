import type {
  ClaimProofParams,
  ClaimRemainingAccountsParams,
  ClaimerCompressedMetaParams,
  LightBackend,
  LightBackendOutcome,
  LightRemainingAccountMeta,
  PaymentCompressedMetaParams,
} from './lightClient.ts';
import {
  LightBackendResult,
  createNoopLightBackend,
} from './lightClient.ts';

type MaybePromise<T> = T | Promise<T>;

export type RealLocalClaimClaimerMetaResolver = (
  params?: ClaimerCompressedMetaParams
) => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

export type RealLocalClaimPaymentMetaResolver = (
  params?: PaymentCompressedMetaParams
) => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

export type RealLocalClaimValidityProofResolver = (
  params?: ClaimProofParams
) => MaybePromise<Uint8Array | LightBackendOutcome<Uint8Array>>;

export type RealLocalClaimRemainingAccountsResolver = (
  params?: ClaimRemainingAccountsParams
) => MaybePromise<
  LightRemainingAccountMeta[] | LightBackendOutcome<LightRemainingAccountMeta[]>
>;

export type RealLocalClaimLightBackendConfig = {
  label?: string;
  resolveClaimerMeta: RealLocalClaimClaimerMetaResolver;
  resolvePaymentMeta: RealLocalClaimPaymentMetaResolver;
  resolveValidityProofForClaim: RealLocalClaimValidityProofResolver;
  resolveRemainingAccountsForClaim: RealLocalClaimRemainingAccountsResolver;
};

function backendLabel(config: RealLocalClaimLightBackendConfig): string {
  return config.label ?? 'real-local-claim-light-backend';
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

export function makeRealLocalClaimLightBackend(
  config: RealLocalClaimLightBackendConfig
): LightBackend {
  const fallback = createNoopLightBackend();
  const label = backendLabel(config);

  return {
    ...fallback,

    async getCompressedMetaForClaimer(params?: ClaimerCompressedMetaParams) {
      return resolveOutcome({
        label: `${label}.claim.claimerMeta`,
        resolver: () => config.resolveClaimerMeta(params),
        errorCode: 'REAL_LOCAL_CLAIM_CLAIMER_META_ERROR',
      });
    },

    async getCompressedMetaForPayment(params?: PaymentCompressedMetaParams) {
      return resolveOutcome({
        label: `${label}.claim.paymentMeta`,
        resolver: () => config.resolvePaymentMeta(params),
        errorCode: 'REAL_LOCAL_CLAIM_PAYMENT_META_ERROR',
      });
    },

    async getValidityProofForClaim(params?: ClaimProofParams) {
      return resolveOutcome({
        label: `${label}.claim.validityProof`,
        resolver: () => config.resolveValidityProofForClaim(params),
        errorCode: 'REAL_LOCAL_CLAIM_VALIDITY_PROOF_ERROR',
      });
    },

    async getRemainingAccountsForClaim(params?: ClaimRemainingAccountsParams) {
      const outcome = await resolveOutcome({
        label: `${label}.claim.remainingAccounts`,
        resolver: () => config.resolveRemainingAccountsForClaim(params),
        errorCode: 'REAL_LOCAL_CLAIM_REMAINING_ACCOUNTS_ERROR',
      });

      return validateRemainingAccountsOutcome(
        outcome,
        `${label}.claim.remainingAccounts`
      );
    },
  };
}
