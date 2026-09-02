import { PublicKey } from '@solana/web3.js';

import type { SupportedCluster } from '../core/programIds.ts';
import { resolveStealthOutputTreeIndex } from '../light/lightCanonicalConfig.ts';
import type {
  EphemeralKey,
  LightDerivedStealthAddress,
  StealthKeys,
  StealthMetaAccount,
  StealthPaymentAccount,
  StealthRecipientPublicBundle,
  SenderHashMode,
} from './stealth.ts';
import {
  generateEphemeralKey,
  generateLightStealthAddress,
  generateStealthKeys,
  makeStealthMetaAccount,
  makeStealthPaymentAccount,
  slotLikeNonce,
  toFixed32,
  unixNowBigInt,
} from './stealth.ts';

export type RegisterStealthPayload = {
  keys: StealthKeys;
  metaAccount: StealthMetaAccount;
  outputTreeIndex: number;

  /**
   * Provisional/local-only seed values.
   * For register flow, canonical seed may later come from live maybeNewAddress.seed.
   */
  lightAddressSeed: Uint8Array;
  lightAddressSeedBytes: Uint8Array;

  lightAddressTree: PublicKey;
  lightAddressQueue: PublicKey;

  /**
   * Provisional/local-only derived address.
   * For register flow, canonical address may later need to be reconciled from live maybeNewAddress.seed.
   */
  stealthAddress: PublicKey;

  proof: unknown;
  addressTreeInfo: unknown;
  metaMeta: unknown | null;
  maybeNewAddress: unknown | null;
};

export type SendRecipientMode = 'debug-generated' | 'provided';

export type SendStealthPayload = {
  recipientMode: SendRecipientMode;
  recipientKeys: StealthRecipientPublicBundle;
  ephemeralKey: EphemeralKey;

  lightAddressSeed: Uint8Array;
  lightAddressSeedBytes: Uint8Array;
  lightAddressTree: PublicKey;
  lightAddressQueue: PublicKey;

  stealthAddress: PublicKey;
  paymentAccount: StealthPaymentAccount;
  amount: bigint;
  outputTreeIndex: number;
  proof: unknown;
  addressTreeInfo: unknown;
  maybeNewPaymentAddress: unknown | null;
};

function assert32Bytes(input: Uint8Array, label: string) {
  if (!(input instanceof Uint8Array) || input.length !== 32) {
    throw new Error(`${label} musi mieć dokładnie 32 bajty`);
  }
}

function clone32(input: Uint8Array, label: string): Uint8Array {
  assert32Bytes(input, label);
  return Uint8Array.from(input);
}

export function buildRegisterStealthPayload(params: {
  owner: PublicKey;
  programId: PublicKey;
  outputTreeIndex?: number;
  cluster?: SupportedCluster;
  seedBytes?: Uint8Array;
  addressTree?: PublicKey | string;
  addressQueue?: PublicKey | string;
}): RegisterStealthPayload {
  const keys = generateStealthKeys();
  const now = unixNowBigInt();
  const nonce = slotLikeNonce(params.owner);

  const metaAccount = makeStealthMetaAccount({
    owner: params.owner,
    nonce,
    registeredAt: now,
    transactionCount: 0n,
  });

  const lightDerived: LightDerivedStealthAddress = generateLightStealthAddress({
    programId: params.programId,
    seedBytes: params.seedBytes,
    addressTree: params.addressTree,
    addressQueue: params.addressQueue,
  });

  return {
    keys,
    metaAccount,
    outputTreeIndex: resolveStealthOutputTreeIndex({
      cluster: params.cluster,
      explicit: params.outputTreeIndex,
      flow: 'register',
    }),
    lightAddressSeed: Uint8Array.from(lightDerived.lightAddressSeed),
    lightAddressSeedBytes: Uint8Array.from(lightDerived.seedBytes),
    lightAddressTree: lightDerived.addressTree,
    lightAddressQueue: lightDerived.addressQueue,
    stealthAddress: lightDerived.stealthAddress,
    proof: null,
    addressTreeInfo: null,
    metaMeta: null,
    maybeNewAddress: null,
  };
}

