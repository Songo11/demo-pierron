// app/layout.tsx
'use client';

import './lib/bufferBigIntPolyfill';

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { useMemo } from 'react';

import '@solana/wallet-adapter-react-ui/styles.css';

import { fetchWithRpcRetry } from '../../shared/solana/resilientConnection.ts';
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
  // Browser: same-origin /api/solana-rpc (avoids Worker CORS on solana-client).
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

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
      new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
    ],
    []
  );

  return (
    <ServerLayout>
      <ThemeProvider>
        <LocaleProvider>
          <LayoutModeProvider>
            <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
              <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>{children}</WalletModalProvider>
              </WalletProvider>
            </ConnectionProvider>
          </LayoutModeProvider>
        </LocaleProvider>
      </ThemeProvider>
    </ServerLayout>
  );
}
