import { PublicKey } from '@solana/web3.js';

import type { StoredRecipientMode } from './stealthStorage.ts';
import {
  extractSealedPaymentNotificationEnvelope,
  looksLikeSealedPaymentNotification,
  tryDecryptSealedPaymentNotificationJson,
} from './stealthPaymentNotificationSeal.ts';

export const STEALTH_PAYMENT_NOTIFICATION_V1 = 'pierron-stealth-payment-v1';

/** Schowek po udanym send on-chain — odbiorca wkleja na swoim telefonie. */
export const PAYMENT_NOTIFICATION_CLIPBOARD_PREFIX =
  'pierron-stealth-payment-v1:b64:';

export type StealthPaymentNotificationV1 = {
  version: typeof STEALTH_PAYMENT_NOTIFICATION_V1;
  mint: string;
  stealthAddress: string;
  amount: string;
  /** Zarejestrowany owner odbiorcy (meta) — opcjonalnie do weryfikacji. */
  metaOwner?: string;
  /** Portfel nadawcy send — devnet newAddressProof. */
  sender?: string;
  senderHash?: string;
  /** 32 B seed z send (hex) — Photon newAddressProof na claim. */
  lightAddressSeedHex?: string;
  /** Sygnatura tx send (devnet explorer). */
  sendSignature?: string;
  createdAt?: string;
  recipientMode?: StoredRecipientMode;
};

export function buildStealthPaymentNotificationV1(params: {
  mint: string;
  stealthAddress: string;
  amount: string;
  metaOwner?: string;
  sender?: string;
  senderHash?: string;
  lightAddressSeedHex?: string;
  sendSignature?: string;
  createdAt?: string;
  recipientMode?: StoredRecipientMode;
}): StealthPaymentNotificationV1 {
  const mint = new PublicKey(params.mint.trim()).toBase58();
  const stealthAddress = new PublicKey(params.stealthAddress.trim()).toBase58();
  const amount = params.amount.trim();
  if (!amount) {
    throw new Error('Kwota powiadomienia o płatności nie może być pusta');
  }

  let metaOwner: string | undefined;
  if (params.metaOwner?.trim()) {
    metaOwner = new PublicKey(params.metaOwner.trim()).toBase58();
  }

  return {
    version: STEALTH_PAYMENT_NOTIFICATION_V1,
    mint,
    stealthAddress,
    amount,
    metaOwner,
    sender: params.sender?.trim()
      ? new PublicKey(params.sender.trim()).toBase58()
      : undefined,
    senderHash: params.senderHash?.trim() || undefined,
    lightAddressSeedHex: normalizeSeedHex(params.lightAddressSeedHex),
    sendSignature: params.sendSignature?.trim() || undefined,
    createdAt: params.createdAt ?? new Date().toISOString(),
    recipientMode: params.recipientMode,
  };
}

/**
 * Minimalny JSON do seal/QR — bez sendSignature/createdAt (duży QR psuje skan).
 * Claim potrzebuje: mint, stealthAddress, amount, seed, senderHash, metaOwner.
 */
export function serializePaymentNotificationForSeal(
  notification: StealthPaymentNotificationV1
): string {
  const compact: Record<string, unknown> = {
    version: STEALTH_PAYMENT_NOTIFICATION_V1,
    mint: notification.mint,
    stealthAddress: notification.stealthAddress,
    amount: notification.amount,
  };
  if (notification.metaOwner) compact.metaOwner = notification.metaOwner;
  if (notification.sender) compact.sender = notification.sender;
  if (notification.senderHash) compact.senderHash = notification.senderHash;
  if (notification.lightAddressSeedHex) {
    compact.lightAddressSeedHex = notification.lightAddressSeedHex;
  }
  if (notification.recipientMode) compact.recipientMode = notification.recipientMode;
  return JSON.stringify(compact);
}

function normalizeSeedHex(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const hex = value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('lightAddressSeedHex musi mieć 64 znaki hex (32 bajty)');
  }
  return hex.toLowerCase();
}

export function tryNormalizeClaimSeedHexInput(
  value: string | undefined
): string | undefined {
  return tryNormalizeSeedHexLoose(value);
}

