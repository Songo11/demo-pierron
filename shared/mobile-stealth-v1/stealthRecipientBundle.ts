import { PublicKey } from '@solana/web3.js';

export const STEALTH_RECIPIENT_BUNDLE_V1 = 'pierron-stealth-recipient-bundle-v1';

/** Schowek z „Skopiuj bundle” — odporny na zamianę przecinków na kropki w czacie. */
export const RECIPIENT_BUNDLE_CLIPBOARD_PREFIX = 'pierron-recipient-bundle-v1:b64:';

export type StealthRecipientBundleV1 = {
  version: typeof STEALTH_RECIPIENT_BUNDLE_V1;
  owner?: string;
  spendPublicKey: number[];
  viewPublicKey: number[];
  createdAt: string;
};

function assertArray32(value: number[], label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} musi być tablicą liczb`);
  }
  if (value.length !== 32) {
    throw new Error(`${label} musi mieć dokładnie 32 bajty`);
  }
  for (const byte of value) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error(`${label} musi zawierać liczby 0..255`);
    }
  }
}

function normalizeOwner(owner?: string): string | undefined {
  if (!owner) return undefined;
  const trimmed = owner.trim();
  if (!trimmed) return undefined;
  return new PublicKey(trimmed).toBase58();
}

export function validateRecipientBundleV1(
  value: unknown
): StealthRecipientBundleV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('Recipient bundle musi być obiektem');
  }

  const obj = value as Record<string, unknown>;

  if (obj.version !== STEALTH_RECIPIENT_BUNDLE_V1) {
    throw new Error('Nieobsługiwana wersja recipient bundle');
  }

  const spendPublicKey = obj.spendPublicKey;
  const viewPublicKey = obj.viewPublicKey;
  const createdAt = obj.createdAt;
  const owner = obj.owner;

  if (!Array.isArray(spendPublicKey)) {
    throw new Error('Brakuje spendPublicKey');
  }
  if (!Array.isArray(viewPublicKey)) {
    throw new Error('Brakuje viewPublicKey');
  }
  if (typeof createdAt !== 'string' || !createdAt.trim()) {
    throw new Error('Brakuje createdAt');
  }

  assertArray32(spendPublicKey as number[], 'spendPublicKey');
  assertArray32(viewPublicKey as number[], 'viewPublicKey');

  const normalizedOwner =
    typeof owner === 'string' ? normalizeOwner(owner) : undefined;

  return {
    version: STEALTH_RECIPIENT_BUNDLE_V1,
    owner: normalizedOwner,
    spendPublicKey: [...(spendPublicKey as number[])],
    viewPublicKey: [...(viewPublicKey as number[])],
    createdAt: createdAt.trim(),
  };
}

export function buildRecipientBundleV1(params: {
  spendPublicKey: number[];
  viewPublicKey: number[];
  owner?: PublicKey | string;
  createdAt?: string;
}): StealthRecipientBundleV1 {
  assertArray32(params.spendPublicKey, 'spendPublicKey');
  assertArray32(params.viewPublicKey, 'viewPublicKey');

  const owner =
    params.owner instanceof PublicKey
      ? params.owner.toBase58()
      : normalizeOwner(params.owner);

  return {
    version: STEALTH_RECIPIENT_BUNDLE_V1,
    owner,
    spendPublicKey: [...params.spendPublicKey],
    viewPublicKey: [...params.viewPublicKey],
    createdAt: params.createdAt ?? new Date().toISOString(),
  };
}

export function serializeRecipientBundleV1(
  bundle: StealthRecipientBundleV1
): string {
  const validated = validateRecipientBundleV1(bundle);
  return JSON.stringify(validated);
}

/** Normalizes clipboard / chat paste before JSON.parse. */
export function sanitizeRecipientBundleRaw(raw: string): string {
  let text = raw.trim();
  if (!text) return text;

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1).trim();
  }

  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
  text = text.replace(/[""]/g, '"').replace(/['']/g, "'");

  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    text = fenced[1].trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }

  return text.trim();
}

function encodeBase64Utf8(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

function decodeBase64Utf8(encoded: string): string {
  return Buffer.from(encoded.trim(), 'base64').toString('utf8');
}

/** Naprawia kropki zamiast przecinków w tablicach kluczy (np. po wklejeniu z Messengera). */
export function repairLocaleCorruptedKeyArrays(json: string): string {
  const fixArrayBody = (body: string) => {
    let prev = body;
    let next = prev.replace(/(\d+)\.(\d+)/g, '$1,$2');
    while (next !== prev) {
      prev = next;
      next = prev.replace(/(\d+)\.(\d+)/g, '$1,$2');
    }
    return next;
  };

  return json.replace(
    /"(spendPublicKey|viewPublicKey)":\[([^\]]*)\]/g,
    (match, key: string, body: string) => `"${key}":[${fixArrayBody(body)}]`
  );
}

function parseRecipientBundleJsonText(trimmed: string): StealthRecipientBundleV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const repaired = repairLocaleCorruptedKeyArrays(trimmed);
    if (repaired !== trimmed) {
      try {
        parsed = JSON.parse(repaired);
      } catch {
        parsed = undefined;
      }
    }
    if (parsed === undefined) {
      const hasDotInKeyArray = /"(spendPublicKey|viewPublicKey)":\[[^\]]*\d+\.\d+/.test(
        trimmed
      );
      const preview =
        trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
      throw new Error(
        [
          'Recipient bundle nie jest poprawnym JSON-em.',
          hasDotInKeyArray
            ? 'W tablicach kluczy są kropki zamiast przecinków (np. 216.134 zamiast 216,134) — skopiuj ponownie ze schowka po „Skopiuj mój recipient bundle”, bez przenoszenia przez czat.'
            : 'Na telefonie nadawcy użyj „Skopiuj mój recipient bundle”, na odbiorcy „Wklej bundle ze schowka”.',
          `Otrzymano ${trimmed.length} znaków, podgląd: ${preview}`,
        ].join(' ')
      );
    }
  }

  return validateRecipientBundleV1(parsed);
}

export function serializeRecipientBundleForClipboard(
  bundle: StealthRecipientBundleV1
): string {
  const json = serializeRecipientBundleV1(bundle);
  return RECIPIENT_BUNDLE_CLIPBOARD_PREFIX + encodeBase64Utf8(json);
}

export function parseRecipientBundleFromTransfer(
  raw: string
): StealthRecipientBundleV1 {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Recipient bundle jest pusty');
  }

  if (trimmed.startsWith(RECIPIENT_BUNDLE_CLIPBOARD_PREFIX)) {
    const encoded = trimmed.slice(RECIPIENT_BUNDLE_CLIPBOARD_PREFIX.length).trim();
    let json: string;
    try {
      json = decodeBase64Utf8(encoded);
    } catch {
      throw new Error(
        'Recipient bundle ma niepoprawne kodowanie base64. Skopiuj ponownie na telefonie odbiorcy przyciskiem „Skopiuj mój recipient bundle”.'
      );
    }
    return parseRecipientBundleJsonText(sanitizeRecipientBundleRaw(json));
  }

  return parseRecipientBundleJsonText(sanitizeRecipientBundleRaw(trimmed));
}

export function parseRecipientBundleV1(
  raw: string
): StealthRecipientBundleV1 {
  return parseRecipientBundleFromTransfer(raw);
}

export function bundleToRecipientKeys(bundle: StealthRecipientBundleV1): {
  recipientSpendKey: Uint8Array;
  recipientViewKey: Uint8Array;
} {
  const validated = validateRecipientBundleV1(bundle);

  return {
    recipientSpendKey: Uint8Array.from(validated.spendPublicKey),
    recipientViewKey: Uint8Array.from(validated.viewPublicKey),
  };
}

export function isRecipientBundleV1(value: unknown): value is StealthRecipientBundleV1 {
  try {
    validateRecipientBundleV1(value);
    return true;
  } catch {
    return false;
  }
}
