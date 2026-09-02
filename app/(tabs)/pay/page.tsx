'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSearchParams } from 'next/navigation';

import { PierronPayMerchantPanel } from '../../components/PierronPayMerchantPanel';
import { useTranslations } from '../../context/LocaleContext';
import { loadAppSettings } from '../../lib/appSettings';
import {
  formatPayRecipientShort,
  parsePierronPayLink,
  type PierronPayRequest,
} from '../../../shared/pierron/pierronPayFlow.ts';
import { mapPierronPayError, signAndSubmitPierronPay } from '../../lib/pierronPayWeb';

export default function PayPage() {
  return (
    <Suspense fallback={<div className="pierron-screen pierron-loading">…</div>}>
      <PayPageContent />
    </Suspense>
  );
}

function PayPageContent() {
  const t = useTranslations();
  const { publicKey, signTransaction } = useWallet();
  const searchParams = useSearchParams();

  const [paymentLink, setPaymentLink] = useState('');
  const [parsed, setParsed] = useState<PierronPayRequest | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const applyLink = useCallback((raw: string) => {
    const trimmed = raw.trim();
    setPaymentLink(trimmed);
    if (!trimmed) {
      setParsed(null);
      setParseError(null);
      return;
    }
    try {
      const req = parsePierronPayLink(trimmed);
      setParsed(req);
      setParseError(null);
    } catch (e) {
      setParsed(null);
      setParseError(mapPierronPayError(String((e as Error)?.message || e)));
    }
  }, []);

  useEffect(() => {
    const linkParam = searchParams.get('link');
    if (linkParam?.trim()) {
      applyLink(linkParam);
    }
  }, [searchParams, applyLink]);

  const onScanQr = () => {
    if (!publicKey) {
      alert(`${t.common.blad}\n${t.pay.walletRequired}`);
      return;
    }
    alert(t.pay.scanCameraRebuildHint);
  };

  const onPay = async () => {
    if (!publicKey || !parsed || !signTransaction) return;
    setPaying(true);
    setStatusMessage(t.pay.stagePrepare);
    setLastSignature(null);
    try {
      const settings = await loadAppSettings();
      const { signature } = await signAndSubmitPierronPay({
        settings,
        payer: publicKey,
        request: parsed,
        signTransaction,
        onStage: setStatusMessage,
      });
      setLastSignature(signature);
      setStatusMessage(null);
      alert(`${t.pay.successTitle}\n${t.pay.successBody}`);
      setPaymentLink('');
      setParsed(null);
    } catch (e) {
      const msg = mapPierronPayError(String((e as Error)?.message || e));
      setStatusMessage(null);
      alert(`${t.common.blad}\n${msg}`);
    } finally {
      setPaying(false);
    }
  };

  const openLastTx = () => {
    if (!lastSignature) return;
    window.open(
      `https://explorer.solana.com/tx/${lastSignature}?cluster=devnet`,
      '_blank'
    );
  };

  return (
    <div className="pierron-screen">
      <h1 className="pierron-title">{t.pay.title}</h1>
      <p className="pierron-subtitle">{t.pay.subtitle}</p>

      <div className="pierron-card">
        <p className="pierron-card-label">{t.pay.shopSectionTitle}</p>
        <p className="pierron-helper" style={{ marginBottom: 16 }}>
          {t.pay.shopSectionSubtitle}
        </p>

        <button
          type="button"
          className="pierron-btn-primary"
          onClick={onScanQr}
          disabled={!publicKey}
          style={{ marginBottom: 16, opacity: publicKey ? 1 : 0.45 }}
        >
          {t.pay.scanQr}
        </button>

        <p className="pierron-or-label">{t.pay.orLabel}</p>

        <input
          className="pierron-input"
          value={paymentLink}
          onChange={(e) => applyLink(e.target.value)}
          placeholder={t.pay.pastePlaceholder}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={!publicKey}
        />

        {parseError ? (
          <p className="pierron-helper" style={{ color: 'var(--pierron-error)', marginTop: 10 }}>
            {parseError}
          </p>
        ) : null}

        {parsed ? (
          <div className="pierron-preview-card">
            <p className="pierron-card-label">{t.pay.previewTitle}</p>
            <p className="pierron-helper">
              {t.pay.previewRecipient}: {formatPayRecipientShort(parsed.recipient)}
            </p>
            <p className="pierron-preview-amount">{parsed.amountUi} PIERRON</p>
            {parsed.label ? (
              <p className="pierron-helper">
                {t.pay.previewLabel}: {parsed.label}
              </p>
            ) : null}
            <button
              type="button"
              className="pierron-btn-primary"
              style={{ marginTop: 16, opacity: !publicKey || paying ? 0.45 : 1 }}
              onClick={() => void onPay()}
              disabled={!publicKey || paying}
            >
              {paying ? statusMessage ?? t.pay.stageWallet : t.pay.confirmPay}
            </button>
          </div>
        ) : (
          <p className="pierron-helper" style={{ marginTop: 16, textAlign: 'center' }}>
            {t.pay.hintPasteOrScan}
          </p>
        )}

        {!publicKey ? (
          <p className="pierron-helper" style={{ marginTop: 16, textAlign: 'center' }}>
            {t.pay.walletRequired}
          </p>
        ) : null}

        {lastSignature ? (
          <button type="button" className="pierron-link" style={{ marginTop: 16 }} onClick={openLastTx}>
            {t.pay.viewLastTx}
          </button>
        ) : null}
      </div>

      <div className="pierron-card">
        <p className="pierron-card-label">{t.pay.merchantSectionTitle}</p>
        <PierronPayMerchantPanel />
      </div>
    </div>
  );
}
