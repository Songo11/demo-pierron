import type { LightBackendOutcome } from './lightClient.ts';
import { extractPhotonValidityProofRootIndicesForClaim } from './lightLiveLocalNormalization.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readU16(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n >= 0 && n <= 0xffff ? n : null;
  }
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 0xffff ? n : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isFinite(n) && n >= 0 && n <= 0xffff ? n : null;
  }
  return null;
}

/** First u16 root index advertised by Photon `getValidityProof` (send / register). */
export function extractSendValidityProofRootIndex(raw: unknown): number | null {
  if (raw == null) {
    return null;
  }

  const fromClaimHelper = extractPhotonValidityProofRootIndicesForClaim(raw);
  if (fromClaimHelper && fromClaimHelper.length > 0) {
    return fromClaimHelper[0] ?? null;
  }

  const direct = readU16(raw);
  if (direct != null) {
    return direct;
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const nested = extractSendValidityProofRootIndex(item);
      if (nested != null) {
        return nested;
      }
    }
    return null;
  }

  if (!isRecord(raw)) {
    return null;
  }

  for (const key of [
    'rootIndex',
    'root_index',
    'selectedRootIndex',
    'selected_root_index',
    'rootIndices',
    'root_indices',
  ]) {
    if (!(key in raw)) {
      continue;
    }
    const nested = extractSendValidityProofRootIndex(raw[key]);
    if (nested != null) {
      return nested;
    }
  }

  if ('result' in raw) {
    const nested = extractSendValidityProofRootIndex(raw.result);
    if (nested != null) {
      return nested;
    }
  }

  if ('value' in raw) {
    return extractSendValidityProofRootIndex(raw.value);
  }

  return null;
}

export function extractSendValidityProofRootIndexFromOutcome(
  outcome: LightBackendOutcome<Uint8Array>
): number | null {
  if (outcome.status !== 'ready') {
    return null;
  }
  const ready = outcome as LightBackendOutcome<Uint8Array> & {
    photonPayload?: unknown;
  };
  return (
    extractSendValidityProofRootIndex(ready.photonPayload) ??
    extractSendValidityProofRootIndex(ready.value)
  );
}

/** 4-byte `PackedAddressTreeInfo` — root index at bytes 2–3 (LE). */
export function alignSendPackedAddressTreeInfoRoot(
  value: Uint8Array,
  rootIndex: number
): Uint8Array {
  if (value.length < 4) {
    return value;
  }
  const out = Uint8Array.from(value);
  out[2] = rootIndex & 0xff;
  out[3] = (rootIndex >> 8) & 0xff;
  return out;
}

/**
 * 38-byte send/register new-address payload:
 * seed(32) | queue(u8) | tree(u8) | root(u16 LE) | assigned…
 */
export function alignSendNewPaymentAddressRoot(
  value: Uint8Array,
  rootIndex: number
): Uint8Array {
  if (value.length < 36) {
    return value;
  }
  const out = Uint8Array.from(value);
  out[34] = rootIndex & 0xff;
  out[35] = (rootIndex >> 8) & 0xff;
  return out;
}
