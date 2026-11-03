import { x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { CryptoError, b64, concatBytes, fromB64, randomBytes, utf8 } from "./bytes.js";
import { dh } from "./keys.js";

const LINK_INFO = utf8("SixFrites_Link_v1");

/** A one-time key pair a new computer shows in its QR code, so the phone can hand it secrets the server can't read. */
export function generateLinkKey() {
  const priv = x25519.utils.randomSecretKey();
  return { priv, pub: x25519.getPublicKey(priv) };
}

const linkKey = (shared: Uint8Array, ephPub: Uint8Array, pub: Uint8Array) =>
  hkdf(sha256, shared, concatBytes(ephPub, pub), LINK_INFO, 32);

/** Seals `plaintext` to the public half of a link key, with a fresh ephemeral key for each seal. */
export function sealToLinkKey(pub: Uint8Array, plaintext: Uint8Array) {
  const eph = generateLinkKey();
  const nonce = randomBytes(24);
  const key = linkKey(dh(eph.priv, pub), eph.pub, pub);
  return b64(concatBytes(eph.pub, nonce, xchacha20poly1305(key, nonce).encrypt(plaintext)));
}

export function openWithLinkKey(link: { priv: Uint8Array; pub: Uint8Array }, sealed: string) {
  const bytes = fromB64(sealed);
  const ephPub = bytes.subarray(0, 32);
  try {
    const key = linkKey(dh(link.priv, ephPub), ephPub, link.pub);
    return xchacha20poly1305(key, bytes.subarray(32, 56)).decrypt(bytes.subarray(56));
  } catch {
    throw new CryptoError("DECRYPT_FAILED", "That doesn't open with this link key");
  }
}
