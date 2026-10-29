import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { CryptoError, concatBytes, equalBytes, randomBytes, u64 } from "./bytes.js";

export const MEDIA_CHUNK = 64 * 1024;
const TAG = 16;
const PREFIX = 16;

const FINAL = Uint8Array.of(1);
const MORE = Uint8Array.of(0);

const nonce = (prefix: Uint8Array, index: number) => concatBytes(prefix, u64(index));

/** Where chunk `index` starts in an encrypted file, after the prefix. */
export const sealedChunkStart = (index: number) => PREFIX + index * (MEDIA_CHUNK + TAG);

/** Decrypts one chunk of an encrypted file on its own, so a player can stream it. `last` marks the final chunk. */
export function decryptMediaChunk(key: Uint8Array, prefix: Uint8Array, index: number, last: boolean, sealed: Uint8Array) {
  try {
    return xchacha20poly1305(key, nonce(prefix, index), last ? FINAL : MORE).decrypt(sealed);
  } catch {
    throw new CryptoError("BAD_MEDIA", "The file could not be decrypted");
  }
}

/**
 * Encrypts a file with a fresh random key, in fixed-size chunks so large files never need a second
 * copy in memory. Each chunk's nonce encodes its position and the last chunk is marked final, so
 * chunks cannot be reordered, dropped or truncated without detection. The key and digest travel
 * inside the encrypted message; only `data` is uploaded.
 */
export function encryptMedia(plain: Uint8Array) {
  const key = randomBytes(32);
  const prefix = randomBytes(PREFIX);
  const chunks = Math.max(1, Math.ceil(plain.length / MEDIA_CHUNK));
  const out = new Uint8Array(PREFIX + plain.length + chunks * TAG);
  out.set(prefix);
  let offset = PREFIX;
  for (let i = 0; i < chunks; i++) {
    const part = plain.subarray(i * MEDIA_CHUNK, (i + 1) * MEDIA_CHUNK);
    const sealed = xchacha20poly1305(key, nonce(prefix, i), i === chunks - 1 ? FINAL : MORE).encrypt(part);
    out.set(sealed, offset);
    offset += sealed.length;
  }
  return { data: out, key, digest: sha256(out) };
}

export function decryptMedia(data: Uint8Array, key: Uint8Array, digest: Uint8Array) {
  if (data.length < PREFIX + TAG || !equalBytes(sha256(data), digest)) {
    throw new CryptoError("BAD_MEDIA", "The file was changed or is incomplete");
  }
  const prefix = data.subarray(0, PREFIX);
  const body = data.subarray(PREFIX);
  const sealedChunk = MEDIA_CHUNK + TAG;
  const chunks = Math.ceil(body.length / sealedChunk);
  const out = new Uint8Array(body.length - chunks * TAG);
  for (let i = 0; i < chunks; i++) {
    const part = body.subarray(i * sealedChunk, (i + 1) * sealedChunk);
    out.set(decryptMediaChunk(key, prefix, i, i === chunks - 1, part), i * MEDIA_CHUNK);
  }
  return out;
}
