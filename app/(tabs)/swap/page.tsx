'use client';

import { BN } from '@coral-xyz/anchor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletSignTransactionError } from '@solana/wallet-adapter-base';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { pierronDevnet, TOKEN_2022_PROGRAM_ID } from '../../lib/pierronDevnet';
import { executeMeteoraPierronSwap } from '../../lib/meteoraSwap';
import { useMeteoraPoolMetrics } from '../../hooks/useMeteoraPoolMetrics';
import { useSwapCooldown } from '../../hooks/useSwapCooldown';
import { usePierronProgram } from '../../lib/anchor';
import { pierronMeteoraAgUrl } from '../../../shared/meteora/pierronPoolExplorer.ts';
import { getPoolDlmm } from '../../lib/meteoraPoolConnection';
import { useTranslations } from '../../context/LocaleContext';
import { formatMessage } from '../../lib/formatMessage';
import { isTransactionCooldownError } from '../../../shared/pierron/epochTransactionCooldown.ts';
import { quoteMeteoraDlmmSwap } from '../../../shared/meteora/meteoraDlmmSwapQuote.ts';
import { netBaseUnitsForGrossSell } from '../../../shared/pierron/tradeTax.ts';

function shortenAddress(addr: string, head = 8, tail = 8) {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function formatBaseUnitsUiDot(
  baseUnits: BN,
  decimals: number,
  minDecimals: number,
  maxDecimals: number
): string {
  const raw = baseUnits.toString();
  const negative = raw.startsWith('-');
  const abs = negative ? raw.slice(1) : raw;

  const safeDecimals = Math.max(0, decimals);
  const whole =
    abs.length > safeDecimals ? abs.slice(0, abs.length - safeDecimals) : '0';

  if (safeDecimals === 0 || maxDecimals === 0) {
    return `${negative ? '-' : ''}${whole}`;
  }

  const fracFull =
    abs.length > safeDecimals
      ? abs.slice(abs.length - safeDecimals)
      : abs.padStart(safeDecimals, '0');

  const max = Math.min(maxDecimals, safeDecimals);

  let frac = fracFull.slice(0, max).padEnd(max, '0');
  while (frac.length > minDecimals && frac.endsWith('0')) {
    frac = frac.slice(0, -1);
  }
  while (frac.length < minDecimals) {
    frac += '0';
  }

  if (minDecimals === 0 && frac.length === 0) {
    return `${negative ? '-' : ''}${whole}`;
  }

  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export default function SwapPage() {
  const t = useTranslations();
  const { publicKey, signTransaction, signAllTransactions, wallet } = useWallet();
  const { connection } = useConnection();
  const { program, idlLoading, idlError } = usePierronProgram();

  const anchorWallet = useMemo(() => {
    if (!publicKey || !signTransaction) return null;
    const adapter = wallet?.adapter as
      | { signAllTransactions?: (txs: unknown[]) => Promise<unknown[]> }
      | undefined;
    const batchSign =
      signAllTransactions ??
      (adapter && typeof adapter.signAllTransactions === 'function'
        ? async (txs: Parameters<NonNullable<typeof signAllTransactions>>[0]) =>
            (await adapter.signAllTransactions!(txs as never[])) as Awaited<
              ReturnType<NonNullable<typeof signAllTransactions>>
            >
        : undefined);
    return {
      publicKey,
      signTransaction,
      // Prefer native batch signing (one wallet approval). Critical on Android MWA.
      signAllTransactions: batchSign,
    };
  }, [publicKey, signTransaction, signAllTransactions, wallet?.adapter]);

  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('0.05');
  const [swapBusy, setSwapBusy] = useState(false);
  const [pierronBalance, setPierronBalance] = useState<string | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [receivePreview, setReceivePreview] = useState<null | {
    ok: string;
    min: string;
    asset: 'PIERRON' | 'SOL';
  }>(null);
  const [receivePreviewLoading, setReceivePreviewLoading] = useState(false);
  const receivePreviewReqIdRef = useRef(0);
  const {
    poolInfo,
    poolSession,
    loading: poolLoading,
    error: poolError,
    ready: poolReady,
    refresh: refreshPoolMetrics,
    formatPoolAmountUi,
  } = useMeteoraPoolMetrics();

  const TOKEN_MINT = pierronDevnet.tokenMint;
  const {
    remainingSeconds: cooldownRemaining,
    tierSeconds: cooldownTierSeconds,
    refresh: refreshCooldown,
  } = useSwapCooldown({
    connection,
    owner: publicKey,
    mint: TOKEN_MINT,
    programId: pierronDevnet.pierronProgramId,
  });

  const refreshBalances = useCallback(async () => {
    if (!publicKey) {
      setSolBalance(null);
      setPierronBalance(null);
      setBalanceError(null);
      return;
    }
    setRefreshing(true);
    try {
      // Fresh read — avoid stale 'processed' cache after faucet / swap.
      const lamports = await connection.getBalance(publicKey, 'confirmed');
      setSolBalance(lamports / 1e9);
      setBalanceError(null);
      try {
        const ata = getAssociatedTokenAddressSync(
          TOKEN_MINT,
          publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const acc = await getAccount(connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID);
        setPierronBalance(
          (Number(acc.amount) / 1_000_000).toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })
        );
      } catch {
        setPierronBalance('0');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBalanceError(msg);
      // Keep last known balances; only clear when we never had a successful read.
    } finally {
      setRefreshing(false);
    }
  }, [publicKey, connection, TOKEN_MINT]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  // Re-fetch when tab becomes visible (faucet / external transfer).
  useEffect(() => {
    if (!publicKey) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshBalances();
      }
    };
    const onFocus = () => {
      void refreshBalances();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [publicKey, refreshBalances]);

  // Poll while swap card is open so SOL stays in sync with wallet/faucet.
  useEffect(() => {
    if (!publicKey) return;
    const id = window.setInterval(() => {
      void refreshBalances();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [publicKey, refreshBalances]);

  const poolMetricText = (amount: number | null | undefined) => {
    if (poolLoading) return '…';
    const formatted = formatPoolAmountUi(amount);
    return formatted === '—' ? t.common.brakDanych : formatted;
  };

  const decimalSeparator = useMemo(() => {
    const sample = new Intl.NumberFormat(undefined, {
      useGrouping: false,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(1.1);
    return sample.replace(/\d/g, '') || '.';
  }, []);

  // Auto quote preview for buy (SOL→PIERRON) and sell (PIERRON→SOL)
  useEffect(() => {
    if (!poolReady || !poolSession) return;

    const amountUi = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amountUi) || amountUi <= 0) {
      setReceivePreview(null);
      return;
    }

    const requestId = ++receivePreviewReqIdRef.current;
    setReceivePreviewLoading(true);

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const dlmm = await getPoolDlmm(poolSession);
          const isBuy = tradeSide === 'buy';
          let inAmount: BN;
          if (isBuy) {
            inAmount = new BN(Math.floor(amountUi * 1_000_000_000));
          } else {
            const gross = BigInt(Math.floor(amountUi * 1_000_000));
            const { net } = netBaseUnitsForGrossSell(gross, 0n);
            inAmount = new BN(net.toString());
          }
          if (inAmount.lte(new BN(0))) {
            if (requestId === receivePreviewReqIdRef.current) {
              setReceivePreview(null);
            }
            return;
          }

          const { quote } = await quoteMeteoraDlmmSwap({
            dlmm,
            inAmount,
            swapForY: isBuy,
            slippageBps: new BN(100), // default: 1%
            skipRefetch: true,
          });

          if (requestId !== receivePreviewReqIdRef.current) return;
          if (quote.minOutAmount.lte(new BN(0))) {
            setReceivePreview(null);
            return;
          }

          const outDecimals = isBuy ? 6 : 9;
          const ok = formatBaseUnitsUiDot(
            quote.outAmount,
            outDecimals,
            isBuy ? 0 : 2,
            isBuy ? 2 : 6
          ).replace('.', decimalSeparator);
          const min = formatBaseUnitsUiDot(
            quote.minOutAmount,
            outDecimals,
            2,
            isBuy ? 2 : 6
          ).replace('.', decimalSeparator);
          setReceivePreview({
            ok,
            min,
            asset: isBuy ? 'PIERRON' : 'SOL',
          });
        } catch {
          if (requestId === receivePreviewReqIdRef.current) setReceivePreview(null);
        } finally {
          if (requestId === receivePreviewReqIdRef.current) setReceivePreviewLoading(false);
        }
      })();
    }, 450);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [amount, tradeSide, poolReady, poolSession, decimalSeparator]);

  const handleSwap = async () => {
    if (!publicKey || !anchorWallet) {
      return alert(`${t.common.blad}\n${t.stealthUi.connectWalletFirst}`);
    }
    const amountUi = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amountUi) || amountUi <= 0) {
      return alert(`${t.common.blad}\n${t.stealthUi.enterValidAmount}`);
    }
    if (!poolReady) {
      return alert(
        `${t.common.blad}\n${poolError ?? t.pure.poolNotReady}`
      );
    }
    const minSolForSwap = tradeSide === 'buy' ? amountUi + 0.005 : 0.005;
    const lamports =
      solBalance != null
        ? Math.floor(solBalance * 1e9)
        : await connection.getBalance(publicKey, 'confirmed');
    const solUi = lamports / 1e9;
    if (solUi < minSolForSwap) {
      return alert(
        `${t.common.blad}\n${formatMessage(t.pure.insufficientSol, {
          have: solUi.toFixed(4),
          need: minSolForSwap.toFixed(3),
        })}\n\n${t.pure.getDevnetSolFaucet}`
      );
    }
    if (cooldownRemaining > 0) {
      return alert(
        `${t.common.blad}\n${formatMessage(t.pure.cooldownActive, {
          seconds: String(cooldownRemaining),
        })}`
      );
    }
    setSwapBusy(true);
    try {
      const sig = await executeMeteoraPierronSwap({
        connection,
        wallet: anchorWallet,
        side: tradeSide,
        amountUi,
        poolSession: poolSession ?? undefined,
      });
      const sideLabel = tradeSide === 'buy' ? t.pure.kup : t.pure.sprzedaj;
      alert(
        `${sideLabel} OK\nhttps://explorer.solana.com/tx/${sig}?cluster=devnet`
      );
      await refreshBalances();
      void refreshCooldown();
      // Second pass after RPC catches up (fees / buy SOL spent).
      window.setTimeout(() => {
        void refreshBalances();
        void refreshCooldown();
      }, 1500);
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : String(err);
      const mobile =
        typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const userCancel =
        /user rejected|user denied|user cancel|odrzuc|anulowan/i.test(msg) ||
        (/cancel(led|led)?/i.test(msg) &&
          !/timeout|associat|not found|unable|session|authoriz/i.test(msg));
      if (userCancel) {
        msg = mobile
          ? (t.pure.swapSignCancelledMobile ??
            'Podpis nie został zatwierdzony w portfelu. Zatwierdź w Solflare/Phantom i wróć do tej karty.')
          : (t.pure.swapSignCancelledDesktop ??
            'Podpis anulowany w portfelu. Zatwierdź w Solflare/Phantom.');
      } else if (
        err instanceof WalletSignTransactionError ||
        /sign(ature|ing)|WalletSign/i.test(msg)
      ) {
        const hint = mobile
          ? (t.pure.swapSignFailedMobileHint ?? '')
          : '';
        msg = hint ? `${msg}\n\n${hint}` : msg;
      } else if (/blockhash|expired|block height exceeded/i.test(msg)) {
        msg =
          'Blockhash wygasł — zatwierdź w portfelu szybciej i spróbuj ponownie.';
      } else if (isTransactionCooldownError(err) || isTransactionCooldownError(msg)) {
        void refreshCooldown();
      }
      const sideLabel = tradeSide === 'buy' ? t.pure.kup : t.pure.sprzedaj;
      alert(`${sideLabel}: ${msg}`);
    } finally {
      setSwapBusy(false);
    }
  };

  const handleInitUserTrade = async () => {
    if (!program || !publicKey) {
      return alert(`${t.common.blad}\n${t.stealthUi.connectWalletFirst}`);
    }
    try {
      const userTokenAccount = getAssociatedTokenAddressSync(
        TOKEN_MINT,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const tx = await program.methods
        .initializeUserTradeState()
        .accountsPartial({
          payer: publicKey,
          owner: publicKey,
          userTokenAccount,
        })
        .rpc();
      alert(`${t.pure.userTradeCreated}\n${tx}`);
    } catch (err: unknown) {
      alert(`${t.pure.initUserTrade}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const openExplorer = () => {
    if (!publicKey) return;
    window.open(`https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=devnet`, '_blank');
  };

  const openMeteora = () => {
    window.open(pierronMeteoraAgUrl('devnet'), '_blank');
  };

  if (!publicKey) return null;

  return (
    <div className="pierron-screen">
      <h1 className="pierron-title">{t.pure.title}</h1>
      <p className="pierron-subtitle">{t.pure.subtitle}</p>

      <div className="pierron-card">
        <p className="pierron-card-label">{t.settings.walletMenuTitle}</p>
        <p className="pierron-address">{shortenAddress(publicKey.toBase58())}</p>
        <button
          type="button"
          className="pierron-btn-secondary"
          style={{ marginTop: 12 }}
          onClick={() => {
            void refreshBalances();
            void refreshPoolMetrics();
          }}
          disabled={refreshing}
        >
          {refreshing ? t.common.laczenie : t.pure.refreshOnChain}
        </button>
      </div>

      <div className="pierron-card">
        <p className="pierron-card-label">{t.pure.poolLabel}</p>
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
              {poolMetricText(poolInfo?.poolPierronTvlUi ?? poolInfo?.poolPierronReserveUi)}
            </span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-label">{t.pure.poolBinLiquidity}</span>
            <span className="pierron-info-value">
              {poolMetricText(poolInfo?.poolPierronBinLiquidityUi)}
            </span>
          </div>
          {poolInfo?.poolPierronReserveUi != null &&
          poolInfo.poolPierronTvlUi != null &&
          poolInfo.poolPierronReserveUi > poolInfo.poolPierronTvlUi * 1.05 ? (
            <div className="pierron-info-row">
              <span className="pierron-info-label">{t.pure.poolVaultOnChain}</span>
              <span className="pierron-info-value">
                {poolLoading ? '…' : formatPoolAmountUi(poolInfo.poolPierronReserveUi)}
              </span>
            </div>
          ) : null}
          {poolInfo?.activeId != null ? (
            <div className="pierron-info-row">
              <span className="pierron-info-label">{t.pure.poolBinActiveStep}</span>
              <span className="pierron-info-value">
                {poolInfo.activeId}
                {poolInfo.binStep != null ? ` · ${poolInfo.binStep} bps` : ''}
              </span>
            </div>
          ) : null}
          <div className="pierron-info-row">
            <span className="pierron-info-label">{t.pure.saldoSol}</span>
            <span
              className="pierron-info-value"
              style={{
                color:
                  solBalance != null && solBalance < 0.005
                    ? 'var(--pierron-error)'
                    : undefined,
              }}
            >
              {solBalance != null ? `${solBalance.toFixed(4)} SOL` : refreshing ? '…' : '—'}
            </span>
          </div>
          <div className="pierron-info-row">
            <span className="pierron-info-label">{t.pure.saldoPierron}</span>
            <span className="pierron-info-value" style={{ color: 'var(--pierron-accent)' }}>
              {pierronBalance ?? (refreshing ? '…' : '—')}
            </span>
          </div>
        </div>
        <p className="pierron-helper" style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {poolInfo?.poolAddress ?? pierronDevnet.meteoraPool.toBase58()}
        </p>
        {balanceError ? (
          <p className="pierron-helper" style={{ color: 'var(--pierron-error)' }}>
            Saldo RPC: {balanceError}
          </p>
        ) : null}
        {poolError ? (
          <p className="pierron-helper" style={{ color: 'var(--pierron-error)' }}>
            {poolError}
          </p>
        ) : !poolReady && !poolLoading ? (
          <p className="pierron-helper">{t.pure.poolConnecting}</p>
        ) : null}
        {solBalance != null && solBalance < 0.005 ? (
          <p className="pierron-helper" style={{ color: 'var(--pierron-error)' }}>
            {t.pure.needDevnetSolBanner}
          </p>
        ) : null}
        <button type="button" className="pierron-link" onClick={openMeteora}>
          {t.pure.openMeteoraPool}
        </button>
      </div>

      <div className="pierron-card">
        <p className="pierron-card-label">{t.pure.swapTitle}</p>
        {idlError ? (
          <p className="pierron-helper" style={{ color: 'var(--pierron-error)' }}>
            IDL: {idlError}
          </p>
        ) : null}
        {idlLoading ? <p className="pierron-helper">{t.common.laczenie}</p> : null}

        <div className="pierron-segment-row">
          <button
            type="button"
            className={`pierron-segment${tradeSide === 'buy' ? ' pierron-segment-active' : ''}`}
            onClick={() => setTradeSide('buy')}
            disabled={swapBusy}
          >
            {t.pure.kup.replace(' PIERRON', '')}
          </button>
          <button
            type="button"
            className={`pierron-segment${tradeSide === 'sell' ? ' pierron-segment-active' : ''}`}
            onClick={() => setTradeSide('sell')}
            disabled={swapBusy}
          >
            {t.pure.sprzedaj.replace(' PIERRON', '')}
          </button>
        </div>

        <label className="pierron-field-label">
          {tradeSide === 'buy' ? t.pure.amountSol : t.pure.amountPierron}
        </label>
        <input
          className="pierron-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          disabled={swapBusy}
        />

        {receivePreviewLoading ? (
          <p className="pierron-helper" style={{ marginTop: 12 }}>
            {t.pure.receiveQuoteLoading}
          </p>
        ) : receivePreview ? (
          <p className="pierron-helper" style={{ marginTop: 12 }}>
            {formatMessage(t.pure.receiveApproxMin, {
              amount: receivePreview.ok,
              min: receivePreview.min,
              asset: receivePreview.asset,
            })}
          </p>
        ) : null}

        <p className="pierron-helper" style={{ marginTop: 12 }}>
          {formatMessage(t.pure.swapHint, {
            seconds: String(cooldownTierSeconds),
          })}
        </p>
        {cooldownRemaining > 0 ? (
          <p className="pierron-helper" style={{ color: 'var(--pierron-accent)' }}>
            {formatMessage(t.pure.cooldownActive, {
              seconds: String(cooldownRemaining),
            })}
          </p>
        ) : null}
        {swapBusy ? (
          <p className="pierron-helper" style={{ color: 'var(--pierron-accent)' }}>
            {tradeSide === 'sell'
              ? 'Krok po kroku: zatwierdź w portfelu → wróć do dappki → ewentualnie drugi podpis.'
              : t.pure.swapStageReadyWallet}
          </p>
        ) : null}

        <button
          type="button"
          className="pierron-btn-primary"
          style={{ marginTop: 8 }}
          onClick={() => void handleSwap()}
          disabled={
            swapBusy ||
            poolLoading ||
            !poolReady ||
            cooldownRemaining > 0
          }
        >
          {swapBusy
            ? t.pure.sendingSwap
            : cooldownRemaining > 0
              ? formatMessage(t.pure.cooldownWaitButton, {
                  seconds: String(cooldownRemaining),
                })
              : tradeSide === 'buy'
                ? t.pure.kup
                : t.pure.sprzedaj}
        </button>

        <button
          type="button"
          className="pierron-btn-secondary"
          style={{ marginTop: 10 }}
          onClick={() => void handleInitUserTrade()}
          disabled={swapBusy || !program}
        >
          {t.pure.initUserTrade}
        </button>
      </div>

      <button type="button" className="pierron-btn-secondary" onClick={openExplorer}>
        {t.pure.historiaExplorer}
      </button>
    </div>
  );
}
