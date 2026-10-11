'use client';

import { useEffect, useRef } from 'react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';

import {
  IOS_WALLET_HANDOFF_KEY,
  RESUME_RETRY_EVENT,
  RESUME_WALLET_NAME_KEY,
  connectInjectedProviderDirect,
  detectInjectedWalletBrowser,
  isWalletUserDisconnected,
} from '../lib/openInMobileWalletBrowser';

/**
 * After MWA / Phantom / Solflare browse handoff, finish connect when a flag is
 * set (or when we land inside an injected wallet WebView). Never reconnect after
 * an explicit user disconnect.
 */
export default function MobileWalletResume() {
  const { connected, connecting, connect, select } = useWallet();
  const busyRef = useRef(false);
  const triedRef = useRef(false);

  useEffect(() => {
    const onRetry = () => {
      triedRef.current = false;
    };
    window.addEventListener(RESUME_RETRY_EVENT, onRetry);
    return () => window.removeEventListener(RESUME_RETRY_EVENT, onRetry);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const resume = async () => {
      if (connected || connecting || busyRef.current || triedRef.current) return;
      if (isWalletUserDisconnected()) return;

      const injected = detectInjectedWalletBrowser();
      let name: string | null = null;
      try {
        name = sessionStorage.getItem(RESUME_WALLET_NAME_KEY);
      } catch {
        /* ignore */
      }
      // Inside Phantom/Solflare after iOS Safari universal-link handoff.
      // sessionStorage from Safari is NOT visible here — use injected provider.
      if (!name && injected) {
        name = injected === 'solflare' ? 'Solflare' : 'Phantom';
      }
      if (!name) return;

      triedRef.current = true;
      busyRef.current = true;
      try {
        if (injected) {
          await connectInjectedProviderDirect(injected);
        }
        select(name as WalletName);
        await new Promise((r) => window.setTimeout(r, 120));
        await connect();
        try {
          sessionStorage.removeItem(RESUME_WALLET_NAME_KEY);
          localStorage.removeItem(IOS_WALLET_HANDOFF_KEY);
        } catch {
          /* ignore */
        }
      } catch {
        triedRef.current = false;
      } finally {
        busyRef.current = false;
      }
    };

    const onShow = () => {
      void resume();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onShow();
    };

    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisibility);
    const t1 = window.setTimeout(onShow, 400);
    const t2 = window.setTimeout(onShow, 1500);

    return () => {
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [connected, connecting, connect, select]);

  return null;
}
