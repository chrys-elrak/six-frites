import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  CryptoError,
  b64,
  concatBytes,
  equalBytes,
  fromB64,
  pad,
  readU32,
  u32,
  unpad,
  utf8,
} from "./bytes.js";
import { dh } from "./keys.js";

/** The most message keys one step may skip, and the most kept for late messages overall. */
export const MAX_SKIP = 1000;
const MAX_STORED_SKIPPED = 2000;

const RK_INFO = utf8("SixFrites_Ratchet_v1");
const MSG_INFO = utf8("SixFrites_Message_v1");

export interface Header {
  dh: Uint8Array;
  /** Messages in the sender's previous sending chain. */
  pn: number;
  /** This message's number in the current sending chain. */
  n: number;
}

export interface RatchetState {
  dhsPub: Uint8Array;
  dhsPriv: Uint8Array;
  dhr: Uint8Array | null;
  rk: Uint8Array;
  cks: Uint8Array | null;
  ckr: Uint8Array | null;
  ns: number;
  nr: number;
  pn: number;
  /** Keys of messages skipped over, by `${b64(dh)}:${n}`, in insertion order. */
  skipped: Map<string, Uint8Array>;
}

function kdfRk(rk: Uint8Array, dhOut: Uint8Array) {
  const out = hkdf(sha256, dhOut, rk, RK_INFO, 64);
  return [out.slice(0, 32), out.slice(32)] as const;
}

function kdfCk(ck: Uint8Array) {
  return [hmac(sha256, ck, Uint8Array.of(2)), hmac(sha256, ck, Uint8Array.of(1))] as const;
}

/** A message key is used exactly once, so deriving the nonce from it is safe. */
function aead(mk: Uint8Array, ad: Uint8Array) {
  const keys = hkdf(sha256, mk, new Uint8Array(32), MSG_INFO, 56);
  return xchacha20poly1305(keys.slice(0, 32), keys.slice(32, 56), ad);
}

export function encodeHeader(h: Header) {
  return concatBytes(h.dh, u32(h.pn), u32(h.n));
}

export function decodeHeader(b: Uint8Array): Header {
  if (b.length !== 40) throw new CryptoError("BAD_ENVELOPE", "Message header has the wrong length");
  return { dh: b.slice(0, 32), pn: readU32(b, 32), n: readU32(b, 36) };
}

const skipKey = (dhPub: Uint8Array, n: number) => `${b64(dhPub)}:${n}`;

function clone(s: RatchetState): RatchetState {
  return { ...s, skipped: new Map(s.skipped) };
}

/** Alice starts the ratchet with the shared secret and Bob's signed prekey as his first ratchet key. */
export function initSender(sharedKey: Uint8Array, remoteRatchetKey: Uint8Array): RatchetState {
  const dhsPriv = x25519.utils.randomSecretKey();
  const dhsPub = x25519.getPublicKey(dhsPriv);
  const [rk, cks] = kdfRk(sharedKey, dh(dhsPriv, remoteRatchetKey));
  return { dhsPub, dhsPriv, dhr: remoteRatchetKey, rk, cks, ckr: null, ns: 0, nr: 0, pn: 0, skipped: new Map() };
}

/** Bob starts with the shared secret and his signed prekey pair as his first ratchet key. */
export function initReceiver(sharedKey: Uint8Array, ratchetKey: { pub: Uint8Array; priv: Uint8Array }): RatchetState {
  return {
    dhsPub: ratchetKey.pub,
    dhsPriv: ratchetKey.priv,
    dhr: null,
    rk: sharedKey,
    cks: null,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: new Map(),
  };
}

export function ratchetEncrypt(state: RatchetState, plaintext: Uint8Array, ad: Uint8Array) {
  if (!state.cks) throw new CryptoError("BAD_KEY", "Cannot send before receiving the first message");
  const s = clone(state);
  const [ck, mk] = kdfCk(s.cks!);
  s.cks = ck;
  const header: Header = { dh: s.dhsPub, pn: s.pn, n: s.ns };
  s.ns += 1;
  const headerBytes = encodeHeader(header);
  const body = aead(mk, concatBytes(ad, headerBytes)).encrypt(pad(plaintext));
  return { state: s, header: headerBytes, body };
}