function tryNormalizeSeedHexLoose(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  try {
    return normalizeSeedHex(value);
  } catch {
    return undefined;
  }
}

function seedByteArrayToHex(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length !== 32) {
    return undefined;
  }
  const bytes: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > 255) {
      return undefined;
    }
    bytes.push(item);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Stare powiadomienia / ręczny JSON — kilka nazw pól seed. */
export function extractLightAddressSeedHexFromParsed(
  obj: Record<string, unknown>
): string | undefined {
  if (typeof obj.lightAddressSeedHex === 'string') {
    return tryNormalizeSeedHexLoose(obj.lightAddressSeedHex);
  }
  if (typeof obj.lightAddressSeed === 'string') {
    return tryNormalizeSeedHexLoose(obj.lightAddressSeed);
  }
  for (const key of [
    'lightAddressSeedBytes',
    'canonicalLightAddressSeed',
    'lightAddressSeed',
  ] as const) {
    const fromArray = seedByteArrayToHex(obj[key]);
    if (fromArray) {
      return fromArray;
    }
  }
  return undefined;
}

export function describePaymentNotificationRaw(raw: string): {
  looksLikeNotification: boolean;
  hasSeed: boolean;
  stealthAddress?: string;
  hint?: string;
  format?: PaymentNotificationTransferFormat | 'sealed-v2';
} {
  const trimmed = raw.trim();
  if (!trimmed || looksLikeSolanaTransactionSignature(trimmed)) {
    return {
      looksLikeNotification: false,
      hasSeed: false,
      hint: 'To nie jest powiadomienie pierron-stealth-payment (np. sygnatura tx).',
    };
  }

  if (looksLikeSealedPaymentNotification(trimmed)) {
    const sealed = extractSealedPaymentNotificationEnvelope(trimmed);
    return {
      looksLikeNotification: !!sealed,
      hasSeed: false,
      format: 'sealed-v2',
      hint: sealed
        ? 'OK: zaszyfrowane powiadomienie v2 — odszyfruje się viewSecretKey odbiorcy.'
        : 'Wygląda na sealed v2, ale envelope jest uszkodzony.',
    };
  }

  try {
    const { jsonText, format } = normalizePaymentNotificationTransferRaw(trimmed);
    const parsed = parsePaymentNotificationJsonText(jsonText);
    const seed = extractLightAddressSeedHexFromParsed(parsed);
    const stealthAddress =
      typeof parsed.stealthAddress === 'string' ? parsed.stealthAddress : undefined;
    const versionOk =
      parsed.version === STEALTH_PAYMENT_NOTIFICATION_V1 ||
      (typeof parsed.stealthAddress === 'string' && parsed.mint != null);
    return {
      looksLikeNotification: versionOk,
      hasSeed: !!seed,
      stealthAddress,
      format,
      hint: seed
        ? `OK: jest lightAddressSeedHex (format: ${format}).`
        : `JSON OK (${format}), ale brak seed — Sony: Send OK, potem kopiuj ponownie.`,
    };
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes('recipient bundle')) {
      return { looksLikeNotification: false, hasSeed: false, hint: msg };
    }
    return {
      looksLikeNotification: false,
      hasSeed: false,
      hint: `Niepoprawny JSON (${msg.slice(0, 80)}). Skopiuj cały blok ze Sony bez edycji.`,
    };
  }
}

