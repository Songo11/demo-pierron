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
 *
 * Inside Phantom after iOS Safari handoff the provider often injects late —
 * poll for several seconds instead of a single attempt.
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
      // Safari sessionStorage is NOT visible inside Phantom WebView.
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
        await new Promise((r) => window.setTimeout(r, 150));
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

    // Provider injection inside Phantom can lag — retry over ~6s.
    const delays = [200, 600, 1200, 2200, 3500, 5500];
    const timers = delays.map((ms) => window.setTimeout(onShow, ms));
    const poll = window.setInterval(() => {
      if (connected || triedRef.current) return;
      if (detectInjectedWalletBrowser()) onShow();
    }, 400);

    return () => {
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisibility);
      timers.forEach((id) => window.clearTimeout(id));
      window.clearInterval(poll);
    };
  }, [connected, connecting, connect, select]);

  return null;
}
