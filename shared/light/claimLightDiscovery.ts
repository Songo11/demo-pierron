import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { deriveCompressedAddressFromAddressTreeAccountData } from '../core/lightAddressDerivation.ts';
import { getAddressMerkleTreeAccountHeader } from './addressMerkleTreeAccount.ts';
import {
  getPierronStealthProgramId,
  PIERRON_STEALTH_PROGRAM_ID,
  type SupportedCluster,
} from '../core/programIds.ts';
import {
  resolveLightLocalRuntimeConfig,
  type LightLocalRuntimeConfig,
  type PartialLightLocalRuntimeConfig,
} from './lightLocalRuntime.ts';
import { LOCALNET_LIGHT_ACCOUNTS } from './lightCanonicalConfig.ts';
import { fetchLiveNewPaymentAddress } from './lightLiveLocalClient.ts';
import {
  tryDecodeStealthMetaFromPhotonNormalizeInput,
  tryDecodeStealthPaymentFromPhotonNormalizeInput,
} from './lightLiveLocalNormalization.ts';
import {
  discoveryHashForPhotonRpc,
  discoveryHashesForPhotonRpc,
} from './discoveryHashRpc.ts';
import { createBN254, createRpc } from './statelessSdk.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

type JsonRpcParams = unknown[] | Record<string, unknown>;

type LightIndexerRpc = {
  getCompressedAccount: (
    address?: PublicKey | unknown,
    hash?: unknown
  ) => Promise<unknown | null>;
  getCompressedAccountsByOwner: (
    owner: PublicKey,
    config?: { limit?: number }
  ) => Promise<unknown>;
};

function choosePhotonBaseUrl(runtime: LightLocalRuntimeConfig): string {
  return runtime.photonUrl ?? runtime.indexerUrl ?? runtime.rpcUrl;
}

function createLightIndexerRpc(runtime: LightLocalRuntimeConfig): LightIndexerRpc {
  const indexer = runtime.indexerUrl ?? runtime.photonUrl ?? runtime.rpcUrl;
  const prover = runtime.proverUrl ?? runtime.rpcUrl;
  return createRpc(runtime.rpcUrl, indexer, prover) as LightIndexerRpc;
}

const PHOTON_HASH_BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;

