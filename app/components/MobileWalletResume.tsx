'use client';

import { useEffect, useRef } from 'react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';

import {
  RESUME_WALLET_NAME_KEY,
  detectInjectedWalletBrowser,
} from '../lib/openInMobileWalletBrowser';

/**
 * After Solflare/MWA returns to the browser, finish connect only when we
 * explicitly marked a handoff (sessionStorage). Never auto-spam connect on load.
 */
export default function MobileWalletResume() {
  const { connected, connecting, connect, select } = useWallet();
  const busyRef = useRef(false);
  const triedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const resume = async () => {
      if (connected || connecting || busyRef.current || triedRef.current) return;

      let name: string | null = null;
      try {
        name = sessionStorage.getItem(RESUME_WALLET_NAME_KEY);
      } catch {
        /* ignore */
      }

      const injected = detectInjectedWalletBrowser();
      if (!name && injected) {
        name = injected === 'solflare' ? 'Solflare' : 'Phantom';
      }
      if (!name) return;

      triedRef.current = true;
      busyRef.current = true;
      try {
        select(name as WalletName);
        await new Promise((r) => window.setTimeout(r, 120));
        await connect();
        try {
          sessionStorage.removeItem(RESUME_WALLET_NAME_KEY);
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
