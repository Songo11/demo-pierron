'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { useTranslations } from '../context/LocaleContext';
import { loadAppSettings } from '../lib/appSettings';
import {
  buildPierronPayLink,
  PIERRON_DECIMALS,
} from '../../shared/pierron/pierronPayFlow.ts';
import { getProgramIds, setCurrentCluster } from '../../shared/core/programIds';

function appClusterToProgramIdsCluster(cluster: string): 'devnet' | 'testnet' | 'mainnet-beta' {
  return cluster === 'localnet' ? 'devnet' : (cluster as 'devnet' | 'testnet' | 'mainnet-beta');
}

function parseAmountUi(raw: string): { amountUi: string; amountBaseUnits: bigint } {
  const amountUi = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(amountUi) || Number(amountUi) <= 0) {
    throw new Error('invalid');
  }
  const [whole, frac = ''] = amountUi.split('.');
  if (frac.length > PIERRON_DECIMALS) {
    throw new Error('decimals');
  }
  const padded = `${whole}${frac.padEnd(PIERRON_DECIMALS, '0')}`;
  const amountBaseUnits = BigInt(padded);
  if (amountBaseUnits <= 0n) {
    throw new Error('zero');
  }
  return { amountUi, amountBaseUnits };
}

export function PierronPayMerchantPanel() {
  const t = useTranslations();
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState('10');
  const [label, setLabel] = useState('');
  const [payLink, setPayLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qrUri = useMemo(() => {
    if (!payLink) return null;
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(payLink)}`;
  }, [payLink]);

  const onGenerate = async () => {
    if (!publicKey) {
      alert(`${t.common.blad}\n${t.pay.walletRequired}`);
      return;
    }
    try {
      const settings = await loadAppSettings();
      const { amountUi, amountBaseUnits } = parseAmountUi(amount);
      const cluster = appClusterToProgramIdsCluster(settings.cluster);
      setCurrentCluster(cluster);
      const mint = getProgramIds(cluster).tokenMint;
      if (!mint) {
        throw new Error('mint');
      }
      const request = {
        recipient: publicKey,
        amountUi,
        amountBaseUnits,
        label: label.trim() || undefined,
        cluster: settings.cluster,
        mint,
      };
      setPayLink(buildPierronPayLink(request));
      setError(null);
    } catch {
      setPayLink(null);
      setError(t.pay.merchantInvalidAmount);
    }
  };

  const onCopyLink = async () => {
    if (!payLink) return;
    try {
      await navigator.clipboard.writeText(payLink);
      alert(`${t.common.sukces}\n${t.pay.merchantLinkCopied}`);
    } catch {
      alert(payLink);
    }
  };

  return (
    <div>
      <p className="pierron-helper" style={{ marginBottom: 16 }}>
        {t.pay.merchantSectionSubtitle}
      </p>

      {!publicKey ? (
        <p className="pierron-helper">{t.pay.walletRequired}</p>
      ) : (
        <>
          <label className="pierron-field-label">{t.pay.merchantWalletLabel}</label>
          <p className="pierron-address" style={{ marginBottom: 14 }}>
            {publicKey.toBase58().slice(0, 8)}…{publicKey.toBase58().slice(-8)}
          </p>

          <label className="pierron-field-label">{t.pay.merchantAmountLabel}</label>
          <input
            className="pierron-input"
            style={{ marginBottom: 14 }}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setPayLink(null);
            }}
            placeholder="10"
            inputMode="decimal"
          />

          <label className="pierron-field-label">{t.pay.merchantLabelOptional}</label>
          <input
            className="pierron-input"
            style={{ marginBottom: 14 }}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setPayLink(null);
            }}
            placeholder={t.pay.merchantLabelPlaceholder}
          />

          <button type="button" className="pierron-btn-primary" onClick={() => void onGenerate()}>
            {t.pay.merchantGenerate}
          </button>

          {error ? (
            <p className="pierron-helper" style={{ color: 'var(--pierron-error)', marginTop: 10 }}>
              {error}
            </p>
          ) : null}

          {payLink ? (
            <div className="pierron-preview-card" style={{ textAlign: 'center' }}>
              <p className="pierron-card-label">{t.pay.merchantQrTitle}</p>
              <p className="pierron-preview-amount">{amount.trim()} PIERRON</p>
              {qrUri ? (
                <img
                  src={qrUri}
                  alt={t.pay.merchantQrTitle}
                  width={220}
                  height={220}
                  style={{
                    display: 'block',
                    margin: '0 auto 12px',
                    borderRadius: 8,
                    background: '#fff',
                  }}
                />
              ) : null}
              <p
                className="pierron-helper"
                style={{ fontSize: 12, wordBreak: 'break-all', marginBottom: 10 }}
              >
                {payLink}
              </p>
              <button type="button" className="pierron-link" onClick={() => void onCopyLink()}>
                {t.pay.merchantCopyLink}
              </button>
              <p className="pierron-helper" style={{ marginTop: 12 }}>
                {t.pay.merchantQrHint}
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
