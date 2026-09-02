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
  type AppSettings,
} from '../../../shared/core/config';
import {
  getAppThemeColors,
  isAppColorScheme,
  type AppColorScheme,
  type AppThemeColors,
} from '../../../mobile/PierronMobile/src/theme/appTheme';
import { loadJson, saveJson } from '../lib/webStorage';

type ThemeContextValue = {
  colorScheme: AppColorScheme;
  colors: AppThemeColors;
  setColorScheme: (scheme: AppColorScheme) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorScheme, setColorSchemeState] = useState<AppColorScheme>('dark');

  useEffect(() => {
    void (async () => {
      const settings = await loadJson<AppSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
      if (settings.colorScheme && isAppColorScheme(settings.colorScheme)) {
        setColorSchemeState(settings.colorScheme);
      }
    })();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.pierronTheme = colorScheme;
  }, [colorScheme]);

  const setColorScheme = useCallback(async (scheme: AppColorScheme) => {
    setColorSchemeState(scheme);
    const settings = await loadJson<AppSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    await saveJson(STORAGE_KEYS.settings, { ...settings, colorScheme: scheme });
  }, []);

  const colors = useMemo(() => getAppThemeColors(colorScheme), [colorScheme]);

  const value = useMemo(
    () => ({ colorScheme, colors, setColorScheme }),
    [colorScheme, colors, setColorScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within ThemeProvider');
  return ctx;
}
