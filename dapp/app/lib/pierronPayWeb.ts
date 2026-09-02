import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  TokenAccountNotFoundError,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { Program, type Idl } from '@coral-xyz/anchor';
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';

import type { AppCluster, AppSettings } from '../../../shared/core/config';
import { notifyEcosystemRefresh } from '../../../shared/core/ecosystemRefresh.ts';
import { getPierronProgramId, type SupportedCluster } from '../../../shared/core/programIds';
import { resolveInitializeUserTradeAccounts } from '../../../shared/pierron/initUserTradeAccounts.ts';
import {
  buildPierronPayTransaction,
  type PierronPayRequest,
} from '../../../shared/pierron/pierronPayFlow.ts';
import { getPierronTokenAtaForOwner } from '../../../shared/pierron/pierronTokenAta.ts';
import { deriveUserTradeStatePda } from '../../../shared/pierron/userTradeState.ts';
import { grossFromNet } from '../../../shared/pierron/tradeTax.ts';
import idl from '../pierron.json';
import { pierronDevnet, TOKEN_2022_PROGRAM_ID as WEB_TOKEN_2022 } from './pierronDevnet';
import { addHistoryItem } from './historyWeb';

export type { PierronPayRequest };

function appClusterToProgramIdsCluster(cluster: AppCluster): SupportedCluster {
  return cluster === 'localnet' ? 'devnet' : cluster;
}

function resolveConnection(settings: AppSettings): Connection {
  const rpc = settings.solanaRpcUrl?.trim() || pierronDevnet.rpcUrl;
  return new Connection(rpc, 'confirmed');
}

async function fetchPierronTokenBalanceRaw(params: {
  connection: Connection;
  owner: PublicKey;
  mint: PublicKey;
}): Promise<bigint> {
  const ata = getPierronTokenAtaForOwner(params.mint, params.owner);
  try {
    const acc = await getAccount(
      params.connection,
      ata,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    return acc.amount;
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) return 0n;
    throw e;
  }
}

async function refreshTransactionBlockhash(
  connection: Connection,
  tx: Transaction
): Promise<void> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
}

async function sendAndConfirmSignedTransaction(
  connection: Connection,
  signed: Transaction
): Promise<string> {
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
  });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}

async function buildInitUserTradeTransaction(params: {
  settings: AppSettings;
  owner: PublicKey;
  connection: Connection;
  mint: PublicKey;
}): Promise<Transaction | null> {
  const cluster = appClusterToProgramIdsCluster(params.settings.cluster);
  const mint = params.mint;
  const programId = getPierronProgramId(cluster);
  const userTokenAccount = getPierronTokenAtaForOwner(mint, params.owner);
  const userTradeState = deriveUserTradeStatePda(userTokenAccount, programId);

  const existing = await params.connection.getAccountInfo(userTradeState);
  if (existing) return null;

  const idlWithAddress = { ...(idl as object), address: programId.toBase58() } as Idl;
  const program = new Program(idlWithAddress, {
    connection: params.connection,
    publicKey: params.owner,
  } as never);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      params.owner,
      userTokenAccount,
      params.owner,
      mint,
      WEB_TOKEN_2022,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  const { tradeConfig, tradeBook } = resolveInitializeUserTradeAccounts({
    mint,
    programId,
    cluster,
  });

  const ix = await program.methods
    .initializeUserTradeState()
    .accountsPartial({
      payer: params.owner,
      owner: params.owner,
      userTokenAccount,
      tradeConfig,
      tradeBook,
      userTradeState,
    })
    .instruction();
  tx.add(ix);
  tx.feePayer = params.owner;
  await refreshTransactionBlockhash(params.connection, tx);
  return tx;
}

async function ensureUserTradeState(params: {
  settings: AppSettings;
  owner: PublicKey;
  connection: Connection;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  mint: PublicKey;
}): Promise<void> {
  const initTx = await buildInitUserTradeTransaction({
    settings: params.settings,
    owner: params.owner,
    connection: params.connection,
    mint: params.mint,
  });
  if (!initTx) return;
  const signed = await params.signTransaction(initTx);
  await sendAndConfirmSignedTransaction(params.connection, signed);
}

export async function preparePierronPay(params: {
  settings: AppSettings;
  payer: PublicKey;
  request: PierronPayRequest;
}): Promise<{ transaction: Transaction; connection: Connection }> {
  const connection = resolveConnection(params.settings);
  const cluster = appClusterToProgramIdsCluster(params.settings.cluster);

  const payBreakdown = grossFromNet(params.request.amountBaseUnits);
  const balance = await fetchPierronTokenBalanceRaw({
    connection,
    owner: params.payer,
    mint: params.request.mint,
  });
  if (balance < payBreakdown.gross) {
    throw new Error(
      `PAY_INSUFFICIENT_BALANCE: Masz ${(Number(balance) / 1_000_000).toFixed(6)} PIERRON, potrzebujesz ${(Number(payBreakdown.gross) / 1_000_000).toFixed(6)} (w tym ~1% opłaty protokołu).`
    );
  }

  const payTx = await buildPierronPayTransaction({
    connection,
    payer: params.payer,
    request: params.request,
    cluster,
  });

  return { transaction: payTx, connection };
}

export async function signAndSubmitPierronPay(params: {
  settings: AppSettings;
  payer: PublicKey;
  request: PierronPayRequest;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  onStage?: (message: string) => void;
}): Promise<{ signature: string }> {
  const prepared = await preparePierronPay({
    settings: params.settings,
    payer: params.payer,
    request: params.request,
  });

  params.onStage?.('Inicjalizacja konta handlowego…');
  await ensureUserTradeState({
    settings: params.settings,
    owner: params.payer,
    connection: prepared.connection,
    signTransaction: params.signTransaction,
    mint: params.request.mint,
  });

  params.onStage?.('Portfel — podpis płatności PIERRON…');
  const tx = prepared.transaction;
  await refreshTransactionBlockhash(prepared.connection, tx);
  const signed = await params.signTransaction(tx);

  params.onStage?.('Wysyłanie transakcji…');
  const signature = await sendAndConfirmSignedTransaction(prepared.connection, signed);

  await addHistoryItem(
    'Pierron Pay',
    `${params.request.amountUi} PIERRON → ${params.request.recipient.toBase58().slice(0, 8)}…`
  );
  notifyEcosystemRefresh();
  return { signature };
}

export function mapPierronPayError(message: string): string {
  if (message.includes('PAY_INSUFFICIENT_BALANCE')) {
    return message.replace(/^PAY_INSUFFICIENT_BALANCE:\s*/, '');
  }
  if (message.includes('PierronPayParseError') || message.includes('Nie rozpoznano')) {
    return message;
  }
  if (message.includes('WalletTransfersDisabled')) {
    return 'Transfer portfel→portfel zablokowany przez program (WalletTransfersDisabled).';
  }
  if (message.includes('PriceFloorSolFeeInsufficient')) {
    return 'Brak opłaty SOL na price floor w transakcji. Zaktualizuj aplikację Pierron Pay.';
  }
  if (message.includes('User rejected') || message.includes('cancel')) {
    return 'Anulowano w portfelu.';
  }
  return message;
}
