'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';

import LayoutModePicker from '../../components/LayoutModePicker';
import { useLocale, useTranslations } from '../../context/LocaleContext';
import { useAppTheme } from '../../context/ThemeContext';
import { clearHistory, loadHistory, type HistoryItem } from '../../lib/historyWeb';
import { pierronDevnet } from '../../lib/pierronDevnet';
import { markWalletUserDisconnected } from '../../lib/openInMobileWalletBrowser';
import { LOCALE_OPTIONS } from '../../i18n/helpers';
import { pierronMeteoraAgUrl } from '../../../shared/meteora/pierronPoolExplorer.ts';
import { PIERRON_DEVNET_METEORA_POOL } from '../../../shared/meteora/pierronPoolCanonical.ts';
import LocaleFlag from '../../components/LocaleFlag';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false }
);

type SettingsView =
  | 'root'
  | 'wallet'
  | 'language'
  | 'history'
  | 'meteora'
  | 'info'
  | 'projectInfo'
  | 'authorWord'
  | 'appearance';

export default function SettingsPage() {
  const t = useTranslations();
  const { locale, setLocale } = useLocale();
  const { colorScheme, setColorScheme } = useAppTheme();
  const { publicKey, disconnect } = useWallet();

  const [activeView, setActiveView] = useState<SettingsView>('root');
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const loadHistoryItems = async () => {
    setHistoryItems(await loadHistory());
  };

  useEffect(() => {
    if (activeView === 'history') {
      void loadHistoryItems();
    }
  }, [activeView]);

  const renderBackButton = (target: SettingsView = 'root') => (
    <button type="button" className="pierron-back-link" onClick={() => setActiveView(target)}>
      {t.common.wsteczDoOpcji}
    </button>
  );

  const onClearHistory = async () => {
    await clearHistory();
    await loadHistoryItems();
    alert(`${t.common.sukces}\n${t.history.wyczyszczono}`);
  };

  const onCopyPoolAddress = async () => {
    try {
      await navigator.clipboard.writeText(PIERRON_DEVNET_METEORA_POOL);
      alert(`${t.common.sukces}\n${t.settings.poolAddressCopied}`);
    } catch {
      alert(PIERRON_DEVNET_METEORA_POOL);
    }
  };

  const subtitle =
    activeView === 'root' ? t.settings.subtitle : t.settings.subtitleDetail;

  return (
    <div className="pierron-screen">
      <h1 className="pierron-title">{t.settings.title}</h1>
      <p className="pierron-subtitle">{subtitle}</p>

      {activeView === 'root' ? (
        <div className="pierron-menu-wrap">
          <button
            type="button"
            className="pierron-menu-button"
            onClick={() => setActiveView('appearance')}
          >
            <span className="pierron-menu-button-title">{t.settings.appearanceMenuTitle}</span>
            <span className="pierron-menu-button-subtitle">
              {colorScheme === 'light'
                ? t.settings.appearanceMenuSubtitleLight
                : t.settings.appearanceMenuSubtitleDark}
            </span>
          </button>

          <button
            type="button"
            className="pierron-menu-button"
            onClick={() => setActiveView('wallet')}
          >
            <span className="pierron-menu-button-title">{t.settings.walletMenuTitle}</span>
            <span className="pierron-menu-button-subtitle">{t.settings.walletMenuSubtitle}</span>
          </button>

          <button
            type="button"
            className="pierron-menu-button"
            onClick={() => setActiveView('language')}
          >
            <span className="pierron-menu-button-title">{t.settings.languageMenuTitle}</span>
            <span className="pierron-menu-button-subtitle pierron-locale-inline">
              {(() => {
                const current = LOCALE_OPTIONS.find((item) => item.code === locale);
                return current ? (
                  <>
                    <LocaleFlag countryCode={current.countryCode} size={12} />
                    <span>
                      {current.countryCode} · {t.settings.languageMenuSubtitle}
                    </span>
                  </>
                ) : (
                  t.settings.languageMenuSubtitle
                );
              })()}
            </span>
          </button>

          <button
            type="button"
            className="pierron-menu-button"
            onClick={() => setActiveView('history')}
          >
            <span className="pierron-menu-button-title">{t.settings.historyMenuTitle}</span>
            <span className="pierron-menu-button-subtitle">{t.settings.historyMenuSubtitle}</span>
          </button>

          <button
            type="button"
            className="pierron-menu-button"
            onClick={() => setActiveView('meteora')}
          >
            <span className="pierron-menu-button-title">{t.settings.meteoraMenuTitle}</span>
            <span className="pierron-menu-button-subtitle">{t.settings.meteoraMenuSubtitle}</span>
          </button>

          <button
            type="button"
            className="pierron-menu-button"
            onClick={() => setActiveView('info')}
          >
            <span className="pierron-menu-button-title">{t.settings.infoMenuTitle}</span>
            <span className="pierron-menu-button-subtitle">{t.settings.infoMenuSubtitle}</span>
          </button>
        </div>
      ) : null}

      {activeView === 'info' ? (
        <>
          {renderBackButton('root')}
          <div className="pierron-menu-wrap">
            <button
              type="button"
              className="pierron-menu-button"
              onClick={() => setActiveView('projectInfo')}
            >
              <span className="pierron-menu-button-title">{t.settings.projectInfoTitle}</span>
            </button>
            <button
              type="button"
              className="pierron-menu-button"
              onClick={() => setActiveView('authorWord')}
            >
              <span className="pierron-menu-button-title">{t.settings.authorWordTitle}</span>
            </button>
          </div>
        </>
      ) : null}

      {activeView === 'appearance' ? (
        <>
          {renderBackButton()}
          <div className="pierron-card">
            <p className="pierron-card-label">{t.settings.appearanceMenuTitle}</p>
            <div className="pierron-appearance-row" style={{ marginTop: 12 }}>
              <div>
                <p className="pierron-menu-button-title" style={{ marginBottom: 4 }}>
                  {colorScheme === 'light' ? t.settings.lightMode : t.settings.darkMode}
                </p>
                <p className="pierron-menu-button-subtitle">
                  {colorScheme === 'light'
                    ? t.settings.appearanceMenuSubtitleLight
                    : t.settings.appearanceMenuSubtitleDark}
                </p>
              </div>
              <label className="pierron-helper" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{t.settings.darkMode}</span>
                <input
                  type="checkbox"
                  checked={colorScheme === 'light'}
                  onChange={(e) => void setColorScheme(e.target.checked ? 'light' : 'dark')}
                />
                <span>{t.settings.lightMode}</span>
              </label>
            </div>
            <div style={{ marginTop: 16 }}>
              <LayoutModePicker compact />
            </div>
          </div>
        </>
      ) : null}

      {activeView === 'wallet' ? (
        <>
          {renderBackButton()}
          <div className="pierron-card">
            <p className="pierron-card-label">{t.settings.walletMenuTitle}</p>
            <p className="pierron-address" style={{ marginBottom: 12 }}>
              {publicKey
                ? `${publicKey.toBase58().slice(0, 8)}…${publicKey.toBase58().slice(-8)}`
                : '—'}
            </p>
            <WalletMultiButton />
            {publicKey ? (
              <button
                type="button"
                className="pierron-btn-secondary"
                style={{ marginTop: 12, color: 'var(--pierron-error)' }}
                onClick={() =>
                  void (async () => {
                    markWalletUserDisconnected();
                    await disconnect();
                    alert(`${t.common.sukces}\n${t.wallet.portfelOdlaczony}`);
                  })()
                }
              >
                {t.wallet.odlaczPortfel}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {activeView === 'language' ? (
        <>
          {renderBackButton()}
          <div className="pierron-card">
            <p className="pierron-card-label">{t.settings.languageMenuTitle}</p>
            <p className="pierron-helper" style={{ marginBottom: 12 }}>
              {t.settings.languageLabel}
            </p>
            <p className="pierron-helper pierron-locale-inline" style={{ marginBottom: 16 }}>
              {t.settings.currentLanguage}:{' '}
              {(() => {
                const current = LOCALE_OPTIONS.find((item) => item.code === locale);
                return current ? (
                  <>
                    <LocaleFlag countryCode={current.countryCode} size={14} />{' '}
                    {current.countryCode} · {current.name}
                  </>
                ) : (
                  locale.toUpperCase()
                );
              })()}
            </p>
            {LOCALE_OPTIONS.map((option) => {
              const active = locale === option.code;
              return (
                <button
                  key={option.code}
                  type="button"
                  className={`pierron-segment pierron-locale-option${
                    active ? ' pierron-segment-active' : ''
                  }`}
                  onClick={() =>
                    void (async () => {
                      if (locale === option.code) return;
                      await setLocale(option.code);
                      alert(`${t.common.sukces}\n${t.settings.languageSaved}`);
                    })()
                  }
                >
                  <LocaleFlag countryCode={option.countryCode} size={16} />
                  <span>
                    {option.countryCode} · {option.name}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {activeView === 'history' ? (
        <>
          {renderBackButton()}
          <div className="pierron-card">
            <p className="pierron-card-label">{t.history.title}</p>
            <p className="pierron-helper" style={{ marginBottom: 16 }}>
              {t.history.subtitle}
            </p>
            <button
              type="button"
              className="pierron-btn-secondary"
              style={{ marginBottom: 16 }}
              onClick={() => void onClearHistory()}
            >
              {t.history.wyczysc}
            </button>
            {historyItems.length === 0 ? (
              <p className="pierron-helper">{t.history.empty}</p>
            ) : (
              historyItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid var(--pierron-border)',
                  }}
                >
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>{item.title}</p>
                  <p className="pierron-helper">{item.meta}</p>
                  <p className="pierron-helper" style={{ fontSize: 12 }}>
                    {item.time}
                  </p>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}

      {activeView === 'meteora' ? (
        <>
          {renderBackButton()}
          <div className="pierron-card">
            <p className="pierron-card-label">{t.settings.meteoraPool}</p>
            <p className="pierron-helper" style={{ marginBottom: 12 }}>
              {t.settings.meteoraDescription}
            </p>
            <p className="pierron-helper">
              {t.settings.poolLabel}: {pierronDevnet.meteoraPool.toBase58()}
            </p>
            <p className="pierron-helper">
              {t.settings.meteoraVault}: {pierronDevnet.poolAta.toBase58()}
            </p>
            <p className="pierron-helper" style={{ marginBottom: 12 }}>
              Mint: {pierronDevnet.tokenMint.toBase58()}
            </p>
            <button
              type="button"
              className="pierron-btn-secondary"
              onClick={() => window.open(pierronMeteoraAgUrl('devnet'), '_blank')}
            >
              {t.settings.openMeteoraPool}
            </button>
            <button
              type="button"
              className="pierron-btn-secondary"
              style={{ marginTop: 8 }}
              onClick={() => void onCopyPoolAddress()}
            >
              {t.settings.copyPoolAddress}
            </button>
          </div>
        </>
      ) : null}

      {activeView === 'projectInfo' ? (
        <>
          {renderBackButton('info')}
          <div className="pierron-card">
            <p className="pierron-card-label">{t.settings.projectInfoTitle}</p>
            <pre
              className="pierron-helper pierron-project-info-body"
              style={{
                whiteSpace: 'pre-wrap',
                margin: 0,
                fontFamily: 'inherit',
                fontSize: 13,
                lineHeight: 1.55,
                overflowWrap: 'anywhere',
              }}
            >
              {t.settings.projectInfoBody}
            </pre>
          </div>
        </>
      ) : null}

      {activeView === 'authorWord' ? (
        <>
          {renderBackButton('info')}
          <div className="pierron-card">
            <p className="pierron-card-label">{t.settings.authorWordTitle}</p>
            <pre
              className="pierron-helper pierron-project-info-body"
              style={{
                whiteSpace: 'pre-wrap',
                margin: 0,
                fontFamily: 'inherit',
                fontSize: 13,
                lineHeight: 1.55,
                overflowWrap: 'anywhere',
              }}
            >
              {t.settings.authorWordBody}
            </pre>
          </div>
        </>
      ) : null}
    </div>
  );
}
