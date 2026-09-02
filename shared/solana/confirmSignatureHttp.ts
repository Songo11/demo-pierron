import type { Connection, TransactionSignature } from '@solana/web3.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function signatureMeetsConfirmation(
  status: {
    err: unknown;
    confirmationStatus?: string | null;
    confirmations?: number | null;
  },
  minConfirmation: 'processed' | 'confirmed'
): boolean {
  if (status.err) return false;
  const processed =
    status.confirmationStatus === 'processed' ||
    status.confirmationStatus === 'confirmed' ||
    status.confirmationStatus === 'finalized' ||
    (status.confirmations != null && status.confirmations >= 0);
  const confirmed =
    status.confirmationStatus === 'confirmed' ||
    status.confirmationStatus === 'finalized' ||
    (status.confirmations != null && status.confirmations > 0);
  return minConfirmation === 'processed' ? processed : confirmed;
}

/**
 * HTTP polling confirmation — never opens Solana web3.js WebSocket.
 * Cloudflare Workers / many mobile RPC proxies reject WSS and LogBox shows
 * `ws error: undefined` from Connection#_wsOnError.
 */
export async function confirmSignatureViaHttp(
  connection: Connection,
  signature: TransactionSignature,
  options?: {
    timeoutMs?: number;
    gracePeriodMs?: number;
    minConfirmation?: 'processed' | 'confirmed';
  }
): Promise<{ ok: true } | { ok: false; err: unknown } | { ok: false; timedOut: true }> {
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const gracePeriodMs = options?.gracePeriodMs ?? 20_000;
  const minConfirmation = options?.minConfirmation ?? 'confirmed';

  const pollOnce = async (
    searchHistory = false
  ): Promise<'ok' | 'fail' | 'pending' | { fail: unknown }> => {
    try {
      const statuses = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: searchHistory,
      });
      const status = statuses.value[0];
      if (!status) return 'pending';
      if (status.err) return { fail: status.err };
      if (signatureMeetsConfirmation(status, minConfirmation)) return 'ok';
      return 'pending';
    } catch {
      return 'pending';
    }
  };

  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    const result = await pollOnce();
    if (result === 'ok') return { ok: true };
    if (typeof result === 'object' && 'fail' in result) {
      return { ok: false, err: result.fail };
    }
    attempt += 1;
    await sleep(attempt < 10 ? 250 : attempt < 20 ? 400 : 700);
  }

  const graceStart = Date.now();
  let useHistory = false;
  while (Date.now() - graceStart < gracePeriodMs) {
    if (Date.now() - graceStart > gracePeriodMs / 2) useHistory = true;
    const result = await pollOnce(useHistory);
    if (result === 'ok') return { ok: true };
    if (typeof result === 'object' && 'fail' in result) {
      return { ok: false, err: result.fail };
    }
    await sleep(500);
  }

  return { ok: false, timedOut: true };
}
