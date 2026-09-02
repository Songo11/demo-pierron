import { PublicKey } from '@solana/web3.js';

import { PIERRON_STEALTH_PROGRAM_ID } from '../core/programIds.ts';
import type { StealthMetaAccount, StealthPaymentAccount } from '../stealth-base/stealth.ts';
import { resolvePierronDevnetCompressionEndpoint } from '../solana/devnetRpcDefaults.ts';
import { isRpcBackendExhaustedError } from '../solana/rpcEndpoint.ts';
import { discoveryHashForPhotonRpc, discoveryHashesForPhotonRpc } from './discoveryHashRpc.ts';
import {
  fetchCompressedAccountsByOwnerOverRpc,
  fetchPhotonCompressedAccountsByHashes,
} from './lightLiveLocalClient.ts';
import {
  tryDecodeStealthMetaFromPhotonAccountBytesOnly,
  tryDecodeStealthMetaFromPhotonNormalizeInput,
  tryDecodeStealthPaymentFromPhotonAccountBytesOnly,
  tryDecodeStealthPaymentFromPhotonNormalizeInput,
} from './lightLiveLocalNormalization.ts';
import type { PartialLightLocalRuntimeConfig } from './lightLocalRuntime.ts';

function decodeStealthMetaPreferLeafBytes(input: unknown): StealthMetaAccount | null {
  return (
    tryDecodeStealthMetaFromPhotonAccountBytesOnly(input) ??
    tryDecodeStealthMetaFromPhotonNormalizeInput(input)
  );
}

function decodeStealthPaymentPreferLeafBytes(input: unknown): StealthPaymentAccount | null {
  return (
    tryDecodeStealthPaymentFromPhotonAccountBytesOnly(input) ??
    tryDecodeStealthPaymentFromPhotonNormalizeInput(input)
  );
}

