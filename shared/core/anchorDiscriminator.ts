import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

/** Anchor instruction discriminator: first 8 bytes of sha256("global:{name}"). */
export function anchorInstructionDiscriminator(ixName: string): Buffer {
  const hash = sha256(utf8ToBytes(`global:${ixName}`));
  return Buffer.from(hash.subarray(0, 8));
}

/** Anchor account discriminator: first 8 bytes of sha256("account:{name}"). */
export function anchorAccountDiscriminator(accountName: string): Buffer {
  const hash = sha256(utf8ToBytes(`account:${accountName}`));
  return Buffer.from(hash.subarray(0, 8));
}
