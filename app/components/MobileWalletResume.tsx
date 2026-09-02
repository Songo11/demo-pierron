'use client';

import { useEffect, useRef } from 'react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';

import {
  RESUME_WALLET_NAME_KEY,
  detectInjectedWalletBrowser,
  isAndroidUserAgent,
} from '../lib/openInMobileWalletBrowser';

/**
 * Invisible: after Solflare/MWA returns to the browser, re-select + connect
 * so the gate unlocks without extra buttons.
 */
export default function MobileWalletResume() {
  const { connected, connecting, wallet, connect, select } = useWallet();
  const busyRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const resume = async () => {
      if (connected || connecting || busyRef.current) return;
      if (!isAndroidUserAgent() && !detectInjectedWalletBrowser()) return;

      busyRef.current = true;
      try {
        const injected = detectInjectedWalletBrowser();
        let name =
          (wallet?.adapter.name as string | undefined) ||
          sessionStorage.getItem(RESUME_WALLET_NAME_KEY);

        if (!name && injected) {
          name = injected === 'solflare' ? 'Solflare' : 'Phantom';
        }
        if (!name) {
          try {
            const stored = localStorage.getItem('walletName');
            if (stored) name = JSON.parse(stored) as string;
          } catch {
            /* ignore */
          }
        }
        // Only resume an existing selection / handoff — never start a fresh MWA prompt.
        if (!name) return;

        select(name as WalletName);
        await new Promise((r) => window.setTimeout(r, 120));
        await connect();
        sessionStorage.removeItem(RESUME_WALLET_NAME_KEY);
      } catch {
        /* user can tap Połącz again */
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
    const timers = [300, 800, 1600, 2800].map((ms) => window.setTimeout(onShow, ms));

    return () => {
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisibility);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [connected, connecting, connect, select, wallet]);

  return null;
}
