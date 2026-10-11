// app/layout.tsx
'use client';

import './lib/bufferBigIntPolyfill';

import { WalletAdapterNetwork, type Adapter, type WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  SolanaMobileWalletAdapter,
} from '@solana-mobile/wallet-adapter-mobile';
import { useCallback, useMemo } from 'react';

import '@solana/wallet-adapter-react-ui/styles.css';

import { fetchWithRpcRetry } from '../shared/solana/resilientConnection.ts';
import { createMobileBrowseWalletAdapters } from './lib/androidBrowseWalletAdapters';
import { resolveBrowserSolanaRpcEndpoint } from './lib/browserSolanaRpc';
import {
  RESUME_WALLET_NAME_KEY,
  isAndroidUserAgent,
  isWalletUserDisconnected,
} from './lib/openInMobileWalletBrowser';

import ServerLayout from './layout-server';

import MobileWalletResume from './components/MobileWalletResume';
import WalletDisconnectGuard from './components/WalletDisconnectGuard';
import { LayoutModeProvider } from './context/LayoutModeContext';
import { LocaleProvider } from './context/LocaleContext';
import { ThemeProvider } from './context/ThemeContext';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Browser: same-origin /api/solana-rpc?cluster=devnet (avoids Worker CORS; cluster hint for wallets).
  // SSR fallback: direct Worker URL.
  const endpoint = useMemo(() => resolveBrowserSolanaRpcEndpoint(), []);

  const connectionConfig = useMemo(
    () => ({
      commitment: 'confirmed' as const,
      fetch: fetchWithRpcRetry as typeof fetch,
      disableRetryOnRateLimit: true,
      wsEndpoint: 'wss://api.devnet.solana.com',
    }),
    []
  );

  // AutoConnect only for pending mobile handoff — never because an extension is injected
  // (that instantly re-connects after the user disconnects).
  const shouldAutoConnect = useCallback(async (_adapter: Adapter) => {
    if (typeof window === 'undefined') return false;
    if (isWalletUserDisconnected()) return false;
    try {
      return Boolean(sessionStorage.getItem(RESUME_WALLET_NAME_KEY));
    } catch {
      return false;
    }
  }, []);

  const wallets = useMemo(() => {
    // Solflare first — primary mobile wallet. On iOS Safari, adapter opens the dapp
    // inside Solflare via https Universal Link (WalletConnect cannot deep-link Solflare
    // on iOS: solflare://wc?uri=… is unsupported by the Solflare app).
    const browseAdapters = createMobileBrowseWalletAdapters(WalletAdapterNetwork.Devnet);

    // MWA is Android-only.
    if (typeof window === 'undefined' || !isAndroidUserAgent()) {
      return browseAdapters;
    }

    const mobile = new SolanaMobileWalletAdapter({
      addressSelector: createDefaultAddressSelector(),
      appIdentity: {
        name: 'Pierron',
        uri: `${window.location.protocol}//${window.location.host}`,
      },
      authorizationResultCache: createDefaultAuthorizationResultCache(),
      cluster: 'devnet',
      onWalletNotFound: async () => {
        // ConnectWalletGateButton falls back to Solflare browse.
      },
    });
    return [mobile, ...browseAdapters];
  }, []);

  const onWalletError = useCallback((error: WalletError) => {
    console.error('[pierron wallet]', error);
    if (typeof window === 'undefined' || !error?.message) return;
    window.dispatchEvent(
      new CustomEvent('pierron-wallet-error', { detail: { message: error.message } })
    );
  }, []);

  return (
    <ServerLayout>
      <ThemeProvider>
        <LocaleProvider>
          <LayoutModeProvider>
            <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
              <WalletProvider wallets={wallets} autoConnect={shouldAutoConnect} onError={onWalletError}>
                <WalletModalProvider>
                  <WalletDisconnectGuard />
                  <MobileWalletResume />
                  {children}
                </WalletModalProvider>
              </WalletProvider>
            </ConnectionProvider>
          </LayoutModeProvider>
        </LocaleProvider>
      </ThemeProvider>
    </ServerLayout>
  );
}
