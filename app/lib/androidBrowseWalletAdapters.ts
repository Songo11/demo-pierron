'use client';

import { WalletReadyState } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import type { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

import {
  isAndroidUserAgent,
  openCurrentPageInPhantom,
  openCurrentPageInSolflare,
} from './openInMobileWalletBrowser';

/**
 * On Android (outside wallet WebView), Solflare/Phantom adapters are Loadable and
 * try iframe/deeplink connect that returns to Vanadium still disconnected.
 * Mirror iOS behavior: redirect into the wallet in-app browser instead.
 */
export function createAndroidAwareWalletAdapters(network: WalletAdapterNetwork) {
  const solflare = new SolflareWalletAdapter({ network });
  const phantom = new PhantomWalletAdapter({ network });

  const wrapBrowseOnAndroid = <T extends SolflareWalletAdapter | PhantomWalletAdapter>(
    adapter: T,
    openBrowse: () => void
  ): T => {
    const original = adapter.connect.bind(adapter);
    adapter.connect = async () => {
      if (
        typeof window !== 'undefined' &&
        isAndroidUserAgent() &&
        adapter.readyState === WalletReadyState.Loadable
      ) {
        openBrowse();
        // Stay pending — real connect happens after page loads inside the wallet browser.
        return;
      }
      return original();
    };
    return adapter;
  };

  return [
    wrapBrowseOnAndroid(solflare, openCurrentPageInSolflare),
    wrapBrowseOnAndroid(phantom, openCurrentPageInPhantom),
  ];
}
