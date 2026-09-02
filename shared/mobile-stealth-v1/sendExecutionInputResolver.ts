import { PublicKey } from '@solana/web3.js';

import type { SupportedCluster } from '../core/programIds.ts';
import { resolveStealthOutputTreeIndex } from '../light/lightCanonicalConfig.ts';

export type FlexibleSendExecutionInput = {
  sender?: PublicKey | string;
  senderPublicKey?: PublicKey | string;
  senderPubkey?: PublicKey | string;
  owner?: PublicKey | string;
  ownerPublicKey?: PublicKey | string;
  ownerPubkey?: PublicKey | string;
  source?: PublicKey | string;
  from?: PublicKey | string;

  mint?: PublicKey | string;
  mintPublicKey?: PublicKey | string;
  mintPubkey?: PublicKey | string;
  tokenMint?: PublicKey | string;
  tokenMintPublicKey?: PublicKey | string;
  tokenMintPubkey?: PublicKey | string;

  amount?: bigint | number | string;
  amountLamports?: bigint | number | string;
  lamports?: bigint | number | string;
  value?: bigint | number | string;

  outputTreeIndex?: number | string | bigint;
  treeIndex?: number | string | bigint;

  recipientSpendKey?: Uint8Array | number[];
  recipientViewKey?: Uint8Array | number[];
  recipientSpendPublicKey?: Uint8Array | number[];
  recipientViewPublicKey?: Uint8Array | number[];

  /** Owner stealth meta odbiorcy — wiązanie claim on-chain. */
  intendedClaimer?: PublicKey | string;
  recipientOwner?: PublicKey | string;
  metaOwner?: PublicKey | string;

  allowDebugRecipientGeneration?: boolean;
  cluster?: SupportedCluster | string;

  [key: string]: unknown;
};

export type NormalizedPrepareSendStealthExecutionInput = {
  sender: PublicKey;
  mint: PublicKey;
  amount: bigint;
  outputTreeIndex: number;
  recipientSpendKey?: Uint8Array;
  recipientViewKey?: Uint8Array;
  intendedClaimer: PublicKey;
  allowDebugRecipientGeneration: boolean;
  cluster?: SupportedCluster;
  hasProvidedRecipientKeys: boolean;
  usedFallbackMint: boolean;
  usedFallbackAmount: boolean;
  resolutionNotes: string[];
};

const DEBUG_PLACEHOLDER_MINT = new PublicKey('11111111111111111111111111111111');
const DEBUG_PLACEHOLDER_AMOUNT = 1n;

const PRIMARY_CONTAINER_KEYS = [
  'params',
  'input',
  'request',
  'plan',
  'executionPlan',
  'preparedSend',
  'sendPrepared',
  'sendInput',
  'raw',
  'payload',
  'wallet',
  'provider',
  'lightBundle',
  'sendLightBundle',
] as const;

const RECIPIENT_BUNDLE_CONTAINER_KEYS = [
  'recipientStealthBundle',
  'recipientPublicStealthBundle',
  'publicStealthBundle',
  'recipientRegistration',
  'recipientBundle',
] as const;

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number');
}

function toPublicKey(value: unknown): PublicKey | null {
  if (!value) {
    return null;
  }

  if (value instanceof PublicKey) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      return new PublicKey(value);
    } catch {
      return null;
    }
  }

  if (value instanceof Uint8Array) {
    try {
      return new PublicKey(value);
    } catch {
      return null;
    }
  }

  if (isNumberArray(value)) {
    try {
      return new PublicKey(Uint8Array.from(value));
    } catch {
      return null;
    }
  }

  if (isDict(value)) {
    return (
      toPublicKey(value.publicKey) ??
      toPublicKey(value.pubkey) ??
      toPublicKey(value.key) ??
      null
    );
  }

  return null;
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (!value) {
    return null;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  if (isNumberArray(value)) {
    return Uint8Array.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(0));
  }

  return null;
}

function toBigIntValue(value: unknown): bigint | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return BigInt(Math.trunc(value));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }

  return null;
}

