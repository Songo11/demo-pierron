'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  type AppLocale,
  type AppSettings,
} from '../../shared/core/config';
import {
  DEFAULT_LOCALE,
  getTranslations,
  isAppLocale,
  loadTranslations,
  type Translations,
} from '../i18n';
import { loadJson, saveJson } from '../lib/webStorage';

type LocaleContextValue = {
  locale: AppLocale;
  t: Translations;
  setLocale: (locale: AppLocale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Always start with DEFAULT_LOCALE so SSR HTML matches the first client render.
  // Reading localStorage in useState() causes hydration mismatches (PL on server, EN/other on client).
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);
  const [t, setT] = useState<Translations>(() => getTranslations(DEFAULT_LOCALE));

  useEffect(() => {
    void (async () => {
      const settings = await loadJson<AppSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
      if (settings.locale && isAppLocale(settings.locale)) {
        setLocaleState(settings.locale);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setT(getTranslations(locale));
    void loadTranslations(locale).then((next) => {
      if (!cancelled) setT(next);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback(async (next: AppLocale) => {
    setLocaleState(next);
    const settings = await loadJson<AppSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    await saveJson(STORAGE_KEYS.settings, { ...settings, locale: next });
  }, []);

  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

export function useTranslations(): Translations {
  return useLocale().t;
}
