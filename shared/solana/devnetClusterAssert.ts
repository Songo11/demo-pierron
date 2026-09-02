import type { Connection } from '@solana/web3.js';

/** Bieżący publiczny devnet (po restarcie sieci). */
export const DEVNET_GENESIS_HASH_CURRENT =
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';

/** Starszy devnet — zostawiamy dla proxy / cache. */
export const DEVNET_GENESIS_HASH_LEGACY =
  'EtWTRABZaYq6iMfeYKoujRu6UX3s5QdaQPZ2czQ27kJw';

export const MAINNET_GENESIS_HASH =
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

const KNOWN_DEVNET_GENESIS = new Set([
  DEVNET_GENESIS_HASH_CURRENT,
  DEVNET_GENESIS_HASH_LEGACY,
]);

/** @deprecated Użyj DEVNET_GENESIS_HASH_CURRENT */
export const DEVNET_GENESIS_HASH = DEVNET_GENESIS_HASH_CURRENT;

export async function assertDevnetRpcConnection(
  connection: Connection
): Promise<void> {
  const genesis = await connection.getGenesisHash();
  if (genesis === MAINNET_GENESIS_HASH) {
    throw new Error(
      'RPC wskazuje mainnet. Ustaw portfel (Phantom/Solflare) na Devnet i użyj devnet RPC.'
    );
  }
  if (!KNOWN_DEVNET_GENESIS.has(genesis)) {
    throw new Error(
      `RPC nie wygląda na devnet (genesis ${genesis}). Sprawdź NEXT_PUBLIC_SOLANA_RPC i cluster portfela.`
    );
  }
}
