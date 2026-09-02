'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

import { useTranslations } from '../context/LocaleContext';

/**
 * Gate CTA. Wallet modal only `select()`s — we must `connect()` afterwards
 * (same as WalletMultiButton's has-wallet → onConnect path).
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, publicKey, connect } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connectAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (connected) {
      setError(null);
      setBusy(false);
      connectAttemptRef.current = null;
    }
  }, [connected]);

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
      connectAttemptRef.current = null;
    };
    window.addEventListener('pierron-wallet-error', onWalletErr);
    return () => window.removeEventListener('pierron-wallet-error', onWalletErr);
  }, [t.dapp.connectRejectedHint]);

  // After modal select(walletName), adapter is set but not connected — connect now.
  useEffect(() => {
    if (!wallet || connected || connecting) return;
    const name = wallet.adapter.name;
    if (connectAttemptRef.current === name) return;
    connectAttemptRef.current = name;

    let cancelled = false;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await connect();
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const rejected = /reject|denied|cancel/i.test(msg);
        setError(
          rejected
            ? (t.dapp.connectRejectedHint ??
              'Odrzucono w portfelu. Kliknij ponownie i zatwierdź połączenie.')
            : msg
        );
        connectAttemptRef.current = null;
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet, connected, connecting, connect, t.dapp.connectRejectedHint]);

  const onClick = useCallback(() => {
    setError(null);
    if (connected) {
      setVisible(true);
      return;
    }
    if (!wallet) {
      setVisible(true);
      return;
    }
    // Selected but not connected (e.g. previous reject) — retry connect.
    connectAttemptRef.current = null;
    setBusy(true);
    void connect()
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        const rejected = /reject|denied|cancel/i.test(msg);
        setError(
          rejected
            ? (t.dapp.connectRejectedHint ??
              'Odrzucono w portfelu. Kliknij ponownie i zatwierdź połączenie.')
            : msg
        );
      })
      .finally(() => setBusy(false));
  }, [connected, connect, setVisible, t.dapp.connectRejectedHint, wallet]);

  const label = connected
    ? publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : t.wallet.portfelPodlaczony
    : busy || connecting
      ? t.dapp.connectHintConnecting
      : wallet
        ? t.wallet.polaczPortfel
        : t.wallet.polaczPortfel;

  return (
    <div className="pierron-connect-wallet-wrap">
      <button
        type="button"
        className="wallet-adapter-button wallet-adapter-button-trigger pierron-connect-wallet-btn"
        onClick={onClick}
      >
        {label}
      </button>
      {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}
    </div>
  );
}
