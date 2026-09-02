import { PublicKey } from '@solana/web3.js';

import {
  type LightBackend,
  type LightBackendOutcome,
  type LightRemainingAccountMeta,
  type PackedAddressTreeInfoParams,
  type SendProofParams,
  type ClaimProofParams,
  type RegisterProofParams,
  type ClaimerCompressedMetaParams,
  type PaymentCompressedMetaParams,
  type RegisterCompressedMetaParams,
  type NewPaymentAddressParams,
  type NewRegisterAddressParams,
  type SendRemainingAccountsParams,
  type ClaimRemainingAccountsParams,
  type RegisterRemainingAccountsParams,
  LightBackendResult,
} from './lightClient';

type MaybePromise<T> = T | Promise<T>;

type LocalLightSource<TParams, TValue> =
  | TValue
  | LightBackendOutcome<TValue>
  | ((params?: TParams) => MaybePromise<TValue | LightBackendOutcome<TValue>>);

export type LocalLightBackendConfig = {
  label?: string;

  send?: {
    packedAddressTreeInfo?: LocalLightSource<PackedAddressTreeInfoParams, Uint8Array>;
    validityProof?: LocalLightSource<SendProofParams, Uint8Array>;
    newPaymentAddress?: LocalLightSource<NewPaymentAddressParams, Uint8Array>;
    remainingAccounts?: LocalLightSource<
      SendRemainingAccountsParams,
      LightRemainingAccountMeta[]
    >;
  };

  claim?: {
    validityProof?: LocalLightSource<ClaimProofParams, Uint8Array>;
    claimerMeta?: LocalLightSource<ClaimerCompressedMetaParams, Uint8Array>;
    paymentMeta?: LocalLightSource<PaymentCompressedMetaParams, Uint8Array>;
    remainingAccounts?: LocalLightSource<
      ClaimRemainingAccountsParams,
      LightRemainingAccountMeta[]
    >;
  };

  register?: {
    packedAddressTreeInfo?: LocalLightSource<PackedAddressTreeInfoParams, Uint8Array>;
    validityProof?: LocalLightSource<RegisterProofParams, Uint8Array>;
    newAddress?: LocalLightSource<NewRegisterAddressParams, Uint8Array>;
    metaMeta?: LocalLightSource<RegisterCompressedMetaParams, Uint8Array>;
    remainingAccounts?: LocalLightSource<
      RegisterRemainingAccountsParams,
      LightRemainingAccountMeta[]
    >;
  };
};

