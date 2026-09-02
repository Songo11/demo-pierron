import { PublicKey } from "@solana/web3.js";
import { deriveTradeBookPda } from "./resolveTransferHookAccounts.ts";
import type { SupportedCluster } from "../core/programIds.ts";

export type TradeBookParticipantSnapshot = {
  owner: PublicKey;
  lastActivity: number;
  txsThisEpoch: number;
  txsEpoch: number;
  epochVolume: number;
  epochVolumeEpoch: number;
  activeEpochsCount: number;
  activityBitmap: number;
  activityCycleEpoch: number;
  lastActiveEpoch: number;
  ticketStart: number;
  ticketCount: number;
  ticketEpoch: number;
  lotteryCycleVolume: number;
  lotteryCycleStart: number;
  eligibleForRedistribution: boolean;
  redistributionClaimCount: number;
  lastClaimTime: number;
  lastClaimedCycle: number;
  unclaimedRedistributionCycleStart: number;
  unclaimedActiveEpochs: number;
  unclaimedActivityBitmap: number;
  initialized: boolean;
  initializedAt: number;
  /** On-chain `created_at` — age gate for redistribution (not `initialized_at`). */
  createdAt: number;
  /** Official DEX tax not yet collected by `collect_dex_redistribution_tax`. */
  pendingDexTax: number;
};

type TradeBookEntryLike = {
  owner: PublicKey;
  lastActivity?: number | { toNumber?: () => number };
  last_activity?: number | { toNumber?: () => number };
  txsThisEpoch?: number;
  txs_this_epoch?: number;
  txsEpoch?: number | { toNumber?: () => number };
  txs_epoch?: number | { toNumber?: () => number };
  epochVolume?: number | { toNumber?: () => number };
  epoch_volume?: number | { toNumber?: () => number };
  epochVolumeEpoch?: number | { toNumber?: () => number };
  epoch_volume_epoch?: number | { toNumber?: () => number };
  activeEpochsCount?: number;
  active_epochs_count?: number;
  activityBitmap?: number;
  activity_bitmap?: number;
  activityCycleEpoch?: number | { toNumber?: () => number };
  activity_cycle_epoch?: number | { toNumber?: () => number };
  lastActiveEpoch?: number | { toNumber?: () => number };
  last_active_epoch?: number | { toNumber?: () => number };
  ticketCount?: number | { toNumber?: () => number };
  ticket_count?: number | { toNumber?: () => number };
  ticketStart?: number | { toNumber?: () => number };
  ticket_start?: number | { toNumber?: () => number };
  ticketEpoch?: number | { toNumber?: () => number };
  ticket_epoch?: number | { toNumber?: () => number };
  lotteryCycleVolume?: number | { toNumber?: () => number };
  lottery_cycle_volume?: number | { toNumber?: () => number };
  lotteryCycleStart?: number | { toNumber?: () => number };
  lottery_cycle_start?: number | { toNumber?: () => number };
  eligibleForRedistribution?: boolean;
  eligible_for_redistribution?: boolean;
  redistributionClaimCount?: number | { toNumber?: () => number };
  redistribution_claim_count?: number | { toNumber?: () => number };
  lastClaimTime?: number | { toNumber?: () => number };
  last_claim_time?: number | { toNumber?: () => number };
  lastClaimedCycle?: number | { toNumber?: () => number };
  last_claimed_cycle?: number | { toNumber?: () => number };
  initializedAt?: number | { toNumber?: () => number };
  initialized_at?: number | { toNumber?: () => number };
  createdAt?: number | { toNumber?: () => number };
  created_at?: number | { toNumber?: () => number };
  pendingDexTax?: number | { toNumber?: () => number };
  pending_dex_tax?: number | { toNumber?: () => number };
};

