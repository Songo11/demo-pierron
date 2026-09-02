import { PublicKey } from '@solana/web3.js';
import {
  getRecipientBundleV1,
  getStealthClaimable,
  getStealthMeta,
  getStealthPending,
  getStealthKeys,
  type StoredRecipientMode,
  type StoredStealthClaimableItem,
  type StoredStealthPendingItem,
} from './stealthStorage';
import {
  buildClaimStealthProverInput,
  summarizeClaimStealthProverInput,
} from './stealthProver';
import {
  DEFAULT_STEALTH_READINESS_MESSAGES,
  resolveStealthNextStep,
  type StealthReadinessMessages,
} from './stealthReadinessMessages';

export type StealthReadinessState = {
  walletConnected: boolean;

  hasKeys: boolean;
  hasMeta: boolean;

  bundleExportReady: boolean;
  hasImportedRecipientBundle: boolean;

  pendingCount: number;
  hasPreparedSend: boolean;
  hasPreparedRealSend: boolean;
  hasPreparedDebugSend: boolean;
  hasPreparedClaim: boolean;

  hasClaimable: boolean;
  hasUnclaimed: boolean;
  hasRealClaimable: boolean;
  hasDebugClaimable: boolean;

  sendLocalReady: boolean;
  sendOnchainReady: boolean;
  claimLocalReady: boolean;
  claimOnchainReady: boolean;

  latestPendingRecipientMode?: StoredRecipientMode;
  nextStep: string;
};

export const INITIAL_STEALTH_READINESS: StealthReadinessState = {
  walletConnected: false,

  hasKeys: false,
  hasMeta: false,

  bundleExportReady: false,
  hasImportedRecipientBundle: false,

  pendingCount: 0,
  hasPreparedSend: false,
  hasPreparedRealSend: false,
  hasPreparedDebugSend: false,
  hasPreparedClaim: false,

  hasClaimable: false,
  hasUnclaimed: false,
  hasRealClaimable: false,
  hasDebugClaimable: false,

  sendLocalReady: false,
  sendOnchainReady: false,
  claimLocalReady: false,
  claimOnchainReady: false,

  latestPendingRecipientMode: undefined,
  nextStep: DEFAULT_STEALTH_READINESS_MESSAGES.connectToStart,
};

function findLatestPendingByType(
  pending: StoredStealthPendingItem[],
  type: StoredStealthPendingItem['type']
): StoredStealthPendingItem | undefined {
  return pending.find((item) => item.type === type);
}

function findLatestUnclaimedWithMint(
  claimable: StoredStealthClaimableItem[]
): StoredStealthClaimableItem | undefined {
  return claimable.find((item) => !item.claimed && !!item.mint);
}

export async function loadStealthReadiness(
  wallet?: PublicKey | null,
  messages: StealthReadinessMessages = DEFAULT_STEALTH_READINESS_MESSAGES
): Promise<StealthReadinessState> {
  try {
    const [keys, meta, pending, claimable, recipientBundle] = await Promise.all([
      getStealthKeys(),
      getStealthMeta(),
      getStealthPending(),
      getStealthClaimable(),
      getRecipientBundleV1(),
    ]);

    const walletConnected = !!wallet;

    const hasKeys = !!keys;
    const hasMeta = !!meta;
    const bundleExportReady = hasKeys;
    const hasImportedRecipientBundle = !!recipientBundle;

    const pendingCount = pending.length;

    const latestSendPending = findLatestPendingByType(pending, 'send_stealth');
    const latestClaimPending = findLatestPendingByType(pending, 'claim_stealth');

    const hasPreparedSend = !!latestSendPending;
    const hasPreparedRealSend = latestSendPending?.recipientMode === 'provided';
    const hasPreparedDebugSend =
      !!latestSendPending && latestSendPending.recipientMode !== 'provided';
    const hasPreparedClaim = !!latestClaimPending;

    const hasClaimable = claimable.length > 0;
    const hasUnclaimed = claimable.some((item) => !item.claimed);
    const hasRealClaimable = claimable.some(
      (item) => !item.claimed && item.recipientMode === 'provided'
    );
    const hasDebugClaimable = claimable.some(
      (item) => !item.claimed && item.recipientMode !== 'provided'
    );

    /**
     * SEND readiness dla V1:
     * lokalnie gotowe = mamy wallet + lokalną tożsamość stealth + załadowany recipient bundle.
     * To oznacza, że user może uczciwie przygotować realny send_stealth bez debug-generated flow.
     */
    const sendLocalReady =
      walletConnected && hasKeys && hasMeta && hasImportedRecipientBundle;

    /**
     * SEND on-chain readiness:
     * nadal nie zgadujemy z samego storage, bo storage nie niesie pełnego proof/light context.
     */
    const sendOnchainReady =
      hasPreparedRealSend &&
      hasImportedRecipientBundle &&
      walletConnected;

    /**
     * CLAIM readiness:
     * tu nadal możemy policzyć uczciwiej, bo buildClaimStealthProverInput opiera się o
     * local storage + warstwę Light i nie zależy od debug-generated recipient flow.
     */
    let claimLocalReady = false;
    let claimOnchainReady = false;

    if (walletConnected) {
      const latestClaimable = findLatestUnclaimedWithMint(claimable);

      if (latestClaimable?.mint) {
        try {
          const claimInput = await buildClaimStealthProverInput({
            claimer: wallet,
            mint: new PublicKey(latestClaimable.mint),
            stealthAddress: latestClaimable.stealthAddress
              ? new PublicKey(latestClaimable.stealthAddress)
              : undefined,
            metaOwner: meta?.owner ? new PublicKey(meta.owner) : undefined,
            skipLightBundleProbe: true,
          });
          const claimSummary = summarizeClaimStealthProverInput(claimInput);

          claimLocalReady = claimSummary.localDataReady;
          // Pełny proof/meta z Photon tylko w prepare/claim — nie blokuj send/readiness.
          claimOnchainReady = false;
        } catch {
          claimLocalReady =
            hasMeta && !!latestClaimable.stealthAddress && !!latestClaimable.mint;
          claimOnchainReady = false;
        }
      }
    }

    const nextStep = resolveStealthNextStep(
      {
        walletConnected,
        hasKeys,
        hasMeta,
        bundleExportReady,
        hasImportedRecipientBundle,
        hasPreparedRealSend,
        hasPreparedDebugSend,
        hasUnclaimed,
        claimLocalReady,
        claimOnchainReady,
        sendLocalReady,
      },
      messages
    );

    return {
      walletConnected,

      hasKeys,
      hasMeta,

      bundleExportReady,
      hasImportedRecipientBundle,

      pendingCount,
      hasPreparedSend,
      hasPreparedRealSend,
      hasPreparedDebugSend,
      hasPreparedClaim,

      hasClaimable,
      hasUnclaimed,
      hasRealClaimable,
      hasDebugClaimable,

      sendLocalReady,
      sendOnchainReady,
      claimLocalReady,
      claimOnchainReady,

      latestPendingRecipientMode: latestSendPending?.recipientMode,
      nextStep,
    };
  } catch {
    return {
      ...INITIAL_STEALTH_READINESS,
      walletConnected: !!wallet,
      nextStep: wallet ? messages.loadFailed : messages.connectToStart,
    };
  }
}
