import { CryptoError, b64, fromB64 } from "./bytes.js";
import {
  type Identity,
  type PreKeyBundle,
  type PreKeyPair,
  type PublicIdentity,
  type PublicIdentityJSON,
  type SignedPreKeyPair,
  publicIdentityFromJSON,
  publicIdentityToJSON,
} from "./keys.js";
import {
  type RatchetJSON,
  type RatchetState,
  initReceiver,
  initSender,
  ratchetDecrypt,
  ratchetEncrypt,
  ratchetFromJSON,
  ratchetToJSON,
} from "./ratchet.js";
import { type X3DHHeader, x3dhInitiate, x3dhRespond } from "./x3dh.js";

/** A Double Ratchet session with one remote device, plus what is needed to keep it going. */
export interface Session {
  ratchet: RatchetState;
  ad: Uint8Array;
  remoteIdentity: PublicIdentity;
  /** Sent with every message until the other side replies, so it can build the session. */
  pendingPreKey: X3DHHeader | null;
}

/** What travels over the wire for one recipient device. Every field is base64url. */
export interface Envelope {
  v: 1;
  /** Present until the session is confirmed by a reply. */
  x3dh?: {
    identity: PublicIdentityJSON;
    ephemeral: string;
    signedPreKeyId: number;
    oneTimePreKeyId: number | null;
  };
  header: string;
  body: string;
}

/** Starts a session with a device from its fetched prekey bundle. */
export function initiateSession(me: Identity, bundle: PreKeyBundle): Session {
  const { sharedKey, ad, header } = x3dhInitiate(me, bundle);
  return {
    ratchet: initSender(sharedKey, bundle.signedPreKey.pub),
    ad,
    remoteIdentity: bundle.identity,
    pendingPreKey: header,
  };
}

export function encrypt(session: Session, plaintext: Uint8Array): { session: Session; envelope: Envelope } {
  const { state, header, body } = ratchetEncrypt(session.ratchet, plaintext, session.ad);
  const p = session.pendingPreKey;
  return {
    session: { ...session, ratchet: state },
    envelope: {
      v: 1,
      ...(p && {
        x3dh: {
          identity: publicIdentityToJSON(p.identity),
          ephemeral: b64(p.ephemeral),
          signedPreKeyId: p.signedPreKeyId,
          oneTimePreKeyId: p.oneTimePreKeyId,
        },
      }),
      header: b64(header),
      body: b64(body),
    },
  };
}

/** Decrypts a message on an existing session. Receiving anything confirms the session. */
export function decrypt(session: Session, envelope: Envelope): { session: Session; plaintext: Uint8Array } {
  const { state, plaintext } = ratchetDecrypt(
    session.ratchet,
    fromB64(envelope.header),
    fromB64(envelope.body),
    session.ad,
  );
  return { session: { ...session, ratchet: state, pendingPreKey: null }, plaintext };
}

export interface PreKeyStore {
  signedPreKey(id: number): SignedPreKeyPair | undefined;
  oneTimePreKey(id: number): PreKeyPair | undefined;
}

/**
 * Builds a session from the first envelope another device sent us. The caller must delete the used
 * one-time prekey once this succeeds, so replaying the same first message cannot build it again.
 */
export function acceptSession(me: Identity, keys: PreKeyStore, envelope: Envelope) {
  if (!envelope.x3dh) throw new CryptoError("BAD_ENVELOPE", "This message does not start a session");
  const x = envelope.x3dh;
  const signedPreKey = keys.signedPreKey(x.signedPreKeyId);
  if (!signedPreKey) throw new CryptoError("UNKNOWN_PREKEY", "Signed prekey is unknown or expired");
  const oneTimePreKey = x.oneTimePreKeyId === null ? null : keys.oneTimePreKey(x.oneTimePreKeyId);
  if (x.oneTimePreKeyId !== null && !oneTimePreKey) {
    throw new CryptoError("UNKNOWN_PREKEY", "One-time prekey was already used");
  }
  const header: X3DHHeader = {
    identity: publicIdentityFromJSON(x.identity),
    ephemeral: fromB64(x.ephemeral),
    signedPreKeyId: x.signedPreKeyId,
    oneTimePreKeyId: x.oneTimePreKeyId,
  };
  const { sharedKey, ad } = x3dhRespond(me, signedPreKey, oneTimePreKey ?? null, header);
  const session: Session = {
    ratchet: initReceiver(sharedKey, signedPreKey),
    ad,
    remoteIdentity: header.identity,
    pendingPreKey: null,
  };
  const out = decrypt(session, envelope);
  return { ...out, usedOneTimePreKeyId: x.oneTimePreKeyId };
}

/**
 * Decrypts any incoming envelope from one remote device. The sender repeats the session-start data
 * until we reply, and its one-time prekey is gone after the first use, so the existing session is
 * always tried first; a fresh session is only built when that fails and the envelope starts one
 * (for example after the sender reinstalled).
 */
export function receive(me: Identity, keys: PreKeyStore, existing: Session | null, envelope: Envelope) {
  if (existing) {
    try {
      return { ...decrypt(existing, envelope), usedOneTimePreKeyId: null as number | null };
    } catch (err) {
      if (!envelope.x3dh || !(err instanceof CryptoError) || err.code === "DUPLICATE_MESSAGE") throw err;
    }
  }
  return acceptSession(me, keys, envelope);
}

export interface SessionJSON {
  ratchet: RatchetJSON;
  ad: string;
  remoteIdentity: PublicIdentityJSON;
  pendingPreKey: Envelope["x3dh"] | null;
}

export const sessionToJSON = (s: Session): SessionJSON => ({
  ratchet: ratchetToJSON(s.ratchet),
  ad: b64(s.ad),
  remoteIdentity: publicIdentityToJSON(s.remoteIdentity),
  pendingPreKey: s.pendingPreKey && {
    identity: publicIdentityToJSON(s.pendingPreKey.identity),
    ephemeral: b64(s.pendingPreKey.ephemeral),
    signedPreKeyId: s.pendingPreKey.signedPreKeyId,
    oneTimePreKeyId: s.pendingPreKey.oneTimePreKeyId,
  },
});

export const sessionFromJSON = (j: SessionJSON): Session => ({
  ratchet: ratchetFromJSON(j.ratchet),
  ad: fromB64(j.ad),
  remoteIdentity: publicIdentityFromJSON(j.remoteIdentity),
  pendingPreKey: j.pendingPreKey
    ? {
        identity: publicIdentityFromJSON(j.pendingPreKey.identity),
        ephemeral: fromB64(j.pendingPreKey.ephemeral),
        signedPreKeyId: j.pendingPreKey.signedPreKeyId,
        oneTimePreKeyId: j.pendingPreKey.oneTimePreKeyId,
      }
    : null,
});