function hashMatchesItem(itemHash: string, wanted: string): boolean {
  if (itemHash === wanted) {
    return true;
  }
  try {
    return discoveryHashForPhotonRpc(itemHash) === wanted;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wybiera element batch Photona pasujący do hash (meta lub payment). */
export function pickPhotonBatchItemForHash(batch: unknown, hash: string): unknown | null {
  if (batch == null || typeof batch !== 'object') {
    return null;
  }
  const value = (batch as { value?: unknown }).value ?? batch;
  const items = Array.isArray(value)
    ? value
    : Array.isArray((value as { items?: unknown[] })?.items)
      ? ((value as { items: unknown[] }).items ?? [])
      : [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const account =
      rec.account && typeof rec.account === 'object' ? rec.account : rec;
    const itemHash =
      typeof (account as { hash?: unknown }).hash === 'string'
        ? (account as { hash: string }).hash
        : typeof rec.hash === 'string'
          ? rec.hash
          : null;
    if (itemHash && hashMatchesItem(itemHash, hash)) {
      return item;
    }
  }
  return null;
}

function listPhotonBatchItems(batch: unknown): unknown[] {
  if (batch == null || typeof batch !== 'object') {
    return [];
  }
  const value = (batch as { value?: unknown }).value ?? batch;
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray((value as { items?: unknown[] })?.items)) {
    return (value as { items: unknown[] }).items ?? [];
  }
  return [];
}

type DecodedPair = {
  meta: StealthMetaAccount;
  payment: StealthPaymentAccount;
};

function tryPairFromItems(
  items: unknown[],
  claimer: PublicKey,
  stealthAddress?: PublicKey,
  metaOwner?: PublicKey
): DecodedPair | null {
  const expectedMetaOwner = metaOwner ?? claimer;
  const metas: StealthMetaAccount[] = [];
  const payments: StealthPaymentAccount[] = [];
  for (const item of items) {
    const meta = decodeStealthMetaPreferLeafBytes(item);
    const payment = decodeStealthPaymentPreferLeafBytes(item);
    if (meta) metas.push(meta);
    if (payment) payments.push(payment);
  }
  for (const meta of metas) {
    if (!meta.owner.equals(expectedMetaOwner)) continue;
    for (const payment of payments) {
      if (payment.claimed) continue;
      if (!payment.intendedClaimer.equals(claimer)) continue;
      if (stealthAddress && !payment.stealthAddress.equals(stealthAddress)) continue;
      return { meta, payment };
    }
  }
  return null;
}

function decodePairFromHashOrder(params: {
  batch: unknown;
  hashA: string;
  hashB: string;
  claimer: PublicKey;
  stealthAddress?: PublicKey;
  metaOwner?: PublicKey;
}): DecodedPair | null {
  const expectedMetaOwner = params.metaOwner ?? params.claimer;
  const itemA = pickPhotonBatchItemForHash(params.batch, params.hashA);
  const itemB = pickPhotonBatchItemForHash(params.batch, params.hashB);
  const candidates: Array<{ metaSrc: unknown; paySrc: unknown }> = [];
  if (itemA != null && itemB != null) {
    candidates.push({ metaSrc: itemA, paySrc: itemB });
    candidates.push({ metaSrc: itemB, paySrc: itemA });
  }
  for (const c of candidates) {
    const meta = decodeStealthMetaPreferLeafBytes(c.metaSrc);
    const payment = decodeStealthPaymentPreferLeafBytes(c.paySrc);
    if (!meta || !payment) continue;
    if (!meta.owner.equals(expectedMetaOwner)) continue;
    if (payment.claimed) continue;
    if (!payment.intendedClaimer.equals(params.claimer)) continue;
    if (params.stealthAddress && !payment.stealthAddress.equals(params.stealthAddress)) {
      continue;
    }
    return { meta, payment };
  }
  return tryPairFromItems(
    listPhotonBatchItems(params.batch),
    params.claimer,
    params.stealthAddress,
    params.metaOwner
  );
}

function photonHasLeafData(input: unknown): boolean {
  if (input == null || typeof input !== 'object') return false;
  return (
    decodeStealthMetaPreferLeafBytes(input) != null ||
    decodeStealthPaymentPreferLeafBytes(input) != null
  );
}

/**
 * Dekoduje StealthMeta + StealthPayment z photonPayload bundle.
 * Gdy `getCompressedAccount` zwraca `data: null`, ponawia przez `getMultipleCompressedAccounts`
 * oraz skan po ownerze (Helius często uzupełnia leaf dopiero po chwili; by-hash bywa wolniejszy).
 */
export async function resolveClaimStealthAccountsFromPhoton(params: {
  claimer: PublicKey;
  claimerPhoton: unknown;
  paymentPhoton: unknown;
  sourceHashes?: string[];
  /** Opcjonalnie: zawęża płatność do oczekiwanego adresu stealth. */
  stealthAddress?: PublicKey;
  /** Owner meta (zwykle nadawca / zarejestrowany owner) — skan Photon by-owner. */
  metaOwner?: PublicKey;
  runtime?: PartialLightLocalRuntimeConfig;
  /** Domyślnie 6×2s — discovery już polluje; zbyt długi decode wpadał w 180s timeout UI. */
  maxAttempts?: number;
  delayMs?: number;
}): Promise<{
  meta: StealthMetaAccount;
  payment: StealthPaymentAccount;
} | null> {
  const preferLeafBytes = (params.sourceHashes?.length ?? 0) >= 2;
  const expectedMetaOwner = params.metaOwner ?? params.claimer;
  let meta = preferLeafBytes
    ? decodeStealthMetaPreferLeafBytes(params.claimerPhoton)
    : tryDecodeStealthMetaFromPhotonNormalizeInput(params.claimerPhoton);
  let payment = decodeStealthPaymentPreferLeafBytes(params.paymentPhoton);

  if (
    meta &&
    payment &&
    meta.owner.equals(expectedMetaOwner) &&
    !payment.claimed &&
    payment.intendedClaimer.equals(params.claimer) &&
    (!params.stealthAddress || payment.stealthAddress.equals(params.stealthAddress))
  ) {
    return { meta, payment };
  }

  // Payload już ma leaf bytes? — nie czekaj na hash retry jeśli para się nie składa
  // (zły claimer / claimed). Poniżej i tak spróbujemy świeżego fetchu.
  const hashes = params.sourceHashes?.filter((h) => h.length > 0) ?? [];
  const maxAttempts = Math.max(1, params.maxAttempts ?? 6);
  const delayMs = Math.max(500, params.delayMs ?? 2_000);

  const ownerCandidates = Array.from(
    new Map(
      [params.metaOwner, params.claimer, PIERRON_STEALTH_PROGRAM_ID]
        .filter((k): k is PublicKey => Boolean(k))
        .map((k) => [k.toBase58(), k] as const)
    ).values()
  );

  let lastBatchError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // 1) Batch by known hashes (gdy discovery je już znalazło).
    if (hashes.length >= 2) {
      const rpcHashes = discoveryHashesForPhotonRpc(hashes);
      const hashA = rpcHashes[0]!;
      const hashB = rpcHashes[1] ?? rpcHashes[0]!;
      try {
        const batch = await fetchPhotonCompressedAccountsByHashes({
          hashes,
          runtime: params.runtime,
        });
        const paired = decodePairFromHashOrder({
          batch,
          hashA,
          hashB,
          claimer: params.claimer,
          stealthAddress: params.stealthAddress,
          metaOwner: params.metaOwner,
        });
        if (paired) {
          return paired;
        }
      } catch (err) {
        lastBatchError = err;
        const msg = String((err as Error)?.message ?? err);
        if (isRpcBackendExhaustedError(msg) || /max usage|-32429/i.test(msg)) {
          throw err;
        }
      }
    }

    // 2) By-owner fallback — często ma `data` gdy by-hash jeszcze zwraca null.
    for (const owner of ownerCandidates) {
      try {
        const batch = await fetchCompressedAccountsByOwnerOverRpc({
          owner,
          runtime: params.runtime,
          limit: 100,
        });
        const paired = tryPairFromItems(
          listPhotonBatchItems(batch),
          params.claimer,
          params.stealthAddress,
          params.metaOwner
        );
        if (paired) {
          return paired;
        }
      } catch (err) {
        lastBatchError = err;
        const msg = String((err as Error)?.message ?? err);
        if (isRpcBackendExhaustedError(msg) || /max usage|-32429/i.test(msg)) {
          throw err;
        }
      }
    }

    // Jeśli lokalne payloady w końcu dostały leaf (rzadkie) — spróbuj jeszcze raz.
    if (
      photonHasLeafData(params.claimerPhoton) &&
      photonHasLeafData(params.paymentPhoton)
    ) {
      meta = decodeStealthMetaPreferLeafBytes(params.claimerPhoton);
      payment = decodeStealthPaymentPreferLeafBytes(params.paymentPhoton);
      if (
        meta &&
        payment &&
        meta.owner.equals(expectedMetaOwner) &&
        !payment.claimed &&
        payment.intendedClaimer.equals(params.claimer) &&
        (!params.stealthAddress || payment.stealthAddress.equals(params.stealthAddress))
      ) {
        return { meta, payment };
      }
    }

    if (attempt < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  if (lastBatchError) {
    const msg = String((lastBatchError as Error)?.message ?? lastBatchError);
    if (isRpcBackendExhaustedError(msg) || /max usage|-32429/i.test(msg)) {
      throw lastBatchError;
    }
  }

  // Bez ≥2 hashów i bez udanego skanu owner — nie udało się.
  return null;
}

function photonItemHash(item: unknown): string | null {
  if (item == null || typeof item !== 'object') {
    return null;
  }
  const rec = item as Record<string, unknown>;
  const account =
    rec.account && typeof rec.account === 'object'
      ? (rec.account as Record<string, unknown>)
      : rec;
  if (typeof account.hash === 'string' && account.hash.length > 0) {
    return account.hash;
  }
  if (typeof rec.hash === 'string' && rec.hash.length > 0) {
    return rec.hash;
  }
  return null;
}

function photonItemAddress(item: unknown): string | null {
  if (item == null || typeof item !== 'object') {
    return null;
  }
  const rec = item as Record<string, unknown>;
  const account =
    rec.account && typeof rec.account === 'object'
      ? (rec.account as Record<string, unknown>)
      : rec;
  if (typeof account.address === 'string' && account.address.length > 0) {
    return account.address;
  }
  if (typeof rec.address === 'string' && rec.address.length > 0) {
    return rec.address;
  }
  return null;
}

function normalizeAmountLoose(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim().replace(/_/g, '');
  if (!s || !/^\d+$/.test(s)) return null;
  return s.replace(/^0+(?=\d)/, '') || '0';
}

export type ClaimPhotonLeafHints = {
  totalPayments: number;
  unclaimedForClaimer: number;
  sampleStealthAddresses: string[];
  paymentHash?: string;
  paymentStealthAddress?: string;
  metaHash?: string;
  metaPhotonAddress?: string;
};

/**
 * Jeden skan programu stealth → meta + payment hash dla claimera.
 * Omija wolny discover (seed/bootstrap/poll), który na mobile wpada w 45s timeout.
 */
export async function resolveClaimPhotonLeafHints(params: {
  claimer: PublicKey;
  metaOwner?: PublicKey;
  registerCompressedAddress?: PublicKey;
  /** Preferuj płatność z tą kwotą (z powiadomienia). */
  expectedPaymentAmount?: string;
  expectedSenderHash?: string;
  /** Preferuj płatność pod tym adresem stealth (z powiadomienia). */
  preferredStealthAddress?: PublicKey;
  runtime?: PartialLightLocalRuntimeConfig;
}): Promise<ClaimPhotonLeafHints> {
  const runtime: PartialLightLocalRuntimeConfig = {
    ...(params.runtime ?? {}),
  };
  if (!runtime.photonUrl && !runtime.indexerUrl && !runtime.rpcUrl) {
    const endpoint = resolvePierronDevnetCompressionEndpoint({});
    runtime.photonUrl = endpoint;
    runtime.indexerUrl = endpoint;
    runtime.rpcUrl = endpoint;
  }

  const batch = await fetchCompressedAccountsByOwnerOverRpc({
    owner: PIERRON_STEALTH_PROGRAM_ID,
    runtime,
    limit: 1000,
  });
  const items = listPhotonBatchItems(batch);
  const metaOwner = params.metaOwner ?? params.claimer;
  const registerB58 = params.registerCompressedAddress?.toBase58();
  const preferredStealthB58 = params.preferredStealthAddress?.toBase58();
  const expectedAmt = normalizeAmountLoose(params.expectedPaymentAmount);
  const expectedSender = normalizeAmountLoose(params.expectedSenderHash);

  let totalPayments = 0;
  let unclaimedForClaimer = 0;
  const sampleStealthAddresses: string[] = [];

  type PayRow = {
    hash: string;
    stealthAddress: string;
    amount?: string;
    senderHash?: string;
    createdAt: bigint;
    photonAddress?: string;
  };
  type MetaRow = {
    hash: string;
    registeredAt: bigint;
    photonAddress?: string;
  };

  const payments: PayRow[] = [];
  const metas: MetaRow[] = [];

  for (const item of items) {
    const hash = photonItemHash(item);
    const address = photonItemAddress(item) ?? undefined;

    const payment = decodeStealthPaymentPreferLeafBytes(item);
    if (payment) {
      totalPayments += 1;
      if (!payment.claimed && payment.intendedClaimer.equals(params.claimer) && hash) {
        unclaimedForClaimer += 1;
        const stealthB58 = payment.stealthAddress.toBase58();
        if (sampleStealthAddresses.length < 3) {
          sampleStealthAddresses.push(stealthB58);
        }
        payments.push({
          hash,
          stealthAddress: stealthB58,
          amount: normalizeAmountLoose(payment.amount) ?? undefined,
          senderHash: normalizeAmountLoose(payment.senderHash) ?? undefined,
          createdAt: payment.createdAt,
          photonAddress: address,
        });
      }
    }

    const meta = decodeStealthMetaPreferLeafBytes(item);
    if (meta && meta.owner.equals(metaOwner) && hash) {
      metas.push({
        hash,
        registeredAt: meta.registeredAt,
        photonAddress: address,
      });
    }
  }

  let chosenPay: PayRow | undefined;
  if (preferredStealthB58) {
    chosenPay = payments.find((p) => p.stealthAddress === preferredStealthB58);
  }
  if (!chosenPay && expectedSender) {
    const bySender = payments.filter((p) => p.senderHash === expectedSender);
    if (bySender.length === 1) {
      chosenPay = bySender[0];
    } else if (bySender.length > 1) {
      chosenPay = bySender.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    }
  }
  if (!chosenPay && expectedAmt) {
    const byAmt = payments.filter((p) => p.amount === expectedAmt);
    if (byAmt.length === 1) {
      chosenPay = byAmt[0];
    } else if (byAmt.length > 1) {
      chosenPay = byAmt.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    }
  }
  if (!chosenPay && payments.length > 0) {
    chosenPay = payments.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  }

  let chosenMeta: MetaRow | undefined;
  if (registerB58) {
    chosenMeta = metas.find((m) => m.photonAddress === registerB58);
  }
  if (!chosenMeta && metas.length > 0) {
    chosenMeta = metas.reduce((a, b) =>
      b.registeredAt > a.registeredAt ? b : a
    );
  }

  return {
    totalPayments,
    unclaimedForClaimer,
    sampleStealthAddresses,
    paymentHash: chosenPay?.hash,
    paymentStealthAddress: chosenPay?.stealthAddress,
    metaHash: chosenMeta?.hash,
    metaPhotonAddress: chosenMeta?.photonAddress,
  };
}

/**
 * Szybka diagnostyka: ile nieodebranych StealthPayment Photon widzi dla danego claimera.
 * Używane gdy discovery nie znajdzie hash płatności — odróżnia „brak Sendu” od „wolna indeksacja”.
 */
export async function countUnclaimedStealthPaymentsForClaimer(params: {
  claimer: PublicKey;
  runtime?: PartialLightLocalRuntimeConfig;
}): Promise<{
  totalPayments: number;
  unclaimedForClaimer: number;
  sampleStealthAddresses: string[];
}> {
  const leaf = await resolveClaimPhotonLeafHints({
    claimer: params.claimer,
    runtime: params.runtime,
  });
  return {
    totalPayments: leaf.totalPayments,
    unclaimedForClaimer: leaf.unclaimedForClaimer,
    sampleStealthAddresses: leaf.sampleStealthAddresses,
  };
}

