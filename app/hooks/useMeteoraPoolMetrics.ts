'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';

import {
  connectMeteoraPool,
  enrichMeteoraPoolDisplayMetrics,
  formatPoolAmountUi,
  type MeteoraPoolConnection,
  type MeteoraPoolSession,
} from '../lib/meteoraPoolConnection';

const POOL_AUTO_REFRESH_MS = 30_000;

export function poolMetricsReady(info: MeteoraPoolConnection | null | undefined): boolean {
  if (!info) return false;
  return (
    info.poolPierronTvlUi != null ||
    info.poolPierronReserveUi != null ||
    info.poolPierronBinLiquidityUi != null
  );
}

export function useMeteoraPoolMetrics(enabled = true) {
  const { connection } = useConnection();
  const [poolInfo, setPoolInfo] = useState<MeteoraPoolConnection | null>(null);
  const [poolSession, setPoolSession] = useState<MeteoraPoolSession | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPoolInfo(null);
      setPoolSession(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const session = await connectMeteoraPool(connection);
      setPoolSession(session);
      setPoolInfo(session.info);

      try {
        const enriched = await enrichMeteoraPoolDisplayMetrics(session);
        setPoolInfo(enriched);
        setPoolSession({ ...session, info: enriched });
      } catch (enrichErr: unknown) {
        const enrichMsg =
          enrichErr instanceof Error ? enrichErr.message : String(enrichErr);
        setError(enrichMsg);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPoolInfo((prev) => (poolMetricsReady(prev) ? prev : null));
      setPoolSession((prev) => (prev && poolMetricsReady(prev.info) ? prev : null));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [connection, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      void refresh();
    }, POOL_AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  const ready = poolMetricsReady(poolInfo) && !loading;

  return {
    poolInfo,
    poolSession,
    loading,
    error,
    ready,
    refresh,
    formatPoolAmountUi,
  };
}
