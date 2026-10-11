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
  openCurrentPageInPhantom,
  openCurrentPageInSolflare,
  redirectIosSafariToWalletBrowse,
} from './openInMobileWalletBrowser';

/**
 * Phantom / Solflare adapters with mobile browse handoff:
 * - iOS Safari (outside wallet WebView): after user picks wallet in the modal,
 *   connect() redirects into the wallet in-app browser (browse deeplink).
 * - Android Loadable: same idea for Vanadium/GrapheneOS flakiness.
 */
export function createMobileBrowseWalletAdapters(network: WalletAdapterNetwork) {
  const solflare = new SolflareWalletAdapter({ network });
  const phantom = new PhantomWalletAdapter({ network });

  const wrapMobileBrowse = <T extends SolflareWalletAdapter | PhantomWalletAdapter>(
    adapter: T,
    kind: 'phantom' | 'solflare',
    openAndroidBrowse: () => void
  ): T => {
    const original = adapter.connect.bind(adapter);
    adapter.connect = async () => {
      if (typeof window === 'undefined') return original();

      // Already inside Phantom/Solflare WebView — use injected provider path.
      if (detectInjectedWalletBrowser()) {
        return original();
      }

      // iOS Safari: user just picked this wallet in the standard modal.
      if (isIosUserAgent()) {
        redirectIosSafariToWalletBrowse(kind);
        return;
      }

      if (isAndroidUserAgent() && adapter.readyState === WalletReadyState.Loadable) {
        openAndroidBrowse();
        return;
      }

      return original();
    };
    return adapter;
  };

  return [
    wrapMobileBrowse(solflare, 'solflare', openCurrentPageInSolflare),
    wrapMobileBrowse(phantom, 'phantom', openCurrentPageInPhantom),
  ];
}

/** @deprecated Use createMobileBrowseWalletAdapters */
export const createAndroidAwareWalletAdapters = createMobileBrowseWalletAdapters;
