import jsQR from 'jsqr';

export type StealthQrKind = 'recipient-bundle' | 'payment-notification';

export const STEALTH_QR_BUNDLE_PREFIX = 'pierron-stealth-qr:bundle:';
export const STEALTH_QR_PAYMENT_PREFIX = 'pierron-stealth-qr:payment:';

const QR_DECODE_MAX_SIDE = 1280;

export function wrapStealthQrPayload(kind: StealthQrKind, payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) throw new Error('Pusty payload QR');
  if (kind === 'recipient-bundle') {
    return `${STEALTH_QR_BUNDLE_PREFIX}${trimmed}`;
  }
  return `${STEALTH_QR_PAYMENT_PREFIX}${trimmed}`;
}

export function unwrapStealthQrPayload(raw: string): {
  kind: StealthQrKind | 'unknown';
  payload: string;
} {
  const trimmed = raw.trim();
  if (trimmed.startsWith(STEALTH_QR_BUNDLE_PREFIX)) {
    return {
      kind: 'recipient-bundle',
      payload: trimmed.slice(STEALTH_QR_BUNDLE_PREFIX.length),
    };
  }
  if (trimmed.startsWith(STEALTH_QR_PAYMENT_PREFIX)) {
    return {
      kind: 'payment-notification',
      payload: trimmed.slice(STEALTH_QR_PAYMENT_PREFIX.length),
    };
  }
  if (
    trimmed.includes('pierron-stealth-recipient-bundle') ||
    trimmed.startsWith('pierron-recipient-bundle-v1:b64:')
  ) {
    return { kind: 'recipient-bundle', payload: trimmed };
  }
  if (
    trimmed.includes('pierron-stealth-payment') ||
    trimmed.startsWith('pierron-stealth-payment-v2-sealed:b64:') ||
    trimmed.startsWith('pierron-stealth-payment-v1:b64:')
  ) {
    return { kind: 'payment-notification', payload: trimmed };
  }
  return { kind: 'unknown', payload: trimmed };
}

function downsampleRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxSide: number
): { data: Uint8ClampedArray; width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) {
    return { data, width, height };
  }
  const scale = maxSide / longest;
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y += 1) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < tw; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const si = (sy * width + sx) * 4;
      const di = (y * tw + x) * 4;
      out[di] = data[si]!;
      out[di + 1] = data[si + 1]!;
      out[di + 2] = data[si + 2]!;
      out[di + 3] = data[si + 3]!;
    }
  }
  return { data: out, width: tw, height: th };
}

function isValidRgbaBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number
): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 1 &&
    height >= 1 &&
    data.length >= width * height * 4
  );
}

function tryDecodeQr(
  data: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  if (!isValidRgbaBuffer(data, width, height)) return null;
  // jsQR sometimes throws ("matrix is undefined") on noisy / empty frames.
  const attempts: Array<'dontInvert' | 'onlyInvert' | 'attemptBoth'> = [
    'attemptBoth',
    'dontInvert',
    'onlyInvert',
  ];
  for (const inversionAttempts of attempts) {
    try {
      const code = jsQR(data, width, height, { inversionAttempts });
      const text = code?.data?.trim();
      if (text) return text;
    } catch {
      /* ignore frame / inversion attempt */
    }
  }
  return null;
}

/** Dekoduje QR z ImageData (kamera / screen capture). */
export function decodeQrFromImageData(imageData: ImageData): string | null {
  try {
    if (
      !imageData ||
      !isValidRgbaBuffer(imageData.data, imageData.width, imageData.height)
    ) {
      return null;
    }
    const scaled = downsampleRgba(
      imageData.data,
      imageData.width,
      imageData.height,
      QR_DECODE_MAX_SIDE
    );
    const text = tryDecodeQr(scaled.data, scaled.width, scaled.height);
    if (text) return text;
    if (Math.max(scaled.width, scaled.height) > 640) {
      const smaller = downsampleRgba(scaled.data, scaled.width, scaled.height, 640);
      return tryDecodeQr(smaller.data, smaller.width, smaller.height);
    }
    return null;
  } catch {
    return null;
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}
