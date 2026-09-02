'use client';

import { useMemo, useState } from 'react';

import { useLocale } from '../context/LocaleContext';
import { localeLabel, LOCALE_OPTIONS } from '../i18n/helpers';
import LocaleFlag from './LocaleFlag';

export default function ConnectLanguageButton() {
  const { locale, t, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const current = useMemo(
    () => LOCALE_OPTIONS.find((item) => item.code === locale),
    [locale]
  );

  return (
    <>
      <button
        type="button"
        className="pierron-connect-lang-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="pierron-connect-lang-btn-flag" aria-hidden>
          {current ? (
            <LocaleFlag countryCode={current.countryCode} size={18} />
          ) : (
            '🌐'
          )}
        </span>
        <span>{t.settings.languageMenuTitle}</span>
      </button>

      {open ? (
        <div
          className="pierron-connect-lang-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t.settings.languageMenuTitle}
        >
          <div className="pierron-connect-lang-modal-backdrop" onClick={() => setOpen(false)} />
          <div className="pierron-connect-lang-modal-panel">
            <div className="pierron-connect-lang-modal-header">
              <div>
                <p className="pierron-connect-lang-modal-title">{t.settings.languageMenuTitle}</p>
                <p
                  className="pierron-helper pierron-locale-inline"
                  style={{ marginBottom: 0 }}
                >
                  {t.settings.currentLanguage}:{' '}
                  {current ? (
                    <>
                      <LocaleFlag countryCode={current.countryCode} size={14} />{' '}
                      {current.countryCode} · {current.name}
                    </>
                  ) : (
                    localeLabel(locale)
                  )}
                </p>
              </div>
              <button
                type="button"
                className="pierron-connect-lang-modal-close"
                onClick={() => setOpen(false)}
                aria-label={t.common.anuluj}
              >
                ✕
              </button>
            </div>
            <div className="pierron-connect-lang-modal-list">
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
                        if (locale !== option.code) {
                          await setLocale(option.code);
                        }
                        setOpen(false);
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
          </div>
        </div>
      ) : null}
    </>
  );
}
