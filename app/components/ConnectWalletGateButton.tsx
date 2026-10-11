'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/** Custom-scheme browse — opens installed Phantom from a real <a> tap even when
 *  Safari has disabled Universal Links for phantom.com (common after visiting the site). */
function buildPhantomBrowseSchemeUrl(pageUrl: string, refUrl: string): string {
  const path = `ul/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(refUrl)}`;
  return `phantom://${path}`;
}

const PHANTOM_NAME = 'Phantom' as WalletName;
const SOLFLARE_NAME = 'Solflare' as WalletName;

function markIosPhantomHandoff(): void {
  clearWalletUserDisconnected();
  markWalletResumePending(PHANTOM_NAME);
  try {
    localStorage.setItem(IOS_WALLET_HANDOFF_KEY, 'phantom');
  } catch {
    /* ignore */
  }
}

/**
 * Start screen connect:
 * - Desktop: wallet modal → connect after select
 * - Android: one-tap Mobile Wallet Adapter
 * - iOS Safari: real <a href> to phantom.com Universal Link (required by Phantom;
 *   JS location.href / phantom.app often opens the website instead of the app)
 * - In-wallet browser: connect injected provider
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, publicKey, connect, select } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [iosBrowseHref, setIosBrowseHref] = useState<string | null>(null);
  const pendingConnectRef = useRef(false);
  const connectGenRef = useRef(0);

  // Build Phantom browse href on the client so Universal Link targets this exact page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (detectInjectedWalletBrowser()) {
      setIosBrowseHref(null);
      return;
    }
    if (!isIosUserAgent()) {
      setIosBrowseHref(null);
      return;
    }
    const page = window.location.href.split('#')[0]!;
    // Prefer custom scheme on the <a href>: Safari often opens https://phantom.com
    // as a website (UL disabled). Scheme + real click opens the installed app.
    setIosBrowseHref(buildPhantomBrowseSchemeUrl(page, window.location.origin));
  }, []);

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

  const onIosBrowseClick = useCallback(() => {
    // Sync with the native <a> navigation — do not preventDefault.
    markIosPhantomHandoff();
  }, []);

  const label = connected
    ? publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : t.wallet.portfelPodlaczony
    : busy || connecting
      ? t.dapp.connectHintConnecting
      : t.wallet.polaczPortfel;

  const btnClass = useMemo(
    () => 'wallet-adapter-button wallet-adapter-button-trigger pierron-connect-wallet-btn',
    []
  );

  // iOS Safari outside wallet: real anchor → Phantom Universal Link (phantom.com).
  // Docs: browse deeplinks must be clicked by the end user — not JS location.href.
  if (iosBrowseHref && !connected && !detectInjectedWalletBrowser()) {
    return (
      <div className="pierron-connect-wallet-wrap">
        <a
          href={iosBrowseHref}
          className={btnClass}
          onClick={onIosBrowseClick}
          rel="noopener"
        >
          {label}
        </a>
        {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="pierron-connect-wallet-wrap">
      <button
        type="button"
        className={btnClass}
        onClick={onPrimaryClick}
      >
        {label}
      </button>
      {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}
    </div>
  );
}
