'use client';

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
import { WalletConnectWallet } from '@walletconnect/solana-adapter/core';
import { createAppKit } from '@reown/appkit/core';
import { solana, solanaDevnet, solanaTestnet } from '@reown/appkit/networks';

/**
 * WalletConnect Explorer lists Solflare/Phantom as injected-only (no mobile_link),
 * so AppKit shows “Not Detected” on iOS Safari. We exclude those Explorer rows and
 * inject custom wallets with Universal Link bases. AppKit then opens
 * `https://solflare.com/ul/v1/wc?uri=…` — approve in Solflare, session returns to Safari.
 */
const SOLFLARE_WC_ID = '1ca0bdd4747578705b1939af023d120677c64fe6ca76add81fda36e350605e79';
const PHANTOM_WC_ID = 'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393';

const CUSTOM_WALLETS = [
  {
    id: SOLFLARE_WC_ID,
    name: 'Solflare',
    homepage: 'https://solflare.com',
    image_url: 'https://solflare.com/favicon.ico',
    // trailing slash → AppKit formats …/ul/v1/wc?uri=
    mobile_link: 'https://solflare.com/ul/v1/',
    desktop_link: 'https://solflare.com/ul/v1/',
    webapp_link: 'https://solflare.com',
    app_store: 'https://apps.apple.com/app/solflare/id1532599793',
    play_store: 'https://play.google.com/store/apps/details?id=com.solflare.mobile',
  },
  {
    id: PHANTOM_WC_ID,
    name: 'Phantom',
    homepage: 'https://phantom.com',
    image_url: 'https://phantom.com/favicon.ico',
    mobile_link: 'https://phantom.com/ul/v1/',
    desktop_link: 'https://phantom.com/ul/v1/',
    webapp_link: 'https://phantom.com',
    app_store: 'https://apps.apple.com/app/phantom-crypto-wallet/id1598432977',
    play_store: 'https://play.google.com/store/apps/details?id=app.phantom',
  },
];

const WALLETCONNECT_PROJECT_ID =
  (typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()) ||
  'e899c82be21d4acca2c8aec45e893598';

type ModalHost = {
  _modal?: ReturnType<typeof createAppKit>;
  _UniversalProvider?: unknown;
  _projectId?: string;
  initModal: () => Promise<void>;
};

let patched = false;

function patchWalletConnectInitModal(): void {
  if (patched || typeof window === 'undefined') return;
  patched = true;

  const proto = WalletConnectWallet.prototype as unknown as ModalHost;

  proto.initModal = async function initModalWithMobileLinks(this: ModalHost) {
    if (this._modal) return;
    if (!this._UniversalProvider) {
      throw new Error(
        'WalletConnect Adapter - cannot init modal when Universal Provider is undefined'
      );
    }
    this._modal = createAppKit({
      projectId: this._projectId!,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      universalProvider: this._UniversalProvider as any,
      networks: [solana, solanaDevnet, solanaTestnet],
      manualWCControl: true,
      // Hide Explorer Solflare/Phantom (empty mobile_link → “Not Detected”).
      excludeWalletIds: [SOLFLARE_WC_ID, PHANTOM_WC_ID],
      customWallets: CUSTOM_WALLETS,
      features: {
        email: false,
        socials: false,
        analytics: false,
      },
    });
  };
}

export function createPierronWalletConnectAdapter(network: WalletAdapterNetwork) {
  patchWalletConnectInitModal();

  return new WalletConnectWalletAdapter({
    network:
      network === WalletAdapterNetwork.Mainnet
        ? WalletAdapterNetwork.Mainnet
        : WalletAdapterNetwork.Devnet,
    options: {
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: 'Pierron',
        description: 'Pierron dapp',
        url:
          typeof window !== 'undefined'
            ? window.location.origin
            : 'https://demo-pierron.vercel.app',
        icons: [
          typeof window !== 'undefined'
            ? `${window.location.origin}/favicon.ico`
            : 'https://solflare.com/favicon.ico',
        ],
      },
    },
  });
}