export function lightAddressSeedHexToBytes(hex: string | undefined): Uint8Array | undefined {
  if (!hex) {
    return undefined;
  }
  const normalized = normalizeSeedHex(hex);
  if (!normalized) {
    return undefined;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Jeden wiersz JSON — najlepiej przenosić między telefonami (Keep/Telegram); zawiera lightAddressSeedHex. */
export function formatPaymentNotificationForCrossDeviceTransfer(
  notification: StealthPaymentNotificationV1
): string {
  return JSON.stringify(notification);
}

/** Schowek: base64 (stare apki) + JSON (czytelny po przeniesieniu między telefonami). */
export function serializePaymentNotificationForClipboard(
  notification: StealthPaymentNotificationV1
): string {
  const json = formatPaymentNotificationForCrossDeviceTransfer(notification);
  const b64Line = serializePaymentNotificationForClipboardB64(notification);
  return `${b64Line}\n---\n${json}`;
}

/** Legacy base64 (stare buildy); parser nadal akceptuje. */
export function serializePaymentNotificationForClipboardB64(
  notification: StealthPaymentNotificationV1
): string {
  const json = JSON.stringify(notification);
  const b64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(json, 'utf8').toString('base64')
      : btoa(unescape(encodeURIComponent(json)));
  return `${PAYMENT_NOTIFICATION_CLIPBOARD_PREFIX}${b64}`;
}

function decodeBase64Utf8(b64: string): string {
  const cleaned = b64.replace(/\s+/g, '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(cleaned, 'base64').toString('utf8');
  }
  return decodeURIComponent(escape(atob(cleaned)));
}

function repairMessengerJsonText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1');
}

function extractJsonObjectSubstring(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function looksLikeRecipientBundleText(text: string): boolean {
  return (
    text.includes('pierron-stealth-recipient-bundle') ||
    text.includes('spendPublicKey') ||
    text.includes('viewPublicKey') ||
    text.includes('pierron-recipient-bundle-v1')
  );
}

export type PaymentNotificationTransferFormat =
  | 'json'
  | 'b64'
  | 'embedded-json'
  | 'dual-block';

/** Normalizuje schowek po Keep/Telegram (dodatkowy tekst, b64, obcięcia). */
export function normalizePaymentNotificationTransferRaw(raw: string): {
  jsonText: string;
  format: PaymentNotificationTransferFormat;
} {
  let trimmed = repairMessengerJsonText(raw.trim());

  if (trimmed.startsWith('```')) {
    trimmed = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  if (looksLikeRecipientBundleText(trimmed) && !trimmed.includes(STEALTH_PAYMENT_NOTIFICATION_V1)) {
    throw new Error(
      'W schowku jest recipient bundle odbiorcy, a nie powiadomienie o płatności. ' +
        'Na Sony po Send on-chain OK skopiuj powiadomienie (JSON z lightAddressSeedHex).'
    );
  }

  if (trimmed.startsWith(PAYMENT_NOTIFICATION_CLIPBOARD_PREFIX)) {
    const b64 = trimmed.slice(PAYMENT_NOTIFICATION_CLIPBOARD_PREFIX.length).trim();
    return {
      jsonText: decodeBase64Utf8(b64),
      format: 'b64',
    };
  }

  const dualParts = trimmed.split(/\n-{3,}\n|\n---\n/);
  if (dualParts.length > 1) {
    for (let i = dualParts.length - 1; i >= 0; i -= 1) {
      const part = dualParts[i]?.trim() ?? '';
      const embedded = extractJsonObjectSubstring(part);
      if (embedded?.includes(STEALTH_PAYMENT_NOTIFICATION_V1)) {
        return { jsonText: embedded, format: 'dual-block' };
      }
      if (part.startsWith(PAYMENT_NOTIFICATION_CLIPBOARD_PREFIX)) {
        const b64 = part.slice(PAYMENT_NOTIFICATION_CLIPBOARD_PREFIX.length).trim();
        return { jsonText: decodeBase64Utf8(b64), format: 'dual-block' };
      }
    }
  }

  const embedded = extractJsonObjectSubstring(trimmed);
  if (embedded) {
    return {
      jsonText: embedded,
      format: trimmed === embedded ? 'json' : 'embedded-json',
    };
  }

  return { jsonText: trimmed, format: 'json' };
}

function parsePaymentNotificationJsonText(jsonText: string): Record<string, unknown> {
  const attempts = [
    jsonText,
    repairMessengerJsonText(jsonText),
    extractJsonObjectSubstring(jsonText) ?? jsonText,
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('JSON.parse failed for payment notification');
}

/** Base58 tx signature (np. z alertu „Send stealth zakończone”) — to NIE jest powiadomienie o płatności. */
export function looksLikeSolanaTransactionSignature(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 80 || trimmed.length > 120) {
    return false;
  }
  if (
    trimmed.startsWith(PAYMENT_NOTIFICATION_CLIPBOARD_PREFIX) ||
    trimmed.startsWith('pierron-')
  ) {
    return false;
  }
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed);
}

export type ResolvedClaimPaymentTarget = {
  stealthAddress: string;
  metaOwner?: string;
  amount?: string;
  mint: string;
  source: string;
};

export function parsePaymentNotificationFromTransfer(
  raw: string,
  options?: {
    viewSecretKey?: Uint8Array | number[] | null;
    localViewPublicKey?: Uint8Array | number[] | null;
  }
): StealthPaymentNotificationV1 {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Pusty tekst powiadomienia o płatności');
  }

  if (looksLikeSolanaTransactionSignature(trimmed)) {
    throw new Error(
      'To wygląda na sygnaturę transakcji Solana (potwierdzenie send), a nie powiadomienie o płatności. ' +
        'Na telefonie nadawcy użyj przycisku „Skopiuj powiadomienie dla odbiorcy” (nie kopiuj samego OK z alertu).'
    );
  }

  const sealedJson = tryDecryptSealedPaymentNotificationJson(
    trimmed,
    options?.viewSecretKey,
    { localViewPublicKey: options?.localViewPublicKey }
  );
  if (sealedJson) {
    return validatePaymentNotificationV1(JSON.parse(sealedJson));
  }

  if (looksLikeSealedPaymentNotification(trimmed)) {
    tryDecryptSealedPaymentNotificationJson(trimmed, options?.viewSecretKey, {
      localViewPublicKey: options?.localViewPublicKey,
    });
    throw new Error(
      'Powiadomienie jest zaszyfrowane (v2-sealed), ale nie udało się go otworzyć. Sprawdź viewSecretKey / register_stealth.'
    );
  }

  let parsed: Record<string, unknown>;
  try {
    const { jsonText } = normalizePaymentNotificationTransferRaw(trimmed);
    parsed = parsePaymentNotificationJsonText(jsonText);
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes('recipient bundle')) {
      throw new Error(msg);
    }
    throw new Error(
      [
        'Nie udało się odczytać powiadomienia o płatności.',
        'Sony: Send on-chain OK → „Kopiuj ostatnie powiadomienie” (cały tekst ze schowka).',
        'Przenieś na Nokia jednym kawałkiem (Keep/Telegram) — nie skracaj.',
        msg ? `Szczegóły: ${msg.slice(0, 120)}` : '',
      ]
        .filter((line) => line.length > 0)
        .join(' ')
    );
  }

  return validatePaymentNotificationV1(parsed);
}

