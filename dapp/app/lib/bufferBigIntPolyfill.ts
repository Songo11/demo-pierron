import { ensureBufferBigIntLeHelpers } from '../../../shared/solana/browserSafeBuffer.ts';

/** Install once at dapp boot — covers @solana/spl-token / buffer-layout paths. */
ensureBufferBigIntLeHelpers();
