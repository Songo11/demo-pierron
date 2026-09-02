import { PublicKey } from '@solana/web3.js';
import type { StealthRecipientBundleV1 } from './stealthRecipientBundle';
import type { StealthPaymentNotificationV1 } from './stealthPaymentNotification.ts';

const STORAGE_KEYS = {
  stealthKeys: 'pierron.stealth.keys',
  stealthMeta: 'pierron.stealth.meta',
  stealthPending: 'pierron.stealth.pending',
  stealthClaimable: 'pierron.stealth.claimable',
  recipientBundleV1: 'pierron.stealth.recipient-bundle-v1',
  /** Ostatnie powiadomienie po udanym send (nadawca — ponowne kopiowanie). */
  lastSenderPaymentNotification: 'pierron.stealth.last-sender-payment-notification-v1',
  /** Gotowy sealed clipboard z send — bez ponownego szyfrowania złym viewPublicKey. */
  lastSenderPaymentSealedClipboard:
    'pierron.stealth.last-sender-payment-sealed-clipboard-v1',
};

export type StoredStealthKeys = {
  spendPublicKey: number[];
  viewPublicKey: number[];
  /** X25519 secret — tylko lokalnie; brak = stare klucze, trzeba ponownego register. */
  viewSecretKey?: number[];
  createdAt: string;
};

export type StoredStealthMeta = {
  owner: string;
  nonce: string;
  registeredAt: string;
  transactionCount: string;
  createdAt: string;
  /** Skompresowany adres StealthMeta z register (remainingAccounts role=address). */
  compressedMetaAddress?: string;
};

export type StoredStealthPendingStatus =
  | 'prepared'
  | 'pending'
  | 'claimable'
  | 'claimed'
  | 'failed';

export type StoredStealthPendingType =
  | 'register_stealth'
  | 'send_stealth'
  | 'claim_stealth';

export type StoredRecipientMode = 'debug-generated' | 'provided';

export type StoredStealthPendingItem = {
  id: string;
  type: StoredStealthPendingType;
  status: StoredStealthPendingStatus;
  mint?: string;
  amount?: string;
  stealthAddress?: string;
  senderHash?: string;
  recipientMode?: StoredRecipientMode;
  createdAt: string;
  updatedAt: string;
  notes?: string[];
};

export type NewStealthPendingItem = {
  type: StoredStealthPendingType;
  status: StoredStealthPendingStatus;
  mint?: string;
  amount?: string;
  stealthAddress?: string;
  senderHash?: string;
  recipientMode?: StoredRecipientMode;
  notes?: string[];
};

export type StoredStealthClaimableItem = {
  id: string;
  mint?: string;
  stealthAddress: string;
  amount: string;
  createdAt: string;
  claimed: boolean;
  senderHash?: string;
  owner?: string;
  recipientMode?: StoredRecipientMode;
  lightAddressSeedHex?: string;
};

export type NewStealthClaimableItem = {
  mint?: string;
  stealthAddress: string;
  amount: string;
  claimed: boolean;
  senderHash?: string;
  owner?: string;
  recipientMode?: StoredRecipientMode;
  lightAddressSeedHex?: string;
};

export type StealthStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type StorageLike = StealthStorageLike;

const memoryStorageData = new Map<string, string>();

const memoryStorage: StorageLike = {
  async getItem(key: string): Promise<string | null> {
    return memoryStorageData.has(key) ? memoryStorageData.get(key)! : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryStorageData.set(key, value);
  },

  async removeItem(key: string): Promise<void> {
    memoryStorageData.delete(key);
  },
};

let resolvedStorage: StorageLike | null = null;
let injectedStorage: StorageLike | null = null;

/** Web/dapp: localStorage zamiast AsyncStorage / memory. */
export function setStealthStorageBackend(storage: StealthStorageLike): void {
  injectedStorage = storage;
  resolvedStorage = storage;
}

function getRuntimeRequire():
  | ((id: string) => unknown)
  | undefined {
  try {
    return Function(
      'return typeof require !== "undefined" ? require : undefined;'
    )() as ((id: string) => unknown) | undefined;
  } catch {
    return undefined;
  }
}

function isStorageLike(value: unknown): value is StorageLike {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StorageLike>;
  return (
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function'
  );
}

function resolveStorage(): StorageLike {
  if (resolvedStorage) {
    return resolvedStorage;
  }

  if (injectedStorage) {
    resolvedStorage = injectedStorage;
    return resolvedStorage;
  }

  const runtimeRequire = getRuntimeRequire();

  if (runtimeRequire) {
    try {
      const mod = runtimeRequire(
        '@react-native-async-storage/async-storage'
      ) as
        | StorageLike
        | {
            default?: StorageLike;
          };

      const candidate =
        (mod as { default?: StorageLike })?.default ?? (mod as StorageLike);

      if (isStorageLike(candidate)) {
        resolvedStorage = candidate;
        return resolvedStorage;
      }
    } catch {
      // Node / test fallback: package not installed or not resolvable here.
    }
  }

  resolvedStorage = memoryStorage;
  return resolvedStorage;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await resolveStorage().getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await resolveStorage().setItem(key, JSON.stringify(value));
}