function skipMessageKeys(s: RatchetState, until: number) {
  if (!s.ckr) return;
  if (until - s.nr > MAX_SKIP) throw new CryptoError("TOO_MANY_SKIPPED", "Too many messages were skipped");
  while (s.nr < until) {
    const [ck, mk] = kdfCk(s.ckr);
    s.ckr = ck;
    s.skipped.set(skipKey(s.dhr!, s.nr), mk);
    s.nr += 1;
  }
  while (s.skipped.size > MAX_STORED_SKIPPED) s.skipped.delete(s.skipped.keys().next().value!);
}

function dhRatchet(s: RatchetState, header: Header) {
  s.pn = s.ns;
  s.ns = 0;
  s.nr = 0;
  s.dhr = header.dh;
  [s.rk, s.ckr] = kdfRk(s.rk, dh(s.dhsPriv, s.dhr));
  s.dhsPriv = x25519.utils.randomSecretKey();
  s.dhsPub = x25519.getPublicKey(s.dhsPriv);
  [s.rk, s.cks] = kdfRk(s.rk, dh(s.dhsPriv, s.dhr));
}

/**
 * Decrypts one message. The returned state must replace the old one; on any failure nothing is
 * returned, so a forged or corrupted message can never advance or damage the session.
 */
export function ratchetDecrypt(state: RatchetState, headerBytes: Uint8Array, body: Uint8Array, ad: Uint8Array) {
  const header = decodeHeader(headerBytes);
  const fullAd = concatBytes(ad, headerBytes);
  const open = (mk: Uint8Array) => {
    try {
      return unpad(aead(mk, fullAd).decrypt(body));
    } catch (err) {
      if (err instanceof CryptoError) throw err;
      throw new CryptoError("DECRYPT_FAILED", "Message could not be decrypted");
    }
  };

  const s = clone(state);
  const key = skipKey(header.dh, header.n);
  const skippedKey = s.skipped.get(key);
  if (skippedKey) {
    const plaintext = open(skippedKey);
    s.skipped.delete(key);
    return { state: s, plaintext };
  }

  if (!s.dhr || !equalBytes(header.dh, s.dhr)) {
    skipMessageKeys(s, header.pn);
    dhRatchet(s, header);
  } else if (header.n < s.nr) {
    throw new CryptoError("DUPLICATE_MESSAGE", "This message was already received");
  }
  skipMessageKeys(s, header.n);
  const [ck, mk] = kdfCk(s.ckr!);
  s.ckr = ck;
  s.nr += 1;
  return { state: s, plaintext: open(mk) };
}

export interface RatchetJSON {
  dhsPub: string;
  dhsPriv: string;
  dhr: string | null;
  rk: string;
  cks: string | null;
  ckr: string | null;
  ns: number;
  nr: number;
  pn: number;
  skipped: [string, string][];
}

const opt = (b: Uint8Array | null) => (b ? b64(b) : null);
const optFrom = (s: string | null) => (s ? fromB64(s) : null);

export const ratchetToJSON = (s: RatchetState): RatchetJSON => ({
  dhsPub: b64(s.dhsPub),
  dhsPriv: b64(s.dhsPriv),
  dhr: opt(s.dhr),
  rk: b64(s.rk),
  cks: opt(s.cks),
  ckr: opt(s.ckr),
  ns: s.ns,
  nr: s.nr,
  pn: s.pn,
  skipped: [...s.skipped].map(([k, v]) => [k, b64(v)]),
});

export const ratchetFromJSON = (j: RatchetJSON): RatchetState => ({
  dhsPub: fromB64(j.dhsPub),
  dhsPriv: fromB64(j.dhsPriv),
  dhr: optFrom(j.dhr),
  rk: fromB64(j.rk),
  cks: optFrom(j.cks),
  ckr: optFrom(j.ckr),
  ns: j.ns,
  nr: j.nr,
  pn: j.pn,
  skipped: new Map(j.skipped.map(([k, v]) => [k, fromB64(v)])),
});