export function validatePaymentNotificationV1(
  value: unknown
): StealthPaymentNotificationV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('Powiadomienie o płatności musi być obiektem JSON');
  }

  const obj = value as Record<string, unknown>;
  if (
    obj.version != null &&
    obj.version !== STEALTH_PAYMENT_NOTIFICATION_V1
  ) {
    throw new Error('Nieobsługiwana wersja powiadomienia o płatności');
  }

  if (typeof obj.stealthAddress !== 'string') {
    throw new Error('Powiadomienie wymaga pola stealthAddress');
  }
  if (obj.mint == null && obj.amount == null) {
    throw new Error('Powiadomienie wymaga pól mint i amount');
  }

  return buildStealthPaymentNotificationV1({
    mint: obj.mint,
    stealthAddress: obj.stealthAddress,
    amount: typeof obj.amount === 'string' ? obj.amount : String(obj.amount ?? '0'),
    metaOwner: typeof obj.metaOwner === 'string' ? obj.metaOwner : undefined,
    sender: typeof obj.sender === 'string' ? obj.sender : undefined,
    senderHash: typeof obj.senderHash === 'string' ? obj.senderHash : undefined,
    lightAddressSeedHex: extractLightAddressSeedHexFromParsed(obj),
    sendSignature:
      typeof obj.sendSignature === 'string' ? obj.sendSignature.trim() : undefined,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : undefined,
    recipientMode:
      obj.recipientMode === 'provided' || obj.recipientMode === 'debug-generated'
        ? obj.recipientMode
        : undefined,
  });
}
