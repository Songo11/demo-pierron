import type { Connection, Transaction } from '@solana/web3.js';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { buildMeteoraPierronSwapTx, METEORA_POOL_URL } from './meteoraSwap';
import {
  getPrimaryDex,
  getPrimaryPoolUrl,
  PIERRON_POOL_VIEWER_PATH,
  type PrimaryDex,
} from './primaryDex';

export type { PrimaryDex };
export { getPrimaryDex, getPrimaryPoolUrl, PIERRON_POOL_VIEWER_PATH, METEORA_POOL_URL };

export async function buildPierronSwapTx(params: {
  connection: Connection;
  wallet: AnchorWallet;
  side: 'buy' | 'sell';
  amountUi: number;
  slippageBps?: number;
}): Promise<Transaction> {
  return buildMeteoraPierronSwapTx(params);
}
