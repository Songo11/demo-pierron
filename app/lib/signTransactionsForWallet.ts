import { PublicKey, Transaction } from '@solana/web3.js';

import {
  handleMobileWalletNotFoundForSign,
  isMwaWalletNotFoundMessage,
} from './openInMobileWalletBrowser';

export type WalletTransactionSigner = {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>;
};

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
export async function withUnsignedTxSerializeAllowed<T>(
  fn: () => Promise<T>
): Promise<T> {
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

export function assertTransactionFullySigned(
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

/** Sign one or more legacy txs; works around broken MWA serialize on mobile web. */
export async function signTransactionsForWallet(
  wallet: WalletTransactionSigner,
  txs: Transaction[],
  options?: { requireBatchOnMobile?: boolean }
): Promise<Transaction[]> {
  const total = txs.length;
  let signedList: Transaction[];
  try {
    signedList = await withUnsignedTxSerializeAllowed(async () => {
      if (typeof wallet.signAllTransactions === 'function') {
        return wallet.signAllTransactions(txs);
      }
      if (total === 1) {
        return [await wallet.signTransaction(txs[0]!)];
      }
      if (options?.requireBatchOnMobile !== false && isLikelyMobileWeb()) {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isMwaWalletNotFoundMessage(msg)) {
      throw handleMobileWalletNotFoundForSign();
    }
    throw err;
  }

  if (!Array.isArray(signedList) || signedList.length !== total) {
    throw new Error(
      `Portfel zwrócił ${signedList?.length ?? 0} podpisów, oczekiwano ${total}.`
    );
  }

  for (const signed of signedList) {
    assertTransactionFullySigned(signed, wallet.publicKey);
  }

  return signedList;
}
