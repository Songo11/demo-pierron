'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

import { useTranslations } from '../context/LocaleContext';
import {
  RESUME_WALLET_NAME_KEY,
  connectInjectedProviderDirect,
  detectInjectedWalletBrowser,
} from '../lib/openInMobileWalletBrowser';

/**
 * Same UX as before: one "Połącz portfel" → wallet modal → approve in wallet.
 * After Solflare/MWA returns, MobileWalletResume + autoConnect finish the session.
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, publicKey, connect, select } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connectAfterSelectRef = useRef(false);
  const injectedTriedRef = useRef(false);

  useEffect(() => {
    if (!connected) return;
    setError(null);
    setBusy(false);
    connectAfterSelectRef.current = false;
    try {
      sessionStorage.removeItem(RESUME_WALLET_NAME_KEY);
    } catch {
      /* ignore */
    }
  }, [connected]);

  const runConnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const injected = detectInjectedWalletBrowser();
      if (injected) {
        await connectInjectedProviderDirect(injected);
        const name = (injected === 'solflare' ? 'Solflare' : 'Phantom') as WalletName;
        select(name);
        await new Promise((r) => window.setTimeout(r, 80));
      }
      if (wallet?.adapter.name) {
        try {
          sessionStorage.setItem(RESUME_WALLET_NAME_KEY, wallet.adapter.name);
        } catch {
          /* ignore */
        }
      }
      await connect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const rejected = /reject|denied|cancel/i.test(msg);
      // Don't surface abort/navigation noise from app-switch handoff.
      if (/abort|navigat|user.?reject/i.test(msg) && !rejected) return;
      setError(
        rejected
          ? (t.dapp.connectRejectedHint ??
            'Odrzucono w portfelu. Spróbuj ponownie i zatwierdź.')
          : msg
      );
    } finally {
      setBusy(false);
    }
  }, [connect, select, t.dapp.connectRejectedHint, wallet]);

  // After user picks a wallet in the modal — continue connect (including MWA → Solflare).
  useEffect(() => {
    if (!wallet || connected || connecting || !connectAfterSelectRef.current) return;
    connectAfterSelectRef.current = false;
    try {
      sessionStorage.setItem(RESUME_WALLET_NAME_KEY, wallet.adapter.name);
    } catch {
      /* ignore */
    }
    void runConnect();
  }, [wallet, connected, connecting, runConnect]);

  // In-wallet browser only: finish connect without extra UI.
  useEffect(() => {
    if (connected || injectedTriedRef.current) return;
    if (!detectInjectedWalletBrowser()) return;
    injectedTriedRef.current = true;
    void runConnect();
  }, [connected, runConnect]);

  const onPrimaryClick = useCallback(() => {
    setError(null);
    if (connected) {
      setVisible(true);
      return;
    }
    if (detectInjectedWalletBrowser()) {
      void runConnect();
      return;
    }
    if (wallet && !connected) {
      void runConnect();
      return;
    }
    connectAfterSelectRef.current = true;
    setVisible(true);
  }, [connected, runConnect, setVisible, wallet]);

  const label = connected
    ? publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : t.wallet.portfelPodlaczony
    : busy || connecting
      ? t.dapp.connectHintConnecting
      : t.wallet.polaczPortfel;

  return (
    <div className="pierron-connect-wallet-wrap">
      <button
        type="button"
        className="wallet-adapter-button wallet-adapter-button-trigger pierron-connect-wallet-btn"
        onClick={onPrimaryClick}
      >
        {label}
      </button>
      {error ? <p className="pierron-connect-wallet-error">{error}</p> : null}
    </div>
  );
}
