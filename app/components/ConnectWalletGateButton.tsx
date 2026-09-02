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

const MWA_PENDING_KEY = 'pierron_mwa_connect_pending';

function markMwaPending(): void {
  try {
    sessionStorage.setItem(MWA_PENDING_KEY, '1');
  } catch {
    // ignore
  }
}

function clearMwaPending(): void {
  try {
    sessionStorage.removeItem(MWA_PENDING_KEY);
  } catch {
    // ignore
  }
}

function isMwaPending(): boolean {
  try {
    return sessionStorage.getItem(MWA_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Gate CTA with Android support.
 *
 * After Solflare/Phantom MWA authorize, the browser often resumes with a hung
 * connect() promise. We must reset in-flight state and call autoConnect() to
 * pick up the cached authorization and unlock the gate.
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, wallets, publicKey, connect, select } =
    useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBrowseFallback, setShowBrowseFallback] = useState(false);
  const [showResumeCta, setShowResumeCta] = useState(false);
  const inFlightRef = useRef(false);

  const android = typeof navigator !== 'undefined' && isAndroidUserAgent();
  const mobileWallet = wallets.find(
    (w) => w.adapter.name === SolanaMobileWalletAdapterWalletName
  );
  const isMwaSelected =
    wallet?.adapter.name === SolanaMobileWalletAdapterWalletName;
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
      setShowResumeCta(false);
      inFlightRef.current = false;
      clearMwaPending();
    }
  }, [connected]);

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
        clearMwaPending();
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
      if (isMwaSelected) setShowResumeCta(true);
    };
    const onMwaMissing = () => {
      setShowBrowseFallback(true);
      setError(
        t.dapp.connectMwaNotFound ??
          'Ta przeglądarka nie widzi portfela przez Mobile Wallet Adapter. Otwórz dappkę w Phantom lub Solflare.'
      );
      setBusy(false);
      inFlightRef.current = false;
      clearMwaPending();
    };
    window.addEventListener('pierron-wallet-error', onWalletErr);
    window.addEventListener('pierron-mwa-not-found', onMwaMissing);
    return () => {
      window.removeEventListener('pierron-wallet-error', onWalletErr);
      window.removeEventListener('pierron-mwa-not-found', onMwaMissing);
    };
  }, [isMwaSelected, t.dapp.connectMwaNotFound, t.dapp.connectRejectedHint]);

  /** Complete MWA after returning from Solflare/Phantom (use autoConnect for cached auth). */
  const resumeMwaSession = useCallback(async () => {
    if (connected) return;
    // Always clear hung first attempt — otherwise resume is a no-op.
    inFlightRef.current = false;
    setBusy(true);
    setError(null);
    setShowResumeCta(true);

    if (!isMwaSelected && mobileWallet) {
      select(SolanaMobileWalletAdapterWalletName);
      await new Promise((r) => window.setTimeout(r, 50));
    }

    try {
      const adapter = wallet?.adapter;
      if (
        adapter &&
        adapter.name === SolanaMobileWalletAdapterWalletName &&
        typeof (adapter as { autoConnect?: () => Promise<void> }).autoConnect ===
          'function'
      ) {
        await (adapter as { autoConnect: () => Promise<void> }).autoConnect();
      } else {
        await connect();
      }
      clearMwaPending();
    } catch (e) {
      // Second chance: plain connect() after autoConnect failed.
      try {
        inFlightRef.current = false;
        await connect();
        clearMwaPending();
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        if (isMwaWalletNotFoundMessage(msg)) {
          setShowBrowseFallback(true);
          setError(
            t.dapp.connectMwaNotFound ??
              'Ta przeglądarka nie widzi portfela przez Mobile Wallet Adapter. Otwórz dappkę w Phantom lub Solflare.'
          );
          clearMwaPending();
        } else {
          setError(
            t.dapp.connectResumeHint ??
              'Wróciłeś z portfela — kliknij „Dokończ połączenie”, żeby wejść do dappki.'
          );
        }
      }
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }, [
    connect,
    connected,
    isMwaSelected,
    mobileWallet,
    select,
    t.dapp.connectMwaNotFound,
    t.dapp.connectResumeHint,
    wallet?.adapter,
  ]);

  const runConnect = useCallback(async () => {
    if (connected) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    if (isMwaSelected || mobileWallet) markMwaPending();
    try {
      await connect();
      clearMwaPending();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isMwaWalletNotFoundMessage(msg)) {
        setShowBrowseFallback(true);
        setError(
          t.dapp.connectMwaNotFound ??
            'Ta przeglądarka nie widzi portfela przez Mobile Wallet Adapter. Otwórz dappkę w Phantom lub Solflare.'
        );
        clearMwaPending();
      } else {
        const rejected = /reject|denied|cancel/i.test(msg);
        setError(
          rejected
            ? (t.dapp.connectRejectedHint ??
              'Odrzucono w portfelu. Kliknij ponownie i zatwierdź połączenie.')
            : msg
        );
        if (isMwaSelected || isMwaPending()) setShowResumeCta(true);
      }
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }, [
    connect,
    connected,
    isMwaSelected,
    mobileWallet,
    t.dapp.connectMwaNotFound,
    t.dapp.connectRejectedHint,
  ]);

  // Non-MWA (injected provider): connect after select.
  useEffect(() => {
    if (!wallet || connected || connecting || isMwaSelected) return;
    void runConnect();
  }, [wallet, connected, connecting, isMwaSelected, runConnect]);

  // Returning from Solflare/Phantom — finish authorization.
  useEffect(() => {
    if (connected || inWalletBrowser) return;
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (isMwaSelected || isMwaPending()) {
        void resumeMwaSession();
      }
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    // If we already returned and page is visible with pending flag.
    if (isMwaPending() || isMwaSelected) {
      const t = window.setTimeout(onResume, 300);
      return () => {
        window.clearTimeout(t);
        document.removeEventListener('visibilitychange', onResume);
        window.removeEventListener('focus', onResume);
        window.removeEventListener('pageshow', onResume);
      };
    }
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [connected, inWalletBrowser, isMwaSelected, resumeMwaSession]);

  const onClick = useCallback(() => {
    setError(null);
    if (connected) {
      setVisible(true);
      return;
    }

    if (showResumeCta || isMwaPending()) {
      void resumeMwaSession();
      return;
    }

    if (inWalletBrowser) {
      if (!wallet) {
        setVisible(true);
        return;
      }
      void runConnect();
      return;
    }

    if (connecting || busy) {
      void resumeMwaSession();
      return;
    }

    if (isMwaSelected) {
      markMwaPending();
      void runConnect();
      return;
    }
    if (mobileWallet) {
      markMwaPending();
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
    resumeMwaSession,
    runConnect,
    select,
    setVisible,
    showResumeCta,
    wallet,
  ]);

  const label = connected
    ? publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : t.wallet.portfelPodlaczony
    : busy || connecting
      ? t.dapp.connectHintConnecting
      : showResumeCta || isMwaPending()
        ? (t.dapp.connectResumeCta ?? 'Dokończ połączenie')
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

      {(showResumeCta || isMwaPending()) && !connected ? (
        <p className="pierron-connect-wallet-mwa-hint">
          {t.dapp.connectResumeHint ??
            'Jeśli wróciłeś z Solflare/Phantom — kliknij „Dokończ połączenie”, żeby wejść do menu.'}
        </p>
      ) : null}
    </div>
  );
}
