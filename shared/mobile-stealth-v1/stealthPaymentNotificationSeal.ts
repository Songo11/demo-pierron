import nacl from 'tweetnacl';

/** Zaszyfrowane powiadomienie — otwiera tylko właściciel viewSecretKey (X25519). */
export const STEALTH_PAYMENT_NOTIFICATION_V2_SEALED =
  'pierron-stealth-payment-v2-sealed';

export const PAYMENT_NOTIFICATION_SEALED_CLIPBOARD_PREFIX =
  'pierron-stealth-payment-v2-sealed:b64:';

export type StealthPaymentNotificationSealedV2 = {
  version: typeof STEALTH_PAYMENT_NOTIFICATION_V2_SEALED;
  ephemeralPublicKey: string;
  nonce: string;
  ciphertext: string;
  /**
   * Cleartext hint (base64 32 B) — który viewPublicKey zaszyfrował envelope.
   * Ułatwia diagnozę mismatch bez odszyfrowania.
   */
  recipientViewPublicKeyB64?: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, '');
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(cleaned, 'base64'));
  }
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function assert32(bytes: Uint8Array, label: string) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new Error(`${label} musi mieć dokładnie 32 bajty`);
  }
}

/** Szyfruje JSON plaintext (notification v1) do envelope v2. */
export function sealPaymentNotificationJson(
  plaintextJson: string,
  recipientViewPublicKey: Uint8Array
): StealthPaymentNotificationSealedV2 {
  assert32(recipientViewPublicKey, 'recipientViewPublicKey');
  const plaintext = new TextEncoder().encode(plaintextJson);
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(
    plaintext,
    nonce,
    recipientViewPublicKey,
    ephemeral.secretKey
  );
  if (!ciphertext) {
    throw new Error('Nie udało się zaszyfrować powiadomienia o płatności');
  }
  return {
    version: STEALTH_PAYMENT_NOTIFICATION_V2_SEALED,
    ephemeralPublicKey: bytesToBase64(ephemeral.publicKey),
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
    recipientViewPublicKeyB64: bytesToBase64(recipientViewPublicKey),
  };
}

