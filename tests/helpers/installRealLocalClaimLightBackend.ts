import { LightBackendResult, setLightBackend } from '../../shared/light/lightClient.ts';
import { makeRealLocalClaimLightBackend } from '../../shared/light/lightBackend.local.claim.ts';
import {
  pickClaimValidityProofSourceHashes,
  resetLocalClaimResolverProvider,
  resolveLocalClaimClaimerMeta,
  resolveLocalClaimPaymentMeta,
  resolveLocalClaimRemainingAccounts,
  resolveClaimValidityProofFromHints,
  resolveLocalClaimValidityProof,
  setLocalClaimResolverProvider,
  type LocalClaimResolverProvider,
} from '../../shared/light/lightClaimResolver.ts';
import type { ClaimProofParams } from '../../shared/light/lightClient.ts';
import {
  fetchLiveClaimerMeta,
  fetchLivePaymentMeta,
  fetchLiveClaimProof,
  fetchLiveRemainingAccountsForClaim,
} from '../../shared/light/lightLiveLocalClient.ts';
import {
  normalizeLiveClaimerMetaToBytes,
  normalizeLiveClaimProofToBytes,
  normalizeLivePaymentMetaToBytes,
  pickPhotonRpcEnvelopeForNormalize,
} from '../../shared/light/lightLiveLocalNormalization.ts';
import {
  getLightLocalRuntimeOverride,
  type PartialLightLocalRuntimeConfig,
} from '../../shared/light/lightLocalRuntime.ts';

function readU16Le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 1 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32Le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 3 >= bytes.length) return null;
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

export type InstallRealLocalClaimLightBackendOptions = {
  runtime?: PartialLightLocalRuntimeConfig;
};

export function installRealLocalClaimLightBackend(
  provider?: Partial<LocalClaimResolverProvider>,
  options?: InstallRealLocalClaimLightBackendOptions
) {
  resetLocalClaimResolverProvider();

  const runtime = () =>
    options?.runtime ?? getLightLocalRuntimeOverride() ?? undefined;

  setLocalClaimResolverProvider({
    async getCompressedMetaForClaimer(params) {
      const result = await fetchLiveClaimerMeta({
        runtime: runtime(),
        request: params,
      });
      const envelope = pickPhotonRpcEnvelopeForNormalize(result);
      let bytes: Uint8Array;
      try {
        bytes = normalizeLiveClaimerMetaToBytes(envelope);
      } catch (first) {
        if (params?.__liveLocalClaimerHintCompressedAddress) {
          const retry = await fetchLiveClaimerMeta({
            runtime: runtime(),
            request: {
              ...params,
              claimer: params.claimer,
              metaOwner: params.metaOwner,
            },
          });
          bytes = normalizeLiveClaimerMetaToBytes(
            pickPhotonRpcEnvelopeForNormalize(retry)
          );
        } else {
          throw first;
        }
      }
      if (bytes.length === 0) {
        throw new Error(
          'liveClaimerMeta normalized to empty bytes — podaj claimerHintCompressedAddress lub poczekaj na Photon'
        );
      }
      // eslint-disable-next-line no-console
      console.log(
        `[claim claimerMeta debug] len=${bytes.length} rootIdx=${readU16Le(bytes, 0)} proveByIndex=${bytes[2] ?? 'n/a'} treeIdx=${bytes[3] ?? 'n/a'} queueIdx=${bytes[4] ?? 'n/a'} leafIdx=${readU32Le(bytes, 5)}`
      );
      return LightBackendResult.ready(
        bytes,
        'installRealLocalClaimLightBackend claimer meta',
        envelope
      );
    },

    async getCompressedMetaForPayment(params) {
      const result = await fetchLivePaymentMeta({
        runtime: runtime(),
        request: params,
      });
      const envelope = pickPhotonRpcEnvelopeForNormalize(result);
      const bytes = normalizeLivePaymentMetaToBytes(envelope);
      // eslint-disable-next-line no-console
      console.log(
        `[claim paymentMeta debug] len=${bytes.length} rootIdx=${readU16Le(bytes, 0)} proveByIndex=${bytes[2] ?? 'n/a'} treeIdx=${bytes[3] ?? 'n/a'} queueIdx=${bytes[4] ?? 'n/a'} leafIdx=${readU32Le(bytes, 5)}`
      );
      return LightBackendResult.ready(
        bytes,
        'installRealLocalClaimLightBackend payment meta',
        envelope
      );
    },

    async getValidityProofForClaim(params) {
      const hintHashes = pickClaimValidityProofSourceHashes(params);
      if (hintHashes.length >= 2) {
        return resolveClaimValidityProofFromHints(params);
      }

      const result = await fetchLiveClaimProof({
        runtime: runtime(),
        request: params,
      });
      const bytes = normalizeLiveClaimProofToBytes(
        (result as { raw?: unknown }).raw ?? result
      );
      if (bytes.length !== 1 && bytes.length !== 129) {
        throw new Error(
          `claim validity proof unexpected length ${bytes.length} (expected 1 or 129 bytes)`
        );
      }
      // eslint-disable-next-line no-console
      console.log(`[claim proof debug] len=${bytes.length} source=photon-no-hints`);
      return bytes;
    },

    async getRemainingAccountsForClaim(params) {
      return fetchLiveRemainingAccountsForClaim({
        runtime: runtime(),
        request: params,
      });
    },

    ...provider,
  });

  setLightBackend(
    makeRealLocalClaimLightBackend({
      label: 'local-claim-real-backend',
      resolveClaimerMeta: resolveLocalClaimClaimerMeta,
      resolvePaymentMeta: resolveLocalClaimPaymentMeta,
      resolveValidityProofForClaim: resolveLocalClaimValidityProof,
      resolveRemainingAccountsForClaim: resolveLocalClaimRemainingAccounts,
    })
  );
}
