import { Buffer } from "buffer";

/**
 * Solana RPC zwraca `Uint8Array` w `account.data`.
 * Zawsze kopiujemy do pełnego Buffer z pakietu `buffer` (RN ma fałszywy Buffer bez readUIntLE).
 */
export function accountDataToBuffer(data: Buffer | Uint8Array): Buffer {
  if (data instanceof Uint8Array) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return Buffer.from(Uint8Array.from(data as ArrayLike<number>));
}
