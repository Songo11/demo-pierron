// app/layout.tsx
'use client';

import './lib/bufferBigIntPolyfill';

import { WalletAdapterNetwork, type Adapter, type WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import {
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
  SolanaMobileWalletAdapter,
  SolanaMobileWalletAdapterWalletName,
} from '@solana-mobile/wallet-adapter-mobile';
import { useCallback, useEffect, useMemo, useState } from 'react';

import '@solana/wallet-adapter-react-ui/styles.css';

import { fetchWithRpcRetry } from '../shared/solana/resilientConnection.ts';
import { resolveBrowserSolanaRpcEndpoint } from './lib/browserSolanaRpc';

import ServerLayout from './layout-server';

import { LayoutModeProvider } from './context/LayoutModeContext';
import { LocaleProvider } from './context/LocaleContext';
import { ThemeProvider } from './context/ThemeContext';

function isAndroidMobileWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /android/i.test(ua) && !/(WebView|; wv\))/i.test(ua);
}

function createDesktopWallets() {
  return [
    new PhantomWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
    new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
  ];
}

/** Tiny gold square — MWA appIdentity.icon must be a data URI. */
function pierronMwaIcon(): `data:image/svg+xml;base64,${string}` {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#d4a017"/><text x="32" y="42" text-anchor="middle" font-size="28" font-family="sans-serif" font-weight="700" fill="#000">P</text></svg>';
  const b64 =
    typeof btoa === 'function' ? btoa(svg) : Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

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
      // Worker HTTP nie obsługuje WSS — subskrypcje idą na publiczny devnet WS (bez ws error w konsoli).
      wsEndpoint: 'wss://api.devnet.solana.com',
    }),
    []
  );

  // Start with desktop adapters (SSR-safe). Inject MWA after mount on Android web.
  const [wallets, setWallets] = useState<Adapter[]>(() => createDesktopWallets());

  useEffect(() => {
    if (!isAndroidMobileWeb()) return;
    const origin = window.location.origin;
    setWallets([
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'Pierron',
          uri: origin,
          icon: pierronMwaIcon(),
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: WalletAdapterNetwork.Devnet,
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
      ...createDesktopWallets(),
    ]);
  }, []);

  const onWalletError = useCallback((error: WalletError) => {
    console.error('[pierron wallet]', error);
    if (typeof window === 'undefined' || !error?.message) return;
    window.dispatchEvent(
      new CustomEvent('pierron-wallet-error', { detail: { message: error.message } })
    );
  }, []);

  // Resume MWA after returning from the installed wallet app; skip desktop autoConnect noise.
  const autoConnect = useCallback(async (adapter: Adapter) => {
    return adapter.name === SolanaMobileWalletAdapterWalletName;
  }, []);

  return (
    <ServerLayout>
      <ThemeProvider>
        <LocaleProvider>
          <LayoutModeProvider>
            <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
              <WalletProvider wallets={wallets} autoConnect={autoConnect} onError={onWalletError}>
                <WalletModalProvider>{children}</WalletModalProvider>
              </WalletProvider>
            </ConnectionProvider>
          </LayoutModeProvider>
        </LocaleProvider>
      </ThemeProvider>
    </ServerLayout>
  );
}
