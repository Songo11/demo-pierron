import { PublicKey } from '@solana/web3.js';
import { PIERRON_DEVNET_RPC_PROXY_DEFAULT } from '../../shared/solana/devnetRpcDefaults.ts';

/** SPL Token-2022 program (mint z bootstrapu używa transfer hook). */
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
);

/** Domyślne adresy z `artifacts/devnet-bootstrap.devnet.json` — nadpisz przez `NEXT_PUBLIC_*` jeśli robisz nowy bootstrap. */
const DEFAULT = {
  pierronProgramId: 'A9kNasYvn9ZqdEzHvRHqQFtouqdRzzE2udR8aUqbKb13',
  pierronStealthProgramId: '5hnbLpHpm2Pk9o9TSJyCPYqq11cMigUMrXN1NEfWGQXA',
  tokenMint: 'BYcQtZN9RbgRDyiRbBSr1UxgcEyWkyqqfmrumdKwLMri',
  meteoraPool: '96RRWGfUZ1rpxnuF5xx5KXDBPhm9yej4RbJ6DVcYCg5W',
  meteoraPoolVault: '95isMbTEeu2JHrYuDRiWdpFJWbS6W6fYr3p8M1F2fgqU',
  redistributionVault: 'D1ajrrwmWqtKA65aTkYcZicd6ncAhtPWQDWRTYfURzhx',
  escrowVault: 'Dh1W8r8Yi6qiwW898thezLGYEbb1S3kK4UnvHEzdye6m',
  lotteryVault: '2ePM87z7fuY9hWMPyXgqPcDQ5hTeDQouAw3hnrLpyAkY',
  burnVault: 'DbTC3f3twUX7VKRGrzUNMxffSpqbjJsJMUfL3afYgDuH',
  accountingState: 'Ae25tJZ14qF17X2Mz5FHCxPy7UQBy15tL7z7BQgSLbCN',
} as const;

function envPk(key: string, fallback: string): PublicKey {
  const v = typeof process !== 'undefined' ? process.env[key] : undefined;
  return new PublicKey(v && v.trim().length > 0 ? v.trim() : fallback);
}

function resolveDevnetRpcUrl(): string {
  const explicit =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SOLANA_RPC?.trim()) ||
    (typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_PIERRON_DEVNET_PROXY_URL?.trim());
  if (explicit) return explicit;
  return PIERRON_DEVNET_RPC_PROXY_DEFAULT;
}

export const pierronDevnet = {
  rpcUrl: resolveDevnetRpcUrl(),

  pierronProgramId: envPk(
    'NEXT_PUBLIC_PIERRON_PROGRAM_ID',
    DEFAULT.pierronProgramId
  ),

  pierronStealthProgramId: envPk(
    'NEXT_PUBLIC_PIERRON_STEALTH_PROGRAM_ID',
    DEFAULT.pierronStealthProgramId
  ),

  tokenMint: envPk('NEXT_PUBLIC_PIERRON_TOKEN_MINT', DEFAULT.tokenMint),

  meteoraPool: envPk('NEXT_PUBLIC_PIERRON_METEORA_POOL', DEFAULT.meteoraPool),

  poolAta: envPk('NEXT_PUBLIC_PIERRON_POOL_VAULT', DEFAULT.meteoraPoolVault),

  redistributionVault: envPk(
    'NEXT_PUBLIC_PIERRON_REDISTRIBUTION_VAULT',
    DEFAULT.redistributionVault
  ),

  escrowVault: envPk('NEXT_PUBLIC_PIERRON_ESCROW_VAULT', DEFAULT.escrowVault),

  lotteryVault: envPk('NEXT_PUBLIC_PIERRON_LOTTERY_VAULT', DEFAULT.lotteryVault),

  burnVault: envPk('NEXT_PUBLIC_PIERRON_BURN_VAULT', DEFAULT.burnVault),

  accountingState: envPk(
    'NEXT_PUBLIC_PIERRON_ACCOUNTING_STATE',
    DEFAULT.accountingState
  ),
} as const;