function toNum(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value && "toNumber" in value) {
    const maybe = (value as { toNumber?: () => number }).toNumber;
    if (typeof maybe === "function") {
      const n = maybe.call(value);
      return Number.isFinite(n) ? n : fallback;
    }
  }
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readEntry(entry: TradeBookEntryLike): TradeBookParticipantSnapshot {
  return {
    owner: entry.owner,
    lastActivity: toNum(entry.lastActivity ?? entry.last_activity),
    txsThisEpoch: toNum(entry.txsThisEpoch ?? entry.txs_this_epoch),
    txsEpoch: toNum(entry.txsEpoch ?? entry.txs_epoch, -1),
    epochVolume: toNum(entry.epochVolume ?? entry.epoch_volume),
    epochVolumeEpoch: toNum(entry.epochVolumeEpoch ?? entry.epoch_volume_epoch, -1),
    activeEpochsCount: toNum(entry.activeEpochsCount ?? entry.active_epochs_count),
    activityBitmap: toNum(entry.activityBitmap ?? entry.activity_bitmap),
    activityCycleEpoch: toNum(entry.activityCycleEpoch ?? entry.activity_cycle_epoch, -1),
    lastActiveEpoch: toNum(entry.lastActiveEpoch ?? entry.last_active_epoch, -1),
    ticketStart: toNum(entry.ticketStart ?? entry.ticket_start),
    ticketCount: toNum(entry.ticketCount ?? entry.ticket_count),
    ticketEpoch: toNum(entry.ticketEpoch ?? entry.ticket_epoch, -1),
    lotteryCycleVolume: toNum(entry.lotteryCycleVolume ?? entry.lottery_cycle_volume),
    lotteryCycleStart: toNum(entry.lotteryCycleStart ?? entry.lottery_cycle_start, -1),
    eligibleForRedistribution: Boolean(
      entry.eligibleForRedistribution ?? entry.eligible_for_redistribution
    ),
    redistributionClaimCount: toNum(
      entry.redistributionClaimCount ?? entry.redistribution_claim_count
    ),
    lastClaimTime: toNum(entry.lastClaimTime ?? entry.last_claim_time),
    lastClaimedCycle: toNum(entry.lastClaimedCycle ?? entry.last_claimed_cycle, -1),
    unclaimedRedistributionCycleStart: toNum(
      entry.unclaimedRedistributionCycleStart ?? entry.unclaimed_redistribution_cycle_start,
      -1
    ),
    unclaimedActiveEpochs: toNum(entry.unclaimedActiveEpochs ?? entry.unclaimed_active_epochs),
    unclaimedActivityBitmap: toNum(
      entry.unclaimedActivityBitmap ?? entry.unclaimed_activity_bitmap
    ),
    initialized: toNum(entry.initializedAt ?? entry.initialized_at) !== 0,
    initializedAt: toNum(entry.initializedAt ?? entry.initialized_at),
    createdAt: toNum(
      entry.createdAt ?? entry.created_at ?? entry.initializedAt ?? entry.initialized_at
    ),
    pendingDexTax: toNum(entry.pendingDexTax ?? entry.pending_dex_tax),
  };
}

function participantFreshness(entry: TradeBookEntryLike): bigint {
  const lastActivity = toNum(entry.lastActivity ?? entry.last_activity);
  const txsEpoch = toNum(entry.txsEpoch ?? entry.txs_epoch, -1);
  const initializedAt = toNum(entry.initializedAt ?? entry.initialized_at);
  return (
    (BigInt(lastActivity) << 64n) |
    (BigInt(Math.max(0, txsEpoch)) << 32n) |
    BigInt(Math.max(0, initializedAt))
  );
}

/**
 * Mirrors on-chain `trade_book.entries.iter().rfind(|e| e.owner == trader)` —
 * used for swap limits, cooldown, and `assert_dex_swap_policy`.
 */
export function selectLastTradeBookEntryForOwner(
  entries: TradeBookEntryLike[],
  owner: PublicKey
): TradeBookEntryLike | undefined {
  const owner58 = owner.toBase58();
  let last: TradeBookEntryLike | undefined;
  for (const entry of entries) {
    if (!entry.owner.equals(owner) && entry.owner.toBase58() !== owner58) continue;
    last = entry;
  }
  return last;
}

