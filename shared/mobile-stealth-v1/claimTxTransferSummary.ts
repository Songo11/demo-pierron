import type { Connection, PublicKey } from '@solana/web3.js';

import {
  formatBaseUnitsAsHumanTokens,
  PIERRON_STEALTH_TOKEN_DECIMALS,
} from './stealthTokenAmount.ts';

export type ClaimTxTransferSummary = {
  mint: string;
  claimerOwner: string;
  tokenAccount: string;
  rawDelta: bigint;
  uiAmount: string;
  decimals: number;
};

type TokenBalanceRow = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: {
    amount: string;
    decimals: number;
    uiAmountString?: string;
  };
};

function readTokenRows(meta: {
  preTokenBalances?: TokenBalanceRow[];
  postTokenBalances?: TokenBalanceRow[];
}): {
  pre: Map<number, TokenBalanceRow>;
  post: Map<number, TokenBalanceRow>;
} {
  const pre = new Map<number, TokenBalanceRow>();
  const post = new Map<number, TokenBalanceRow>();
  for (const row of meta.preTokenBalances ?? []) {
    pre.set(row.accountIndex, row);
  }
  for (const row of meta.postTokenBalances ?? []) {
    post.set(row.accountIndex, row);
  }
  return { pre, post };
}

/**
 * Po udanym claim: ile Token-2022 trafiło na ATA claimera (z meta transakcji).
 */
export async function summarizeClaimTokenTransferFromConfirmedTx(params: {
  connection: Connection;
  signature: string;
  claimer: PublicKey;
}): Promise<ClaimTxTransferSummary | null> {
  const tx = await params.connection.getTransaction(params.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx?.meta || tx.meta.err) {
    return null;
  }

  const claimerB58 = params.claimer.toBase58();
  const { pre, post } = readTokenRows(tx.meta);
  let best: ClaimTxTransferSummary | null = null;

  for (const [index, postRow] of post) {
    if (postRow.owner !== claimerB58 || !postRow.uiTokenAmount) {
      continue;
    }
    const preRow = pre.get(index);
    const postAmt = BigInt(postRow.uiTokenAmount.amount);
    const preAmt = preRow?.uiTokenAmount
      ? BigInt(preRow.uiTokenAmount.amount)
      : 0n;
    const delta = postAmt - preAmt;
    if (delta <= 0n) {
      continue;
    }
    const decimals = postRow.uiTokenAmount.decimals;
    const ui = formatBaseUnitsAsHumanTokens(delta, decimals);
    const accountKeys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta.loadedAddresses,
    });
    const tokenAccount = accountKeys.get(index)?.toBase58() ?? `#${index}`;
    const candidate: ClaimTxTransferSummary = {
      mint: postRow.mint,
      claimerOwner: claimerB58,
      tokenAccount,
      rawDelta: delta,
      uiAmount: ui,
      decimals,
    };
    if (!best || candidate.rawDelta > best.rawDelta) {
      best = candidate;
    }
  }

  return best;
}

export function formatClaimTxTransferSummaryForUser(
  summary: ClaimTxTransferSummary
): string {
  const human =
    summary.decimals === PIERRON_STEALTH_TOKEN_DECIMALS
      ? summary.uiAmount
      : formatBaseUnitsAsHumanTokens(summary.rawDelta, summary.decimals);
  return [
    `Odebrano: ${human} tokenów (${summary.rawDelta.toString()} jednostek on-chain, ${summary.decimals} miejsc po przecinku).`,
    `Mint (Token-2022): ${summary.mint}`,
    'Phantom na telefonie często nie pokazuje Token-2022 automatycznie.',
    'Ustawienia → Manage token list → Import → wklej powyższy mint (sieć Devnet).',
    `ATA odbiorcy: ${summary.tokenAccount}`,
  ].join('\n');
}
