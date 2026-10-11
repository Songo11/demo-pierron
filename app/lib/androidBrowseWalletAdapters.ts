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
 * Order: Solflare first, then Phantom (matches primary mobile wallets).
 *
 * iOS Safari: https Universal Link browse only (never solflare:// / phantom:// —
 * those trigger “Open in …?” and WalletConnect’s solflare://wc?uri= is a no-op).
 * After handoff, MobileWalletResume connects the injected provider inside the wallet.
 *
 * Android Loadable: browse handoff for Vanadium/GrapheneOS.
 */
export function createMobileBrowseWalletAdapters(network: WalletAdapterNetwork) {
  const solflare = new SolflareWalletAdapter({ network });
  const phantom = new PhantomWalletAdapter({ network });

  const solflareOriginal = solflare.connect.bind(solflare);
  solflare.connect = async () => {
    if (typeof window === 'undefined') return solflareOriginal();

    if (detectInjectedWalletBrowser()) {
      return solflareOriginal();
    }

    if (isAndroidUserAgent() && solflare.readyState === WalletReadyState.Loadable) {
      openCurrentPageInSolflare();
      return;
    }

    if (isIosUserAgent()) {
      // Explicit https UL — same as stock adapter, plus resume flag for auto-connect.
      markWalletResumePending('Solflare');
      const url = encodeURIComponent(window.location.href.split('#')[0]!);
      const ref = encodeURIComponent(window.location.origin);
      window.location.href = `https://solflare.com/ul/v1/browse/${url}?ref=${ref}`;
      return;
    }

    return solflareOriginal();
  };

  const phantomOriginal = phantom.connect.bind(phantom);
  phantom.connect = async () => {
    if (typeof window === 'undefined') return phantomOriginal();

    if (detectInjectedWalletBrowser()) {
      return phantomOriginal();
    }

    if (isAndroidUserAgent() && phantom.readyState === WalletReadyState.Loadable) {
      openCurrentPageInPhantom();
      return;
    }

    if (isIosUserAgent() && phantom.readyState === WalletReadyState.Loadable) {
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