/** Prefer the newest row when legacy hook validation left duplicate owners. */
export function selectBestTradeBookEntryForOwner(
  entries: TradeBookEntryLike[],
  owner: PublicKey
): TradeBookEntryLike | undefined {
  const owner58 = owner.toBase58();
  let best: TradeBookEntryLike | undefined;
  let bestScore = -1n;
  for (const entry of entries) {
    if (!entry.owner.equals(owner) && entry.owner.toBase58() !== owner58) continue;
    const score = participantFreshness(entry);
    if (!best || score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

function snapshotFreshness(row: TradeBookParticipantSnapshot): bigint {
  return (
    (BigInt(row.lastActivity) << 64n) |
    (BigInt(Math.max(0, row.txsEpoch)) << 32n) |
    BigInt(Math.max(0, row.initializedAt))
  );
}

import { readI64LE, readU64LE } from "../solana/browserSafeBuffer.ts";

/** On-disk Anchor `TradeBookEntry` size (borsh), including trailing `pending_dex_tax`. */
export const TRADE_BOOK_ENTRY_RAW_SIZE = 197;

/** TradeBook account: 8 disc + 32 mint + 1 bump + 4 vec len. */
export const TRADE_BOOK_ACCOUNT_HEADER_SIZE = 8 + 32 + 1 + 4;

function u16LE(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

function u32LE(data: Uint8Array, offset: number): number {
  return (
    (data[offset]! |
      (data[offset + 1]! << 8) |
      (data[offset + 2]! << 16) |
      (data[offset + 3]! << 24)) >>>
    0
  );
}

function asBytes(rawData: Buffer | Uint8Array): Uint8Array {
  return rawData instanceof Uint8Array
    ? rawData
    : new Uint8Array(rawData);
}

function tradeBookVecEntryCount(data: Uint8Array): number {
  if (data.length < TRADE_BOOK_ACCOUNT_HEADER_SIZE) return 0;
  const vecLen = u32LE(data, 8 + 32 + 1);
  const maxBySize = Math.floor(
    (data.length - TRADE_BOOK_ACCOUNT_HEADER_SIZE) / TRADE_BOOK_ENTRY_RAW_SIZE
  );
  return Math.min(vecLen, Math.max(0, maxBySize));
}

function readRawTradeBookEntryAt(
  data: Uint8Array,
  offset: number
): TradeBookParticipantSnapshot | null {
  if (offset + TRADE_BOOK_ENTRY_RAW_SIZE > data.length) return null;
  // DataView helpers — do not rely on Buffer.readBig* (often missing under Next).
  const initializedAt = Number(readI64LE(data, offset + 74));
  if (initializedAt <= 0) return null;
  const txsEpoch = Number(readI64LE(data, offset + 50));
  // Nie odrzucaj wierszy z txs_epoch < 0 — claimy redystrybucji mogą być na koncie
  // bez oficjalnego DEX swapu w tej epoce; filtr fałszywie zerował limity w mobilce.
  const owner = new PublicKey(data.subarray(offset, offset + 32));
  const createdAt = Number(readI64LE(data, offset + 82));
  return {
    owner,
    lastActivity: Number(readU64LE(data, offset + 40)),
    txsThisEpoch: u16LE(data, offset + 48),
    txsEpoch,
    epochVolume: Number(readU64LE(data, offset + 58)),
    epochVolumeEpoch: Number(readI64LE(data, offset + 66)),
    activeEpochsCount: data[offset + 143]!,
    activityBitmap: u32LE(data, offset + 131),
    activityCycleEpoch: Number(readI64LE(data, offset + 135)),
    lastActiveEpoch: Number(readI64LE(data, offset + 90)),
    ticketStart: Number(readU64LE(data, offset + 98)),
    ticketCount: Number(readU64LE(data, offset + 106)),
    ticketEpoch: Number(readI64LE(data, offset + 114)),
    lotteryCycleVolume: Number(readU64LE(data, offset + 160)),
    lotteryCycleStart: Number(readI64LE(data, offset + 168)),
    eligibleForRedistribution: data[offset + 130]! !== 0,
    redistributionClaimCount: Number(readU64LE(data, offset + 122)),
    lastClaimTime: Number(readI64LE(data, offset + 152)),
    lastClaimedCycle: Number(readI64LE(data, offset + 144)),
    unclaimedRedistributionCycleStart: Number(readI64LE(data, offset + 176)),
    unclaimedActiveEpochs: data[offset + 184]!,
    unclaimedActivityBitmap: u32LE(data, offset + 185),
    pendingDexTax: Number(readU64LE(data, offset + 189)),
    initialized: true,
    initializedAt,
    createdAt: createdAt > 0 ? createdAt : initializedAt,
  };
}

/** Decode all aligned trade-book rows from raw account bytes. */
export function scanAllRawTradeBookEntries(
  rawData: Buffer | Uint8Array
): TradeBookParticipantSnapshot[] {
  const data = asBytes(rawData);
  const out: TradeBookParticipantSnapshot[] = [];
  const entryCount = tradeBookVecEntryCount(data);
  for (let i = 0; i < entryCount; i++) {
    const offset =
      TRADE_BOOK_ACCOUNT_HEADER_SIZE + i * TRADE_BOOK_ENTRY_RAW_SIZE;
    const row = readRawTradeBookEntryAt(data, offset);
    if (row) out.push(row);
  }
  return out;
}

/** Scan raw account bytes for duplicate owner rows (legacy hook double-write). */
export function scanRawTradeBookRowsForOwner(
  rawData: Buffer | Uint8Array,
  owner: PublicKey
): TradeBookParticipantSnapshot[] {
  const owner58 = owner.toBase58();
  return scanAllRawTradeBookEntries(rawData).filter(
    (row) => row.owner.toBase58() === owner58
  );
}

/** Last raw row for owner — approximates on-chain `rfind` when Anchor decode works. */
export function scanRawTradeBookLastRowForOwner(
  rawData: Buffer | Uint8Array,
  owner: PublicKey
): TradeBookParticipantSnapshot | null {
  const rows = scanRawTradeBookRowsForOwner(rawData, owner);
  return rows.length > 0 ? rows[rows.length - 1]! : null;
}

function pickBestParticipantSnapshot(
  rows: TradeBookParticipantSnapshot[]
): TradeBookParticipantSnapshot | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) =>
    snapshotFreshness(row) > snapshotFreshness(best) ? row : best
  );
}

/** Official DEX activity lives in the mint trade book (not `user_trade_state`). */
export async function fetchTradeBookParticipant(params: {
  program: {
    account: {
      tradeBook: {
        fetch: (pda: PublicKey) => Promise<{ entries: TradeBookEntryLike[] }>;
      };
    };
  };
  mint: PublicKey;
  owner: PublicKey;
  programId: PublicKey;
  cluster?: SupportedCluster;
  connection?: {
    getAccountInfo: (
      pk: PublicKey
    ) => Promise<{ data: Buffer | Uint8Array } | null>;
  };
}): Promise<TradeBookParticipantSnapshot | null> {
  const tradeBookPda = deriveTradeBookPda(
    params.mint,
    params.programId,
    params.cluster
  );
  const rows: TradeBookParticipantSnapshot[] = [];

  // Prefer a single raw getAccountInfo — Anchor+raw double-fetch was ~2× RPC latency
  // on every ecosystem load. Raw scan is the source of truth for the Ecosystem window.
  if (params.connection) {
    const info = await params.connection.getAccountInfo(tradeBookPda).catch(() => null);
    if (info?.data) {
      try {
        rows.push(...scanRawTradeBookRowsForOwner(info.data, params.owner));
      } catch {
        // fall through
      }
    }
    return pickBestParticipantSnapshot(rows);
  }

  const book = await params.program.account.tradeBook
    .fetch(tradeBookPda)
    .catch(() => null);
  if (book) {
    try {
      const anchorEntry = selectBestTradeBookEntryForOwner(book.entries, params.owner);
      if (anchorEntry) rows.push(readEntry(anchorEntry));
    } catch {
      // Fall through.
    }
  }
  return pickBestParticipantSnapshot(rows);
}

/** Raw-byte only — one RPC, no Anchor decode (mobile swap prep hot path). */
export async function fetchTradeBookParticipantForDexPolicyFast(params: {
  mint: PublicKey;
  owner: PublicKey;
  programId: PublicKey;
  cluster?: SupportedCluster;
  connection: {
    getAccountInfo: (
      pk: PublicKey
    ) => Promise<{ data: Buffer | Uint8Array } | null>;
  };
}): Promise<TradeBookParticipantSnapshot | null> {
  const tradeBookPda = deriveTradeBookPda(
    params.mint,
    params.programId,
    params.cluster
  );
  try {
    const info = await params.connection.getAccountInfo(tradeBookPda);
    if (!info?.data) return null;
    const rows = scanRawTradeBookRowsForOwner(info.data, params.owner);
    if (rows.length === 0) return null;
    // On-chain DEX używa rfind (ostatni), ale przy duplikatach limity/claimy
    // muszą brać też najświeższy wiersz — inaczej mobilka pokazywała zaniżony tier.
    const last = rows[rows.length - 1]!;
    const best = pickBestParticipantSnapshot(rows) ?? last;
    const maxClaims = rows.reduce(
      (m, r) => Math.max(m, r.redistributionClaimCount),
      0
    );
    return {
      ...best,
      // Cooldown: najświeższa aktywność z dowolnego wiersza / last.
      lastActivity: Math.max(best.lastActivity, last.lastActivity),
      redistributionClaimCount: Math.max(
        best.redistributionClaimCount,
        last.redistributionClaimCount,
        maxClaims
      ),
    };
  } catch {
    return null;
  }
}

/** Trade-book row used by on-chain DEX policy (`rfind` semantics, not freshness). */
export async function fetchTradeBookParticipantForDexPolicy(params: {
  program: {
    account: {
      tradeBook: {
        fetch: (pda: PublicKey) => Promise<{ entries: TradeBookEntryLike[] }>;
      };
    };
  };
  mint: PublicKey;
  owner: PublicKey;
  programId: PublicKey;
  cluster?: SupportedCluster;
  connection?: {
    getAccountInfo: (
      pk: PublicKey
    ) => Promise<{ data: Buffer | Uint8Array } | null>;
  };
}): Promise<TradeBookParticipantSnapshot | null> {
  const tradeBookPda = deriveTradeBookPda(
    params.mint,
    params.programId,
    params.cluster
  );

  const anchorPromise = params.program.account.tradeBook
    .fetch(tradeBookPda)
    .catch(() => null);
  const rawPromise = params.connection
    ? params.connection.getAccountInfo(tradeBookPda).catch(() => null)
    : Promise.resolve(null);

  const [book, info] = await Promise.all([anchorPromise, rawPromise]);

  if (book) {
    try {
      const anchorEntry = selectLastTradeBookEntryForOwner(book.entries, params.owner);
      if (anchorEntry) return readEntry(anchorEntry);
    } catch {
      // Fall through to raw-byte scan.
    }
  }

  if (info?.data) {
    try {
      return scanRawTradeBookLastRowForOwner(info.data, params.owner);
    } catch {
      // Best-effort only.
    }
  }

  return null;
}

const MAX_PLAUSIBLE_TICKET_COUNT = 50;

export function isPlausibleTradeBookParticipant(
  row: Pick<
    TradeBookParticipantSnapshot,
    "ticketCount" | "lotteryCycleStart" | "initializedAt"
  >
): boolean {
  return (
    row.initializedAt > 0 &&
    row.ticketCount >= 0 &&
    row.ticketCount <= MAX_PLAUSIBLE_TICKET_COUNT &&
    row.lotteryCycleStart >= 0 &&
    row.lotteryCycleStart < 10_000_000
  );
}

/** Sum ticket_count for all trade-book rows in the active lottery cycle. */
export function sumTradeBookTicketsInLotteryCycle(
  rows: Array<
    Pick<
      TradeBookParticipantSnapshot,
      "ticketCount" | "lotteryCycleStart" | "initializedAt" | "owner"
    >
  >,
  cycleStart: number,
  cycleFloor: number
): number {
  let sum = 0;
  for (const row of rows) {
    if (!isPlausibleTradeBookParticipant(row)) continue;
    if (row.ticketCount <= 0) continue;
    if (row.lotteryCycleStart !== cycleStart) continue;
    // Pending draw from prior redistribution cycle (cycleStart < cycleFloor).
    if (cycleStart >= cycleFloor && row.lotteryCycleStart < cycleFloor) continue;
    sum += row.ticketCount;
  }
  return sum;
}

/** Global lottery pool size from trade-book rows (ignores stale on-chain total_tickets desync). */
export async function fetchTradeBookLotteryCycleTicketTotal(params: {
  program: {
    account: {
      tradeBook: {
        fetch: (pda: PublicKey) => Promise<{ entries: TradeBookEntryLike[] }>;
      };
    };
  };
  mint: PublicKey;
  programId: PublicKey;
  cluster?: SupportedCluster;
  connection: {
    getAccountInfo: (
      pk: PublicKey
    ) => Promise<{ data: Buffer | Uint8Array } | null>;
  };
  cycleStart: number;
  cycleFloor: number;
}): Promise<number> {
  if (params.cycleStart < 0) return 0;
  const tradeBookPda = deriveTradeBookPda(
    params.mint,
    params.programId,
    params.cluster
  );
  const rows: TradeBookParticipantSnapshot[] = [];
  try {
    const book = await params.program.account.tradeBook.fetch(tradeBookPda);
    for (const entry of book.entries) {
      rows.push(readEntry(entry));
    }
  } catch {
    // Fall through to raw-byte scan below.
  }
  try {
    const info = await params.connection.getAccountInfo(tradeBookPda);
    if (info?.data) {
      const seen = new Set<string>();
      for (const row of rows) seen.add(row.owner.toBase58());
      for (const row of scanAllRawTradeBookEntries(info.data)) {
        const key = row.owner.toBase58();
        if (seen.has(key)) continue;
        rows.push(row);
        seen.add(key);
      }
    }
  } catch {
    // Best-effort only.
  }
  return sumTradeBookTicketsInLotteryCycle(rows, params.cycleStart, params.cycleFloor);
}
