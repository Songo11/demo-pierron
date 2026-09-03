import './bufferBigIntPolyfill';

import { BN, Program } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import {
  createCloseAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionSignature,
} from '@solana/web3.js';

import pierronIdl from '../../shared/idl/pierron.json';
import {
  buildPierronDlmmSwapPlan,
  type PierronDlmmSwapPlan,
} from '../../shared/meteora/buildPierronDlmmSwapTx.ts';
import {
  isMeteoraInsufficientLiquidityError,
  quoteMeteoraDlmmSwap,
} from '../../shared/meteora/meteoraDlmmSwapQuote.ts';
import { assertDexSwapAmountWithinPolicy } from '../../shared/pierron/assertDexSwapPolicy.ts';
import { humanizeSwapPolicyError } from '../../shared/pierron/swapPolicyLimits.ts';
import { fetchConsumedRedistributionClaimPubkeys } from '../../shared/pierron/redistributionClaimEligibility.ts';
import { buyRedistributionTaxBaseUnits } from '../../shared/pierron/sellRedistributionTaxPretransfer.ts';
import { netBaseUnitsForGrossSell } from '../../shared/pierron/tradeTax.ts';
import { getPierronProgramId } from '../../shared/core/programIds.ts';
import { pierronMeteoraAgUrl, pierronPoolSolscanUrl } from '../../shared/meteora/pierronPoolExplorer.ts';
import { PIERRON_DEVNET_METEORA_POOL } from '../../shared/meteora/pierronPoolCanonical.ts';
import {
  assertDexRpcReady,
  classifyDexRpcError,
} from '../../shared/solana/rpcEndpoint.ts';

import { pierronDevnet } from './pierronDevnet';
import {
  connectMeteoraPool,
  connectAndEnrichMeteoraPool,
  enrichMeteoraPoolDisplayMetrics,
  formatPoolAmountUi,
  getPoolDlmm,
  type MeteoraPoolConnection,
  type MeteoraPoolSession,
} from './meteoraPoolConnection';

import {
  assertDevnetRpcConnection,
  DEVNET_GENESIS_HASH,
} from '../../shared/solana/devnetClusterAssert.ts';

export { DEVNET_GENESIS_HASH };

export async function assertDevnetConnection(connection: Connection): Promise<void> {
  await assertDevnetRpcConnection(connection);
}

function formatSimulationError(
  err: unknown,
  logs: string[] | null | undefined
): string {
  const base = err != null ? JSON.stringify(err) : 'unknown';
  const hookLine = logs?.find((l) => l.includes('Error') || l.includes('failed'));
  const pierronLine = logs?.find((l) => l.includes('EecYxwKYmnbvd1EaSMqkEpoqL4gRks8aRrYPpMkG2dcY'));
  const tail = (logs ?? []).slice(-8).join('\n');
  return [base, hookLine, pierronLine, tail].filter(Boolean).join('\n\n');
}

export type MeteoraSwapWallet = Pick<AnchorWallet, 'publicKey' | 'signTransaction'> & {
  signAllTransactions?: AnchorWallet['signAllTransactions'];
};

function rpcUrlFromConnection(connection: Connection): string {
  const ep = (connection as Connection & { rpcEndpoint?: string }).rpcEndpoint;
  return typeof ep === 'string' && ep.length > 0 ? ep : pierronDevnet.rpcUrl;
}

function assertSwapRpc(connection: Connection): void {
  const rpcUrl = rpcUrlFromConnection(connection);
  try {
    assertDexRpcReady(rpcUrl, 'devnet', {
      operation: 'swap Meteora',
      requireDedicatedRpc: process.env.NODE_ENV === 'production',
    });
  } catch (err) {
    if (classifyDexRpcError(err) === 'DEX_RPC_PUBLIC') {
      throw new Error(
        'Produkcja wymaga NEXT_PUBLIC_SOLANA_RPC (Helius). Publiczny api.devnet.solana.com daje 429 i psuje swap.'
      );
    }
    throw err;
  }
}

