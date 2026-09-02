import {
  Connection,
  PublicKey,
  type TransactionSignature,
  type VersionedTransaction,
} from '@solana/web3.js';

import type { StealthWalletExecutor } from '../../shared/mobile-stealth-v1/stealthTransactionRunner.ts';
import type { StealthSignableTransaction } from '../../shared/mobile-stealth-v1/stealthVersionedTransaction.ts';

export type WebStealthWallet = {
  publicKey: PublicKey;
  signTransaction: <T extends VersionedTransaction>(tx: T) => Promise<T>;
};

export function createWebStealthWalletExecutor(params: {
  connection: Connection;
  wallet: WebStealthWallet;
}): StealthWalletExecutor {
  const { connection, wallet } = params;
  return {
    payer: wallet.publicKey,
    signTransaction: async (tx: StealthSignableTransaction) => {
      const signed = await wallet.signTransaction(tx as VersionedTransaction);
      return signed as StealthSignableTransaction;
    },
    sendRawTransaction: async (rawTx: Buffer): Promise<TransactionSignature> => {
      return connection.sendRawTransaction(rawTx, {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
        maxRetries: 5,
      });
    },
  };
}
