'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import {
  RESUME_WALLET_NAME_KEY,
  markWalletUserDisconnected,
} from '../lib/openInMobileWalletBrowser';

/**
 * When the user disconnects (settings / modal), block autoConnect + resume
 * so the gate does not instantly reconnect and bounce back into the menu.
 */
export default function WalletDisconnectGuard() {
  const { connected } = useWallet();
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    if (connected) {
      wasConnectedRef.current = true;
      return;
    }
    if (!wasConnectedRef.current) return;
    wasConnectedRef.current = false;
    try {
      // Pending mobile handoff — do not treat as user disconnect.
      if (sessionStorage.getItem(RESUME_WALLET_NAME_KEY)) return;
    } catch {
      /* ignore */
    }
    markWalletUserDisconnected();
  }, [connected]);

  return null;
}
