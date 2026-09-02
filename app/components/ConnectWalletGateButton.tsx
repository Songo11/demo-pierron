'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SolanaMobileWalletAdapterWalletName } from '@solana-mobile/wallet-adapter-mobile';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

import { useTranslations } from '../context/LocaleContext';

/**
 * Gate CTA with Android Mobile Wallet Adapter support.
 *
 * MWA quirk: selecting it in the modal often does nothing if it is already
 * the selected wallet — we must call connect() explicitly (Solana Mobile UX).
 * Leaving to the wallet app and returning also needs a reconnect attempt.
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, wallets, publicKey, connect, select } =
    useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);

  const mobileWallet = wallets.find(
    (w) => w.adapter.name === SolanaMobileWalletAdapterWalletName
  );
  const isMwaSelected =
    wallet?.adapter.name === SolanaMobileWalletAdapterWalletName;

  useEffect(() => {
    if (connected) {
      setError(null);
      setBusy(false);
      inFlightRef.current = false;
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
      inFlightRef.current = false;
    };
    window.addEventListener('pierron-wallet-error', onWalletErr);
    return () => window.removeEventListener('pierron-wallet-error', onWalletErr);
  }, [t.dapp.connectRejectedHint]);

  const runConnect = useCallback(async () => {
    if (inFlightRef.current || connected) return;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await connect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const rejected = /reject|denied|cancel/i.test(msg);
      setError(
        rejected
          ? (t.dapp.connectRejectedHint ??
            'Odrzucono w portfelu. Kliknij ponownie i zatwierdź połączenie.')
          : msg
      );
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }, [connect, connected, t.dapp.connectRejectedHint]);

  // After modal select() of a non-MWA wallet, connect automatically.
  // For MWA we connect from onClick / visibility resume (select often no-ops).
  useEffect(() => {
    if (!wallet || connected || connecting || isMwaSelected) return;
    void runConnect();
  }, [wallet, connected, connecting, isMwaSelected, runConnect]);

  // Returning from Phantom/Solflare app after MWA authorize.
  useEffect(() => {
    if (!isMwaSelected || connected) return;
    const resume = () => {
      if (document.visibilityState === 'visible') {
        void runConnect();
      }
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [isMwaSelected, connected, runConnect]);

  const onClick = useCallback(() => {
    setError(null);
    if (connected) {
      setVisible(true);
      return;
    }
    if (connecting || busy) {
      // Allow retry if stuck.
      void runConnect();
      return;
    }

    // Android: prefer Mobile Wallet Adapter ("Use installed wallet").
    if (isMwaSelected) {
      void runConnect();
      return;
    }
    if (mobileWallet) {
      select(SolanaMobileWalletAdapterWalletName);
      // select may be sync; connect on next tick so adapter is wired.
      window.setTimeout(() => {
        void runConnect();
      }, 0);
      return;
    }

    // Desktop / no MWA: open wallet picker (Phantom / Solflare).
    if (!wallet) {
      setVisible(true);
      return;
    }
    void runConnect();
  }, [
    busy,
    connected,
    connecting,
    isMwaSelected,
    mobileWallet,
    runConnect,
    select,
    setVisible,
    wallet,
  ]);

  const label = connected
    ? publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : t.wallet.portfelPodlaczony
    : busy || connecting
      ? t.dapp.connectHintConnecting
      : mobileWallet && !wallet
        ? (t.dapp.connectMobileWallet ?? t.wallet.polaczPortfel)
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
      {mobileWallet && !connected ? (
        <p className="pierron-connect-wallet-mwa-hint">
          {t.dapp.connectMobileHint ??
            'Na Androidzie: Połącz portfel otworzy zainstalowaną aplikację portfela (Phantom / Solflare).'}
        </p>
      ) : null}
    </div>
  );
}
