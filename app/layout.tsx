// app/layout.tsx
'use client';

import './lib/bufferBigIntPolyfill';

import { WalletAdapterNetwork, type WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { useCallback, useMemo } from 'react';

import '@solana/wallet-adapter-react-ui/styles.css';

import { fetchWithRpcRetry } from '../shared/solana/resilientConnection.ts';
import { resolveBrowserSolanaRpcEndpoint } from './lib/browserSolanaRpc';

import ServerLayout from './layout-server';

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
      // Worker HTTP nie obsługuje WSS — subskrypcje idą na publiczny devnet WS (bez ws error w konsoli).
      wsEndpoint: 'wss://api.devnet.solana.com',
    }),
    []
  );

  // Keep legacy adapters as fallback when Wallet Standard is not injected yet
  // (install links). Standard wallets auto-register and replace duplicates.
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
      new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
    ],
    []
  );

  const onWalletError = useCallback((error: WalletError) => {
    console.error('[pierron wallet]', error);
    if (typeof window === 'undefined' || !error?.message) return;
    // Inline UI via ConnectWalletGateButton — avoid blocking alert that freezes "Łączenie…".
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
              {/* autoConnect off: rejected popups + localStorage left the gate stuck on "Łączenie…". */}
              <WalletProvider wallets={wallets} autoConnect={false} onError={onWalletError}>
                <WalletModalProvider>{children}</WalletModalProvider>
              </WalletProvider>
            </ConnectionProvider>
          </LayoutModeProvider>
        </LocaleProvider>
      </ThemeProvider>
    </ServerLayout>
  );
}
