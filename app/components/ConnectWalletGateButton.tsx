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

const PHANTOM_NAME = 'Phantom' as WalletName;
const SOLFLARE_NAME = 'Solflare' as WalletName;

/** Real <a href> custom schemes — Safari user-gesture opens the installed app. */
function buildPhantomBrowseSchemeUrl(pageUrl: string, refUrl: string): string {
  const path = `ul/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(refUrl)}`;
  return `phantom://${path}`;
}

function buildSolflareBrowseSchemeUrl(pageUrl: string, refUrl: string): string {
  const path = `ul/v1/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(refUrl)}`;
  return `solflare://${path}`;
}

function markIosWalletHandoff(kind: 'phantom' | 'solflare'): void {
  clearWalletUserDisconnected();
  markWalletResumePending(kind === 'solflare' ? SOLFLARE_NAME : PHANTOM_NAME);
  try {
    localStorage.setItem(IOS_WALLET_HANDOFF_KEY, kind);
  } catch {
    /* ignore */
  }
}

/**
 * Start screen connect:
 * - Desktop: wallet modal → connect after select
 * - Android: one-tap Mobile Wallet Adapter
 * - iOS Safari: choose Phantom or Solflare via real <a> browse deeplink
 * - In-wallet browser: connect injected provider
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, publicKey, connect, select } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [iosLinks, setIosLinks] = useState<{ phantom: string; solflare: string } | null>(
    null
  );
  const pendingConnectRef = useRef(false);
  const connectGenRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (detectInjectedWalletBrowser()) {
      setIosLinks(null);
      return;
    }
    if (!isIosUserAgent()) {
      setIosLinks(null);
      return;
    }
    const page = window.location.href.split('#')[0]!;
    const origin = window.location.origin;
    setIosLinks({
      phantom: buildPhantomBrowseSchemeUrl(page, origin),
      solflare: buildSolflareBrowseSchemeUrl(page, origin),
    });
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

  const connectedLabel = connected
    ? publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : t.wallet.portfelPodlaczony
    : null;

  const btnClass = useMemo(
    () => 'wallet-adapter-button wallet-adapter-button-trigger pierron-connect-wallet-btn',
    []
  );

  // iOS Safari: choose Phantom or Solflare — real <a> taps open the wallet app.
  if (iosLinks && !connected && !detectInjectedWalletBrowser()) {
    const phantomLabel = t.dapp.openInPhantom ?? 'Phantom';
    const solflareLabel = t.dapp.openInSolflare ?? 'Solflare';
    return (
      <div className="pierron-connect-wallet-wrap">
        <div className="pierron-connect-browse-row">
          <a
            href={iosLinks.phantom}
            className={`${btnClass} pierron-connect-browse-btn`}
            onClick={() => markIosWalletHandoff('phantom')}
            rel="noopener"
          >
            {phantomLabel}
          </a>
          <a
            href={iosLinks.solflare}
            className={`${btnClass} pierron-connect-browse-btn`}
            onClick={() => markIosWalletHandoff('solflare')}
            rel="noopener"
          >
            {solflareLabel}
          </a>
        </div>
        {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}
      </div>
    );
  }

  const label =
    connectedLabel ??
    (busy || connecting ? t.dapp.connectHintConnecting : t.wallet.polaczPortfel);

  return (
    <div className="pierron-connect-wallet-wrap">
      <button type="button" className={btnClass} onClick={onPrimaryClick}>
        {label}
      </button>
      {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}
    </div>
  );
}