/** Buduje plan swapu Meteora (1+ tx) — jak mobilka. */
export async function buildMeteoraPierronSwapPlan(params: {
  connection: Connection;
  wallet: MeteoraSwapWallet;
  side: 'buy' | 'sell';
  amountUi: number;
  slippageBps?: number;
  poolSession?: MeteoraPoolSession;
}): Promise<PierronDlmmSwapPlan> {
  const { connection, wallet, side, amountUi } = params;
  assertSwapRpc(connection);
  await assertDevnetConnection(connection);

  const session =
    params.poolSession ?? (await connectMeteoraPool(connection));
  const dlmm = await getPoolDlmm(session, wallet);
  const slippageBps = new BN(params.slippageBps ?? 100);
  const programId = getPierronProgramId('devnet');
  const mintPierron = session.mint;
  const user = wallet.publicKey;

  const program = new Program(pierronIdl as never, {
    connection,
    publicKey: user,
  } as never);

  const swapForY = side === 'buy';
  let inToken: PublicKey;
  let outToken: PublicKey;
  let inAmount: BN;
  let sellGrossBase = 0n;
  let sellTaxRemainder = 0n;

  if (side === 'buy') {
    inToken = NATIVE_MINT;
    outToken = mintPierron;
    inAmount = new BN(Math.floor(amountUi * 1_000_000_000));
  } else {
    inToken = mintPierron;
    outToken = NATIVE_MINT;
    sellGrossBase = BigInt(Math.floor(amountUi * 1_000_000));
    try {
      const [accountingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('accounting')],
        programId
      );
      const accounting = await program.account.accountingState.fetch(accountingPda);
      sellTaxRemainder = BigInt(
        (accounting as { taxRemainder?: unknown; tax_remainder?: unknown }).taxRemainder ??
          (accounting as { tax_remainder?: unknown }).tax_remainder ??
          0
      );
    } catch {
      sellTaxRemainder = 0n;
    }
    const { net } = netBaseUnitsForGrossSell(sellGrossBase, sellTaxRemainder);
    inAmount = new BN(net.toString());
  }

  if (inAmount.lte(new BN(0))) {
    throw new Error('Kwota musi być większa od zera.');
  }

  let quote;
  try {
    ({ quote } = await quoteMeteoraDlmmSwap({
      dlmm,
      inAmount,
      swapForY,
      slippageBps,
      skipRefetch: true,
    }));
  } catch (err) {
    if (isMeteoraInsufficientLiquidityError(err)) {
      throw new Error(
        'Za mała płynność w puli Meteora — zmniejsz kwotę lub dodaj SOL/PIERRON do puli (skrypt devnet-seed-meteora-liquidity).'
      );
    }
    if (classifyDexRpcError(err) === 'DEX_RPC_RATE_LIMIT') {
      throw new Error(
        'RPC zwrócił limit zapytań (429). Ustaw NEXT_PUBLIC_SOLANA_RPC i odśwież stronę.'
      );
    }
    throw err;
  }

  if (side === 'buy' && quote.minOutAmount.lte(new BN(0))) {
    throw new Error('Za mała płynność — zmniejsz kwotę SOL.');
  }

  // Buy and sell: load consumed vouchers so claim-tier progression / cooldown
  // apply after settle. Passing [] skips the rescan in buildPierronDlmmSwapTx.
  const consumedVouchers = await fetchConsumedRedistributionClaimPubkeys({
    connection,
    programId,
    user,
  }).catch(() => [] as PublicKey[]);

  const sellTaxSplit =
    side === 'sell'
      ? netBaseUnitsForGrossSell(sellGrossBase, sellTaxRemainder)
      : null;
  const sellTaxBaseUnits = sellTaxSplit?.tax;
  const buyTaxBaseUnits =
    side === 'buy'
      ? buyRedistributionTaxBaseUnits(BigInt(quote.outAmount.toString()))
      : undefined;

  const policyAmount =
    side === 'sell'
      ? BigInt(quote.consumedInAmount.toString())
      : BigInt(quote.outAmount.toString());

  await assertDexSwapAmountWithinPolicy({
    connection,
    program,
    mint: mintPierron,
    owner: user,
    programId,
    amountBaseUnits: policyAmount,
    isSell: side === 'sell',
    consumedRedistributionVouchers: consumedVouchers,
  }).catch((err) => {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(detail);
  });

  return buildPierronDlmmSwapPlan(dlmm, {
    inToken,
    outToken,
    inAmount: quote.consumedInAmount,
    minOutAmount: quote.minOutAmount,
    user,
    binArraysPubkey: quote.binArraysPubkey,
    cluster: 'devnet',
    sellTaxBaseUnits,
    sellTaxRemainder: side === 'sell' ? sellTaxRemainder : undefined,
    sellGrossInAmount:
      side === 'sell' ? new BN(sellGrossBase.toString()) : undefined,
    buyTaxBaseUnits,
    buyLedgerGrossAmount: side === 'buy' ? quote.outAmount : undefined,
    forceSplit: side === 'buy',
    preferSingleTx: side === 'sell',
    avoidForceSplit: false,
    consumedRedistributionVouchers: consumedVouchers,
  });
}

