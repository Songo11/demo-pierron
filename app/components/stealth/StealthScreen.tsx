'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import CollapsibleSection from '../CollapsibleSection';
import { useTranslations } from '../../context/LocaleContext';
import { ensureStealthWebStorage } from '../../lib/stealthStorageWeb';
import { unwrapStealthQrPayload, type StealthQrKind } from '../../lib/stealthQrWeb';
import type {
  PreparedClaimContext,
  PreparedSendContext,
} from '../../lib/stealthSafeSendWeb';
import type { StealthRecipientBundleV1 } from '../../../shared/mobile-stealth-v1/stealthRecipientBundle';
import StealthQrScannerModal from './StealthQrScannerModal';
import StealthQrDisplayModal from './StealthQrDisplayModal';

function shortenAddress(addr: string, head = 8, tail = 8) {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

async function stealthApi() {
  return import('../../lib/stealthSafeSendWeb');
}

type QrScanTarget = 'recipient-bundle' | 'payment-notification';

export default function StealthScreen() {
  const t = useTranslations();
  const { publicKey, signTransaction } = useWallet();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recipientBundleText, setRecipientBundleText] = useState('');
  const [loadedRecipientBundle, setLoadedRecipientBundle] =
    useState<StealthRecipientBundleV1 | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [claimSeedHex, setClaimSeedHex] = useState('');
  const [preparedSend, setPreparedSend] = useState<PreparedSendContext | null>(null);
  const [preparedClaim, setPreparedClaim] = useState<PreparedClaimContext | null>(null);
  const [qrScanTarget, setQrScanTarget] = useState<QrScanTarget | null>(null);
  const [qrDisplay, setQrDisplay] = useState<{
    kind: StealthQrKind;
    payload: string;
  } | null>(null);
  const [lastPaymentClipboard, setLastPaymentClipboard] = useState<string | null>(null);

  useEffect(() => {
    ensureStealthWebStorage();
  }, []);

  const requireWallet = (): boolean => {
    if (publicKey) return true;
    alert(`${t.common.blad}\n${t.stealthUi.connectWalletFirst}`);
    return false;
  };

  const walletForSign = useCallback(() => {
    if (!publicKey || !signTransaction) {
      throw new Error(t.stealthUi.connectWalletFirst);
    }
    return {
      publicKey,
      signTransaction: signTransaction as <T>(tx: T) => Promise<T>,
    };
  }, [publicKey, signTransaction, t.stealthUi.connectWalletFirst]);

  const runAction = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setStatusMessage(`${label}…`);
    try {
      await fn();
    } catch (err: unknown) {
      const msg = String((err as Error)?.message ?? err);
      setStatusMessage(`${label}: ${msg}`);
      alert(`${t.common.blad}\n${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const pasteFromClipboard = async (setter: (v: string) => void) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        alert(`${t.common.blad}\n${t.stealthUi.clipboardEmpty}`);
        return;
      }
      setter(text.trim());
    } catch {
      alert(`${t.common.blad}\n${t.stealthUi.clipboardEmpty}`);
    }
  };

  const handleQrScanned = async (raw: string) => {
    const expect = qrScanTarget;
    setQrScanTarget(null);
    const { kind, payload } = unwrapStealthQrPayload(raw);

    if (expect === 'recipient-bundle') {
      if (kind !== 'recipient-bundle' && kind !== 'unknown') {
        throw new Error(t.stealthUi.qrWrongKindBundle);
      }
      const api = await stealthApi();
      const result = await api.loadRecipientBundleWeb(payload);
      if (result.loadedRecipientBundle) {
        setLoadedRecipientBundle(result.loadedRecipientBundle);
      }
      if (result.recipientBundleText) {
        setRecipientBundleText(result.recipientBundleText);
      }
      setStatusMessage(result.message);
      alert(`${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`);
      return;
    }

    if (expect === 'payment-notification') {
      if (kind !== 'payment-notification' && kind !== 'unknown') {
        throw new Error(t.stealthUi.qrWrongKindPayment);
      }
      if (!publicKey) {
        throw new Error(t.stealthUi.connectWalletFirst);
      }
      setClaimSeedHex(payload);
      const api = await stealthApi();
      const result = await api.ingestPaymentNotificationWeb({
        publicKey,
        raw: payload,
      });
      if (result.preparedClaim) setPreparedClaim(result.preparedClaim);
      setStatusMessage(result.message);
      alert(`${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`);
    }
  };

  return (
    <div className="pierron-screen">
      <h1 className="pierron-title">{t.tabs.safeSend}</h1>
      <p className="pierron-subtitle">{t.stealth.opis}</p>

      {publicKey ? (
        <p className="pierron-address" style={{ textAlign: 'center', marginBottom: 16 }}>
          {shortenAddress(publicKey.toBase58())}
        </p>
      ) : null}

      {statusMessage ? (
        <div className="pierron-card" style={{ marginBottom: 12 }}>
          <p className="pierron-helper">{statusMessage}</p>
          <button
            type="button"
            className="pierron-link"
            onClick={() => setStatusMessage(null)}
          >
            {t.common.ukryj}
          </button>
        </div>
      ) : null}

      <CollapsibleSection
        title={t.stealth.guide.title}
        subtitle={t.stealth.guide.subtitle}
        highlight
        defaultExpanded
      >
        <p className="pierron-helper">{t.stealth.guide.intro}</p>
        <p className="pierron-card-label" style={{ marginTop: 12 }}>
          {t.stealth.guide.senderTitle}
        </p>
        {t.stealth.guide.senderSteps.map((step) => (
          <p key={step} className="pierron-helper">
            {step}
          </p>
        ))}
        <p className="pierron-card-label" style={{ marginTop: 12 }}>
          {t.stealth.guide.recipientTitle}
        </p>
        {t.stealth.guide.recipientSteps.map((step) => (
          <p key={step} className="pierron-helper">
            {step}
          </p>
        ))}
        <p className="pierron-helper" style={{ marginTop: 12 }}>
          {t.stealth.guide.note}
        </p>
      </CollapsibleSection>

      <CollapsibleSection title={t.stealthSections.register}>
        <p className="pierron-helper">{t.stealthUi.registerSectionDesc}</p>
        <button
          type="button"
          className="pierron-btn-primary"
          style={{ marginTop: 12 }}
          disabled={busy}
          onClick={() =>
            void runAction(t.stealthUi.prepareRegister, async () => {
              if (!requireWallet() || !publicKey) return;
              const api = await stealthApi();
              const result = await api.prepareRegisterStealthWeb({ publicKey });
              setStatusMessage(result.message);
              alert(
                `${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`
              );
            })
          }
        >
          {t.stealthUi.prepareRegister}
        </button>
        <button
          type="button"
          className="pierron-btn-secondary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() =>
            void runAction(t.stealthUi.executeRegister, async () => {
              if (!requireWallet() || !publicKey) return;
              const api = await stealthApi();
              const result = await api.executeRegisterStealthWeb({
                publicKey,
                wallet: walletForSign(),
                onStage: setStatusMessage,
              });
              setStatusMessage(result.message);
              alert(
                `${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`
              );
            })
          }
        >
          {t.stealthUi.executeRegister}
        </button>
      </CollapsibleSection>

      <CollapsibleSection title={t.stealthSections.bundleV1}>
        <p className="pierron-helper">{t.stealthUi.bundleSectionDesc}</p>
        <button
          type="button"
          className="pierron-btn-primary"
          style={{ marginTop: 12 }}
          disabled={busy}
          onClick={() =>
            void runAction(t.stealthUi.copyMyBundle, async () => {
              if (!requireWallet() || !publicKey) return;
              const api = await stealthApi();
              const result = await api.copyOwnRecipientBundleWeb({ publicKey });
              setStatusMessage(result.message);
              if (result.ok && result.recipientBundleClipboard) {
                setQrDisplay({
                  kind: 'recipient-bundle',
                  payload: result.recipientBundleClipboard,
                });
              }
              alert(
                `${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`
              );
            })
          }
        >
          {t.stealthUi.copyMyBundle}
        </button>
        <button
          type="button"
          className="pierron-btn-secondary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() => setQrScanTarget('recipient-bundle')}
        >
          {t.stealthUi.scanQrBundle}
        </button>
        <textarea
          className="pierron-input"
          style={{ marginTop: 12, minHeight: 88, resize: 'vertical' }}
          placeholder={t.stealthUi.recipientBundlePlaceholder}
          value={recipientBundleText}
          onChange={(e) => setRecipientBundleText(e.target.value)}
        />
        <button
          type="button"
          className="pierron-btn-primary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() => void pasteFromClipboard(setRecipientBundleText)}
        >
          {t.stealthUi.pasteBundleFromClipboard}
        </button>
        <button
          type="button"
          className="pierron-btn-primary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() =>
            void runAction(t.stealthUi.loadRecipientBundle, async () => {
              if (!recipientBundleText.trim()) {
                alert(`${t.common.blad}\n${t.stealthUi.recipientBundlePlaceholder}`);
                return;
              }
              const api = await stealthApi();
              const result = await api.loadRecipientBundleWeb(recipientBundleText);
              if (result.loadedRecipientBundle) {
                setLoadedRecipientBundle(result.loadedRecipientBundle);
              }
              if (result.recipientBundleText) {
                setRecipientBundleText(result.recipientBundleText);
              }
              setStatusMessage(result.message);
              alert(
                `${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`
              );
            })
          }
        >
          {t.stealthUi.loadRecipientBundle}
        </button>
        <button
          type="button"
          className="pierron-btn-secondary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() =>
            void runAction(t.stealthUi.clearRecipientBundle, async () => {
              const api = await stealthApi();
              await api.clearRecipientBundleWeb();
              setRecipientBundleText('');
              setLoadedRecipientBundle(null);
              setStatusMessage(t.stealthUi.clearRecipientBundle);
            })
          }
        >
          {t.stealthUi.clearRecipientBundle}
        </button>
      </CollapsibleSection>

      <CollapsibleSection title={t.stealthSections.send}>
        <p className="pierron-helper">{t.stealthUi.sendSectionDesc}</p>
        <p className="pierron-helper">{t.stealthUi.mintDecimalsHint}</p>
        <label className="pierron-field-label">PIERRON</label>
        <input
          className="pierron-input"
          value={sendAmount}
          onChange={(e) => setSendAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0"
        />
        <button
          type="button"
          className="pierron-btn-primary"
          style={{ marginTop: 12 }}
          disabled={busy}
          onClick={() =>
            void runAction(t.stealthUi.prepareSend, async () => {
              if (!requireWallet() || !publicKey) return;
              if (!sendAmount.trim()) {
                alert(`${t.common.blad}\n${t.stealthUi.enterAmountFirst}`);
                return;
              }
              const api = await stealthApi();
              const result = await api.prepareSendStealthWeb({
                publicKey,
                amount: sendAmount,
                recipientBundle: loadedRecipientBundle,
                recipientBundleText,
              });
              if (result.preparedSend) setPreparedSend(result.preparedSend);
              setStatusMessage(result.message);
              alert(
                `${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`
              );
            })
          }
        >
          {t.stealthUi.prepareSend}
        </button>
        <button
          type="button"
          className="pierron-btn-secondary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() =>
            void runAction(t.stealthUi.sendOnchain, async () => {
              if (!requireWallet() || !publicKey) return;
              if (!preparedSend) {
                alert(`${t.common.blad}\n${t.stealthUi.prepareSendFirst}`);
                return;
              }
              const api = await stealthApi();
              const result = await api.executeSendStealthWeb({
                publicKey,
                wallet: walletForSign(),
                preparedSend,
                recipientBundle: loadedRecipientBundle,
                recipientBundleText,
                onStage: setStatusMessage,
              });
              setStatusMessage(result.message);
              if (result.ok && result.sealedPaymentClipboard) {
                setLastPaymentClipboard(result.sealedPaymentClipboard);
                setQrDisplay({
                  kind: 'payment-notification',
                  payload: result.sealedPaymentClipboard,
                });
              }
              alert(
                `${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`
              );
            })
          }
        >
          {t.stealthUi.sendOnchain}
        </button>
        {lastPaymentClipboard ? (
          <button
            type="button"
            className="pierron-btn-secondary"
            style={{ marginTop: 10 }}
            disabled={busy}
            onClick={() =>
              setQrDisplay({
                kind: 'payment-notification',
                payload: lastPaymentClipboard,
              })
            }
          >
            {t.stealthUi.showPaymentQr}
          </button>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection title={t.stealthSections.claim}>
        <p className="pierron-helper">{t.stealthUi.claimSectionDesc}</p>
        <button
          type="button"
          className="pierron-btn-secondary"
          style={{ marginTop: 12 }}
          disabled={busy}
          onClick={() => setQrScanTarget('payment-notification')}
        >
          {t.stealthUi.scanQrPayment}
        </button>
        <button
          type="button"
          className="pierron-btn-secondary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() => void pasteFromClipboard(setClaimSeedHex)}
        >
          {t.stealthUi.checkClipboardSeed}
        </button>
        <button
          type="button"
          className="pierron-btn-primary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() =>
            void runAction(t.stealthUi.pastePaymentNotification, async () => {
              if (!requireWallet() || !publicKey) return;
              const raw = await navigator.clipboard.readText();
              if (!raw.trim()) {
                alert(`${t.common.blad}\n${t.stealthUi.clipboardEmpty}`);
                return;
              }
              setClaimSeedHex(raw.trim());
              const api = await stealthApi();
              const result = await api.ingestPaymentNotificationWeb({
                publicKey,
                raw: raw.trim(),
              });
              if (result.preparedClaim) setPreparedClaim(result.preparedClaim);
              setStatusMessage(result.message);
              alert(
                `${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`
              );
            })
          }
        >
          {t.stealthUi.pastePaymentNotification}
        </button>
        <input
          className="pierron-input"
          style={{ marginTop: 12 }}
          placeholder={t.stealthUi.optionalSeedPlaceholder}
          value={claimSeedHex}
          onChange={(e) => setClaimSeedHex(e.target.value)}
        />
        <button
          type="button"
          className="pierron-btn-primary"
          style={{ marginTop: 12 }}
          disabled={busy}
          onClick={() =>
            void runAction(t.stealthUi.prepareClaim, async () => {
              if (!requireWallet() || !publicKey) return;
              const api = await stealthApi();
              const result = await api.prepareClaimStealthWeb({
                publicKey,
                claimSeedHex,
                preparedClaim,
                paymentRaw: claimSeedHex,
              });
              if (result.preparedClaim) setPreparedClaim(result.preparedClaim);
              setStatusMessage(result.message);
              alert(
                `${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`
              );
            })
          }
        >
          {t.stealthUi.prepareClaim}
        </button>
        <button
          type="button"
          className="pierron-btn-secondary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() =>
            void runAction(t.stealthUi.claimOnchain, async () => {
              if (!requireWallet() || !publicKey) return;
              const api = await stealthApi();
              const result = await api.executeClaimStealthWeb({
                publicKey,
                wallet: walletForSign(),
                claimSeedHex,
                preparedClaim,
                onStage: setStatusMessage,
              });
              setStatusMessage(result.message);
              alert(
                `${result.ok ? t.common.sukces : t.common.blad}\n${result.message}`
              );
            })
          }
        >
          {t.stealthUi.claimOnchain}
        </button>
      </CollapsibleSection>

      <StealthQrScannerModal
        open={qrScanTarget != null}
        expectKind={qrScanTarget ?? undefined}
        title={
          qrScanTarget === 'payment-notification'
            ? t.stealthUi.scanQrTitlePayment
            : t.stealthUi.scanQrTitleBundle
        }
        hintCamera={t.stealthUi.scanQrHintCamera}
        hintScreen={t.stealthUi.scanQrHintScreen}
        labelCamera={t.stealthUi.scanQrCamera}
        labelScreen={t.stealthUi.scanQrScreen}
        labelCancel={t.common.anuluj}
        labelScanning={t.stealthUi.scanQrScanning}
        labelPickSource={t.stealthUi.scanQrPickSource}
        onClose={() => setQrScanTarget(null)}
        onScanned={handleQrScanned}
      />

      <StealthQrDisplayModal
        open={qrDisplay != null}
        kind={qrDisplay?.kind ?? 'recipient-bundle'}
        payload={qrDisplay?.payload ?? ''}
        title={
          qrDisplay?.kind === 'payment-notification'
            ? t.stealthUi.showPaymentQr
            : t.stealthUi.showMyBundleQr
        }
        hint={
          qrDisplay?.kind === 'payment-notification'
            ? t.stealthUi.qrDisplayPaymentHint
            : t.stealthUi.qrDisplayBundleHint
        }
        labelClose={t.common.ok}
        onClose={() => setQrDisplay(null)}
      />
    </div>
  );
}
