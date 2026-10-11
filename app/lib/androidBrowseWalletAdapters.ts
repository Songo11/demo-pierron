'use client';

import { WalletReadyState } from '@solana/wallet-adapter-base';
import type { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
// Direct packages — never import @solana/wallet-adapter-wallets (barrel pulls Torus → build break).
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

import {
  detectInjectedWalletBrowser,
  isAndroidUserAgent,
  isIosUserAgent,
  markWalletResumePending,
  openCurrentPageInPhantom,
  openCurrentPageInSolflare,
} from './openInMobileWalletBrowser';

/**
 * Phantom / Solflare adapters:
 * - iOS Safari: use https Universal Links only (never solflare:// / phantom:// —
 *   custom schemes trigger Safari’s “Open in Solflare?” alert). Official Solflare
 *   adapter already uses https://solflare.com/ul/v1/browse; Phantom is patched to
 *   phantom.com (docs) instead of phantom.app.
 * - Android Loadable: browse handoff for Vanadium/GrapheneOS.
 */
export function createMobileBrowseWalletAdapters(network: WalletAdapterNetwork) {
  const solflare = new SolflareWalletAdapter({ network });
  const phantom = new PhantomWalletAdapter({ network });

  const solflareOriginal = solflare.connect.bind(solflare);
  solflare.connect = async () => {
    if (
      typeof window !== 'undefined' &&
      isAndroidUserAgent() &&
      !detectInjectedWalletBrowser() &&
      solflare.readyState === WalletReadyState.Loadable
    ) {
      openCurrentPageInSolflare();
      return;
    }
    // iOS: stock adapter → https://solflare.com/ul/v1/browse (Universal Link, no scheme prompt)
    return solflareOriginal();
  };

  const phantomOriginal = phantom.connect.bind(phantom);
  phantom.connect = async () => {
    if (typeof window === 'undefined') return phantomOriginal();

    if (
      isAndroidUserAgent() &&
      !detectInjectedWalletBrowser() &&
      phantom.readyState === WalletReadyState.Loadable
    ) {
      openCurrentPageInPhantom();
      return;
    }

    // iOS Safari Loadable: https UL on phantom.com (not phantom://, not phantom.app)
    if (
      isIosUserAgent() &&
      !detectInjectedWalletBrowser() &&
      phantom.readyState === WalletReadyState.Loadable
    ) {
      markWalletResumePending('Phantom');
      const url = encodeURIComponent(window.location.href.split('#')[0]!);
      const ref = encodeURIComponent(window.location.origin);
      window.location.href = `https://phantom.com/ul/browse/${url}?ref=${ref}`;
      return;
    }

    return phantomOriginal();
  };

  return [solflare, phantom];
}

/** @deprecated Use createMobileBrowseWalletAdapters */
export const createAndroidAwareWalletAdapters = createMobileBrowseWalletAdapters;
