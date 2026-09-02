import type { LightBackend } from './lightClient.ts';
import { createNoopLightBackend } from './lightClient.ts';

/**
 * installRealLocal* helpers each call setLightBackend() and overwrite the previous one.
 * Mobile needs register + send + claim methods active at once.
 */
export function mergeRealLocalLightBackends(
  register: LightBackend,
  send: LightBackend,
  claim: LightBackend
): LightBackend {
  const noop = createNoopLightBackend();

  return {
    ...noop,

    async getPackedAddressTreeInfo(params) {
      if (params?.address) {
        return send.getPackedAddressTreeInfo(params);
      }
      return register.getPackedAddressTreeInfo(params);
    },

    getValidityProofForRegister: register.getValidityProofForRegister.bind(register),
    getCompressedMetaForRegister: register.getCompressedMetaForRegister.bind(register),
    getNewRegisterAddressParams: register.getNewRegisterAddressParams.bind(register),
    getRemainingAccountsForRegister:
      register.getRemainingAccountsForRegister.bind(register),

    getValidityProofForSend: send.getValidityProofForSend.bind(send),
    getNewPaymentAddressParams: send.getNewPaymentAddressParams.bind(send),
    getRemainingAccountsForSend: send.getRemainingAccountsForSend.bind(send),

    getValidityProofForClaim: claim.getValidityProofForClaim.bind(claim),
    getCompressedMetaForClaimer: claim.getCompressedMetaForClaimer.bind(claim),
    getCompressedMetaForPayment: claim.getCompressedMetaForPayment.bind(claim),
    getRemainingAccountsForClaim: claim.getRemainingAccountsForClaim.bind(claim),
  };
}