function backendLabel(config?: LocalLightBackendConfig): string {
  return config?.label ?? 'local-light-backend';
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

async function resolveSource<TParams, TValue>(params: {
  source?: LocalLightSource<TParams, TValue>;
  input?: TParams;
  readyNote: string;
  missingNote: string;
  missingCode: string;
  errorCode: string;
}): Promise<LightBackendOutcome<TValue>> {
  if (!params.source) {
    return LightBackendResult.missing(params.missingNote, params.missingCode);
  }

  try {
    if (typeof params.source === 'function') {
      const resolved = await params.source(params.input);
      return toOutcome(resolved, params.readyNote);
    }

    return toOutcome(params.source, params.readyNote);
  } catch (cause) {
    return LightBackendResult.error(
      `${params.readyNote} failed: ${String((cause as Error)?.message ?? cause)}`,
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

async function resolveRemainingAccountsSource<TParams>(params: {
  source?: LocalLightSource<TParams, LightRemainingAccountMeta[]>;
  input?: TParams;
  readyNote: string;
  missingNote: string;
  missingCode: string;
  errorCode: string;
}): Promise<LightBackendOutcome<LightRemainingAccountMeta[]>> {
  const outcome = await resolveSource(params);

  if (outcome.status !== 'ready') {
    return outcome;
  }

  return LightBackendResult.ready(
    dedupeRemainingAccounts(outcome.value),
    outcome.note ?? params.readyNote
  );
}

export function makeLightRemainingAccount(params: {
  pubkey: PublicKey | string;
  isSigner?: boolean;
  isWritable?: boolean;
  role: string;
}): LightRemainingAccountMeta {
  return {
    pubkey:
      typeof params.pubkey === 'string' ? new PublicKey(params.pubkey) : params.pubkey,
    isSigner: params.isSigner ?? false,
    isWritable: params.isWritable ?? false,
    role: params.role,
  };
}

/**
 * Główny lokalny backend.
 *
 * Założenie:
 * - send możesz zasilić od razu fixture’ami albo resolverami
 * - claim/register mogą na razie zwracać missing
 * - później podmienisz pojedyncze źródła na realny client/prover/indexer
 */
export function makeLocalLightBackend(
  config: LocalLightBackendConfig = {}
): LightBackend {
  const label = backendLabel(config);

  return {
    async getPackedAddressTreeInfo(params?: PackedAddressTreeInfoParams) {
      const isRegisterPath = !!params?.owner && !params?.address;
      const isSendPath = !!params?.address;

      if (isSendPath) {
        return resolveSource({
          source: config.send?.packedAddressTreeInfo,
          input: params,
          readyNote: `${label}.send.packedAddressTreeInfo ready`,
          missingNote: `${label}.send.packedAddressTreeInfo missing`,
          missingCode: 'LOCAL_SEND_PACKED_ADDRESS_TREE_INFO_MISSING',
          errorCode: 'LOCAL_SEND_PACKED_ADDRESS_TREE_INFO_ERROR',
        });
      }

      if (isRegisterPath) {
        return resolveSource({
          source: config.register?.packedAddressTreeInfo,
          input: params,
          readyNote: `${label}.register.packedAddressTreeInfo ready`,
          missingNote: `${label}.register.packedAddressTreeInfo missing`,
          missingCode: 'LOCAL_REGISTER_PACKED_ADDRESS_TREE_INFO_MISSING',
          errorCode: 'LOCAL_REGISTER_PACKED_ADDRESS_TREE_INFO_ERROR',
        });
      }

      return LightBackendResult.missing(
        `${label}.packedAddressTreeInfo path not resolved`,
        'LOCAL_PACKED_ADDRESS_TREE_INFO_PATH_UNRESOLVED'
      );
    },

    async getValidityProofForSend(params?: SendProofParams) {
      return resolveSource({
        source: config.send?.validityProof,
        input: params,
        readyNote: `${label}.send.validityProof ready`,
        missingNote: `${label}.send.validityProof missing`,
        missingCode: 'LOCAL_SEND_VALIDITY_PROOF_MISSING',
        errorCode: 'LOCAL_SEND_VALIDITY_PROOF_ERROR',
      });
    },

    async getValidityProofForClaim(params?: ClaimProofParams) {
      return resolveSource({
        source: config.claim?.validityProof,
        input: params,
        readyNote: `${label}.claim.validityProof ready`,
        missingNote: `${label}.claim.validityProof missing`,
        missingCode: 'LOCAL_CLAIM_VALIDITY_PROOF_MISSING',
        errorCode: 'LOCAL_CLAIM_VALIDITY_PROOF_ERROR',
      });
    },

    async getValidityProofForRegister(params?: RegisterProofParams) {
      return resolveSource({
        source: config.register?.validityProof,
        input: params,
        readyNote: `${label}.register.validityProof ready`,
        missingNote: `${label}.register.validityProof missing`,
        missingCode: 'LOCAL_REGISTER_VALIDITY_PROOF_MISSING',
        errorCode: 'LOCAL_REGISTER_VALIDITY_PROOF_ERROR',
      });
    },

    async getCompressedMetaForClaimer(params?: ClaimerCompressedMetaParams) {
      return resolveSource({
        source: config.claim?.claimerMeta,
        input: params,
        readyNote: `${label}.claim.claimerMeta ready`,
        missingNote: `${label}.claim.claimerMeta missing`,
        missingCode: 'LOCAL_CLAIM_CLAIMER_META_MISSING',
        errorCode: 'LOCAL_CLAIM_CLAIMER_META_ERROR',
      });
    },

    async getCompressedMetaForPayment(params?: PaymentCompressedMetaParams) {
      return resolveSource({
        source: config.claim?.paymentMeta,
        input: params,
        readyNote: `${label}.claim.paymentMeta ready`,
        missingNote: `${label}.claim.paymentMeta missing`,
        missingCode: 'LOCAL_CLAIM_PAYMENT_META_MISSING',
        errorCode: 'LOCAL_CLAIM_PAYMENT_META_ERROR',
      });
    },

    async getCompressedMetaForRegister(params?: RegisterCompressedMetaParams) {
      return resolveSource({
        source: config.register?.metaMeta,
        input: params,
        readyNote: `${label}.register.metaMeta ready`,
        missingNote: `${label}.register.metaMeta missing`,
        missingCode: 'LOCAL_REGISTER_META_META_MISSING',
        errorCode: 'LOCAL_REGISTER_META_META_ERROR',
      });
    },

    async getNewPaymentAddressParams(params?: NewPaymentAddressParams) {
      return resolveSource({
        source: config.send?.newPaymentAddress,
        input: params,
        readyNote: `${label}.send.newPaymentAddress ready`,
        missingNote: `${label}.send.newPaymentAddress missing`,
        missingCode: 'LOCAL_SEND_NEW_PAYMENT_ADDRESS_MISSING',
        errorCode: 'LOCAL_SEND_NEW_PAYMENT_ADDRESS_ERROR',
      });
    },

    async getNewRegisterAddressParams(params?: NewRegisterAddressParams) {
      return resolveSource({
        source: config.register?.newAddress,
        input: params,
        readyNote: `${label}.register.newAddress ready`,
        missingNote: `${label}.register.newAddress missing`,
        missingCode: 'LOCAL_REGISTER_NEW_ADDRESS_MISSING',
        errorCode: 'LOCAL_REGISTER_NEW_ADDRESS_ERROR',
      });
    },

    async getRemainingAccountsForSend(params?: SendRemainingAccountsParams) {
      return resolveRemainingAccountsSource({
        source: config.send?.remainingAccounts,
        input: params,
        readyNote: `${label}.send.remainingAccounts ready`,
        missingNote: `${label}.send.remainingAccounts missing`,
        missingCode: 'LOCAL_SEND_REMAINING_ACCOUNTS_MISSING',
        errorCode: 'LOCAL_SEND_REMAINING_ACCOUNTS_ERROR',
      });
    },

    async getRemainingAccountsForClaim(params?: ClaimRemainingAccountsParams) {
      return resolveRemainingAccountsSource({
        source: config.claim?.remainingAccounts,
        input: params,
        readyNote: `${label}.claim.remainingAccounts ready`,
        missingNote: `${label}.claim.remainingAccounts missing`,
        missingCode: 'LOCAL_CLAIM_REMAINING_ACCOUNTS_MISSING',
        errorCode: 'LOCAL_CLAIM_REMAINING_ACCOUNTS_ERROR',
      });
    },

    async getRemainingAccountsForRegister(params?: RegisterRemainingAccountsParams) {
      return resolveRemainingAccountsSource({
        source: config.register?.remainingAccounts,
        input: params,
        readyNote: `${label}.register.remainingAccounts ready`,
        missingNote: `${label}.register.remainingAccounts missing`,
        missingCode: 'LOCAL_REGISTER_REMAINING_ACCOUNTS_MISSING',
        errorCode: 'LOCAL_REGISTER_REMAINING_ACCOUNTS_ERROR',
      });
    },
  };
}

/**
 * Wygodny skrót do pierwszego pionowego slice’a:
 * tylko send, reszta defaultowo missing.
 */
export function makeStaticSendLocalLightBackend(params: {
  packedAddressTreeInfo: Uint8Array;
  validityProof: Uint8Array;
  newPaymentAddress: Uint8Array;
  remainingAccounts: LightRemainingAccountMeta[];
  label?: string;
}): LightBackend {
  return makeLocalLightBackend({
    label: params.label ?? 'static-send-local-light-backend',
    send: {
      packedAddressTreeInfo: params.packedAddressTreeInfo,
      validityProof: params.validityProof,
      newPaymentAddress: params.newPaymentAddress,
      remainingAccounts: params.remainingAccounts,
    },
  });
}
