'use client';

import { WalletReadyState } from '@solana/wallet-adapter-base';
import type { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

import {
  detectInjectedWalletBrowser,
  isAndroidUserAgent,
  openCurrentPageInPhantom,
  openCurrentPageInSolflare,
} from './openInMobileWalletBrowser';

/**
 * Desktop / injected: stock Phantom & Solflare adapters.
 * Android Loadable: browse handoff for Vanadium/GrapheneOS.
 * iOS Safari: prefer WalletConnect (createPierronWalletConnectAdapter) so the
 * session stays in Safari — do NOT force browse into the wallet WebView.
 */
export function createMobileBrowseWalletAdapters(network: WalletAdapterNetwork) {
  const solflare = new SolflareWalletAdapter({ network });
  const phantom = new PhantomWalletAdapter({ network });

  const wrapAndroidOnly = <T extends SolflareWalletAdapter | PhantomWalletAdapter>(
    adapter: T,
    openBrowse: () => void
  ): T => {
    const original = adapter.connect.bind(adapter);
    adapter.connect = async () => {
      if (
        typeof window !== 'undefined' &&
        isAndroidUserAgent() &&
        !detectInjectedWalletBrowser() &&
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
    wrapAndroidOnly(solflare, openCurrentPageInSolflare),
    wrapAndroidOnly(phantom, openCurrentPageInPhantom),
  ];
}

/** @deprecated Use createMobileBrowseWalletAdapters */
export const createAndroidAwareWalletAdapters = createMobileBrowseWalletAdapters;
