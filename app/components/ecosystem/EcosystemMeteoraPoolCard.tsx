'use client';

import CollapsibleSection from '../CollapsibleSection';
import { useTranslations } from '../../context/LocaleContext';
import { useMeteoraPoolMetrics } from '../../hooks/useMeteoraPoolMetrics';
import { pierronDevnet } from '../../lib/pierronDevnet';

/** Isolated so @meteora-ag/dlmm stays out of the main ecosystem webpack entry. */
export default function EcosystemMeteoraPoolCard() {
  const t = useTranslations();
  const {
    poolInfo,
    loading: poolLoading,
    error: poolError,
    ready: poolReady,
    formatPoolAmountUi,
  } = useMeteoraPoolMetrics();

  return (
    <div className="pierron-ecosystem-span-2">
      <CollapsibleSection
        title={t.pure.poolLabel}
        defaultExpanded
        subtitle={
          poolLoading
            ? t.pure.poolConnecting
            : poolError
              ? t.pure.poolConnectFailed
              : poolReady
                ? t.pure.poolConnected
                : t.pure.poolNotReady
        }
      >
        <div className="pierron-info-table">
          <div className="pierron-info-row">
            <span className="pierron-info-label">{t.pure.poolStatus}</span>
            <span
              className="pierron-info-value"
              style={{
                color: poolError
                  ? 'var(--pierron-error)'
                  : poolReady
                    ? 'var(--pierron-success)'
                    : 'var(--pierron-text-secondary)',
              }}
            >
              {poolLoading
                ? `● ${t.pure.poolConnecting}`
                : poolError
                  ? `● ${t.pure.poolConnectFailed}`
                  : poolReady
                    ? `● ${t.pure.poolConnected}`
                    : `● ${t.pure.poolNotReady}`}
            </span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-label">{t.pure.poolReserve}</span>
            <span className="pierron-info-value" style={{ color: 'var(--pierron-accent)' }}>
              {poolLoading
                ? '…'
                : formatPoolAmountUi(
                    poolInfo?.poolPierronTvlUi ?? poolInfo?.poolPierronReserveUi
                  )}
            </span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-label">{t.pure.poolBinLiquidity}</span>
            <span className="pierron-info-value">
              {poolLoading ? '…' : formatPoolAmountUi(poolInfo?.poolPierronBinLiquidityUi)}
            </span>
          </div>
        </div>
        <p className="pierron-helper" style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {poolInfo?.poolAddress ?? pierronDevnet.meteoraPool.toBase58()}
        </p>
        {poolError ? (
          <p className="pierron-helper" style={{ color: 'var(--pierron-error)' }}>
            {poolError}
          </p>
        ) : null}
      </CollapsibleSection>
    </div>
  );
}
