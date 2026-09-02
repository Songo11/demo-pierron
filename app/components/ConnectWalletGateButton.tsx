'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { SolanaMobileWalletAdapterWalletName } from '@solana-mobile/wallet-adapter-mobile';

import { useTranslations } from '../context/LocaleContext';
import {
  RESUME_RETRY_EVENT,
  clearWalletUserDisconnected,
  connectInjectedProviderDirect,
  detectInjectedWalletBrowser,
  isAndroidUserAgent,
  isMwaWalletNotFoundMessage,
  markWalletResumePending,
  openCurrentPageInSolflare,
} from '../lib/openInMobileWalletBrowser';

/**
 * Start screen connect:
 * - Desktop: wallet modal → connect after select
 * - Android: Mobile Wallet Adapter (opens Solflare/Phantom) in one tap
 * - In-wallet browser: connect injected provider
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, publicKey, connect, select } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingConnectRef = useRef(false);
  const connectGenRef = useRef(0);

  useEffect(() => {
    if (!connected) return;
    setError(null);
    setBusy(false);
    pendingConnectRef.current = false;
  }, [connected]);

  const runConnect = useCallback(
    async (source: string) => {
      const gen = ++connectGenRef.current;
      setBusy(true);
      setError(null);
      try {
        if (wallet?.adapter.name) {
          markWalletResumePending(wallet.adapter.name);
        }
        await connect();
      } catch (e) {
        if (gen !== connectGenRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        const rejected = /reject|denied|cancel/i.test(msg);
        // Keep resume flag for app-switch; still show real wallet-not-found errors.
        if (/abort|navigat/i.test(msg) && !rejected) return;
        if (isMwaWalletNotFoundMessage(msg) && isAndroidUserAgent()) {
          openCurrentPageInSolflare();
          setError(
            t.dapp.connectAndroidStayHint ??
              'Brak MWA — otwieram dappkę w Solflare. Zostań w Solflare i zatwierdź połączenie.'
          );
          return;
        }
        setError(
          rejected
            ? (t.dapp.connectRejectedHint ??
              'Odrzucono w portfelu. Spróbuj ponownie i zatwierdź.')
            : msg || `Connect failed (${source})`
        );
      } finally {
        if (gen === connectGenRef.current) setBusy(false);
      }
    },
    [connect, wallet, t.dapp.connectAndroidStayHint, t.dapp.connectRejectedHint]
  );

  // After modal select — do NOT depend on `connecting` (that cancels in-flight connect).
  useEffect(() => {
    if (!pendingConnectRef.current || !wallet || connected) return;
    pendingConnectRef.current = false;
    void runConnect('modal-select');
  }, [wallet, connected, runConnect]);

  const onPrimaryClick = useCallback(() => {
    setError(null);
    clearWalletUserDisconnected();
    try {
      window.dispatchEvent(new Event(RESUME_RETRY_EVENT));
    } catch {
      /* ignore */
    }

    const injected = detectInjectedWalletBrowser();
    if (injected) {
      void (async () => {
        setBusy(true);
        try {
          await connectInjectedProviderDirect(injected);
          const name = (injected === 'solflare' ? 'Solflare' : 'Phantom') as WalletName;
          markWalletResumePending(name);
          select(name);
          await new Promise((r) => window.setTimeout(r, 100));
          await connect();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
        } finally {
          setBusy(false);
        }
      })();
      return;
    }

    if (isAndroidUserAgent()) {
      // One tap: Mobile Wallet Adapter → installed wallet (Solflare/Phantom).
      void (async () => {
        setBusy(true);
        setError(null);
        try {
          markWalletResumePending(SolanaMobileWalletAdapterWalletName);
          select(SolanaMobileWalletAdapterWalletName);
          await new Promise((r) => window.setTimeout(r, 120));
          await connect();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (isMwaWalletNotFoundMessage(msg)) {
            openCurrentPageInSolflare();
            setError(
              t.dapp.connectAndroidStayHint ??
                'Otwieram w Solflare — zostań w aplikacji portfela i zatwierdź.'
            );
          } else if (!/abort|navigat/i.test(msg)) {
            setError(msg);
          }
        } finally {
          setBusy(false);
        }
      })();
      return;
    }

    pendingConnectRef.current = true;
    setVisible(true);
  }, [connect, select, setVisible, t.dapp.connectAndroidStayHint]);

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
        onClick={onPrimaryClick}
      >
        {label}
      </button>
      {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}
    </div>
  );
}
