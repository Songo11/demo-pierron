'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  FaCog,
  FaExchangeAlt,
  FaHubspot,
  FaMoneyBillWave,
  FaUserSecret,
} from 'react-icons/fa';

import LayoutModePicker from './LayoutModePicker';
import ConnectLanguageButton from './ConnectLanguageButton';
import { useLayoutMode } from '../context/LayoutModeContext';
import { useTranslations } from '../context/LocaleContext';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false }
);

const TAB_ICONS = {
  swap: FaExchangeAlt,
  ecosystem: FaHubspot,
  pay: FaMoneyBillWave,
  settings: FaCog,
  stealth: FaUserSecret,
} as const;

export default function PierronShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { connected, connecting } = useWallet();
  const { layoutMode, layoutReady } = useLayoutMode();
  const t = useTranslations();
  const wasConnectedRef = useRef(false);

  const showGate = !connected;
  const needsLayoutChoice = layoutReady && layoutMode == null;

  // After wallet connect (manual or autoConnect), always land on Pierron Swap first.
  useEffect(() => {
    if (!connected) {
      wasConnectedRef.current = false;
      return;
    }
    // Wait until layout mode is chosen so we don't navigate under the overlay.
    if (needsLayoutChoice) return;

    const justConnected = !wasConnectedRef.current;
    wasConnectedRef.current = true;
    if (!justConnected) return;
    if (pathname === '/swap' || pathname.startsWith('/swap/')) return;
    router.replace('/swap');
  }, [connected, needsLayoutChoice, pathname, router]);

  const tabs = [
    { href: '/swap', label: t.tabs.swap, icon: TAB_ICONS.swap },
    { href: '/ecosystem', label: t.tabs.ecosystem, icon: TAB_ICONS.ecosystem },
    { href: '/pay', label: t.tabs.pay, icon: TAB_ICONS.pay },
    { href: '/settings', label: t.tabs.settings, icon: TAB_ICONS.settings },
    { href: '/stealth', label: t.tabs.safeSend, icon: TAB_ICONS.stealth },
  ] as const;

  const layoutClass =
    layoutMode === 'pc' ? 'pierron-layout-pc' : 'pierron-layout-phone';

  const tabNav = (
    <nav className="pierron-tabbar" aria-label="Główna nawigacja">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`pierron-tab${active ? ' pierron-tab-active' : ''}`}
          >
            <span className="pierron-tab-icon">
              <Icon aria-hidden />
            </span>
            <span className="pierron-tab-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className={`pierron-app ${layoutClass}`}>
      {showGate || needsLayoutChoice ? (
        <div className="pierron-connect-overlay">
          <div className="pierron-connect-hero">
            <h1 className="pierron-connect-brand">PIERRON</h1>
            <p className="pierron-connect-tagline">{t.dapp.connectTagline}</p>
          </div>

          <div className="pierron-connect-actions">
            <LayoutModePicker />

            {!needsLayoutChoice ? (
              <>
                <p className="pierron-connect-hint">
                  {connecting ? t.dapp.connectHintConnecting : t.dapp.connectHint}
                </p>
                <div className="pierron-connect-cta-row">
                  <WalletMultiButton>{t.wallet.polaczPortfel}</WalletMultiButton>
                  <ConnectLanguageButton />
                </div>
              </>
            ) : (
              <>
                <p className="pierron-connect-hint">{t.dapp.layoutPickerHint}</p>
                <ConnectLanguageButton />
              </>
            )}
          </div>
        </div>
      ) : null}

      <div
        className="pierron-shell-body"
        style={showGate || needsLayoutChoice ? { visibility: 'hidden' } : undefined}
      >
        {layoutMode === 'pc' ? tabNav : null}

        <main className="pierron-main">{children}</main>

        {layoutMode !== 'pc' && !showGate && !needsLayoutChoice ? tabNav : null}
      </div>
    </div>
  );
}