function toInteger(value: unknown): number | null {
  const bigintValue = toBigIntValue(value);
  if (bigintValue == null) {
    return null;
  }

  const asNumber = Number(bigintValue);
  if (!Number.isFinite(asNumber)) {
    return null;
  }

  return Math.trunc(asNumber);
}

function findValueByKeys(
  input: unknown,
  keys: readonly string[],
  containerKeys: readonly string[] = PRIMARY_CONTAINER_KEYS,
  depth = 0
): unknown {
  if (depth > 5 || !isDict(input)) {
    return undefined;
  }

  for (const key of keys) {
    if (input[key] !== undefined) {
      return input[key];
    }
  }

  for (const containerKey of containerKeys) {
    const nested = input[containerKey];
    const found = findValueByKeys(nested, keys, containerKeys, depth + 1);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function findBundleValueByKeys(input: unknown, keys: readonly string[]): unknown {
  if (!isDict(input)) {
    return undefined;
  }

  // Tylko kontenery recipient bundle — NIE cały input.
  // injectCanonicalSendAliases ustawia top-level `owner` = sender; szukanie `owner`
  // poza bundlem błędnie wiązało intendedClaimer do nadawcy.
  for (const bundleKey of RECIPIENT_BUNDLE_CONTAINER_KEYS) {
    const bundle = input[bundleKey];
    if (!isDict(bundle)) {
      continue;
    }
    const found = findValueByKeys(
      bundle,
      keys,
      [...PRIMARY_CONTAINER_KEYS, ...RECIPIENT_BUNDLE_CONTAINER_KEYS],
      0
    );
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

export function resolveSendOwnerPublicKey(input: unknown): PublicKey | null {
  return (
    toPublicKey(
      findValueByKeys(input, [
        'sender',
        'senderPublicKey',
        'senderPubkey',
        'owner',
        'ownerPublicKey',
        'ownerPubkey',
        'source',
        'sourcePublicKey',
        'sourcePubkey',
        'from',
        'fromPublicKey',
        'fromPubkey',
      ])
    ) ??
    toPublicKey(
      findValueByKeys(input, ['publicKey', 'pubkey'], ['wallet', 'provider', 'authority', 'payer'])
    ) ??
    null
  );
}

export function resolveSendRecipientPublicKey(input: unknown): PublicKey | null {
  return (
    toPublicKey(
      findValueByKeys(input, [
        'recipient',
        'recipientPublicKey',
        'recipientPubkey',
        'recipientOwner',
        'recipientOwnerPublicKey',
        'recipientOwnerPubkey',
        'recipientWallet',
        'recipientWalletPublicKey',
        'recipientWalletPubkey',
        'destination',
        'destinationPublicKey',
        'destinationPubkey',
        'destinationOwner',
        'destinationOwnerPublicKey',
        'destinationOwnerPubkey',
        'receiver',
        'receiverPublicKey',
        'receiverPubkey',
        'payee',
        'payeePublicKey',
        'payeePubkey',
        'claimer',
        'claimerPublicKey',
        'claimerPubkey',
      ])
    ) ??
    toPublicKey(
      findBundleValueByKeys(input, [
        'owner',
        'recipient',
        'recipientPublicKey',
        'recipientPubkey',
        'recipientOwner',
        'recipientOwnerPublicKey',
        'recipientOwnerPubkey',
        'publicKey',
        'pubkey',
      ])
    ) ??
    null
  );
}

export function resolveSendMintPublicKey(input: unknown): PublicKey | null {
  return (
    toPublicKey(
      findValueByKeys(input, [
        'mint',
        'mintPublicKey',
        'mintPubkey',
        'tokenMint',
        'tokenMintPublicKey',
        'tokenMintPubkey',
      ])
    ) ?? null
  );
}

export function resolveSendAmount(input: unknown): bigint | null {
  return (
    toBigIntValue(
      findValueByKeys(input, ['amount', 'amountLamports', 'lamports', 'value', 'tokenAmount'])
    ) ?? null
  );
}

export function resolveSendOutputTreeIndex(input: unknown): number | null {
  return toInteger(findValueByKeys(input, ['outputTreeIndex', 'treeIndex']));
}

export function resolveSendRecipientSpendKey(input: unknown): Uint8Array | null {
  return (
    toUint8Array(
      findValueByKeys(input, ['recipientSpendKey', 'recipientSpendPublicKey'])
    ) ??
    toUint8Array(
      findBundleValueByKeys(input, [
        'recipientSpendKey',
        'recipientSpendPublicKey',
        'spendPublicKey',
        'spendKey',
      ])
    ) ??
    null
  );
}

export function resolveSendRecipientViewKey(input: unknown): Uint8Array | null {
  return (
    toUint8Array(
      findValueByKeys(input, ['recipientViewKey', 'recipientViewPublicKey'])
    ) ??
    toUint8Array(
      findBundleValueByKeys(input, [
        'recipientViewKey',
        'recipientViewPublicKey',
        'viewPublicKey',
        'viewKey',
      ])
    ) ??
    null
  );
}

export function injectCanonicalSendAliases<T extends FlexibleSendExecutionInput>(input: T): T {
  const sender = resolveSendOwnerPublicKey(input);
  const recipient = resolveSendRecipientPublicKey(input);
  const mint = resolveSendMintPublicKey(input);
  const amount = resolveSendAmount(input);
  const recipientSpendKey = resolveSendRecipientSpendKey(input);
  const recipientViewKey = resolveSendRecipientViewKey(input);

  const out: Record<string, unknown> = { ...input };

  if (sender) {
    out.sender ??= sender;
    out.senderPublicKey ??= sender;
    out.senderPubkey ??= sender;
    out.owner ??= sender;
    out.ownerPublicKey ??= sender;
    out.ownerPubkey ??= sender;
    out.source ??= sender;
    out.sourcePublicKey ??= sender;
    out.sourcePubkey ??= sender;
    out.from ??= sender;
    out.fromPublicKey ??= sender;
    out.fromPubkey ??= sender;
  }

  if (recipient) {
    out.recipient ??= recipient;
    out.recipientPublicKey ??= recipient;
    out.recipientPubkey ??= recipient;
    out.recipientOwner ??= recipient;
    out.recipientOwnerPublicKey ??= recipient;
    out.recipientOwnerPubkey ??= recipient;
    out.recipientWallet ??= recipient;
    out.recipientWalletPublicKey ??= recipient;
    out.recipientWalletPubkey ??= recipient;
    out.destination ??= recipient;
    out.destinationPublicKey ??= recipient;
    out.destinationPubkey ??= recipient;
    out.destinationOwner ??= recipient;
    out.destinationOwnerPublicKey ??= recipient;
    out.destinationOwnerPubkey ??= recipient;
    out.receiver ??= recipient;
    out.receiverPublicKey ??= recipient;
    out.receiverPubkey ??= recipient;
    out.payee ??= recipient;
    out.payeePublicKey ??= recipient;
    out.payeePubkey ??= recipient;
    out.claimer ??= recipient;
    out.claimerPublicKey ??= recipient;
    out.claimerPubkey ??= recipient;
  }

  if (mint) {
    out.mint ??= mint;
    out.mintPublicKey ??= mint;
    out.mintPubkey ??= mint;
    out.tokenMint ??= mint;
    out.tokenMintPublicKey ??= mint;
    out.tokenMintPubkey ??= mint;
  }

  if (amount != null) {
    out.amount ??= amount;
    out.amountLamports ??= amount;
    out.lamports ??= amount;
  }

  if (recipientSpendKey) {
    out.recipientSpendKey ??= recipientSpendKey;
    out.recipientSpendPublicKey ??= recipientSpendKey;
  }

  if (recipientViewKey) {
    out.recipientViewKey ??= recipientViewKey;
    out.recipientViewPublicKey ??= recipientViewKey;
  }

  return out as T;
}

export function normalizePrepareSendStealthExecutionInput(
  rawInput: FlexibleSendExecutionInput
): NormalizedPrepareSendStealthExecutionInput {
  if (!isDict(rawInput)) {
    throw new TypeError('prepareSendStealthExecution oczekuje obiektu wejściowego.');
  }

  const input = injectCanonicalSendAliases(rawInput);

  const sender = resolveSendOwnerPublicKey(input);
  if (!sender) {
    throw new TypeError(
      'Nie udało się rozwiązać sender/owner dla send_stealth. Oczekiwano sender/owner albo aliasu z PublicKey.'
    );
  }

  const resolvedMint = resolveSendMintPublicKey(input);
  const amountValue = resolveSendAmount(input);
  const outputTreeIndex = resolveStealthOutputTreeIndex({
    cluster: typeof input.cluster === 'string' ? (input.cluster as SupportedCluster) : undefined,
    explicit: resolveSendOutputTreeIndex(input),
    flow: 'send',
  });

  const recipientSpendKey = resolveSendRecipientSpendKey(input) ?? undefined;
  const recipientViewKey = resolveSendRecipientViewKey(input) ?? undefined;

  const hasProvidedRecipientKeys =
    recipientSpendKey instanceof Uint8Array && recipientViewKey instanceof Uint8Array;

  const allowDebugRecipientGeneration = Boolean(input.allowDebugRecipientGeneration);

  const resolutionNotes: string[] = [];

  if (hasProvidedRecipientKeys) {
    const topLevelSpend = toUint8Array(input.recipientSpendKey);
    const topLevelView = toUint8Array(input.recipientViewKey);
    if (!topLevelSpend || !topLevelView) {
      resolutionNotes.push(
        'Klucze recipientSpendKey/recipientViewKey zostały rozwiązane z aliasów lub recipient public stealth bundle.'
      );
    }
  }

  const usedFallbackMint = !resolvedMint;
  const usedFallbackAmount = amountValue == null;

  if (usedFallbackMint) {
    resolutionNotes.push(
      'Nie przekazano mint dla send_stealth. Użyto debug placeholder mint i oznaczono flow jako local-only.'
    );
  }

  if (usedFallbackAmount) {
    resolutionNotes.push(
      'Nie przekazano amount dla send_stealth. Użyto debug placeholder amount=1 i oznaczono flow jako local-only.'
    );
  }

  // Explicit claimer: pole intendedClaimer / owner w recipient bundle.
  // Nie używamy bare top-level `owner` (to alias sendera po injectCanonicalSendAliases).
  const explicitIntendedClaimer =
    toPublicKey(
      findValueByKeys(input, [
        'intendedClaimer',
        'intended_claimer',
        'metaOwner',
        'recipientOwner',
      ])
    ) ??
    toPublicKey(
      findBundleValueByKeys(input, [
        'owner',
        'recipient',
        'recipientPublicKey',
        'recipientPubkey',
        'recipientOwner',
        'recipientOwnerPublicKey',
        'recipientOwnerPubkey',
        'publicKey',
        'pubkey',
      ])
    );

  if (hasProvidedRecipientKeys && !explicitIntendedClaimer) {
    throw new TypeError(
      'Brak intendedClaimer / owner w recipient bundle. Safe Send wymaga portfela odbiorcy (wiąże claim on-chain).'
    );
  }

  const intendedClaimer =
    explicitIntendedClaimer ??
    (!hasProvidedRecipientKeys ? resolveSendRecipientPublicKey(input) : null) ??
    (!hasProvidedRecipientKeys ? sender : null);

  if (!intendedClaimer) {
    throw new TypeError(
      'Brak intendedClaimer / owner w recipient bundle. Safe Send wymaga portfela odbiorcy (wiąże claim on-chain).'
    );
  }

  if (!hasProvidedRecipientKeys && allowDebugRecipientGeneration) {
    resolutionNotes.push(
      `Debug recipient: intendedClaimer ustawiony na sender (${sender.toBase58()}).`
    );
  } else if (explicitIntendedClaimer) {
    resolutionNotes.push(`intendedClaimer: ${intendedClaimer.toBase58()}`);
  }

  return {
    sender,
    mint: resolvedMint ?? DEBUG_PLACEHOLDER_MINT,
    amount: amountValue ?? DEBUG_PLACEHOLDER_AMOUNT,
    outputTreeIndex,
    recipientSpendKey,
    recipientViewKey,
    intendedClaimer,
    allowDebugRecipientGeneration,
    cluster: typeof input.cluster === 'string' ? (input.cluster as SupportedCluster) : undefined,
    hasProvidedRecipientKeys,
    usedFallbackMint,
    usedFallbackAmount,
    resolutionNotes,
  };
}
