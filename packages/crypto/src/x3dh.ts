import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8 } from "./bytes.js";
import {
  type Identity,
  type PreKeyBundle,
  type PreKeyPair,
  type PublicIdentity,
  type SignedPreKeyPair,
  dh,
  identityBytes,
  publicIdentity,
  verifyIdentity,
  verifySignedPreKey,
} from "./keys.js";

const INFO = utf8("SixFrites_X3DH_v1");
const F = new Uint8Array(32).fill(0xff);

const kdf = (parts: Uint8Array[]) => hkdf(sha256, concatBytes(F, ...parts), new Uint8Array(32), INFO, 32);

/** What the initiator sends with its first messages so the responder can derive the same secret. */
export interface X3DHHeader {
  identity: PublicIdentity;
  ephemeral: Uint8Array;
  signedPreKeyId: number;
  oneTimePreKeyId: number | null;
}

export interface X3DHResult {
  sharedKey: Uint8Array;
  /** Associated data binding every message to both identities: initiator's, then responder's. */
  ad: Uint8Array;
}

/** Initiator side (Alice) of X3DH against a fetched prekey bundle. */
export function x3dhInitiate(me: Identity, bundle: PreKeyBundle): X3DHResult & { header: X3DHHeader } {
  verifyIdentity(bundle.identity);
  verifySignedPreKey(bundle.identity, bundle.signedPreKey);

  const ekPriv = x25519.utils.randomSecretKey();
  const ekPub = x25519.getPublicKey(ekPriv);
  const parts = [
    dh(me.dhPriv, bundle.signedPreKey.pub),
    dh(ekPriv, bundle.identity.dhPub),
    dh(ekPriv, bundle.signedPreKey.pub),
  ];
  if (bundle.oneTimePreKey) parts.push(dh(ekPriv, bundle.oneTimePreKey.pub));

  return {
    sharedKey: kdf(parts),
    ad: concatBytes(identityBytes(publicIdentity(me)), identityBytes(bundle.identity)),
    header: {
      identity: publicIdentity(me),
      ephemeral: ekPub,
      signedPreKeyId: bundle.signedPreKey.id,
      oneTimePreKeyId: bundle.oneTimePreKey?.id ?? null,
    },
  };
}

/** Responder side (Bob): recomputes the secret from the initiator's header and its own prekeys. */
export function x3dhRespond(
  me: Identity,
  signedPreKey: SignedPreKeyPair,
  oneTimePreKey: PreKeyPair | null,
  header: X3DHHeader,
): X3DHResult {
  verifyIdentity(header.identity);
  const parts = [
    dh(signedPreKey.priv, header.identity.dhPub),
    dh(me.dhPriv, header.ephemeral),
    dh(signedPreKey.priv, header.ephemeral),
  ];
  if (oneTimePreKey) parts.push(dh(oneTimePreKey.priv, header.ephemeral));

  return {
    sharedKey: kdf(parts),
    ad: concatBytes(identityBytes(header.identity), identityBytes(publicIdentity(me))),
  };
}
