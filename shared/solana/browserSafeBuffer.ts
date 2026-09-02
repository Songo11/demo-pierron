/**
 * Next/Turbopack Buffer polyfills often omit BigInt LE helpers.
 * Always write via DataView into a fresh Uint8Array, then wrap as Buffer.
 */

export function allocU8(size: number): Uint8Array {
  return new Uint8Array(size);
}

export function writeU64LE(bytes: Uint8Array, value: bigint | number, offset = 0): void {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 8).setBigUint64(
    0,
    BigInt(value),
    true
  );
}

export function writeI64LE(bytes: Uint8Array, value: bigint | number, offset = 0): void {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 8).setBigInt64(
    0,
    BigInt(value),
    true
  );
}

export function readU64LE(bytes: Uint8Array, offset = 0): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true);
}

export function readI64LE(bytes: Uint8Array, offset = 0): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigInt64(0, true);
}

/** Buffer-compatible bytes for TransactionInstruction.data */
export function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes);
}

/** Patch global Buffer.prototype when the runtime polyfill is incomplete. */
export function ensureBufferBigIntLeHelpers(): void {
  const proto = (Buffer as unknown as { prototype: Record<string, unknown> }).prototype;
  if (typeof proto.writeBigUInt64LE !== "function") {
    proto.writeBigUInt64LE = function writeBigUInt64LE(
      this: Uint8Array,
      value: bigint,
      offset = 0
    ) {
      writeU64LE(this, value, offset);
      return offset + 8;
    };
  }
  if (typeof proto.writeBigInt64LE !== "function") {
    proto.writeBigInt64LE = function writeBigInt64LE(
      this: Uint8Array,
      value: bigint,
      offset = 0
    ) {
      writeI64LE(this, value, offset);
      return offset + 8;
    };
  }
  if (typeof proto.readBigUInt64LE !== "function") {
    proto.readBigUInt64LE = function readBigUInt64LE(this: Uint8Array, offset = 0) {
      return readU64LE(this, offset);
    };
  }
  if (typeof proto.readBigInt64LE !== "function") {
    proto.readBigInt64LE = function readBigInt64LE(this: Uint8Array, offset = 0) {
      return readI64LE(this, offset);
    };
  }
}
