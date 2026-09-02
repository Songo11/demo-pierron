'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

import { useTranslations } from '../context/LocaleContext';
import { RESUME_WALLET_NAME_KEY } from '../lib/openInMobileWalletBrowser';

/**
 * One button → always opens the wallet modal. After the user picks a wallet,
 * connect() runs. Resume-after-return is handled by MobileWalletResume.
 */
export default function ConnectWalletGateButton() {
  const t = useTranslations();
  const { connected, connecting, wallet, publicKey, connect } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingConnectRef = useRef(false);

  useEffect(() => {
    if (!connected) return;
    setError(null);
    setBusy(false);
    pendingConnectRef.current = false;
    try {
      sessionStorage.removeItem(RESUME_WALLET_NAME_KEY);
    } catch {
      /* ignore */
    }
  }, [connected]);

  // User just picked a wallet in the modal → connect (MWA / Phantom / Solflare).
  useEffect(() => {
    if (!pendingConnectRef.current || !wallet || connected || connecting) return;
    pendingConnectRef.current = false;

    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        try {
          sessionStorage.setItem(RESUME_WALLET_NAME_KEY, wallet.adapter.name);
        } catch {
          /* ignore */
        }
        await connect();
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const rejected = /reject|denied|cancel/i.test(msg);
        if (/abort|navigat/i.test(msg) && !rejected) {
          // App switch mid-connect — resume will finish after return.
          return;
        }
        setError(
          rejected
            ? (t.dapp.connectRejectedHint ??
              'Odrzucono w portfelu. Spróbuj ponownie i zatwierdź.')
            : msg
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet, connected, connecting, connect, t.dapp.connectRejectedHint]);

  const onPrimaryClick = useCallback(() => {
    setError(null);
    // Always open the picker — never silently hang on a stale adapter connect().
    pendingConnectRef.current = true;
    setVisible(true);
  }, [setVisible]);

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