/** @deprecated Użyj buildMeteoraPierronSwapPlan — pojedyncza tx często niewystarczająca (kupno). */
export async function buildMeteoraPierronSwapTx(params: {
  connection: Connection;
  wallet: MeteoraSwapWallet;
  side: 'buy' | 'sell';
  amountUi: number;
  slippageBps?: number;
}): Promise<Transaction> {
  const plan = await buildMeteoraPierronSwapPlan(params);
  if (plan.transactions.length !== 1) {
    throw new Error(
      `Swap wymaga ${plan.transactions.length} transakcji — użyj executeMeteoraPierronSwap (podpis wielu tx).`
    );
  }
  return plan.transactions[0];
}

function shouldSkipSwapSimulationError(
  detail: string,
  txIndex: number
): boolean {
  if (
    txIndex > 0 &&
    /AccountNotInitialized|user_token_in|"Custom":3012|0xbc4/i.test(detail)
  ) {
    return true;
  }
  if (/AccountNotFound|could not find account|UnbalancedAccount/i.test(detail)) {
    // Devnet RPC często nie widzi wszystkich kont w symulacji multi-tx (jak mobilka).
    return true;
  }
  return false;
}

async function refreshTransactionBlockhash(
  connection: Connection,
  tx: Transaction
): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  return { blockhash, lastValidBlockHeight };
}

async function sendSignedSwapStep(
  connection: Connection,
  signed: Transaction,
  step: { index: number; total: number },
  side: 'buy' | 'sell' | undefined,
  confirmContext: { blockhash: string; lastValidBlockHeight: number }
): Promise<TransactionSignature> {
  const sim = await connection.simulateTransaction(signed);
  if (sim.value.err) {
    const detail = formatSimulationError(sim.value.err, sim.value.logs);
    if (!shouldSkipSwapSimulationError(detail, step.index)) {
      const friendly = humanizeSwapPolicyError(detail, { side });
      throw new Error(
        `Symulacja swapu (krok ${step.index + 1}/${step.total}) nie przeszła: ${friendly}`
      );
    }
  }

  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });

  const conf = await connection.confirmTransaction(
    {
      signature: sig,
      blockhash: confirmContext.blockhash,
      lastValidBlockHeight: confirmContext.lastValidBlockHeight,
    },
    'confirmed'
  );
  if (conf.value.err) {
    const txInfo = await connection.getTransaction(sig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    throw new Error(
      `Swap odrzucony on-chain (krok ${step.index + 1}/${step.total}):\n${formatSimulationError(conf.value.err, txInfo?.meta?.logMessages)}`
    );
  }
  return sig;
}

function isLikelyMobileWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * @solana-mobile/wallet-adapter-mobile 2.2.x calls `tx.serialize()` with no options
 * when handing bytes to the wallet. Default `requireAllSignatures: true` throws
 * "Missing signature for public key [wallet]" on *unsigned* txs — the wallet never opens.
 * protocol-web3js already passes `requireAllSignatures: false`; the React adapter does not.
 */
async function withUnsignedTxSerializeAllowed<T>(fn: () => Promise<T>): Promise<T> {
  const proto = Transaction.prototype;
  const original = proto.serialize;
  proto.serialize = function serializeForWalletSign(
    this: Transaction,
    config?: Parameters<typeof original>[0]
  ) {
    if (config === undefined) {
      return original.call(this, {
        requireAllSignatures: false,
        verifySignatures: false,
      });
    }
    return original.call(this, config);
  };
  try {
    return await fn();
  } finally {
    proto.serialize = original;
  }
}

