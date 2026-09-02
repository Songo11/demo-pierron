'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type DappLayoutMode = 'phone' | 'pc';

const STORAGE_KEY = 'pierron_dapp_layout_mode';

type LayoutModeContextValue = {
  layoutMode: DappLayoutMode | null;
  layoutReady: boolean;
  setLayoutMode: (mode: DappLayoutMode) => void;
};

const LayoutModeContext = createContext<LayoutModeContextValue | null>(null);

export function LayoutModeProvider({ children }: { children: React.ReactNode }) {
  const [layoutMode, setLayoutModeState] = useState<DappLayoutMode | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'phone' || saved === 'pc') {
      setLayoutModeState(saved);
    }
    setLayoutReady(true);
  }, []);

  const setLayoutMode = useCallback((mode: DappLayoutMode) => {
    setLayoutModeState(mode);
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const value = useMemo(
    () => ({ layoutMode, layoutReady, setLayoutMode }),
    [layoutMode, layoutReady, setLayoutMode]
  );

  return <LayoutModeContext.Provider value={value}>{children}</LayoutModeContext.Provider>;
}

export function useLayoutMode(): LayoutModeContextValue {
  const ctx = useContext(LayoutModeContext);
  if (!ctx) throw new Error('useLayoutMode must be used within LayoutModeProvider');
  return ctx;
}
