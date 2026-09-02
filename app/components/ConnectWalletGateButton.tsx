'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

import { useTranslations } from '../context/LocaleContext';

/**
 * Explicit connect CTA for the gate overlay.
 * WalletMultiButton alone can look stuck when connect fails silently;
 * this surfaces errors and always opens the wallet modal.
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, connect, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connected) setError(null);
  }, [connected]);

  const onClick = useCallback(async () => {
    setError(null);
    if (connected) {
      setVisible(true);
      return;
    }
    // No wallet chosen yet → open modal (Phantom / Solflare / Mobile).
    if (!wallet) {
      setVisible(true);
      return;
    }
    try {
      await connect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || t.wallet.najpierwPodlaczPortfel);
      setVisible(true);
    }
  }, [connected, connect, setVisible, t.wallet.najpierwPodlaczPortfel, wallet]);

  const label = connected
    ? publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : t.wallet.portfelPodlaczony
    : connecting
      ? t.dapp.connectHintConnecting
      : t.wallet.polaczPortfel;

  return (
    <div className="pierron-connect-wallet-wrap">
      <button
        type="button"
        className="wallet-adapter-button wallet-adapter-button-trigger pierron-connect-wallet-btn"
        onClick={() => {
          void onClick();
        }}
        disabled={connecting}
      >
        {label}
      </button>
      {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}
    </div>
  );
}
