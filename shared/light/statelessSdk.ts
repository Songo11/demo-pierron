/**
 * Light Protocol SDK — Metro resolves this to the browser/RN build (see metro.config.js).
 */
import statelessPkg from '@lightprotocol/stateless.js';

export default statelessPkg;

export const { createBN254, createRpc, getDefaultAddressTreeInfo, encodeBN254toBase58 } =
  statelessPkg as {
    createBN254: (
      value: string | number | Uint8Array | number[],
      base?: number | 'hex' | 'base58'
    ) => unknown;
    encodeBN254toBase58: (value: import('bn.js').default) => string;
    createRpc: (
      rpcUrl: string,
      indexerUrl: string,
      proverUrl: string
    ) => unknown;
    getDefaultAddressTreeInfo: () => {
      tree: { toBase58: () => string };
      queue: { toBase58: () => string };
    };
  };