function shortKeyHint(bytes: Uint8Array): string {
  const hex = Array.from(bytes.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex}…`;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function openSealedPaymentNotificationJson(
  sealed: StealthPaymentNotificationSealedV2,
  viewSecretKey: Uint8Array,
  options?: {
    localViewPublicKey?: Uint8Array | number[] | null;
  }
): string {
  assert32(viewSecretKey, 'viewSecretKey');
  if (sealed.version !== STEALTH_PAYMENT_NOTIFICATION_V2_SEALED) {
    throw new Error('Nieobsługiwana wersja zaszyfrowanego powiadomienia');
  }
  const ephemeralPublicKey = base64ToBytes(sealed.ephemeralPublicKey);
  const nonce = base64ToBytes(sealed.nonce);
  const ciphertext = base64ToBytes(sealed.ciphertext);
  assert32(ephemeralPublicKey, 'ephemeralPublicKey');
  if (nonce.length !== nacl.box.nonceLength) {
    throw new Error(`nonce musi mieć ${nacl.box.nonceLength} bajtów`);
  }
  const opened = nacl.box.open(ciphertext, nonce, ephemeralPublicKey, viewSecretKey);
  if (!opened) {
    const sealedFor = sealed.recipientViewPublicKeyB64
      ? base64ToBytes(sealed.recipientViewPublicKeyB64)
      : null;
    const localRaw = options?.localViewPublicKey;
    const localPk =
      localRaw == null
        ? null
        : localRaw instanceof Uint8Array
          ? localRaw
          : Uint8Array.from(localRaw);

    try {
      const derived = nacl.box.keyPair.fromSecretKey(viewSecretKey).publicKey;
      if (localPk?.length === 32 && !bytesEqual(derived, localPk)) {
        throw new Error(
          [
            'Lokalne viewSecretKey nie pasuje do zapisanego viewPublicKey',
            `(secret→${shortKeyHint(derived)}, stored→${shortKeyHint(localPk)}).`,
            'Zrób register_stealth od nowa na tym telefonie, wyślij nowy recipient QR, poproś o ponowny Send.',
          ].join(' ')
        );
      }
    } catch (err) {
      if (String((err as Error)?.message ?? err).includes('viewSecretKey nie pasuje')) {
        throw err;
      }
      // fromSecretKey może rzucić przy złym kluczu — idź w dalszą diagnostykę
    }

    if (sealedFor?.length === 32 && localPk?.length === 32 && !bytesEqual(sealedFor, localPk)) {
      throw new Error(
        [
          'Powiadomienie zaszyfrowano dla innego viewPublicKey niż klucze na tym telefonie',
          `(QR: ${shortKeyHint(sealedFor)}, lokalnie: ${shortKeyHint(localPk)}).`,
          'Nie rób ponownego register po udostępnieniu recipient QR.',
          'Albo: nowy recipient QR z tego telefonu → nadawca ponowny Send → nowy QR powiadomienia.',
        ].join(' ')
      );
    }

    if (sealedFor?.length === 32 && localPk?.length === 32 && bytesEqual(sealedFor, localPk)) {
      throw new Error(
        [
          'Klucze pasują, ale odszyfrowanie QR nie wyszło — payload pewnie uszkodzony przy skanie (za gęsty QR).',
          'Na nadawcy: skopiuj powiadomienie do schowka / Keep / Telegram i wklej na odbiorcy („Wklej powiadomienie”),',
          'albo zapisz QR do galerii i wybierz z galerii (nie skanuj kamerą z drugiego ekranu).',
        ].join(' ')
      );
    }

    throw new Error(
      'Nie udało się odszyfrować powiadomienia. Użyj tego samego telefonu/portfela co przy register_stealth (viewSecretKey), albo wygeneruj nowe klucze i poproś nadawcę o ponowny send. Jeśli QR skanujesz z ekranu — spróbuj schowka albo galerii.'
    );
  }
  return new TextDecoder().decode(opened);
}

export function serializeSealedPaymentNotificationForClipboard(
  sealed: StealthPaymentNotificationSealedV2
): string {
  const json = JSON.stringify(sealed);
  return `${PAYMENT_NOTIFICATION_SEALED_CLIPBOARD_PREFIX}${bytesToBase64(
    new TextEncoder().encode(json)
  )}`;
}

export function buildSealedPaymentNotificationClipboard(params: {
  plaintextJson: string;
  recipientViewPublicKey: Uint8Array | number[];
}): string {
  const viewPk =
    params.recipientViewPublicKey instanceof Uint8Array
      ? params.recipientViewPublicKey
      : Uint8Array.from(params.recipientViewPublicKey);
  const sealed = sealPaymentNotificationJson(params.plaintextJson, viewPk);
  // Tylko sealed — plaintext w schowku niweczyłby szyfrowanie przy udostępnieniu.
  return serializeSealedPaymentNotificationForClipboard(sealed);
}

export function looksLikeSealedPaymentNotification(raw: string): boolean {
  const trimmed = raw.trim();
  return (
    trimmed.startsWith(PAYMENT_NOTIFICATION_SEALED_CLIPBOARD_PREFIX) ||
    trimmed.includes(STEALTH_PAYMENT_NOTIFICATION_V2_SEALED)
  );
}

function parseSealedEnvelopeObject(
  value: unknown
): StealthPaymentNotificationSealedV2 | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const obj = value as Record<string, unknown>;
  if (obj.version !== STEALTH_PAYMENT_NOTIFICATION_V2_SEALED) {
    return null;
  }
  if (
    typeof obj.ephemeralPublicKey !== 'string' ||
    typeof obj.nonce !== 'string' ||
    typeof obj.ciphertext !== 'string'
  ) {
    return null;
  }
  return {
    version: STEALTH_PAYMENT_NOTIFICATION_V2_SEALED,
    ephemeralPublicKey: obj.ephemeralPublicKey,
    nonce: obj.nonce,
    ciphertext: obj.ciphertext,
    ...(typeof obj.recipientViewPublicKeyB64 === 'string'
      ? { recipientViewPublicKeyB64: obj.recipientViewPublicKeyB64 }
      : {}),
  };
}

/** Wyciąga envelope sealed z schowka (prefix b64 / JSON / dual-block). */
export function extractSealedPaymentNotificationEnvelope(
  raw: string
): StealthPaymentNotificationSealedV2 | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(PAYMENT_NOTIFICATION_SEALED_CLIPBOARD_PREFIX)) {
    const b64 = trimmed
      .slice(PAYMENT_NOTIFICATION_SEALED_CLIPBOARD_PREFIX.length)
      .trim();
    const json = new TextDecoder().decode(base64ToBytes(b64));
    try {
      return parseSealedEnvelopeObject(JSON.parse(json));
    } catch {
      return null;
    }
  }

  const dualParts = trimmed.split(/\n-{3,}\n|\n---\n/);
  for (const part of dualParts) {
    const p = part.trim();
    if (p.startsWith(PAYMENT_NOTIFICATION_SEALED_CLIPBOARD_PREFIX)) {
      const found = extractSealedPaymentNotificationEnvelope(p);
      if (found) {
        return found;
      }
    }
    const start = p.indexOf('{');
    const end = p.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed = parseSealedEnvelopeObject(
          JSON.parse(p.slice(start, end + 1))
        );
        if (parsed) {
          return parsed;
        }
      } catch {
        // next
      }
    }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return parseSealedEnvelopeObject(
        JSON.parse(trimmed.slice(start, end + 1))
      );
    } catch {
      return null;
    }
  }

  return null;
}

export function tryDecryptSealedPaymentNotificationJson(
  raw: string,
  viewSecretKey: Uint8Array | number[] | null | undefined,
  options?: {
    localViewPublicKey?: Uint8Array | number[] | null;
  }
): string | null {
  const sealed = extractSealedPaymentNotificationEnvelope(raw);
  if (!sealed) {
    return null;
  }
  if (!viewSecretKey) {
    throw new Error(
      'Powiadomienie jest zaszyfrowane (v2-sealed), ale brak viewSecretKey na urządzeniu. Zrób register_stealth ponownie na tym telefonie, albo wklej na telefonie odbiorcy.'
    );
  }
  const secret =
    viewSecretKey instanceof Uint8Array
      ? viewSecretKey
      : Uint8Array.from(viewSecretKey);
  return openSealedPaymentNotificationJson(sealed, secret, {
    localViewPublicKey: options?.localViewPublicKey,
  });
}