export async function buildSendStealthPayload(params: {
  sender: PublicKey;
  programId: PublicKey;
  recipientSpendKey?: Uint8Array;
  recipientViewKey?: Uint8Array;
  /** Portfel odbiorcy (owner stealth meta) — wymagany do claim binding. */
  intendedClaimer?: PublicKey;
  amount: bigint;
  outputTreeIndex?: number;
  cluster?: SupportedCluster;
  senderHashMode?: SenderHashMode;
  seedBytes?: Uint8Array;
  addressTree?: PublicKey | string;
  addressQueue?: PublicKey | string;
}): Promise<SendStealthPayload> {
  const hasRecipientSpendKey = params.recipientSpendKey instanceof Uint8Array;
  const hasRecipientViewKey = params.recipientViewKey instanceof Uint8Array;

  if (hasRecipientSpendKey !== hasRecipientViewKey) {
    throw new Error(
      'Dla realnego odbiorcy trzeba przekazać jednocześnie recipientSpendKey i recipientViewKey.'
    );
  }

  const usingProvidedRecipient = hasRecipientSpendKey && hasRecipientViewKey;

  const recipientKeys: StealthRecipientPublicBundle = usingProvidedRecipient
    ? {
        spendPublicKey: clone32(params.recipientSpendKey!, 'recipientSpendKey'),
        viewPublicKey: clone32(params.recipientViewKey!, 'recipientViewKey'),
      }
    : (() => {
        const generated = generateStealthKeys();
        return {
          spendPublicKey: Uint8Array.from(generated.spendPublicKey),
          viewPublicKey: Uint8Array.from(generated.viewPublicKey),
        };
      })();

  const intendedClaimer = params.intendedClaimer ?? (usingProvidedRecipient ? undefined : params.sender);
  if (!intendedClaimer) {
    throw new Error(
      'Brak intendedClaimer (owner recipient bundle). Safe Send wymaga portfela odbiorcy do wiązania claim on-chain.'
    );
  }

  const ephemeralKey = generateEphemeralKey();

  const lightDerived: LightDerivedStealthAddress = generateLightStealthAddress({
    programId: params.programId,
    seedBytes: params.seedBytes,
    addressTree: params.addressTree,
    addressQueue: params.addressQueue,
  });

  const paymentAccount = await makeStealthPaymentAccount({
    stealthAddress: lightDerived.stealthAddress,
    amount: params.amount,
    createdAt: unixNowBigInt(),
    sender: params.sender,
    intendedClaimer,
    senderHashMode: params.senderHashMode ?? 'onchain',
  });

  return {
    recipientMode: usingProvidedRecipient ? 'provided' : 'debug-generated',
    recipientKeys,
    ephemeralKey,
    lightAddressSeed: Uint8Array.from(lightDerived.lightAddressSeed),
    lightAddressSeedBytes: Uint8Array.from(lightDerived.seedBytes),
    lightAddressTree: lightDerived.addressTree,
    lightAddressQueue: lightDerived.addressQueue,
    stealthAddress: lightDerived.stealthAddress,
    paymentAccount,
    amount: params.amount,
    outputTreeIndex: resolveStealthOutputTreeIndex({
      cluster: params.cluster,
      explicit: params.outputTreeIndex,
      flow: 'send',
    }),
    proof: null,
    addressTreeInfo: null,
    maybeNewPaymentAddress: null,
  };
}

export function serializeStealthKeys(keys: StealthKeys | StealthRecipientPublicBundle) {
  return {
    spend_public_key: toFixed32(keys.spendPublicKey),
    view_public_key: toFixed32(keys.viewPublicKey),
  };
}

export function serializeEphemeralKey(ephemeralKey: EphemeralKey) {
  return {
    ephemeral_public_key: toFixed32(ephemeralKey.ephemeralPublicKey),
  };
}

export function serializeStealthMetaAccount(meta: StealthMetaAccount) {
  return {
    owner: meta.owner,
    nonce: meta.nonce,
    registered_at: meta.registeredAt,
    transaction_count: meta.transactionCount,
  };
}

export function serializeStealthPaymentAccount(payment: StealthPaymentAccount) {
  return {
    stealth_address: payment.stealthAddress,
    amount: payment.amount,
    created_at: payment.createdAt,
    claimed: payment.claimed,
    sender_hash: payment.senderHash,
    intended_claimer: payment.intendedClaimer,
  };
}
