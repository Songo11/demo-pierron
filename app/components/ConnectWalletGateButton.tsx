'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SolanaMobileWalletAdapterWalletName } from '@solana-mobile/wallet-adapter-mobile';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

import { useTranslations } from '../context/LocaleContext';
import {
  isAndroidUserAgent,
  isMwaWalletNotFoundMessage,
  openCurrentPageInPhantom,
  openCurrentPageInSolflare,
} from '../lib/openInMobileWalletBrowser';

/**
 * Gate CTA with Android support.
 *
 * MWA works on stock Chrome + Play wallets. GrapheneOS / Vanadium often block
 * package discovery → "FOUND NO INSTALLED WALLET…". Fallback: open this page
 * inside Phantom/Solflare in-app browser (provider injected, same as mobile app path).
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, wallets, publicKey, connect, select } =
    useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBrowseFallback, setShowBrowseFallback] = useState(false);
  const inFlightRef = useRef(false);

  const android = typeof navigator !== 'undefined' && isAndroidUserAgent();
  const mobileWallet = wallets.find(
    (w) => w.adapter.name === SolanaMobileWalletAdapterWalletName
  );
  const isMwaSelected =
    wallet?.adapter.name === SolanaMobileWalletAdapterWalletName;
  // Inside Phantom/Solflare browser the extension provider is already injected.
  const inWalletBrowser =
    typeof window !== 'undefined' &&
    Boolean(
      (window as Window & { phantom?: { solana?: unknown }; solflare?: unknown })
        .phantom?.solana ||
        (window as Window & { solflare?: unknown }).solflare ||
        (window as Window & { solana?: { isPhantom?: boolean } }).solana?.isPhantom
    );

  useEffect(() => {
    if (connected) {
      setError(null);
      setBusy(false);
      setShowBrowseFallback(false);
      inFlightRef.current = false;
    }
  }, [connected]);

  // On Android (esp. Vanadium): show browse fallbacks by default — MWA is unreliable there.
  useEffect(() => {
    if (android && !inWalletBrowser && !connected) {
      setShowBrowseFallback(true);
    }
  }, [android, inWalletBrowser, connected]);

  useEffect(() => {
    const onWalletErr = (ev: Event) => {
      const msg = (ev as CustomEvent<{ message?: string }>).detail?.message;
      if (!msg) return;
      if (isMwaWalletNotFoundMessage(msg)) {
        setShowBrowseFallback(true);
        setError(
          t.dapp.connectMwaNotFound ??
            'Ta przeglądarka nie widzi portfela przez Mobile Wallet Adapter (częste na GrapheneOS/Vanadium). Otwórz dappkę w Phantom lub Solflare.'
        );
        setBusy(false);
        inFlightRef.current = false;
        return;
      }
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
    const onMwaMissing = () => {
      setShowBrowseFallback(true);
      setError(
        t.dapp.connectMwaNotFound ??
          'Ta przeglądarka nie widzi portfela przez Mobile Wallet Adapter. Otwórz dappkę w Phantom lub Solflare.'
      );
      setBusy(false);
      inFlightRef.current = false;
    };
    window.addEventListener('pierron-wallet-error', onWalletErr);
    window.addEventListener('pierron-mwa-not-found', onMwaMissing);
    return () => {
      window.removeEventListener('pierron-wallet-error', onWalletErr);
      window.removeEventListener('pierron-mwa-not-found', onMwaMissing);
    };
  }, [t.dapp.connectMwaNotFound, t.dapp.connectRejectedHint]);

  const runConnect = useCallback(async () => {
    if (inFlightRef.current || connected) return;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await connect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isMwaWalletNotFoundMessage(msg)) {
        setShowBrowseFallback(true);
        setError(
          t.dapp.connectMwaNotFound ??
            'Ta przeglądarka nie widzi portfela przez Mobile Wallet Adapter. Otwórz dappkę w Phantom lub Solflare.'
        );
      } else {
        const rejected = /reject|denied|cancel/i.test(msg);
        setError(
          rejected
            ? (t.dapp.connectRejectedHint ??
              'Odrzucono w portfelu. Kliknij ponownie i zatwierdź połączenie.')
            : msg
        );
      }
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }, [connect, connected, t.dapp.connectMwaNotFound, t.dapp.connectRejectedHint]);

  // Non-MWA (e.g. Phantom injected in wallet browser): connect after select.
  useEffect(() => {
    if (!wallet || connected || connecting || isMwaSelected) return;
    void runConnect();
  }, [wallet, connected, connecting, isMwaSelected, runConnect]);

  useEffect(() => {
    if (!isMwaSelected || connected) return;
    const resume = () => {
      if (document.visibilityState === 'visible') void runConnect();
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

    // Already inside Phantom/Solflare browser → normal adapter connect.
    if (inWalletBrowser) {
      if (!wallet) {
        setVisible(true);
        return;
      }
      void runConnect();
      return;
    }

    if (connecting || busy) {
      void runConnect();
      return;
    }

    // Android outside wallet browser: try MWA once, but keep browse fallbacks visible.
    if (isMwaSelected) {
      void runConnect();
      return;
    }
    if (mobileWallet) {
      select(SolanaMobileWalletAdapterWalletName);
      window.setTimeout(() => {
        void runConnect();
      }, 0);
      return;
    }

    if (!wallet) {
      setVisible(true);
      return;
    }
    void runConnect();
  }, [
    busy,
    connected,
    connecting,
    inWalletBrowser,
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
      : inWalletBrowser
        ? t.wallet.polaczPortfel
        : mobileWallet
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

      {showBrowseFallback && !connected && !inWalletBrowser ? (
        <div className="pierron-connect-browse-fallback">
          <p className="pierron-connect-wallet-mwa-hint">
            {t.dapp.connectBrowseHint ??
              'Najpewniejsza ścieżka na telefonie: otwórz tę stronę w przeglądarce wbudowanej w portfel.'}
          </p>
          <div className="pierron-connect-browse-row">
            <button
              type="button"
              className="pierron-connect-browse-btn"
              onClick={() => openCurrentPageInPhantom()}
            >
              {t.dapp.openInPhantom ?? 'Otwórz w Phantom'}
            </button>
            <button
              type="button"
              className="pierron-connect-browse-btn"
              onClick={() => openCurrentPageInSolflare()}
            >
              {t.dapp.openInSolflare ?? 'Otwórz w Solflare'}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}

      {mobileWallet && !connected && !showBrowseFallback ? (
        <p className="pierron-connect-wallet-mwa-hint">
          {t.dapp.connectMobileHint ??
            'Na Androidzie: Połącz portfel otworzy zainstalowaną aplikację portfela (Phantom / Solflare).'}
        </p>
      ) : null}
    </div>
  );
}
