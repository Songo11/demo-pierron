/** Keys match mobile `stealthReadiness` i18n section (English defaults). */
export type StealthReadinessMessages = {
  connectToStart: string;
  prepareRegister: string;
  prepareBundleExport: string;
  loadRecipientBundle: string;
  debugSendPrepared: string;
  readyForRealSend: string;
  unclaimedCheckClaim: string;
  claimMissingLight: string;
  claimReadyOnchain: string;
  realSendPrepared: string;
  defaultNext: string;
  loadFailed: string;
};

export const DEFAULT_STEALTH_READINESS_MESSAGES: StealthReadinessMessages = {
  connectToStart: 'Connect your wallet to get started.',
  prepareRegister:
    'Prepare register_stealth to create your local stealth identity.',
  prepareBundleExport: 'Prepare recipient bundle V1 export.',
  loadRecipientBundle:
    "Load the recipient's bundle V1 to unlock real send_stealth.",
  debugSendPrepared:
    'You have a debug send prepared. For Mobile V1 load recipient bundle V1 and prepare a real send.',
  readyForRealSend:
    'You have everything locally for real send_stealth. Next: prepare real send.',
  unclaimedCheckClaim:
    'You have unclaimed stealth funds. Open claim flow and check local receive data.',
  claimMissingLight:
    'Claim has local data but missing full Light layer proof/data for on-chain execution.',
  claimReadyOnchain: 'Stealth claim is ready to execute on-chain.',
  realSendPrepared:
    'Real send stealth is prepared. Next: simulate/send after full Light flow is wired.',
  defaultNext:
    'Copy your recipient bundle V1 or load recipient bundle and continue the real flow.',
  loadFailed:
    'Could not read stealth readiness. Check local storage and stealth data.',
};

export function resolveStealthNextStep(
  state: {
    walletConnected: boolean;
    hasKeys: boolean;
    hasMeta: boolean;
    bundleExportReady: boolean;
    hasImportedRecipientBundle: boolean;
    hasPreparedRealSend: boolean;
    hasPreparedDebugSend: boolean;
    hasUnclaimed: boolean;
    claimLocalReady: boolean;
    claimOnchainReady: boolean;
    sendLocalReady: boolean;
  },
  m: StealthReadinessMessages
): string {
  if (!state.walletConnected) return m.connectToStart;
  if (!state.hasKeys || !state.hasMeta) return m.prepareRegister;
  if (!state.bundleExportReady) return m.prepareBundleExport;
  if (
    !state.hasImportedRecipientBundle &&
    !state.hasPreparedRealSend &&
    !state.hasUnclaimed
  ) {
    return m.loadRecipientBundle;
  }
  if (state.hasPreparedDebugSend) return m.debugSendPrepared;
  if (state.sendLocalReady && !state.hasPreparedRealSend && !state.hasUnclaimed) {
    return m.readyForRealSend;
  }
  if (state.hasUnclaimed && !state.claimLocalReady) return m.unclaimedCheckClaim;
  if (state.hasUnclaimed && state.claimLocalReady && !state.claimOnchainReady) {
    return m.claimMissingLight;
  }
  if (state.hasUnclaimed && state.claimOnchainReady) return m.claimReadyOnchain;
  if (state.hasPreparedRealSend) return m.realSendPrepared;
  return m.defaultNext;
}