function normalizeDiscoveryHash(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (BN.isBN(value)) {
    try {
      return discoveryHashForPhotonRpc(value.toString(10));
    } catch {
      return null;
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed) && trimmed.length >= 8) {
      try {
        return discoveryHashForPhotonRpc(trimmed);
      } catch {
        return trimmed;
      }
    }
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length >= 16) {
      return trimmed.toLowerCase();
    }
    if (PHOTON_HASH_BASE58.test(trimmed)) {
      return trimmed;
    }
    return trimmed.length >= 16 ? trimmed : null;
  }

  if (value instanceof Uint8Array) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value).toString('hex');
    }
    return Array.from(value)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  if (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 255
    )
  ) {
    return normalizeDiscoveryHash(Uint8Array.from(value));
  }

  if (typeof value === 'object' && value !== null) {
    const toStringFn = (value as { toString?: unknown }).toString;
    if (typeof toStringFn === 'function') {
      try {
        const rendered = String(toStringFn.call(value)).trim();
        if (rendered.length >= 16 && !rendered.startsWith('[object')) {
          return normalizeDiscoveryHash(rendered);
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}

function extractCompressedAccountHash(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const direct =
    value.hash ??
    value.accountHash ??
    (isRecord(value.compressedAccount) ? value.compressedAccount.hash : undefined) ??
    (isRecord(value.compressed_account) ? value.compressed_account.hash : undefined);

  const fromDirect = normalizeDiscoveryHash(direct);
  if (fromDirect) {
    return fromDirect;
  }

  const nested = value.value ?? value.account;
  if (nested != null && nested !== value) {
    return extractCompressedAccountHash(nested);
  }

  return null;
}

function extractCompressedAccountAddress(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const direct = value.address;
  if (typeof direct === 'string' && direct.length > 0) {
    try {
      return new PublicKey(direct).toBase58();
    } catch {
      return direct;
    }
  }

  const nested = value.value ?? value.account ?? value.compressedAccount;
  if (nested != null && nested !== value) {
    return extractCompressedAccountAddress(nested);
  }

  return null;
}

function firstNonEmptyArray(
  result: unknown,
  paths: Array<Array<string>>
): unknown[] {
  if (!isRecord(result)) {
    return Array.isArray(result) ? result : [];
  }

  for (const path of paths) {
    let cursor: unknown = result;
    for (const key of path) {
      if (!isRecord(cursor)) {
        cursor = undefined;
        break;
      }
      cursor = cursor[key];
    }
    if (Array.isArray(cursor) && cursor.length > 0) {
      return cursor;
    }
  }

  return [];
}

const BASE58_ALPHABET = /^[1-9A-HJ-NP-Za-km-z]+$/;

function collectBase58Strings(value: unknown, depth = 0, out = new Set<string>()): Set<string> {
  if (value == null || depth > 8) {
    return out;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length >= 32 && trimmed.length <= 64 && BASE58_ALPHABET.test(trimmed)) {
      try {
        out.add(new PublicKey(trimmed).toBase58());
      } catch {
        // skip
      }
    }
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectBase58Strings(item, depth + 1, out);
    }
    return out;
  }

  if (isRecord(value)) {
    for (const inner of Object.values(value)) {
      collectBase58Strings(inner, depth + 1, out);
    }
  }

  return out;
}

function rawContainsBase58(value: unknown, target: string): boolean {
  return collectBase58Strings(value).has(target);
}

function extractNewAddressProofEntry(raw: unknown): {
  address: string | null;
  hash: string | null;
} {
  const unwrap = (node: unknown): unknown => {
    if (isRecord(node) && node.value !== undefined) {
      return unwrap(node.value);
    }
    return node;
  };

  const value = unwrap(isRecord(raw) && 'value' in raw ? (raw as { value?: unknown }).value : raw);
  const entries: unknown[] = Array.isArray(value)
    ? value
    : isRecord(value)
      ? [value]
      : isRecord(raw)
        ? [raw]
        : [];
  if (entries.length === 0) {
    return { address: null, hash: null };
  }
  const first = entries[0];
  if (!isRecord(first)) {
    return { address: null, hash: null };
  }
  const address =
    typeof first.address === 'string' && first.address.length > 0
      ? new PublicKey(first.address).toBase58()
      : null;

  const hashFromProofLeaf = (): string | null => {
    const mp = first.merkleProofHashedIndexedElementLeaf;
    if (Array.isArray(mp) && mp.length > 0) {
      const leaf = mp[mp.length - 1];
      const fromLeaf = normalizeDiscoveryHash(leaf);
      if (fromLeaf) {
        return fromLeaf;
      }
    }
    return normalizeDiscoveryHash(
      first.indexHashedIndexedElementLeaf ?? first.index_hashed_indexed_element_leaf
    );
  };

  const hash = normalizeDiscoveryHash(
    first.hash ??
      first.accountHash ??
      first.leafHash ??
      (isRecord(first.compressedAccount)
        ? first.compressedAccount.hash
        : undefined) ??
      first.indexHashedIndexedElementLeaf ??
      first['indexHashedIndexedElementLeaf']
  );

  const hashFinal =
    hash ??
    hashFromProofLeaf() ??
    extractHashFromNewAddressProofRecordDeep(first);

  return { address, hash: hashFinal };
}

function extractHashFromNewAddressProofRecordDeep(
  record: Record<string, unknown>
): string | null {
  const candidates: string[] = [];

  const push = (value: unknown) => {
    const h = normalizeDiscoveryHash(value);
    if (h) {
      candidates.push(h);
    }
  };

  push(record.indexHashedIndexedElementLeaf);
  push(record.index_hashed_indexed_element_leaf);
  push(record.hash);
  push(record.accountHash);
  push(record.leafHash);

  const mp = record.merkleProofHashedIndexedElementLeaf;
  if (Array.isArray(mp)) {
    for (const leaf of mp) {
      push(leaf);
    }
    if (mp.length > 0) {
      push(mp[mp.length - 1]);
    }
  }

  const treeInfo = record.treeInfo;
  if (isRecord(treeInfo)) {
    push(treeInfo.hash);
  }

  for (const key of ['value', 'leaf', 'proof', 'compressedAccount'] as const) {
    const nested = record[key];
    if (isRecord(nested)) {
      push(nested.hash);
      push((nested as { accountHash?: unknown }).accountHash);
    }
  }

  const unique = Array.from(new Set(candidates));
  return unique.sort((a, b) => b.length - a.length)[0] ?? null;
}

async function waitForPaymentHashAtAddress(
  address: PublicKey,
  runtime: LightLocalRuntimeConfig,
  rpc: LightIndexerRpc | undefined,
  attempts: number,
  delayMs: number
): Promise<string | null> {
  for (let i = 0; i < attempts; i += 1) {
    const h = await fetchPhotonCompressedAccountHash(address, runtime, rpc);
    if (h) {
      return h;
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

type StatelessPaymentLeaf = {
  derivedAddress: PublicKey;
  hash: string | null;
  notes: string[];
};

async function fetchPaymentLeafViaStatelessSdk(params: {
  runtime: LightLocalRuntimeConfig;
  lightAddressSeed: Uint8Array;
  stealthAddressFallback: PublicKey;
  cluster?: SupportedCluster;
}): Promise<StatelessPaymentLeaf> {
  const notes: string[] = [];
  const addressTree = new PublicKey(
    params.runtime.addressTreePubkey ?? LOCALNET_LIGHT_ACCOUNTS.addressTree.toBase58()
  );

  let derivedBytes: Uint8Array;
  try {
    const connection = new Connection(params.runtime.rpcUrl, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: true,
    });
    const treeAccount = await getAddressMerkleTreeAccountHeader(
      connection,
      addressTree,
      'confirmed'
    );
    if (!treeAccount?.data) {
      throw new Error(`brak danych address tree ${addressTree.toBase58()}`);
    }
    derivedBytes = deriveCompressedAddressFromAddressTreeAccountData(
      params.lightAddressSeed,
      addressTree,
      PIERRON_STEALTH_PROGRAM_ID,
      new Uint8Array(treeAccount.data)
    );
  } catch (error) {
    notes.push(
      `stateless derive: ${String((error as Error)?.message ?? error).slice(0, 120)}`
    );
    return {
      derivedAddress: params.stealthAddressFallback,
      hash: null,
      notes,
    };
  }

  const derivedAddress = new PublicKey(derivedBytes);
  notes.push(`stateless derived: ${derivedAddress.toBase58()}`);

  try {
    const indexer =
      params.runtime.indexerUrl ?? params.runtime.photonUrl ?? params.runtime.rpcUrl;
    const prover = params.runtime.proverUrl ?? params.runtime.rpcUrl;
    const rpc = createRpc(params.runtime.rpcUrl, indexer, prover) as {
      getMultipleNewAddressProofs: (inputs: unknown[]) => Promise<unknown[]>;
    };
    const proofs = await rpc.getMultipleNewAddressProofs([
      createBN254(derivedBytes),
    ]);
    const first = Array.isArray(proofs) && proofs.length > 0 ? proofs[0] : null;
    if (isRecord(first)) {
      const hash = extractHashFromNewAddressProofRecordDeep(first);
      if (hash) {
        notes.push('stateless getMultipleNewAddressProofs: hash OK');
        return { derivedAddress, hash, notes };
      }
      notes.push('stateless getMultipleNewAddressProofs: brak hasha w pierwszym wpisie');
    }
  } catch (error) {
    notes.push(
      `stateless proof: ${String((error as Error)?.message ?? error).slice(0, 120)}`
    );
  }

  return { derivedAddress, hash: null, notes };
}

function pushNoteOnce(notes: string[], note: string) {
  if (!notes.includes(note)) {
    notes.push(note);
  }
}

function normalizeAmountForMatch(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  try {
    const s = String(value).trim();
    if (!s) {
      return null;
    }
    return BigInt(s).toString();
  } catch {
    return null;
  }
}

/** Powiadomienie vs on-chain: ta sama wartość w różnych skalach (np. 10016 vs 10016000000 przy 6 miejsc). */
function amountsMatchForClaim(expected?: string, rowAmount?: string): boolean {
  const a = normalizeAmountForMatch(expected);
  const b = normalizeAmountForMatch(rowAmount);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  try {
    const ae = BigInt(a);
    const be = BigInt(b);
    if (ae === be) {
      return true;
    }
    for (const decimals of [0, 3, 6, 9, 18] as const) {
      const mul = 10n ** BigInt(decimals);
      if (ae * mul === be || ae === be * mul) {
        return true;
      }
    }
    if (ae > 0n && be > 0n && (ae * 1000n === be || ae === be * 1000n)) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function formatAmountMatchDiagnostics(
  rows: UnclaimedPaymentRow[],
  expected?: string
): string {
  const expectedNorm = normalizeAmountForMatch(expected);
  if (!expectedNorm || rows.length === 0) {
    return '';
  }
  const matching = rows.filter((r) =>
    amountsMatchForClaim(expected, r.amount)
  );
  if (matching.length > 0) {
    return `w indeksie jest ${matching.length} nieodebrane z kwotą ${expectedNorm}`;
  }
  try {
    const exp = BigInt(expectedNorm);
    const near = rows
      .filter((r) => {
        if (!r.amount) {
          return false;
        }
        const ra = BigInt(r.amount);
        if (ra === 0n || exp === 0n) {
          return false;
        }
        const ratio = ra > exp ? ra / exp : exp / ra;
        return ratio >= 2n && ratio <= 1_000_000_000n;
      })
      .slice(0, 5)
      .map((r) => `${r.amount}@${r.stealthAddress.slice(0, 8)}…`);
    if (near.length > 0) {
      return `brak kwoty ${expectedNorm}; najbliższe w indeksie: ${near.join(', ')}`;
    }
  } catch {
    // ignore
  }
  return `brak kwoty ${expectedNorm} wśród ${rows.length} nieodebranych w programie`;
}

type UnclaimedPaymentRow = {
  hash: string;
  stealthAddress: string;
  photonAddress?: string;
  amount?: string;
  senderHash?: string;
  createdAt: bigint;
  intendedClaimer?: string;
};

function filterRowsBySenderHash(
  rows: UnclaimedPaymentRow[],
  expectedSenderHash?: string
): UnclaimedPaymentRow[] {
  const norm = normalizeAmountForMatch(expectedSenderHash);
  if (!norm) {
    return rows;
  }
  const filtered = rows.filter((r) => r.senderHash === norm);
  return filtered.length > 0 ? filtered : rows;
}

function pickUnclaimedPaymentForClaim(params: {
  rows: UnclaimedPaymentRow[];
  stealthB58: string;
  indexedPaymentAddressB58?: string;
  alternateStealthB58s?: string[];
  expectedAmount?: string;
  /** Z powiadomienia send — rozróżnia 30+ starych nieodebranych na devnet. */
  expectedSenderHash?: string;
}): { row: UnclaimedPaymentRow; note: string } | null {
  const targets = new Set(
    [
      params.stealthB58,
      params.indexedPaymentAddressB58,
      ...(params.alternateStealthB58s ?? []),
    ].filter((v): v is string => !!v && v.length > 0)
  );

  let rows = filterRowsBySenderHash(params.rows, params.expectedSenderHash);
  const senderHashNote =
    params.expectedSenderHash && rows.length < params.rows.length
      ? ` (filtr senderHash=${params.expectedSenderHash})`
      : '';

  for (const target of targets) {
    const match = rows.find((r) => r.stealthAddress === target || r.photonAddress === target);
    if (match) {
      return {
        row: match,
        note: `payment: nieodebrane @ ${match.stealthAddress} (dopasowanie adresu ${target})${senderHashNote}`,
      };
    }
  }

  const expectedAmt = normalizeAmountForMatch(params.expectedAmount);
  if (expectedAmt) {
    const byAmount = rows.filter((r) =>
      amountsMatchForClaim(params.expectedAmount, r.amount)
    );
    if (byAmount.length === 1) {
      const only = byAmount[0]!;
      return {
        row: only,
        note: `payment: jedyne nieodebrane z kwotą ${expectedAmt} @ ${only.stealthAddress}${senderHashNote}`,
      };
    }
    if (byAmount.length > 1) {
      const newest = byAmount.reduce((best, cur) =>
        cur.createdAt > best.createdAt ? cur : best
      );
      return {
        row: newest,
        note: `payment: najnowsze nieodebrane z kwotą ${expectedAmt} (${byAmount.length} kandydatów) @ ${newest.stealthAddress}${senderHashNote}`,
      };
    }
  }

  if (params.rows.length === 1) {
    const only = params.rows[0]!;
    return {
      row: only,
      note: `payment: jedyne nieodebrane konto programu @ ${only.stealthAddress}`,
    };
  }

  // Po filtrze claimer/senderHash — często zostaje 1 leaf (Samsung), mimo 10+ starych Sony.
  if (rows.length === 1) {
    const only = rows[0]!;
    return {
      row: only,
      note: `payment: jedyne nieodebrane po filtrze @ ${only.stealthAddress}${senderHashNote}`,
    };
  }

  return null;
}

function scanProgramItemsForClaimHints(params: {
  items: Array<{ hash: string | null; address: string | null; raw: unknown }>;
  metaOwner: PublicKey;
  stealthB58: string;
  /** Adres z getMultipleNewAddressProofs — nadrzędny wybór płatności przy wielu nieodebranych */
  indexedPaymentAddressB58?: string;
  /** Adresy z stateless derive / proof (gdy ≠ powiadomienie). */
  alternateStealthB58s?: string[];
  /** Kwota z powiadomienia — wybór najnowszego nieodebranego przy wielu starych sendach. */
  expectedAmount?: string;
  expectedSenderHash?: string;
  /** Filtr intended_claimer — bez tego skan bierze stare sendy Sony przy claimie Samsunga. */
  intendedClaimer?: PublicKey;
}): {
  metaHash: string | null;
  paymentHash: string | null;
  resolvedStealthAddress?: PublicKey;
  claimerHint?: PublicKey;
  notes: string[];
} {
  const notes: string[] = [];
  let metaHash: string | null = null;
  let paymentHash: string | null = null;
  let resolvedStealthAddress: PublicKey | undefined;
  let claimerHint: PublicKey | undefined;
  const unclaimedPayments: UnclaimedPaymentRow[] = [];
  const proofAddr = params.indexedPaymentAddressB58?.trim();
  const paymentAddressTargets = new Set(
    [
      params.stealthB58,
      proofAddr,
      ...(params.alternateStealthB58s ?? []),
    ].filter((v): v is string => !!v && v.length > 0)
  );

  for (const item of params.items) {
    if (
      !paymentHash &&
      item.hash &&
      item.address &&
      paymentAddressTargets.has(item.address)
    ) {
      paymentHash = item.hash;
      try {
        resolvedStealthAddress = new PublicKey(params.stealthB58);
      } catch {
        // skip
      }
      pushNoteOnce(
        notes,
        `payment: Photon item.address = ${item.address}`
      );
    }

    const decodedMeta = tryDecodeStealthMetaFromPhotonNormalizeInput(item.raw);
    if (
      decodedMeta &&
      decodedMeta.owner.equals(params.metaOwner) &&
      item.hash &&
      !metaHash
    ) {
      metaHash = item.hash;
      if (item.address) {
        try {
          claimerHint = new PublicKey(item.address);
          pushNoteOnce(
            notes,
            `meta: StealthMeta dla owner @ ${item.address}`
          );
        } catch {
          // skip
        }
      }
    }

    const decodedPayment = tryDecodeStealthPaymentFromPhotonNormalizeInput(item.raw);
    if (decodedPayment && item.hash) {
      const paymentAddr = decodedPayment.stealthAddress.toBase58();
      const claimerOk =
        !params.intendedClaimer ||
        decodedPayment.intendedClaimer.equals(params.intendedClaimer);
      if (!decodedPayment.claimed && claimerOk) {
        unclaimedPayments.push({
          hash: item.hash,
          stealthAddress: paymentAddr,
          photonAddress: item.address ?? undefined,
          amount: normalizeAmountForMatch(decodedPayment.amount) ?? undefined,
          senderHash: normalizeAmountForMatch(decodedPayment.senderHash) ?? undefined,
          createdAt: decodedPayment.createdAt,
          intendedClaimer: decodedPayment.intendedClaimer.toBase58(),
        });
      }
      if (claimerOk && paymentAddr === params.stealthB58) {
        paymentHash = item.hash;
        resolvedStealthAddress = decodedPayment.stealthAddress;
        pushNoteOnce(notes, 'payment: StealthPayment (adres z powiadomienia)');
      }
    }

    if (!paymentHash && item.hash && rawContainsBase58(item.raw, params.stealthB58)) {
      paymentHash = item.hash;
      try {
        resolvedStealthAddress = new PublicKey(params.stealthB58);
      } catch {
        // skip
      }
      pushNoteOnce(notes, 'payment: dopasowanie base58 w surowym wpisie Photon');
    }

    if (
      proofAddr &&
      item.hash &&
      !paymentHash &&
      (item.address === proofAddr || rawContainsBase58(item.raw, proofAddr))
    ) {
      paymentHash = item.hash;
      try {
        resolvedStealthAddress = new PublicKey(proofAddr);
      } catch {
        // skip
      }
      pushNoteOnce(notes, `payment: dopasowany do adresu newAddressProof @ ${proofAddr}`);
    }
  }

  if (!paymentHash && proofAddr && unclaimedPayments.length > 0) {
    const byProof = unclaimedPayments.find((p) => p.stealthAddress === proofAddr);
    if (byProof) {
      paymentHash = byProof.hash;
      resolvedStealthAddress = new PublicKey(proofAddr);
      pushNoteOnce(
        notes,
        `payment: nieodebrane konto wg newAddressProof @ ${proofAddr}`
      );
    }
  }

  if (!paymentHash && unclaimedPayments.length > 0) {
    if (unclaimedPayments.length > 3) {
      pushNoteOnce(
        notes,
        `payment: ${unclaimedPayments.length} nieodebrane w programie (stare sendy z nieudanych claimów — normalne na devnet)`
      );
    }
    const picked = pickUnclaimedPaymentForClaim({
      rows: unclaimedPayments,
      stealthB58: params.stealthB58,
      indexedPaymentAddressB58: proofAddr,
      alternateStealthB58s: params.alternateStealthB58s,
      expectedAmount: params.expectedAmount,
      expectedSenderHash: params.expectedSenderHash,
    });
    if (picked) {
      paymentHash = picked.row.hash;
      try {
        resolvedStealthAddress = new PublicKey(picked.row.stealthAddress);
      } catch {
        // skip
      }
      pushNoteOnce(notes, picked.note);
    } else if (unclaimedPayments.length > 0) {
      const sample = unclaimedPayments
        .slice(0, 3)
        .map((p) => `${p.stealthAddress}${p.amount ? ` amt=${p.amount}` : ''}`)
        .join(', ');
      const amountDiag = formatAmountMatchDiagnostics(
        unclaimedPayments,
        params.expectedAmount
      );
      pushNoteOnce(
        notes,
        `payment: ${unclaimedPayments.length} nieodebrane (np. ${sample}) — brak dopasowania do ${params.stealthB58}${params.expectedAmount ? ` / kwota ${params.expectedAmount}` : ''}${amountDiag ? `; ${amountDiag}` : ''}; send mógł nie dojść on-chain lub Photon jeszcze nie zindeksował`
      );
    }
  }

  if (
    !paymentHash &&
    proofAddr &&
    params.expectedSenderHash &&
    unclaimedPayments.length > 0
  ) {
    const filtered = filterRowsBySenderHash(
      unclaimedPayments,
      params.expectedSenderHash
    );
    if (filtered.length === 1) {
      const only = filtered[0]!;
      paymentHash = only.hash;
      try {
        resolvedStealthAddress = new PublicKey(
          only.photonAddress ?? only.stealthAddress
        );
      } catch {
        // skip
      }
      pushNoteOnce(
        notes,
        `payment: jedyne nieodebrane z senderHash z powiadomienia @ ${only.stealthAddress}`
      );
    }
  }

  return {
    metaHash,
    paymentHash,
    resolvedStealthAddress,
    claimerHint,
    notes,
  };
}

function mapOwnerItems(result: unknown): Array<{
  hash: string | null;
  address: string | null;
  raw: unknown;
}> {
  const items = firstNonEmptyArray(result, [
    ['items'],
    ['value', 'items'],
    ['value', 'accounts'],
    ['accounts'],
    ['value', 'value', 'items'],
  ]);

  return items.map((item) => {
    const account =
      isRecord(item) && isRecord(item.account) ? item.account : item;
    return {
      hash: extractCompressedAccountHash(account ?? item),
      address: extractCompressedAccountAddress(account ?? item),
      raw: item,
    };
  });
}

async function postPhotonRpc(
  baseUrl: string,
  method: string,
  params: JsonRpcParams
): Promise<unknown> {
  const url = baseUrl.replace(/\/+$/, '');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Photon ${method} HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message?: string; code?: number };
  };

  if (payload.error) {
    throw new Error(
      payload.error.message ??
        `Photon ${method} RPC error${payload.error.code != null ? ` (${payload.error.code})` : ''}`
    );
  }

  return payload.result;
}

async function postPhotonRpcWithCandidates(
  baseUrl: string,
  method: string,
  candidates: JsonRpcParams[]
): Promise<unknown> {
  const errors: string[] = [];

  for (const params of candidates) {
    try {
      return await postPhotonRpc(baseUrl, method, params);
    } catch (error) {
      errors.push(String((error as Error)?.message ?? error));
    }
  }

  throw new Error(
    `${method} failed (${baseUrl}): ${errors.slice(0, 3).join(' | ') || 'unknown'}`
  );
}

function buildOwnerCandidates(owner: string): JsonRpcParams[] {
  return [
    [owner],
    [{ owner }],
    [{ owner, limit: 50 }],
    [{ owner, limit: 250 }],
    [{ owner, limit: 500 }],
  ];
}

function extractPaginationCursor(pageResult: unknown): string | undefined {
  if (!isRecord(pageResult)) {
    return undefined;
  }
  if (typeof pageResult.cursor === 'string' && pageResult.cursor.length > 0) {
    return pageResult.cursor;
  }
  const inner = pageResult.value;
  if (isRecord(inner) && typeof inner.cursor === 'string' && inner.cursor.length > 0) {
    return inner.cursor;
  }
  return undefined;
}

function buildCompressedAccountCandidates(address: string): JsonRpcParams[] {
  return [[address], [{ address }], [{ hash: address }]];
}

async function fetchPaymentHashViaSdk(
  rpc: LightIndexerRpc,
  stealthAddress: PublicKey
): Promise<string | null> {
  try {
    const account = await rpc.getCompressedAccount(stealthAddress);
    return extractCompressedAccountHash(account);
  } catch {
    return null;
  }
}

async function fetchOwnerItemsViaSdk(
  rpc: LightIndexerRpc,
  owner: PublicKey
): Promise<Array<{ hash: string | null; address: string | null; raw: unknown }>> {
  try {
    const merged: Array<{ hash: string | null; address: string | null; raw: unknown }> =
      [];
    let cursor: string | undefined;
    const pageLimit = new BN(100);

    for (let page = 0; page < 12; page += 1) {
      const cfg: Record<string, unknown> = { limit: pageLimit };
      if (cursor) {
        cfg.cursor = cursor;
      }
      const pageResult = await rpc.getCompressedAccountsByOwner(owner, cfg as never);
      const rows = mapOwnerItems(pageResult);
      merged.push(...rows);

      if (rows.length === 0) {
        break;
      }

      const next = extractPaginationCursor(pageResult);
      if (!next) {
        break;
      }
      cursor = next;
      if (merged.length >= 2500) {
        break;
      }
    }

    return merged;
  } catch {
    return [];
  }
}

async function fetchPhotonLeafHashViaAccountProof(
  addressB58: string,
  runtime: LightLocalRuntimeConfig
): Promise<string | null> {
  const baseUrl = choosePhotonBaseUrl(runtime);
  const variants: JsonRpcParams[] = [[addressB58], [{ address: addressB58 }]];
  for (const rpcParams of variants) {
    try {
      const result = await postPhotonRpc(baseUrl, 'getCompressedAccountProof', rpcParams);
      const h =
        extractCompressedAccountHash(result) ??
        extractCompressedAccountHash(isRecord(result) ? result.value : null);
      if (h) {
        return h;
      }
    } catch {
      // try next variant
    }
  }
  return null;
}

function normalizePaymentDiscoveryHash(hash: string | null): string | null {
  if (!hash) {
    return null;
  }
  try {
    return discoveryHashForPhotonRpc(hash);
  } catch {
    return hash.trim().length > 0 ? hash.trim() : null;
  }
}

async function fetchPhotonCompressedAccountHashByDiscoveryHash(
  hash: string,
  runtime: LightLocalRuntimeConfig,
  rpc?: LightIndexerRpc
): Promise<string | null> {
  const rpcHash = normalizePaymentDiscoveryHash(hash);
  if (!rpcHash) {
    return null;
  }

  const baseUrl = choosePhotonBaseUrl(runtime);
  try {
    const result = await postPhotonRpcWithCandidates(
      baseUrl,
      'getCompressedAccount',
      [[rpcHash], [{ hash: rpcHash }]]
    );
    const fromAccount = extractCompressedAccountHash(result);
    if (fromAccount) {
      return normalizePaymentDiscoveryHash(fromAccount);
    }
  } catch {
    // ignore
  }

  if (rpc) {
    try {
      const account = await rpc.getCompressedAccount(undefined, rpcHash);
      const fromSdk = extractCompressedAccountHash(account);
      if (fromSdk) {
        return normalizePaymentDiscoveryHash(fromSdk);
      }
    } catch {
      // ignore
    }
  }

  return rpcHash;
}

async function fetchPhotonCompressedAccountHash(
  address: PublicKey,
  runtime: LightLocalRuntimeConfig,
  rpc?: LightIndexerRpc
): Promise<string | null> {
  const b58 = address.toBase58();

  try {
    const fromProof = await fetchPhotonLeafHashViaAccountProof(b58, runtime);
    if (fromProof) {
      return normalizePaymentDiscoveryHash(fromProof);
    }
  } catch {
    // fall through
  }

  if (rpc) {
    const fromSdk = await fetchPaymentHashViaSdk(rpc, address);
    if (fromSdk) {
      return normalizePaymentDiscoveryHash(fromSdk);
    }
  }

  const baseUrl = choosePhotonBaseUrl(runtime);

  try {
    const result = await postPhotonRpcWithCandidates(
      baseUrl,
      'getCompressedAccount',
      buildCompressedAccountCandidates(b58)
    );
    const fromAccount = extractCompressedAccountHash(result);
    if (fromAccount) {
      return normalizePaymentDiscoveryHash(fromAccount);
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Hash płatności z newAddressProof / stateless — często dostępny zanim Photon zindeksuje konto pod adresem.
 */
async function bootstrapPaymentHashFromSendProof(params: {
  stealthAddress: PublicKey;
  metaOwner: PublicKey;
  sendProofOwner?: PublicKey;
  lightAddressSeed?: Uint8Array;
  runtime: LightLocalRuntimeConfig;
  cluster?: SupportedCluster;
}): Promise<{
  hash: string | null;
  address: PublicKey;
  notes: string[];
}> {
  const notes: string[] = [];
  let address = params.stealthAddress;
  let hash: string | null = null;
  const probeB58 = new Set<string>([params.stealthAddress.toBase58()]);

  if (params.lightAddressSeed) {
    const statelessLeaf = await fetchPaymentLeafViaStatelessSdk({
      runtime: params.runtime,
      lightAddressSeed: params.lightAddressSeed,
      stealthAddressFallback: params.stealthAddress,
      cluster: params.cluster,
    });
    notes.push(...statelessLeaf.notes);
    probeB58.add(statelessLeaf.derivedAddress.toBase58());
    if (statelessLeaf.hash) {
      hash = statelessLeaf.hash;
      address = statelessLeaf.derivedAddress;
      notes.push('bootstrap: hash ze stateless newAddressProof');
    }
  }

  if (params.sendProofOwner || params.lightAddressSeed) {
    try {
      const resolved = await resolveIndexedSendPaymentAddress({
        preparedStealthAddress: params.stealthAddress,
        proofOwner: params.sendProofOwner ?? params.metaOwner,
        metaOwner: params.metaOwner,
        lightAddressSeed: params.lightAddressSeed,
        runtime: params.runtime,
        cluster: params.cluster,
      });
      notes.push(...resolved.notes);
      address = resolved.address;
      probeB58.add(resolved.address.toBase58());
      if (resolved.proofHash) {
        hash = resolved.proofHash;
        notes.push('bootstrap: hash z resolveIndexedSendPaymentAddress');
      }
    } catch (error) {
      notes.push(
        `bootstrap resolveIndexed: ${String((error as Error)?.message ?? error).slice(0, 120)}`
      );
    }
  }

  try {
    const newPaymentRaw = await fetchLiveNewPaymentAddress({
      runtime: params.runtime,
      request: {
        stealthAddress: params.stealthAddress,
        metaOwner: params.metaOwner,
        owner: params.sendProofOwner ?? params.metaOwner,
        lightAddressSeed: params.lightAddressSeed,
        lightAddressSeedBytes: params.lightAddressSeed,
        cluster: params.cluster,
      },
    });
    const proofEnvelope =
      isRecord(newPaymentRaw) && 'raw' in newPaymentRaw
        ? (newPaymentRaw as { raw?: unknown }).raw
        : newPaymentRaw;
    const proofEntry = extractNewAddressProofEntry(proofEnvelope);
    if (proofEntry.address) {
      address = new PublicKey(proofEntry.address);
      probeB58.add(proofEntry.address);
    }
    if (proofEntry.hash) {
      hash = normalizePaymentDiscoveryHash(proofEntry.hash);
      notes.push('bootstrap: hash z fetchLiveNewPaymentAddress');
    }
  } catch (error) {
    notes.push(
      `bootstrap newAddressProof: ${String((error as Error)?.message ?? error).slice(0, 120)}`
    );
  }

  if (!hash) {
    for (const b58 of probeB58) {
      try {
        const fromProof = await fetchPhotonLeafHashViaAccountProof(b58, params.runtime);
        if (fromProof) {
          hash = fromProof;
          address = new PublicKey(b58);
          notes.push(`bootstrap: hash z getCompressedAccountProof @ ${b58}`);
          break;
        }
      } catch {
        // try next
      }
    }
  }

  return { hash, address, notes };
}

async function fetchPhotonCompressedAccountsByOwner(
  owner: PublicKey,
  runtime: LightLocalRuntimeConfig,
  rpc?: LightIndexerRpc
): Promise<Array<{ hash: string | null; address: string | null; raw: unknown }>> {
  if (rpc) {
    const fromSdk = await fetchOwnerItemsViaSdk(rpc, owner);
    if (fromSdk.length > 0) {
      return fromSdk;
    }
  }

  const baseUrl = choosePhotonBaseUrl(runtime);

  try {
    const result = await postPhotonRpcWithCandidates(
      baseUrl,
      'getCompressedAccountsByOwner',
      buildOwnerCandidates(owner.toBase58())
    );
    return mapOwnerItems(result);
  } catch {
    return [];
  }
}

/** Po send na Sony — czy Photon widzi skompresowaną płatność pod adresem. */
export async function probeSendPaymentPhotonIndex(params: {
  paymentAddress: PublicKey;
  runtime?: PartialLightLocalRuntimeConfig;
  cluster?: SupportedCluster;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<{ hash: string | null; attempts: number }> {
  const resolved = resolveLightLocalRuntimeConfig(params.runtime);
  const rpc = createLightIndexerRpc(resolved);
  const maxAttempts = params.maxAttempts ?? 15;
  const delayMs = params.delayMs ?? 3000;

  for (let i = 0; i < maxAttempts; i += 1) {
    const hash = await fetchPhotonCompressedAccountHash(
      params.paymentAddress,
      resolved,
      rpc
    );
    if (hash) {
      return { hash, attempts: i + 1 };
    }
    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { hash: null, attempts: maxAttempts };
}

export type ClaimLightBundleHints = {
  claimValidityProofSourceHashes: string[];
  claimerHintCompressedAddress?: PublicKey;
  /** Gdy Photon indeksuje inną skompresowaną płatność niż adres z powiadomienia. */
  resolvedStealthAddress?: PublicKey;
  notes: string[];
};

/**
 * Devnet claim: Photon musi zindeksować StealthMeta odbiorcy + konto płatności (stealthAddress).
 * Bez hashy inclusion `getValidityProof` / claim bundle pada na build.
 */
export async function discoverClaimLightBundleHints(params: {
  metaOwner: PublicKey;
  stealthAddress: PublicKey;
  /** Z register bundle (role=address) — Photon indeksuje meta pod tym adresem, nie pod pubkey portfela. */
  registerCompressedAddress?: PublicKey;
  /** Seed z send (powiadomienie) — dokładniejsze getMultipleNewAddressProofs. */
  lightAddressSeed?: Uint8Array;
  /** Pubkey nadawcy send (z powiadomienia) — devnet newAddressProof. */
  sendProofOwner?: PublicKey;
  /** Kwota z powiadomienia — rozróżnia najnowszy send od starych nieodebranych. */
  expectedPaymentAmount?: string;
  /** senderHash z powiadomienia / prepare send — filtr przy 30+ nieodebranych na devnet. */
  expectedSenderHash?: string;
  /** Claimer (portfel) — filtr StealthPayment.intended_claimer przy skanie programu. */
  intendedClaimer?: PublicKey;
  /**
   * Adresy stealth z countUnclaimedStealthPaymentsForClaimer — gdy seed/powiadomienie
   * nie zgadza się z leafem on-chain, claim i tak trafia w płatność claimera.
   */
  preferredPaymentAddresses?: string[];
  runtime?: PartialLightLocalRuntimeConfig;
  cluster?: SupportedCluster;
  maxAttempts?: number;
  delayMs?: number;
  /** Szybsze przygotowanie lokalne — bez paginacji całego programu stealth. */
  skipProgramScan?: boolean;
  /**
   * Po fail-fast „płatność już w Photon” nie spalaj 14×2.5s na złym adresie z powiadomienia.
   */
  skipLongPaymentWait?: boolean;
  /** Ponowne `runHeavyDiscoveryOnce` w pętli poll (domyślnie 1 — unika 8+ min timeout). */
  maxHeavyRediscoveryRuns?: number;
}): Promise<ClaimLightBundleHints> {
  const hasSeed = params.lightAddressSeed && params.lightAddressSeed.length === 32;
  // Bez seeda nie ma sensu 36× poll (kilka minut) — fail-fast, UI wymaga powiadomienia ze seedem.
  if (!hasSeed) {
    const notes: string[] = [
      'powiadomienie bez lightAddressSeedHex (32 B) — nie uruchamiam długiego poll Photon',
      'na nadawcy: Send OK → QR/schowek ze seedem (nie sam prepare)',
    ];
    return {
      claimValidityProofSourceHashes: [],
      notes,
      claimerHintCompressedAddress: params.registerCompressedAddress,
      resolvedStealthAddress: undefined,
    };
  }
  const maxAttempts =
    params.maxAttempts ??
    (params.cluster === 'devnet' ? 10 : 12);
  const delayMs = params.delayMs ?? (params.cluster === 'devnet' ? 2000 : 1500);
  const maxHeavyRediscoveryRuns =
    params.maxHeavyRediscoveryRuns ?? 1;
  const notes: string[] = [];
  const stealthB58 = params.stealthAddress.toBase58();
  const resolved = resolveLightLocalRuntimeConfig(params.runtime);
  const photonBase = choosePhotonBaseUrl(resolved);
  const rpc = createLightIndexerRpc(resolved);

  notes.push(`photon: ${photonBase}`);

  if (
    params.cluster === 'devnet' &&
    !photonBase.includes('helius-rpc.com') &&
    photonBase.includes('api.devnet.solana.com')
  ) {
    notes.push(
      'devnet: publiczny RPC nie indeksuje ZK compression — Ustawienia → Helius API key (ten sam co na nadawcy).'
    );
  }

  let paymentHash: string | null = null;
  let metaHash: string | null = null;
  let resolvedStealthAddress: PublicKey | undefined;
  let claimerHint: PublicKey | undefined = params.registerCompressedAddress;
  let lastOwnerScanCount = 0;
  let lastProgramScanCount = 0;
  let indexedProofAddressB58: string | undefined;
  const alternateStealthB58s: string[] = [];
  const paymentCandidateB58 = new Set<string>([stealthB58]);

  for (const preferred of params.preferredPaymentAddresses ?? []) {
    if (!preferred) {
      continue;
    }
    paymentCandidateB58.add(preferred);
    if (preferred !== stealthB58 && !alternateStealthB58s.includes(preferred)) {
      alternateStealthB58s.push(preferred);
    }
  }
  if ((params.preferredPaymentAddresses?.length ?? 0) > 0) {
    pushNoteOnce(
      notes,
      `preferowane adresy płatności claimera: ${params.preferredPaymentAddresses!.slice(0, 3).join(', ')}`
    );
  }

  const tryAssignMetaHash = (hash: string | null, note?: string): boolean => {
    if (!hash) {
      return false;
    }
    if (paymentHash && hash === paymentHash) {
      pushNoteOnce(
        notes,
        'pominięto hash meta — identyczny z hashem płatności (szukam osobnych kont)'
      );
      return false;
    }
    metaHash = hash;
    if (note) {
      pushNoteOnce(notes, note);
    }
    return true;
  };

  const tryAssignPaymentHash = (
    hash: string | null,
    resolved?: PublicKey,
    note?: string
  ): boolean => {
    const normalized = normalizePaymentDiscoveryHash(hash);
    if (!normalized) {
      return false;
    }
    if (metaHash && normalized === metaHash) {
      return false;
    }
    if (claimerHint && resolved?.equals(claimerHint)) {
      return false;
    }
    // Fail-fast już znalazł leaf claimera — nie bierz „płatności” z losowego seed/derive.
    const preferred = params.preferredPaymentAddresses ?? [];
    if (
      preferred.length > 0 &&
      resolved &&
      !preferred.includes(resolved.toBase58())
    ) {
      pushNoteOnce(
        notes,
        `pominięto payment @ ${resolved.toBase58()} — nie jest leafem claimera (preferowane: ${preferred[0]})`
      );
      return false;
    }
    paymentHash = normalized;
    if (resolved) {
      resolvedStealthAddress = resolved;
    }
    if (note) {
      pushNoteOnce(notes, note);
    }
    return true;
  };

  if (claimerHint) {
    pushNoteOnce(notes, `registerCompressedAddress: ${claimerHint.toBase58()}`);
    const h = await fetchPhotonCompressedAccountHash(claimerHint, resolved, rpc);
    tryAssignMetaHash(h, 'meta hash ze zapisanego adresu register');
  }

  // Płatność już widoczna w Photon dla claimera — nie czekaj na (często zły) adres z powiadomienia.
  for (const preferred of params.preferredPaymentAddresses ?? []) {
    if (paymentHash) {
      break;
    }
    try {
      const pk = new PublicKey(preferred);
      const h = await fetchPhotonCompressedAccountHash(pk, resolved, rpc);
      tryAssignPaymentHash(
        h,
        pk,
        `payment hash z preferowanego adresu claimera @ ${preferred}`
      );
    } catch {
      // ignore invalid preferred
    }
  }

  {
    const boot = await bootstrapPaymentHashFromSendProof({
      stealthAddress: params.stealthAddress,
      metaOwner: params.metaOwner,
      sendProofOwner: params.sendProofOwner,
      lightAddressSeed: params.lightAddressSeed,
      runtime: resolved,
      cluster: params.cluster,
    });
    for (const note of boot.notes) {
      pushNoteOnce(notes, note);
    }
    paymentCandidateB58.add(boot.address.toBase58());
    if (!boot.address.equals(params.stealthAddress)) {
      indexedProofAddressB58 = boot.address.toBase58();
    }
    tryAssignPaymentHash(
      boot.hash,
      boot.address,
      'payment hash z bootstrap newAddressProof (przed skanem Photon)'
    );
  }

  if (params.lightAddressSeed) {
    const statelessEarly = await fetchPaymentLeafViaStatelessSdk({
      runtime: resolved,
      lightAddressSeed: params.lightAddressSeed,
      stealthAddressFallback: params.stealthAddress,
      cluster: params.cluster,
    });
    for (const note of statelessEarly.notes) {
      pushNoteOnce(notes, note);
    }
    const derivedB58 = statelessEarly.derivedAddress.toBase58();
    paymentCandidateB58.add(derivedB58);
    if (!statelessEarly.derivedAddress.equals(params.stealthAddress)) {
      indexedProofAddressB58 = derivedB58;
      pushNoteOnce(
        notes,
        `claim: adres ze stateless derive ${derivedB58} (powiadomienie ${stealthB58})`
      );
    }
    if (statelessEarly.hash) {
      tryAssignPaymentHash(
        statelessEarly.hash,
        statelessEarly.derivedAddress,
        'payment hash ze stateless SDK (early)'
      );
    }
  }

  if (params.sendProofOwner || params.lightAddressSeed) {
    try {
      const resolvedAddr = await resolveIndexedSendPaymentAddress({
        preparedStealthAddress: params.stealthAddress,
        proofOwner: params.sendProofOwner ?? params.metaOwner,
        metaOwner: params.metaOwner,
        lightAddressSeed: params.lightAddressSeed,
        runtime: resolved,
        cluster: params.cluster,
      });
      for (const note of resolvedAddr.notes) {
        pushNoteOnce(notes, note);
      }
      const indexedB58 = resolvedAddr.address.toBase58();
      paymentCandidateB58.add(indexedB58);
      if (!resolvedAddr.matchesPrepared) {
        indexedProofAddressB58 = indexedB58;
        pushNoteOnce(
          notes,
          `claim: adres z newAddressProof ${indexedB58} (powiadomienie ${stealthB58})`
        );
      }
      if (resolvedAddr.proofHash) {
        tryAssignPaymentHash(
          resolvedAddr.proofHash,
          resolvedAddr.address,
          'payment hash z early resolveIndexedSendPaymentAddress'
        );
      }
      const indexedHash = await fetchPhotonCompressedAccountHash(
        resolvedAddr.address,
        resolved,
        rpc
      );
      tryAssignPaymentHash(
        indexedHash,
        resolvedAddr.address,
        'payment hash z early getCompressedAccount(indexed)'
      );
    } catch (error) {
      pushNoteOnce(
        notes,
        `early newAddressProof: ${String((error as Error)?.message ?? error).slice(0, 160)}`
      );
    }
  }

  for (const b58 of paymentCandidateB58) {
    if (b58 !== stealthB58 && !alternateStealthB58s.includes(b58)) {
      alternateStealthB58s.push(b58);
    }
  }

  const stealthProgramId = getPierronStealthProgramId(
    params.cluster ?? 'devnet'
  );

  let cachedProgramItems:
    | Array<{ hash: string | null; address: string | null; raw: unknown }>
    | null = null;

  const runProgramScan = async (): Promise<void> => {
    if (!stealthProgramId || params.skipProgramScan) {
      return;
    }
    if (!cachedProgramItems) {
      cachedProgramItems = await fetchPhotonCompressedAccountsByOwner(
        stealthProgramId,
        resolved,
        rpc
      );
      lastProgramScanCount = cachedProgramItems.length;
      pushNoteOnce(
        notes,
        `skan programu stealth: ${lastProgramScanCount} kont`
      );
    }
    const scanned = scanProgramItemsForClaimHints({
      items: cachedProgramItems,
      metaOwner: params.metaOwner,
      stealthB58,
      indexedPaymentAddressB58: indexedProofAddressB58,
      alternateStealthB58s,
      expectedAmount: params.expectedPaymentAmount,
      expectedSenderHash: params.expectedSenderHash,
      intendedClaimer: params.intendedClaimer,
    });
    for (const note of scanned.notes) {
      pushNoteOnce(notes, note);
    }
    if (scanned.metaHash) {
      tryAssignMetaHash(scanned.metaHash);
    }
    if (scanned.paymentHash) {
      tryAssignPaymentHash(scanned.paymentHash, scanned.resolvedStealthAddress);
    }
    if (scanned.resolvedStealthAddress) {
      resolvedStealthAddress = scanned.resolvedStealthAddress;
    }
    if (scanned.claimerHint) {
      claimerHint = scanned.claimerHint;
    }
  };

  const probeNewAddressProof = async (): Promise<void> => {
    if (paymentHash && indexedProofAddressB58) {
      return;
    }
    try {
      const proofOwner = params.sendProofOwner ?? params.metaOwner;

      if (params.lightAddressSeed) {
        const statelessLeaf = await fetchPaymentLeafViaStatelessSdk({
          runtime: resolved,
          lightAddressSeed: params.lightAddressSeed,
          stealthAddressFallback: params.stealthAddress,
          cluster: params.cluster,
        });
        for (const note of statelessLeaf.notes) {
          pushNoteOnce(notes, note);
        }
        if (statelessLeaf.hash) {
          tryAssignPaymentHash(
            statelessLeaf.hash,
            statelessLeaf.derivedAddress,
            'payment hash ze stateless SDK (newAddressProof)'
          );
        }
        const derivedB58 = statelessLeaf.derivedAddress.toBase58();
        if (!statelessLeaf.derivedAddress.equals(params.stealthAddress)) {
          indexedProofAddressB58 = derivedB58;
          alternateStealthB58s.push(derivedB58);
          paymentCandidateB58.add(derivedB58);
        }

        const resolvedAddr = await resolveIndexedSendPaymentAddress({
          preparedStealthAddress: params.stealthAddress,
          proofOwner,
          metaOwner: params.metaOwner,
          lightAddressSeed: params.lightAddressSeed,
          runtime: resolved,
          cluster: params.cluster,
        });
        for (const note of resolvedAddr.notes) {
          pushNoteOnce(notes, note);
        }
        if (!resolvedAddr.matchesPrepared) {
          tryAssignPaymentHash(
            await fetchPhotonCompressedAccountHash(
              resolvedAddr.address,
              resolved,
              rpc
            ),
            resolvedAddr.address,
            'payment hash pod adresem z newAddressProof (resolve)'
          );
          indexedProofAddressB58 = resolvedAddr.address.toBase58();
          paymentCandidateB58.add(resolvedAddr.address.toBase58());
        }
        if (resolvedAddr.proofHash) {
          tryAssignPaymentHash(
            resolvedAddr.proofHash,
            resolvedAddr.address,
            'payment hash bezpośrednio z resolveIndexedSendPaymentAddress'
          );
        }
      }

      const newPaymentRaw = await fetchLiveNewPaymentAddress({
        runtime: resolved,
        request: {
          stealthAddress: params.stealthAddress,
          metaOwner: params.metaOwner,
          owner: proofOwner,
          payer: proofOwner,
          sender: proofOwner.toBase58(),
          cluster: params.cluster,
          lightAddressSeed: params.lightAddressSeed,
          lightAddressSeedBytes: params.lightAddressSeed,
        },
      });
      const proofEnvelope =
        isRecord(newPaymentRaw) && 'raw' in newPaymentRaw
          ? (newPaymentRaw as { raw?: unknown }).raw
          : newPaymentRaw;
      const proofEntry = extractNewAddressProofEntry(proofEnvelope);
      if (proofEntry.hash) {
        const proofHashNorm = normalizePaymentDiscoveryHash(proofEntry.hash);
        tryAssignPaymentHash(
          proofHashNorm,
          proofEntry.address ? new PublicKey(proofEntry.address) : undefined,
          'payment hash bezpośrednio z newAddressProof'
        );
        if (!paymentHash && proofHashNorm) {
          const fromHashLookup = await fetchPhotonCompressedAccountHashByDiscoveryHash(
            proofHashNorm,
            resolved,
            rpc
          );
          tryAssignPaymentHash(
            fromHashLookup ?? proofHashNorm,
            proofEntry.address ? new PublicKey(proofEntry.address) : undefined,
            'payment hash z getCompressedAccount(hash=newAddressProof)'
          );
        }
      }
      if (proofEntry.address) {
        indexedProofAddressB58 = proofEntry.address;
        paymentCandidateB58.add(proofEntry.address);
        const indexedPk = new PublicKey(proofEntry.address);
        pushNoteOnce(
          notes,
          `newAddressProof: ${indexedPk.toBase58()}${indexedPk.equals(params.stealthAddress) ? '' : ' (≠ powiadomienie)'}`
        );
        const hashForIndexed = await fetchPhotonCompressedAccountHash(
          indexedPk,
          resolved,
          rpc
        );
        tryAssignPaymentHash(
          hashForIndexed,
          indexedPk,
          'payment hash z getCompressedAccount(newAddressProof)'
        );
        if (!resolvedStealthAddress) {
          resolvedStealthAddress = indexedPk;
        }
      }
    } catch (error) {
      pushNoteOnce(
        notes,
        `newAddressProof: ${String((error as Error)?.message ?? error).slice(0, 160)}`
      );
    }
  };

  const runHeavyDiscoveryOnce = async (): Promise<void> => {
    await probeNewAddressProof();

    tryAssignPaymentHash(
      await fetchPhotonCompressedAccountHash(params.stealthAddress, resolved, rpc),
      params.stealthAddress,
      'payment hash z adresu powiadomienia'
    );

    const paymentAddrForWait = indexedProofAddressB58
      ? new PublicKey(indexedProofAddressB58)
      : params.stealthAddress;
    if (!paymentHash) {
      const waitAttempts = params.skipLongPaymentWait
        ? 1
        : params.cluster === 'devnet'
          ? params.lightAddressSeed && params.lightAddressSeed.length === 32
            ? 14
            : 30
          : 20;
      const waitDelayMs = params.skipLongPaymentWait
        ? 0
        : params.cluster === 'devnet'
          ? 2500
          : 2000;
      const waited = await waitForPaymentHashAtAddress(
        paymentAddrForWait,
        resolved,
        rpc,
        waitAttempts,
        waitDelayMs
      );
      tryAssignPaymentHash(
        waited,
        paymentAddrForWait,
        `payment hash po oczekiwaniu na indeks @ ${paymentAddrForWait.toBase58()}`
      );
    }

    if (indexedProofAddressB58) {
      tryAssignPaymentHash(
        await fetchPhotonCompressedAccountHash(
          new PublicKey(indexedProofAddressB58),
          resolved,
          rpc
        ),
        new PublicKey(indexedProofAddressB58),
        'payment hash z newAddressProof (ponowny lookup)'
      );
    }

    const scanOwnerCompressedItems = async (
      owner: PublicKey,
      label: string
    ): Promise<void> => {
      const items = await fetchPhotonCompressedAccountsByOwner(owner, resolved, rpc);
      if (label === 'metaOwner') {
        lastOwnerScanCount = items.length;
      }
      for (const item of items) {
        const decodedMeta = tryDecodeStealthMetaFromPhotonNormalizeInput(item.raw);
        if (
          decodedMeta &&
          decodedMeta.owner.equals(params.metaOwner) &&
          item.hash
        ) {
          tryAssignMetaHash(item.hash, `meta hash ze skanu ${label}`);
        }
        const ownerPaymentMatch =
          item.hash &&
          item.address &&
          (item.address === stealthB58 ||
            (indexedProofAddressB58 && item.address === indexedProofAddressB58) ||
            paymentCandidateB58.has(item.address));
        if (ownerPaymentMatch) {
          tryAssignPaymentHash(
            item.hash,
            item.address === stealthB58
              ? params.stealthAddress
              : new PublicKey(item.address),
            `payment hash ze skanu ${label}`
          );
        }
      }
    };

    await scanOwnerCompressedItems(params.metaOwner, 'metaOwner');

    if (params.sendProofOwner && !params.sendProofOwner.equals(params.metaOwner)) {
      await scanOwnerCompressedItems(params.sendProofOwner, 'nadawca send');
    }

    if (!metaHash || !paymentHash || params.intendedClaimer) {
      await runProgramScan();
    }
  };

  const pollLightweight = async (): Promise<void> => {
    const paymentTargets: PublicKey[] = [];
    for (const b58 of paymentCandidateB58) {
      try {
        paymentTargets.push(new PublicKey(b58));
      } catch {
        // skip invalid
      }
    }

    for (const pk of paymentTargets) {
      if (paymentHash) {
        break;
      }
      const h =
        (await fetchPhotonLeafHashViaAccountProof(pk.toBase58(), resolved)) ??
        (await fetchPhotonCompressedAccountHash(pk, resolved, rpc));
      tryAssignPaymentHash(h, pk, `payment hash poll @ ${pk.toBase58()}`);
    }

    if (!metaHash && claimerHint) {
      const h = await fetchPhotonCompressedAccountHash(claimerHint, resolved, rpc);
      tryAssignMetaHash(h, `meta hash poll @ ${claimerHint.toBase58()}`);
    }
  };

  await runHeavyDiscoveryOnce();

  let pollAttempts = maxAttempts;
  if (metaHash && paymentHash) {
    pollAttempts = Math.min(maxAttempts, 2);
  } else if (metaHash || paymentHash) {
    pollAttempts = Math.min(maxAttempts, 10);
  }

  let heavyRediscoveryRuns = 0;

  for (let attempt = 0; attempt < pollAttempts && (!metaHash || !paymentHash); attempt += 1) {
    await pollLightweight();
    if (metaHash && paymentHash) {
      break;
    }
    if (!paymentHash && (attempt === 0 || attempt % 3 === 2)) {
      await probeNewAddressProof();
    }
    if (!paymentHash && attempt > 0 && attempt % 4 === 3) {
      await runProgramScan();
    }
    if (
      !paymentHash &&
      attempt > 0 &&
      attempt % 10 === 9 &&
      heavyRediscoveryRuns < maxHeavyRediscoveryRuns
    ) {
      heavyRediscoveryRuns += 1;
      await runHeavyDiscoveryOnce();
    }
    if (attempt < pollAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (!paymentHash) {
    const paymentTargetB58 = indexedProofAddressB58 ?? stealthB58;
    notes.push(
      `brak hash dla płatności ${paymentTargetB58} po ${maxAttempts} próbach — poczekaj na indeks Photon po send`
    );
    if (!params.lightAddressSeed || params.lightAddressSeed.length !== 32) {
      pushNoteOnce(
        notes,
        'bez seed w powiadomieniu claim nie może wyliczyć adresu płatności — Sony: send OK → schowek z lightAddressSeedHex (nie prepare)'
      );
    }
    if (lastProgramScanCount > 0) {
      notes.push(
        `skan programu stealth: ${lastProgramScanCount} kont — brak dopasowania do ${stealthB58}`
      );
      notes.push(
        'Jeśli nadawca używa starej wersji app: ponów send i skopiuj powiadomienie PO send (adres z newAddressProof, nie tylko z prepare).'
      );
    }
  }

  if (!metaHash) {
    notes.push(
      `brak hash StealthMeta — register on-chain na odbiorcy i ponów register (wallet owner: ${params.metaOwner.toBase58()}, skan portfela: ${lastOwnerScanCount})`
    );
  }

  if (metaHash && paymentHash && metaHash === paymentHash) {
    paymentHash = null;
    resolvedStealthAddress = undefined;
    pushNoteOnce(
      notes,
      `meta i płatność miały ten sam hash @ ${claimerHint?.toBase58() ?? stealthB58} — czekam na osobny leaf płatności (${stealthB58})`
    );
  }

  const orderedHashes: string[] = [];
  if (metaHash && metaHash !== paymentHash) {
    orderedHashes.push(metaHash);
  }
  if (paymentHash) {
    orderedHashes.push(paymentHash);
  }

  if (!claimerHint) {
    claimerHint = params.registerCompressedAddress ?? params.metaOwner;
    notes.push(
      params.registerCompressedAddress
        ? 'claimerHint: registerCompressedAddress (stored)'
        : 'claimerHint: fallback metaOwner — zrób register on-chain ponownie aby zapisać compressedMetaAddress'
    );
  }

  const effectiveStealth =
    resolvedStealthAddress ?? params.stealthAddress;
  if (!effectiveStealth.equals(params.stealthAddress)) {
    pushNoteOnce(
      notes,
      `claim użyje adresu płatności ${effectiveStealth.toBase58()} (z indeksu Photon)`
    );
  }

  let claimValidityProofSourceHashes: string[] = [];
  try {
    claimValidityProofSourceHashes = discoveryHashesForPhotonRpc(
      orderedHashes.filter((h) => h.length > 0)
    );
  } catch {
    claimValidityProofSourceHashes = orderedHashes;
  }

  return {
    claimValidityProofSourceHashes,
    claimerHintCompressedAddress: claimerHint,
    resolvedStealthAddress:
      resolvedStealthAddress && !resolvedStealthAddress.equals(params.stealthAddress)
        ? resolvedStealthAddress
        : undefined,
    notes: notes.slice(-12),
  };
}

/** Wymaga ≥2 hashy (meta + payment) w kolejności CPI. */
export function claimDiscoveryHashesReady(hashes: string[]): boolean {
  return hashes.length >= 2;
}

export type ResolveIndexedSendPaymentAddressResult = {
  /** Adres skompresowanej płatności wg Photon `getMultipleNewAddressProofs` (do claim / powiadomienia). */
  address: PublicKey;
  preparedAddress: PublicKey;
  matchesPrepared: boolean;
  proofHash: string | null;
  notes: string[];
};

/**
 * Adres z lokalnego `generateLightStealthAddress` (prepare) często ≠ adres w indeksie Photon.
 * Powiadomienie i claim muszą używać adresu z newAddressProof (ten sam co po send on-chain).
 */
export async function resolveIndexedSendPaymentAddress(params: {
  preparedStealthAddress: PublicKey;
  /** Nadawca send — primary owner dla newAddressProof. */
  proofOwner: PublicKey;
  /** Odbiorca (meta owner) — dodatkowy kandydat RPC. */
  metaOwner?: PublicKey;
  lightAddressSeed?: Uint8Array;
  runtime?: PartialLightLocalRuntimeConfig;
  cluster?: SupportedCluster;
}): Promise<ResolveIndexedSendPaymentAddressResult> {
  const notes: string[] = [];
  let address = params.preparedStealthAddress;
  let proofHash: string | null = null;

  const ownersToTry = Array.from(
    new Set(
      [
        params.proofOwner.toBase58(),
        params.metaOwner?.toBase58(),
      ].filter((v): v is string => !!v)
    )
  );

  for (const ownerB58 of ownersToTry) {
    try {
      const newPaymentRaw = await fetchLiveNewPaymentAddress({
        runtime: params.runtime ?? resolveLightLocalRuntimeConfig(undefined),
        request: {
          stealthAddress: params.preparedStealthAddress,
          metaOwner: new PublicKey(ownerB58),
          owner: new PublicKey(ownerB58),
          lightAddressSeed: params.lightAddressSeed,
          lightAddressSeedBytes: params.lightAddressSeed,
          cluster: params.cluster,
        },
      });
      const proofEnvelope =
        isRecord(newPaymentRaw) && 'raw' in newPaymentRaw
          ? (newPaymentRaw as { raw?: unknown }).raw
          : newPaymentRaw;
      const proofEntry = extractNewAddressProofEntry(proofEnvelope);
      if (proofEntry.hash) {
        proofHash = normalizePaymentDiscoveryHash(proofEntry.hash);
      }
      if (proofEntry.address) {
        address = new PublicKey(proofEntry.address);
        if (address.equals(params.preparedStealthAddress)) {
          notes.push('newAddressProof: adres zgodny z prepare');
        } else {
          notes.push(
            `newAddressProof: użyj ${address.toBase58()} (prepare miał ${params.preparedStealthAddress.toBase58()})`
          );
        }
        break;
      }
    } catch (error) {
      notes.push(
        `newAddressProof owner ${ownerB58}: ${String((error as Error)?.message ?? error).slice(0, 120)}`
      );
    }
  }

  return {
    address,
    preparedAddress: params.preparedStealthAddress,
    matchesPrepared: address.equals(params.preparedStealthAddress),
    proofHash,
    notes,
  };
}

/** State tree pubkey for picking claimer meta when scanning owner items. */
export function isLikelyStateTreeAccount(raw: unknown): boolean {
  if (!isRecord(raw)) {
    return false;
  }
  const account = isRecord(raw.account) ? raw.account : raw;
  if (!isRecord(account)) {
    return false;
  }
  const merkle = account.merkleContext ?? account.merkle_context;
  if (!isRecord(merkle)) {
    return false;
  }
  const tree = merkle.tree;
  return (
    typeof tree === 'string' &&
    tree === LOCALNET_LIGHT_ACCOUNTS.stateTree.toBase58()
  );
}
