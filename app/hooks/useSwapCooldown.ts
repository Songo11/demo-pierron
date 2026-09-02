'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Connection, PublicKey } from '@solana/web3.js';
import {
  epochTransactionCooldownSeconds,
  swapCooldownRemainingSeconds,
} from '../../shared/pierron/epochTransactionCooldown.ts';
import { fetchTradeBookParticipantForDexPolicyFast } from '../../shared/pierron/tradeBookParticipant.ts';
import { swapPolicyClaimsForDexLimit } from '../../shared/pierron/swapPolicyClaims.ts';
import { countConsumedRedistributionClaimsForUser } from '../../shared/pierron/redistributionClaimEligibility.ts';

type CooldownSnapshot = {
  lastActivityUnix: number;
  claimCount: number;
  tierSeconds: number;
};

/**
 * Live DEX swap cooldown from trade-book last_activity + claim tier.
 * Skew matches client assert so the button stays disabled until simulate is safe.
 */
export function useSwapCooldown(params: {
  connection: Connection;
  owner: PublicKey | null;
  mint: PublicKey;
  programId: PublicKey;
}): {
  remainingSeconds: number;
  tierSeconds: number;
  claimCount: number;
  refresh: () => Promise<void>;
} {
  const { connection, owner, mint, programId } = params;
  const [snap, setSnap] = useState<CooldownSnapshot | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const refresh = useCallback(async () => {
    if (!owner) {
      setSnap(null);
      return;
    }
    try {
      const participant = await fetchTradeBookParticipantForDexPolicyFast({
        mint,
        owner,
        programId,
        connection,
      });
      const tradeBookClaims = participant?.redistributionClaimCount ?? 0;
      const voucherCount = await countConsumedRedistributionClaimsForUser({
        connection,
        programId,
        user: owner,
        // UI path: prefer cache / TB; full GPA scan is too heavy for a 20s poll.
        skipProgramAccountsScan: true,
      }).catch(() => 0);
      const pid = programId.toBase58();
      const claimCount = swapPolicyClaimsForDexLimit(
        tradeBookClaims,
        voucherCount,
        pid
      );
      setSnap({
        lastActivityUnix: Number(participant?.lastActivity ?? 0),
        claimCount,
        tierSeconds: epochTransactionCooldownSeconds(claimCount, pid),
      });
      setNowSec(Math.floor(Date.now() / 1000));
    } catch {
      // Keep last snapshot; cooldown UI is best-effort.
    }
  }, [connection, owner, mint, programId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!owner) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [owner, refresh]);

  useEffect(() => {
    if (!owner) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [owner, refresh]);

  useEffect(() => {
    if (!snap || snap.lastActivityUnix <= 0) return;
    const id = window.setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [snap]);

  const remainingSeconds = snap
    ? swapCooldownRemainingSeconds({
        lastActivityUnix: snap.lastActivityUnix,
        redistributionClaimCount: snap.claimCount,
        programId: programId.toBase58(),
        nowSec,
        skewSecs: 2,
      })
    : 0;

  return {
    remainingSeconds,
    tierSeconds: snap?.tierSeconds ?? 120,
    claimCount: snap?.claimCount ?? 0,
    refresh,
  };
}
