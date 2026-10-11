'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { SolanaMobileWalletAdapterWalletName } from '@solana-mobile/wallet-adapter-mobile';

import { useTranslations } from '../context/LocaleContext';
import {
  IOS_WALLET_HANDOFF_KEY,
  RESUME_RETRY_EVENT,
  clearWalletUserDisconnected,
  connectInjectedProviderDirect,
  detectInjectedWalletBrowser,
  isAndroidUserAgent,
  isIosUserAgent,
  isMwaWalletNotFoundMessage,
  markWalletResumePending,
  openCurrentPageInSolflare,
} from '../lib/openInMobileWalletBrowser';

const PHANTOM_NAME = 'Phantom' as WalletName;
const SOLFLARE_NAME = 'Solflare' as WalletName;

/**
 * iOS Safari: redirect MUST stay synchronous with the tap.
 * Any await/setTimeout/setState before navigation kills the user-gesture —
 * Safari then opens phantom.app as a website instead of the installed app.
 *
 * Prefer phantom:// (custom scheme) — JS-triggered https Universal Links are
 * unreliable on iOS Safari. Fall back to https UL only if still visible.
 */
function redirectIosSafariToPhantomSync(): void {
  clearWalletUserDisconnected();
  markWalletResumePending(PHANTOM_NAME);
  try {
    localStorage.setItem(IOS_WALLET_HANDOFF_KEY, 'phantom');
  } catch {
    /* ignore */
  }
  const page = window.location.href.split('#')[0]!;
  const url = encodeURIComponent(page);
  const ref = encodeURIComponent(window.location.origin);
  const path = `ul/browse/${url}?ref=${ref}`;
  // Custom scheme first — opens installed Phantom from the tap gesture.
  window.location.href = `phantom://${path}`;
  // If Phantom is missing, Safari stays here; try Universal Link once (still ok if app caught scheme).
  window.setTimeout(() => {
    if (document.visibilityState !== 'visible') return;
    window.location.href = `https://phantom.app/${path}`;
  }, 700);
}

/**
 * Start screen connect:
 * - Desktop: wallet modal → connect after select
 * - Android: one-tap Mobile Wallet Adapter
 * - iOS Safari: one-tap sync Phantom universal link (same idea as MWA)
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
    try {
      localStorage.removeItem(IOS_WALLET_HANDOFF_KEY);
    } catch {
      /* ignore */
    }
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
        if (/abort|navigat/i.test(msg) && !rejected) return;
        if (isMwaWalletNotFoundMessage(msg) && isAndroidUserAgent()) {
          openCurrentPageInSolflare();
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
    [connect, wallet, t.dapp.connectRejectedHint]
  );

  useEffect(() => {
    if (!pendingConnectRef.current || !wallet || connected) return;
    pendingConnectRef.current = false;
    void runConnect('modal-select');
  }, [wallet, connected, runConnect]);

  const onPrimaryClick = useCallback(() => {
    // iOS Safari: redirect BEFORE any setState — React state updates can break
    // the user-gesture chain and leave the user on phantom.app in Safari.
    if (!detectInjectedWalletBrowser() && isIosUserAgent()) {
      redirectIosSafariToPhantomSync();
      return;
    }

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
          const name = injected === 'solflare' ? SOLFLARE_NAME : PHANTOM_NAME;
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
  }, [connect, select, setVisible]);

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
