'use client';

import { useEffect, useRef } from 'react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { SolanaMobileWalletAdapterWalletName } from '@solana-mobile/wallet-adapter-mobile';

import {
  RESUME_WALLET_NAME_KEY,
  detectInjectedWalletBrowser,
  isAndroidUserAgent,
} from '../lib/openInMobileWalletBrowser';

/**
 * After Solflare/MWA returns to the browser (or page restores from bfcache),
 * wallet-adapter often has authorization cached but `connected` is still false
 * when autoConnect was off or walletName was cleared on unload.
 * Re-select + connect on pageshow / visibility.
 */
export default function MobileWalletResume() {
  const { connected, connecting, wallet, connect, select } = useWallet();
  const busyRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isAndroidUserAgent() && !detectInjectedWalletBrowser()) return;

    const resume = async () => {
      if (connected || connecting || busyRef.current) return;
      busyRef.current = true;
      try {
        const injected = detectInjectedWalletBrowser();
        let name =
          (wallet?.adapter.name as string | undefined) ||
          (typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem(RESUME_WALLET_NAME_KEY)
            : null);

        if (!name && injected) {
          name = injected === 'solflare' ? 'Solflare' : 'Phantom';
        }
        // MWA: WalletProvider stores this name after a prior mobile connect attempt.
        if (!name) {
          try {
            const stored = localStorage.getItem('walletName');
            if (stored) name = JSON.parse(stored) as string;
          } catch {
            /* ignore */
          }
        }
        if (!name && isAndroidUserAgent()) {
          name = SolanaMobileWalletAdapterWalletName;
        }
        if (!name) return;

        select(name as WalletName);
        await new Promise((r) => window.setTimeout(r, 150));
        await connect();
        try {
          sessionStorage.removeItem(RESUME_WALLET_NAME_KEY);
        } catch {
          /* ignore */
        }
      } catch {
        // Leave gate visible; user can tap connect again.
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
    // First paint after redirect back from wallet.
    const t1 = window.setTimeout(onShow, 400);
    const t2 = window.setTimeout(onShow, 1200);

    return () => {
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [connected, connecting, connect, select, wallet]);

  return null;
}