function assertTransactionFullySigned(
  tx: Transaction,
  expectedSigner: PublicKey
): void {
  const entry = tx.signatures.find((s) => s.publicKey.equals(expectedSigner));
  if (!entry?.signature) {
    throw new Error(
      isLikelyMobileWeb()
        ? 'Portfel nie zwrócił podpisu. Zatwierdź w Solflare/Phantom i wróć do tej samej karty (albo odłącz i połącz ponownie).'
        : 'Portfel nie zwrócił podpisu — zatwierdź transakcję i spróbuj ponownie.'
    );
  }
  try {
    tx.serialize({ requireAllSignatures: true, verifySignatures: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Podpis z portfela jest niekompletny: ${detail}` +
        (isLikelyMobileWeb()
          ? ' Zatwierdź w Solflare/Phantom i wróć do tej karty.'
          : '')
    );
  }
}

async function signSwapTransactions(
  wallet: MeteoraSwapWallet,
  txs: Transaction[]
): Promise<Transaction[]> {
  const total = txs.length;
  return withUnsignedTxSerializeAllowed(async () => {
    if (typeof wallet.signAllTransactions === 'function') {
      return wallet.signAllTransactions(txs);
    }
    if (total === 1) {
      return [await wallet.signTransaction(txs[0]!)];
    }
    if (isLikelyMobileWeb()) {
      throw new Error(
        'Ten portfel na telefonie nie podpisuje wielu transakcji naraz. Połącz ponownie przez Solflare/Phantom (Mobile Wallet Adapter) i spróbuj jeszcze raz.'
      );
    }
    const out: Transaction[] = [];
    for (const tx of txs) {
      out.push(await wallet.signTransaction(tx));
    }
    return out;
  });
}

/** Buduje plan, podpisuje (1 potwierdzenie w portfelu jak mobilka) i wysyła swap Meteora. */
export async function executeMeteoraPierronSwap(params: {
  connection: Connection;
  wallet: MeteoraSwapWallet;
  side: 'buy' | 'sell';
  amountUi: number;
  slippageBps?: number;
  poolSession?: MeteoraPoolSession;
}): Promise<TransactionSignature> {
  await assertDevnetConnection(params.connection);

  const plan = await buildMeteoraPierronSwapPlan(params);
  const total = plan.transactions.length;
  const txs = plan.transactions;

  // Świeży blockhash na wszystkie tx przed jednym podpisem batch (jak MWA signTransactions).
  const confirmContexts: { blockhash: string; lastValidBlockHeight: number }[] = [];
  for (let i = 0; i < total; i++) {
    const tx = txs[i]!;
    tx.feePayer = params.wallet.publicKey;
    confirmContexts.push(await refreshTransactionBlockhash(params.connection, tx));
  }

  // Prefer batch signing whenever available — one wallet session (critical on Android MWA).
  const signedList = await signSwapTransactions(params.wallet, txs);

  if (!Array.isArray(signedList) || signedList.length !== total) {
    throw new Error(
      `Portfel zwrócił ${signedList?.length ?? 0} podpisów, oczekiwano ${total}.`
    );
  }

  for (const signed of signedList) {
    assertTransactionFullySigned(signed, params.wallet.publicKey);
  }

  let lastSig: TransactionSignature = '';
  for (let i = 0; i < total; i++) {
    lastSig = await sendSignedSwapStep(
      params.connection,
      signedList[i]!,
      { index: i, total },
      params.side,
      confirmContexts[i]!
    );
  }

  // Safety net: leftover wSOL after sell. On mobile a *second* wallet prompt after
  // the main swap often fails/cancels the whole flow — never fail a landed swap.
  if (params.side === 'sell') {
    try {
      const unwrapSig = await unwrapLeftoverWsolIfAny(params.connection, params.wallet);
      if (unwrapSig) lastSig = unwrapSig;
    } catch (err) {
      console.warn('[pierron swap] wSOL unwrap skipped after successful sell', err);
    }
  }

  return lastSig;
}

/** Close leftover wSOL ATA after sell (no-op if already unwrapped / missing). */
async function unwrapLeftoverWsolIfAny(
  connection: Connection,
  wallet: MeteoraSwapWallet
): Promise<TransactionSignature | null> {
  const wsolAta = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  try {
    await getAccount(connection, wsolAta, 'confirmed', TOKEN_PROGRAM_ID);
  } catch {
    return null;
  }

  const tx = new Transaction().add(
    createCloseAccountInstruction(
      wsolAta,
      wallet.publicKey,
      wallet.publicKey,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  tx.feePayer = wallet.publicKey;
  const confirmContext = await refreshTransactionBlockhash(connection, tx);
  const [signed] = await signSwapTransactions(wallet, [tx]);
  assertTransactionFullySigned(signed!, wallet.publicKey);
  return sendSignedSwapStep(
    connection,
    signed!,
    { index: 0, total: 1 },
    'sell',
    confirmContext
  );
}

export {
  connectMeteoraPool,
  connectAndEnrichMeteoraPool,
  enrichMeteoraPoolDisplayMetrics,
  formatPoolAmountUi,
  type MeteoraPoolSession,
  type MeteoraPoolConnection,
};

export const METEORA_POOL_URL = pierronPoolSolscanUrl(PIERRON_DEVNET_METEORA_POOL, 'devnet');
export const METEORA_AG_UI_URL = pierronMeteoraAgUrl('devnet');
