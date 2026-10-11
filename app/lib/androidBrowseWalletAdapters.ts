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
 * Android-only: outside wallet WebView, Loadable Solflare/Phantom connect is flaky
 * (Vanadium/GrapheneOS). Open the dapp inside the wallet browser instead.
 *
 * iOS Safari: do NOT wrap — official adapters already redirect via universal links
 * on user-initiated connect() (same one-tap idea as Android MWA).
 */
export function createMobileBrowseWalletAdapters(network: WalletAdapterNetwork) {
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

/** @deprecated Use createMobileBrowseWalletAdapters */
export const createAndroidAwareWalletAdapters = createMobileBrowseWalletAdapters;
