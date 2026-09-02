import type { PublicKey } from '@solana/web3.js';

import type { ClaimLightBundle } from './lightClient.ts';
import { pickPhotonBatchItemForHash } from './claimStealthPhotonAccounts.ts';
import { discoveryHashesForPhotonRpc } from './discoveryHashRpc.ts';
import { resolveClaimValidityProofFromHints } from './lightClaimResolver.ts';
import {
  alignClaimCompressedAccountMetaRootFromValidityProof,
  extractPhotonAccountLeafIndexFromNormalizeInput,
  extractPhotonValidityProofRootIndicesForClaim,
  normalizeLiveClaimerMetaToBytes,
  normalizeLivePaymentMetaToBytes,
  patchClaimCompressedAccountMetaLeafIndex,
  pickPhotonRpcEnvelopeForNormalize,
} from './lightLiveLocalNormalization.ts';
import type { PartialLightLocalRuntimeConfig } from './lightLocalRuntime.ts';
import { fetchPhotonCompressedAccountsByHashes } from './lightLiveLocalClient.ts';

function readySerialized<T extends Uint8Array>(
  label: string,
  value: T,
  note: string,
  photonPayload?: unknown
) {
  return {
    status: 'ready' as const,
    source: 'light-client' as const,
    note,
    value,
    ...(photonPayload !== undefined ? { photonPayload } : {}),
    serializationKind: 'canonical' as const,
  };
}

function alignMetaLeafFromPhoton(meta: Uint8Array, photon: unknown): Uint8Array {
  const leaf = extractPhotonAccountLeafIndexFromNormalizeInput(photon);
  if (leaf == null) {
    return meta;
  }
  return patchClaimCompressedAccountMetaLeafIndex(meta, leaf);
}

/**
 * Meta claimera + płatności wyłącznie z hashów użytych w getValidityProof (kolejność CPI).
 * Nie używa getCompressedAccount(stealthAddress) ani skanu by-owner — to powodowało 6043.
 */
async function loadClaimCompressedMetaFromSourceHashes(params: {
  sourceHashes: string[];
  runtime?: PartialLightLocalRuntimeConfig;
}): Promise<{
  claimerMeta: ReturnType<typeof readySerialized>;
  paymentMeta: ReturnType<typeof readySerialized>;
} | null> {
  if (params.sourceHashes.length < 2) {
    return null;
  }
  const batch = await fetchPhotonCompressedAccountsByHashes({
    hashes: params.sourceHashes,
    runtime: params.runtime,
  });
  const rpcHashes = discoveryHashesForPhotonRpc(params.sourceHashes);
  const claimerItem = pickPhotonBatchItemForHash(batch, rpcHashes[0]!);
  const paymentItem = pickPhotonBatchItemForHash(batch, rpcHashes[1]!);
  if (claimerItem == null || paymentItem == null) {
    return null;
  }
  const claimerPhoton = pickPhotonRpcEnvelopeForNormalize(claimerItem);
  const paymentPhoton = pickPhotonRpcEnvelopeForNormalize(paymentItem);
  let claimerBytes = normalizeLiveClaimerMetaToBytes(claimerPhoton);
  let paymentBytes = normalizeLivePaymentMetaToBytes(paymentPhoton);
  claimerBytes = alignMetaLeafFromPhoton(claimerBytes, claimerPhoton);
  paymentBytes = alignMetaLeafFromPhoton(paymentBytes, paymentPhoton);
  return {
    claimerMeta: readySerialized(
      'CompressedMeta.claimer',
      claimerBytes,
      'claimer meta from sourceHashes[0] at submit',
      claimerPhoton
    ),
    paymentMeta: readySerialized(
      'CompressedMeta.payment',
      paymentBytes,
      'payment meta from sourceHashes[1] at submit',
      paymentPhoton
    ),
  };
}

/**
 * Tuż przed złożeniem tx: świeży validity proof + meta z tych samych hashy (devnet root drift → 6043).
 */
export async function refreshClaimLightBundleForSubmit(params: {
  bundle: ClaimLightBundle;
  sourceHashes: string[];
  runtime?: PartialLightLocalRuntimeConfig;
  claimer?: PublicKey;
  metaOwner?: PublicKey;
  stealthAddress?: PublicKey;
  claimerHintCompressedAddress?: PublicKey;
}): Promise<ClaimLightBundle> {
  if (params.bundle.status !== 'ready' || params.sourceHashes.length < 2) {
    return params.bundle;
  }

  const proofOutcome = await resolveClaimValidityProofFromHints({
    __liveLocalClaimHintSourceHashes: params.sourceHashes,
  });

  if (proofOutcome.status !== 'ready') {
    const detail =
      proofOutcome.status === 'error' || proofOutcome.status === 'missing'
        ? proofOutcome.note
        : proofOutcome.status;
    throw new Error(
      `Claim: nie udało się odświeżyć validity proof przed podpisem (${String(detail)}). Poczekaj 30–60 s i spróbuj ponownie.`
    );
  }

  let claimerMeta = params.bundle.claimerMeta;
  let paymentMeta = params.bundle.paymentMeta;

  try {
    const fromHashes = await loadClaimCompressedMetaFromSourceHashes({
      sourceHashes: params.sourceHashes,
      runtime: params.runtime,
    });
    if (fromHashes) {
      claimerMeta = fromHashes.claimerMeta;
      paymentMeta = fromHashes.paymentMeta;
    }
  } catch {
    // keep bundle meta if batch fetch fails
  }

  const rootIndices =
    proofOutcome.photonPayload != null
      ? extractPhotonValidityProofRootIndicesForClaim(proofOutcome.photonPayload)
      : null;

  if (
    rootIndices &&
    rootIndices.length > 0 &&
    claimerMeta.status === 'ready' &&
    claimerMeta.value &&
    paymentMeta.status === 'ready' &&
    paymentMeta.value
  ) {
    const rClaimer = rootIndices[0]!;
    const rPayment = rootIndices.length > 1 ? rootIndices[1]! : rootIndices[0]!;
    const alignedClaimer = alignClaimCompressedAccountMetaRootFromValidityProof(
      claimerMeta.value,
      rClaimer
    );
    const alignedPayment = alignClaimCompressedAccountMetaRootFromValidityProof(
      paymentMeta.value,
      rPayment
    );
    if (alignedClaimer !== claimerMeta.value || alignedPayment !== paymentMeta.value) {
      claimerMeta = {
        ...claimerMeta,
        value: alignedClaimer,
        note: `${claimerMeta.note ?? ''} | submit rootIndex=${rClaimer}`,
      };
      paymentMeta = {
        ...paymentMeta,
        value: alignedPayment,
        note: `${paymentMeta.note ?? ''} | submit rootIndex=${rPayment}`,
      };
    }
  }

  return {
    ...params.bundle,
    validityProof: readySerialized(
      'ValidityProof.claim',
      proofOutcome.value,
      `${proofOutcome.note ?? 'ready'} | refreshed at submit`,
      proofOutcome.photonPayload
    ),
    claimerMeta,
    paymentMeta,
    notes: [
      ...(params.bundle.notes ?? []),
      'claim: refreshed proof+meta from sourceHashes at submit (anti-6043)',
    ],
  };
}
