import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { CryptoError, b64, concatBytes, equalBytes, fromB64, u32, utf8 } from "./bytes.js";

/**
 * A device's long-term identity: an Ed25519 key that signs, and an X25519 key used in key agreement.
 * The agreement key is signed by the signing key, so the pair always travels as one identity.
 */
export interface Identity {
  signPub: Uint8Array;
  signPriv: Uint8Array;
  dhPub: Uint8Array;
  dhPriv: Uint8Array;
  /** Signature of the agreement key by the signing key. */
  dhSig: Uint8Array;
}

export interface PublicIdentity {
  signPub: Uint8Array;
  dhPub: Uint8Array;
  dhSig: Uint8Array;
}

export interface PreKeyPair {
  id: number;
  pub: Uint8Array;
  priv: Uint8Array;
}

export interface SignedPreKeyPair extends PreKeyPair {
  sig: Uint8Array;
}

/** What a device publishes so others can start a session with it. */
export interface PreKeyBundle {
  identity: PublicIdentity;
  signedPreKey: { id: number; pub: Uint8Array; sig: Uint8Array };
  oneTimePreKey: { id: number; pub: Uint8Array } | null;
}

const IDENTITY_DH = utf8("SixFrites_IdentityDH_v1");
const SIGNED_PREKEY = utf8("SixFrites_SignedPreKey_v1");

export function generateIdentity(): Identity {
  const signPriv = ed25519.utils.randomSecretKey();
  const signPub = ed25519.getPublicKey(signPriv);
  const dhPriv = x25519.utils.randomSecretKey();
  const dhPub = x25519.getPublicKey(dhPriv);
  const dhSig = ed25519.sign(concatBytes(IDENTITY_DH, dhPub), signPriv);
  return { signPub, signPriv, dhPub, dhPriv, dhSig };
}

export const publicIdentity = (i: Identity): PublicIdentity => ({ signPub: i.signPub, dhPub: i.dhPub, dhSig: i.dhSig });

/** Throws unless the identity's agreement key really belongs to its signing key. */
export function verifyIdentity(i: PublicIdentity) {
  if (!ed25519.verify(i.dhSig, concatBytes(IDENTITY_DH, i.dhPub), i.signPub)) {
    throw new CryptoError("BAD_SIGNATURE", "Identity agreement key is not signed by the identity");
  }
}

export function generateSignedPreKey(identity: Identity, id: number): SignedPreKeyPair {
  const priv = x25519.utils.randomSecretKey();
  const pub = x25519.getPublicKey(priv);
  const sig = ed25519.sign(concatBytes(SIGNED_PREKEY, u32(id), pub), identity.signPriv);
  return { id, pub, priv, sig };
}

export function verifySignedPreKey(identity: PublicIdentity, spk: { id: number; pub: Uint8Array; sig: Uint8Array }) {
  if (!ed25519.verify(spk.sig, concatBytes(SIGNED_PREKEY, u32(spk.id), spk.pub), identity.signPub)) {
    throw new CryptoError("BAD_SIGNATURE", "Signed prekey signature is invalid");
  }
}

export function generateOneTimePreKeys(startId: number, count: number): PreKeyPair[] {
  return Array.from({ length: count }, (_, i) => {
    const priv = x25519.utils.randomSecretKey();
    return { id: startId + i, pub: x25519.getPublicKey(priv), priv };
  });
}

/** X25519 agreement that refuses the all-zero result a malicious low-order public key would produce. */
export function dh(priv: Uint8Array, pub: Uint8Array) {
  let out: Uint8Array;
  try {
    out = x25519.getSharedSecret(priv, pub);
  } catch {
    throw new CryptoError("BAD_KEY", "Key agreement failed");
  }
  if (equalBytes(out, new Uint8Array(32))) throw new CryptoError("BAD_KEY", "Key agreement produced a weak secret");
  return out;
}

export const identityBytes = (i: PublicIdentity) => concatBytes(i.signPub, i.dhPub);

export function sameIdentity(a: PublicIdentity, b: PublicIdentity) {
  return equalBytes(a.signPub, b.signPub) && equalBytes(a.dhPub, b.dhPub);
}

export interface IdentityJSON {
  signPub: string;
  signPriv: string;
  dhPub: string;
  dhPriv: string;
  dhSig: string;
}
export interface PublicIdentityJSON {
  signPub: string;
  dhPub: string;
  dhSig: string;
}

export const identityToJSON = (i: Identity): IdentityJSON => ({
  signPub: b64(i.signPub),
  signPriv: b64(i.signPriv),
  dhPub: b64(i.dhPub),
  dhPriv: b64(i.dhPriv),
  dhSig: b64(i.dhSig),
});
export const identityFromJSON = (j: IdentityJSON): Identity => ({
  signPub: fromB64(j.signPub),
  signPriv: fromB64(j.signPriv),
  dhPub: fromB64(j.dhPub),
  dhPriv: fromB64(j.dhPriv),
  dhSig: fromB64(j.dhSig),
});
export const publicIdentityToJSON = (i: PublicIdentity): PublicIdentityJSON => ({
  signPub: b64(i.signPub),
  dhPub: b64(i.dhPub),
  dhSig: b64(i.dhSig),
});
export const publicIdentityFromJSON = (j: PublicIdentityJSON): PublicIdentity => ({
  signPub: fromB64(j.signPub),
  dhPub: fromB64(j.dhPub),
  dhSig: fromB64(j.dhSig),
});