async function removeItem(key: string): Promise<void> {
  await resolveStorage().removeItem(key);
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveStealthKeys(keys: {
  spendPublicKey: number[];
  viewPublicKey: number[];
  viewSecretKey?: number[];
}) {
  const payload: StoredStealthKeys = {
    spendPublicKey: keys.spendPublicKey,
    viewPublicKey: keys.viewPublicKey,
    ...(keys.viewSecretKey ? { viewSecretKey: keys.viewSecretKey } : {}),
    createdAt: new Date().toISOString(),
  };

  await writeJson(STORAGE_KEYS.stealthKeys, payload);
}

export async function getStealthKeys(): Promise<StoredStealthKeys | null> {
  return readJson<StoredStealthKeys | null>(STORAGE_KEYS.stealthKeys, null);
}

export async function clearStealthKeys() {
  await removeItem(STORAGE_KEYS.stealthKeys);
}

export async function saveStealthMeta(meta: {
  owner: PublicKey | string;
  nonce: bigint | string;
  registeredAt: bigint | string;
  transactionCount: bigint | string;
  compressedMetaAddress?: PublicKey | string;
}) {
  const existing = await getStealthMeta();
  const compressedMetaAddress = meta.compressedMetaAddress
    ? typeof meta.compressedMetaAddress === 'string'
      ? meta.compressedMetaAddress
      : meta.compressedMetaAddress.toBase58()
    : existing?.compressedMetaAddress;

  const payload: StoredStealthMeta = {
    owner: typeof meta.owner === 'string' ? meta.owner : meta.owner.toBase58(),
    nonce: String(meta.nonce),
    registeredAt: String(meta.registeredAt),
    transactionCount: String(meta.transactionCount),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    compressedMetaAddress,
  };

  await writeJson(STORAGE_KEYS.stealthMeta, payload);
}

export async function getStealthMeta(): Promise<StoredStealthMeta | null> {
  return readJson<StoredStealthMeta | null>(STORAGE_KEYS.stealthMeta, null);
}

export async function clearStealthMeta() {
  await removeItem(STORAGE_KEYS.stealthMeta);
}

export async function saveRecipientBundleV1(
  bundle: StealthRecipientBundleV1
): Promise<void> {
  await writeJson(STORAGE_KEYS.recipientBundleV1, bundle);
}

export async function getRecipientBundleV1(): Promise<StealthRecipientBundleV1 | null> {
  return readJson<StealthRecipientBundleV1 | null>(
    STORAGE_KEYS.recipientBundleV1,
    null
  );
}

export async function clearRecipientBundleV1(): Promise<void> {
  await removeItem(STORAGE_KEYS.recipientBundleV1);
}

export async function getStealthPending(): Promise<StoredStealthPendingItem[]> {
  return readJson<StoredStealthPendingItem[]>(STORAGE_KEYS.stealthPending, []);
}

export async function addStealthPending(
  item: NewStealthPendingItem
): Promise<StoredStealthPendingItem> {
  const current = await getStealthPending();

  const nextItem: StoredStealthPendingItem = {
    ...item,
    id: makeId('stealth-pending'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const next = [nextItem, ...current];
  await writeJson(STORAGE_KEYS.stealthPending, next);

  return nextItem;
}

export async function updateStealthPending(
  id: string,
  patch: Partial<NewStealthPendingItem>
): Promise<StoredStealthPendingItem | null> {
  const current = await getStealthPending();
  let updated: StoredStealthPendingItem | null = null;

  const next = current.map((item) => {
    if (item.id !== id) return item;

    updated = {
      ...item,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    return updated!;
  });

  await writeJson(STORAGE_KEYS.stealthPending, next);
  return updated;
}

export async function removeStealthPending(id: string): Promise<void> {
  const current = await getStealthPending();
  const next = current.filter((item) => item.id !== id);
  await writeJson(STORAGE_KEYS.stealthPending, next);
}

export async function clearStealthPending(): Promise<void> {
  await removeItem(STORAGE_KEYS.stealthPending);
}

export async function getStealthClaimable(): Promise<StoredStealthClaimableItem[]> {
  return readJson<StoredStealthClaimableItem[]>(STORAGE_KEYS.stealthClaimable, []);
}

export async function addStealthClaimable(
  item: NewStealthClaimableItem
): Promise<StoredStealthClaimableItem> {
  const current = await getStealthClaimable();

  const nextItem: StoredStealthClaimableItem = {
    ...item,
    id: makeId('stealth-claimable'),
    createdAt: new Date().toISOString(),
  };

  const next = [nextItem, ...current];
  await writeJson(STORAGE_KEYS.stealthClaimable, next);

  return nextItem;
}

export async function markStealthClaimableAsClaimed(id: string): Promise<void> {
  const current = await getStealthClaimable();

  const next = current.map((item) =>
    item.id === id
      ? {
          ...item,
          claimed: true,
        }
      : item
  );

  await writeJson(STORAGE_KEYS.stealthClaimable, next);
}

export async function removeStealthClaimable(id: string): Promise<void> {
  const current = await getStealthClaimable();
  const next = current.filter((item) => item.id !== id);
  await writeJson(STORAGE_KEYS.stealthClaimable, next);
}

export async function clearStealthClaimable(): Promise<void> {
  await removeItem(STORAGE_KEYS.stealthClaimable);
}

export type ResolvedStoredClaimPaymentTarget = {
  stealthAddress: string;
  metaOwner?: string;
  sender?: string;
  senderHash?: string;
  amount?: string;
  mint: string;
  lightAddressSeedHex?: string;
  source: string;
};

/**
 * Odbiorca: preparedClaim (po wklejeniu powiadomienia) lub wpis w pierron.stealth.claimable.
 * Gdy jest dokładnie jedna nieodebrana płatność, użyj jej nawet przy innym mint w polu UI.
 */
export async function resolveStoredClaimPaymentTarget(params: {
  mint: string;
  preparedClaim?: {
    mint: string;
    stealthAddress: string;
    metaOwner: string;
    amount?: string;
    lightAddressSeedHex?: string;
    sender?: string;
    senderHash?: string;
  } | null;
}): Promise<ResolvedStoredClaimPaymentTarget | null> {
  const mintB58 = new PublicKey(params.mint.trim()).toBase58();
  const prepared = params.preparedClaim;

  if (
    prepared?.stealthAddress &&
    (!prepared.mint || prepared.mint === mintB58)
  ) {
    return {
      stealthAddress: prepared.stealthAddress,
      metaOwner: prepared.metaOwner,
      amount: prepared.amount,
      mint: prepared.mint || mintB58,
      lightAddressSeedHex: prepared.lightAddressSeedHex,
      sender: prepared.sender,
      senderHash: prepared.senderHash,
      source: 'preparedClaim',
    };
  }

  const items = await getStealthClaimable();
  const forMint = items.filter(
    (item) => !item.claimed && item.stealthAddress && (!item.mint || item.mint === mintB58)
  );
  if (forMint.length > 0) {
    const item = forMint[0]!;
    return {
      stealthAddress: item.stealthAddress,
      metaOwner: item.owner,
      amount: item.amount,
      mint: item.mint ?? mintB58,
      senderHash: item.senderHash,
      lightAddressSeedHex: item.lightAddressSeedHex,
      source: 'claimable-storage',
    };
  }

  const unclaimed = items.filter((item) => !item.claimed && item.stealthAddress);
  if (unclaimed.length === 1) {
    const item = unclaimed[0]!;
    return {
      stealthAddress: item.stealthAddress,
      metaOwner: item.owner,
      amount: item.amount,
      mint: item.mint ?? mintB58,
      lightAddressSeedHex: item.lightAddressSeedHex,
      source: 'claimable-storage-single',
    };
  }

  if (
    prepared?.stealthAddress &&
    prepared.mint &&
    prepared.mint !== mintB58
  ) {
    return {
      stealthAddress: prepared.stealthAddress,
      metaOwner: prepared.metaOwner,
      amount: prepared.amount,
      mint: prepared.mint,
      source: 'preparedClaim-mint-mismatch',
    };
  }

  return null;
}

export async function saveLastSenderPaymentNotification(
  notification: StealthPaymentNotificationV1
): Promise<void> {
  await writeJson(STORAGE_KEYS.lastSenderPaymentNotification, notification);
}

export async function getLastSenderPaymentNotification(): Promise<StealthPaymentNotificationV1 | null> {
  return readJson<StealthPaymentNotificationV1 | null>(
    STORAGE_KEYS.lastSenderPaymentNotification,
    null
  );
}

export async function saveLastSenderPaymentSealedClipboard(
  sealedClipboard: string
): Promise<void> {
  const trimmed = sealedClipboard.trim();
  if (!trimmed) {
    throw new Error('Pusty sealed clipboard powiadomienia');
  }
  await writeJson(STORAGE_KEYS.lastSenderPaymentSealedClipboard, trimmed);
}

export async function getLastSenderPaymentSealedClipboard(): Promise<string | null> {
  return readJson<string | null>(STORAGE_KEYS.lastSenderPaymentSealedClipboard, null);
}

export async function clearAllStealthStorage(): Promise<void> {
  await Promise.all([
    removeItem(STORAGE_KEYS.stealthKeys),
    removeItem(STORAGE_KEYS.stealthMeta),
    removeItem(STORAGE_KEYS.stealthPending),
    removeItem(STORAGE_KEYS.stealthClaimable),
    removeItem(STORAGE_KEYS.recipientBundleV1),
    removeItem(STORAGE_KEYS.lastSenderPaymentNotification),
    removeItem(STORAGE_KEYS.lastSenderPaymentSealedClipboard),
  ]);
}
