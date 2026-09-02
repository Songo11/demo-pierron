'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

import { useTranslations } from '../context/LocaleContext';
import {
  detectInjectedWalletBrowser,
  isAndroidUserAgent,
  openCurrentPageInPhantom,
  openCurrentPageInSolflare,
} from '../lib/openInMobileWalletBrowser';

/**
 * Mobile (Vanadium/GrapheneOS): do NOT rely on MWA round-trip — it returns to the
 * browser still disconnected. Primary path = open this page inside Solflare/Phantom
 * browse, then auto-connect with the injected provider.
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, publicKey, connect, select } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [injected, setInjected] = useState(() => detectInjectedWalletBrowser());
  const autoTriedRef = useRef(false);

  const android = typeof navigator !== 'undefined' && isAndroidUserAgent();
  const inWalletBrowser = injected != null;

  useEffect(() => {
    if (connected) {
      setError(null);
      setBusy(false);
      autoTriedRef.current = false;
    }
  }, [connected]);

  // Providers can appear a moment after load inside Solflare/Phantom browser.
  useEffect(() => {
    if (!android && !inWalletBrowser) return;
    const id = window.setInterval(() => {
      const kind = detectInjectedWalletBrowser();
      if (kind) setInjected(kind);
    }, 400);
    return () => window.clearInterval(id);
  }, [android, inWalletBrowser]);

  const connectInjected = useCallback(async () => {
    const kind = detectInjectedWalletBrowser();
    if (!kind) {
      setError(
        t.dapp.connectNeedWalletBrowser ??
          'Otwórz tę stronę w Solflare lub Phantom (przyciski poniżej), potem połącz portfel.'
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const name = (kind === 'solflare' ? 'Solflare' : 'Phantom') as WalletName;
      select(name);
      // Let WalletProvider wire the adapter before connect().
      await new Promise((r) => window.setTimeout(r, 120));
      await connect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const rejected = /reject|denied|cancel/i.test(msg);
      setError(
        rejected
          ? (t.dapp.connectRejectedHint ??
            'Odrzucono w portfelu. Spróbuj ponownie i zatwierdź.')
          : msg
      );
    } finally {
      setBusy(false);
    }
  }, [connect, select, t.dapp.connectNeedWalletBrowser, t.dapp.connectRejectedHint]);

  // Inside wallet in-app browser: auto-connect so user lands in the dapp menu.
  useEffect(() => {
    if (!inWalletBrowser || connected || autoTriedRef.current) return;
    autoTriedRef.current = true;
    const timers = [200, 600, 1200, 2000].map((ms) =>
      window.setTimeout(() => {
        if (!connected) void connectInjected();
      }, ms)
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [inWalletBrowser, connected, connectInjected]);

  // After modal select of Phantom/Solflare (desktop or wallet browser).
  useEffect(() => {
    if (!wallet || connected || connecting || !inWalletBrowser) return;
    void connectInjected();
  }, [wallet, connected, connecting, inWalletBrowser, connectInjected]);

  const onPrimaryClick = useCallback(() => {
    setError(null);
    if (connected) {
      setVisible(true);
      return;
    }
    if (inWalletBrowser) {
      void connectInjected();
      return;
    }
    if (android) {
      // Vanadium: stay inside Solflare — do not use MWA handoff.
      openCurrentPageInSolflare();
      return;
    }
    setVisible(true);
  }, [android, connected, connectInjected, inWalletBrowser, setVisible]);

  const label = connected
    ? publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : t.wallet.portfelPodlaczony
    : busy || connecting
      ? t.dapp.connectHintConnecting
      : inWalletBrowser
        ? t.wallet.polaczPortfel
        : android
          ? (t.dapp.openInSolflare ?? 'Otwórz w Solflare')
          : t.wallet.polaczPortfel;

  return (
    <div className="pierron-connect-wallet-wrap">
      <button
        type="button"
        className="wallet-adapter-button wallet-adapter-button-trigger pierron-connect-wallet-btn"
        onClick={onPrimaryClick}
      >
        {label}
      </button>

      {android && !inWalletBrowser && !connected ? (
        <div className="pierron-connect-browse-fallback">
          <p className="pierron-connect-wallet-mwa-hint">
            {t.dapp.connectAndroidStayHint ??
              'Na telefonie (Vanadium/GrapheneOS): otwórz dappkę w Solflare lub Phantom i ZOSTAŃ w tej aplikacji — nie wracaj do przeglądarki. Potem portfel połączy się sam.'}
          </p>
          <div className="pierron-connect-browse-row">
            <button
              type="button"
              className="pierron-connect-browse-btn"
              onClick={() => openCurrentPageInSolflare()}
            >
              {t.dapp.openInSolflare ?? 'Otwórz w Solflare'}
            </button>
            <button
              type="button"
              className="pierron-connect-browse-btn"
              onClick={() => openCurrentPageInPhantom()}
            >
              {t.dapp.openInPhantom ?? 'Otwórz w Phantom'}
            </button>
          </div>
        </div>
      ) : null}

      {inWalletBrowser && !connected ? (
        <p className="pierron-connect-wallet-mwa-hint">
          {t.dapp.connectInWalletBrowserHint ??
            'Jesteś w przeglądarce portfela — zatwierdź połączenie, gdy Solflare/Phantom o to poprosi.'}
        </p>
      ) : null}

      {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}
    </div>
  );
}
