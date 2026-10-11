// app/layout.tsx
'use client';

import './lib/bufferBigIntPolyfill';

import { WalletAdapterNetwork, type Adapter, type WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
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

/** WalletConnect — iOS Safari can approve in Solflare/Phantom and return to Safari (MWA is Android-only). */
const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ||
  'e899c82be21d4acca2c8aec45e893598';

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
    const browseAdapters = createMobileBrowseWalletAdapters(WalletAdapterNetwork.Devnet);

    // Android: Mobile Wallet Adapter (approve in wallet → return to browser).
    if (typeof window !== 'undefined' && isAndroidUserAgent()) {
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
    }

    // iOS Safari / desktop: WalletConnect keeps the session in Safari (closest to MWA).
    // Phantom/Solflare still available via https Universal Link browse when preferred.
    if (typeof window === 'undefined') {
      return browseAdapters;
    }

    const walletConnect = new WalletConnectWalletAdapter({
      network: WalletAdapterNetwork.Devnet,
      options: {
        projectId: WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: 'Pierron',
          description: 'Pierron dapp',
          url: window.location.origin,
          icons: [`${window.location.origin}/favicon.ico`],
        },
      },
    });
    return [walletConnect, ...browseAdapters];
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
