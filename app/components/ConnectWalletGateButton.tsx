'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

import { useTranslations } from '../context/LocaleContext';

/**
 * Gate CTA: always recoverable after reject / hung connect.
 * Never stays disabled on "Łączenie…" — clears selection and reopens the modal.
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, publicKey, select, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (connected) {
      setError(null);
      setBusy(false);
    }
  }, [connected]);

  // If adapter reports connecting for too long after a reject, unlock the CTA.
  useEffect(() => {
    if (!connecting) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const id = window.setTimeout(() => setBusy(false), 2500);
    return () => window.clearTimeout(id);
  }, [connecting]);

  useEffect(() => {
    const onWalletErr = (ev: Event) => {
      const msg = (ev as CustomEvent<{ message?: string }>).detail?.message;
      if (!msg) return;
      const rejected = /reject|denied|cancel/i.test(msg);
      setError(
        rejected
          ? (t.dapp.connectRejectedHint ??
            'Odrzucono w portfelu. Kliknij ponownie i zatwierdź połączenie.')
          : msg
      );
      setBusy(false);
    };
    window.addEventListener('pierron-wallet-error', onWalletErr);
    return () => window.removeEventListener('pierron-wallet-error', onWalletErr);
  }, [t.dapp.connectRejectedHint]);

  const onClick = useCallback(async () => {
    setError(null);
    if (connected) {
      setVisible(true);
      return;
    }

    // Clear hung / rejected selection so the next attempt is clean.
    try {
      if (wallet) {
        await disconnect().catch(() => undefined);
      }
    } catch {
      // ignore
    }
    try {
      select(null);
    } catch {
      // ignore
    }

    setBusy(false);
    setVisible(true);
  }, [connected, disconnect, select, setVisible, wallet]);

  const label = connected
    ? publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : t.wallet.portfelPodlaczony
    : busy || connecting
      ? t.dapp.connectHintConnecting
      : t.wallet.polaczPortfel;

  return (
    <div className="pierron-connect-wallet-wrap">
      <button
        type="button"
        className="wallet-adapter-button wallet-adapter-button-trigger pierron-connect-wallet-btn"
        onClick={() => {
          void onClick();
        }}
      >
        {label}
      </button>
      {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}
    </div>
  );
}
