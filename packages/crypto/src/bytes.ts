import { equalBytes } from "@noble/ciphers/utils.js";
import { concatBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { base64urlnopad } from "@scure/base";

export { concatBytes, equalBytes, randomBytes };

export const utf8 = (s: string) => utf8ToBytes(s);
export const fromUtf8 = (b: Uint8Array) => new TextDecoder().decode(b);

export const b64 = (b: Uint8Array) => base64urlnopad.encode(b);
export const fromB64 = (s: string) => base64urlnopad.decode(s);

export function u32(n: number) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
}

export function u64(n: number) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(n));
  return out;
}

export const readU32 = (b: Uint8Array, offset: number) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(offset);

/** ISO/IEC 7816-4 padding to a multiple of `block`, so ciphertext length only reveals a size bucket. */
export function pad(data: Uint8Array, block = 64) {
  const length = Math.ceil((data.length + 1) / block) * block;
  const out = new Uint8Array(length);
  out.set(data);
  out[data.length] = 0x80;
  return out;
}

export function unpad(data: Uint8Array) {
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i] === 0x80) return data.subarray(0, i);
    if (data[i] !== 0) break;
  }
  throw new CryptoError("BAD_PADDING", "Message padding is invalid");
}

export type CryptoErrorCode =
  | "BAD_PADDING"
  | "BAD_SIGNATURE"
  | "BAD_KEY"
  | "DECRYPT_FAILED"
  | "TOO_MANY_SKIPPED"
  | "DUPLICATE_MESSAGE"
  | "UNKNOWN_PREKEY"
  | "BAD_MEDIA"
  | "BAD_RECOVERY_KEY"
  | "BAD_ENVELOPE";

export class CryptoError extends Error {
  constructor(
    readonly code: CryptoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CryptoError";
  }
}
