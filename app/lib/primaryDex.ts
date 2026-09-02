/** Pierron swaps use Meteora DLMM only. */
export type PrimaryDex = 'meteora';

export function getPrimaryDex(): PrimaryDex {
  return 'meteora';
}

/** In-app pool preview (RPC). External meteora.ag often hangs on Loading. */
export const PIERRON_POOL_VIEWER_PATH = '/meteora';

export function getPrimaryPoolUrl(): string {
  return PIERRON_POOL_VIEWER_PATH;
}
