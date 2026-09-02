import type { Connection } from "@solana/web3.js";
import type { TradeBookParticipantSnapshot } from "./tradeBookParticipant.ts";
import { LOTTERY_TICKET_PER_VOLUME } from "./tokenomicsConstants.ts";

export function dexSwapActivityFingerprint(
  row: TradeBookParticipantSnapshot | null
): string {
  if (!row) return "none";
  return [
    row.lastActivity,
    row.txsThisEpoch,
    row.txsEpoch,
    row.epochVolume,
    row.epochVolumeEpoch,
    row.activityBitmap,
    row.ticketCount,
    row.ticketEpoch,
    row.lotteryCycleVolume,
  ].join(":");
}

export function dexSwapActivityRecorded(
  before: TradeBookParticipantSnapshot | null,
  after: TradeBookParticipantSnapshot | null
): boolean {
  if (!after) return false;
  if (!before) {
    return (
      after.txsThisEpoch > 0 ||
      after.lastActivity > 0 ||
      after.ticketCount > 0 ||
      after.lotteryCycleVolume > 0
    );
  }
  if (dexSwapActivityFingerprint(before) !== dexSwapActivityFingerprint(after)) {
    return true;
  }
  return (
    after.txsThisEpoch > before.txsThisEpoch ||
    after.lastActivity > before.lastActivity ||
    after.ticketCount > before.ticketCount ||
    after.lotteryCycleVolume > before.lotteryCycleVolume ||
    after.epochVolume > before.epochVolume
  );
}

/** Minimum gross swap volume (base units) that should earn at least one lottery ticket. */
export function dexSwapVolumeWarrantsTickets(grossBaseUnits: bigint): boolean {
  return grossBaseUnits >= BigInt(LOTTERY_TICKET_PER_VOLUME);
}

export function dexSwapTicketsRecorded(
  before: TradeBookParticipantSnapshot | null,
  after: TradeBookParticipantSnapshot | null,
  options?: { minGrossBaseUnits?: bigint }
): boolean {
  if (!after) return false;
  const minGross = options?.minGrossBaseUnits ?? 0n;
  if (minGross > 0n && !dexSwapVolumeWarrantsTickets(minGross)) {
    return true;
  }
  if (!before) {
    return (
      after.ticketCount > 0 ||
      after.lotteryCycleVolume >= Number(LOTTERY_TICKET_PER_VOLUME)
    );
  }
  const sameCycle = after.lotteryCycleStart === before.lotteryCycleStart;
  const ticketVolume = Number(LOTTERY_TICKET_PER_VOLUME);
  const beforeDerived = sameCycle
    ? Math.floor(before.lotteryCycleVolume / ticketVolume)
    : 0;
  const afterDerived = Math.floor(
    after.lotteryCycleVolume / ticketVolume
  );
  // Activity/epoch volume alone is not proof of lottery progress. Accept either the
  // authoritative ticket counter or a newly crossed ticket-volume threshold; the latter
  // tolerates RPC index lag without crediting a swap to an unrelated window.
  return (
    after.ticketCount > (sameCycle ? before.ticketCount : 0) ||
    afterDerived > beforeDerived
  );
}

export function dexSwapLedgerEffectsRecorded(
  before: TradeBookParticipantSnapshot | null,
  after: TradeBookParticipantSnapshot | null,
  options?: { minGrossBaseUnits?: bigint }
): boolean {
  if (!dexSwapActivityRecorded(before, after)) {
    return false;
  }
  return dexSwapTicketsRecorded(before, after, options);
}

function signatureLooksConfirmed(status: {
  err: unknown;
  confirmationStatus?: string | null;
  confirmations?: number | null;
}): boolean {
  if (status.err) return false;
  return (
    status.confirmationStatus === "confirmed" ||
    status.confirmationStatus === "finalized" ||
    (status.confirmations != null && status.confirmations > 0)
  );
}

/** Public devnet RPC often lacks getTransaction archive — use signature statuses instead. */
export async function assertConfirmedTransactionsSucceeded(
  connection: Connection,
  signatures: string[],
  options?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 75_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1500;
  const start = Date.now();

  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i]!;
    let lastErr: unknown = new Error("brak statusu RPC");

    while (Date.now() - start < timeoutMs) {
      const statuses = await connection.getSignatureStatuses([sig], {
        searchTransactionHistory: true,
      });
      const status = statuses.value[0];
      if (status) {
        if (status.err) {
          let detail = JSON.stringify(status.err);
          try {
            const tx = await connection.getTransaction(sig, {
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0,
            });
            const logs = (tx?.meta?.logMessages ?? []).slice(-8).join(" | ");
            if (logs) detail += ` — ${logs}`;
          } catch {
            /* optional */
          }
          throw new Error(
            `Tx ${i + 1}/${signatures.length} (${sig.slice(0, 8)}…) failed on-chain: ${detail}`
          );
        }
        if (signatureLooksConfirmed(status)) {
          lastErr = null;
          break;
        }
        lastErr = new Error("oczekuje na potwierdzenie");
      } else {
        lastErr = new Error("brak statusu RPC");
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    if (lastErr) {
      throw new Error(
        `Tx ${i + 1}/${signatures.length} (${sig.slice(0, 8)}…) niepotwierdzona: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
      );
    }
  }
}

/** True when every signature is confirmed without on-chain error (best-effort). */
export async function allSignaturesConfirmed(
  connection: Connection,
  signatures: string[]
): Promise<boolean> {
  if (signatures.length === 0) return false;
  const statuses = await connection.getSignatureStatuses(signatures, {
    searchTransactionHistory: true,
  });
  for (let i = 0; i < signatures.length; i++) {
    const status = statuses.value[i];
    if (!status || status.err || !signatureLooksConfirmed(status)) {
      return false;
    }
  }
  return true;
}

export async function pollDexSwapActivityRecorded(
  fetchAfter: () => Promise<TradeBookParticipantSnapshot | null>,
  before: TradeBookParticipantSnapshot | null,
  attempts = 12,
  options?: { minGrossBaseUnits?: bigint; requireTickets?: boolean }
): Promise<TradeBookParticipantSnapshot | null> {
  let after = before;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const delay = attempt < 3 ? 250 : attempt < 6 ? 450 : 800;
      await new Promise((r) => setTimeout(r, delay));
    }
    after = await fetchAfter().catch(() => null);
    const recorded = options?.requireTickets
      ? dexSwapLedgerEffectsRecorded(before, after, options)
      : dexSwapActivityRecorded(before, after);
    if (recorded) {
      return after;
    }
  }
  return after;
}

/** Quick ticket-only polls after activity is already visible (RPC index lag). */
export async function pollDexSwapTicketsRecorded(
  fetchAfter: () => Promise<TradeBookParticipantSnapshot | null>,
  before: TradeBookParticipantSnapshot | null,
  options?: { minGrossBaseUnits?: bigint },
  attempts = 5
): Promise<TradeBookParticipantSnapshot | null> {
  let after: TradeBookParticipantSnapshot | null = before;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, attempt < 2 ? 200 : 400));
    }
    after = await fetchAfter().catch(() => null);
    if (dexSwapTicketsRecorded(before, after, options)) {
      return after;
    }
  }
  return after;
}
