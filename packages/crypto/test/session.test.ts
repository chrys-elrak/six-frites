import { describe, expect, it } from "vitest";
import {
  CryptoError,
  type Envelope,
  type Identity,
  MAX_SKIP,
  type PreKeyBundle,
  type PreKeyPair,
  type Session,
  type SignedPreKeyPair,
  decrypt,
  encrypt,
  fromUtf8,
  generateIdentity,
  generateOneTimePreKeys,
  generateSignedPreKey,
  initiateSession,
  publicIdentity,
  receive,
  sessionFromJSON,
  sessionToJSON,
  utf8,
} from "../src/index.js";

interface Device {
  identity: Identity;
  spk: SignedPreKeyPair;
  otks: Map<number, PreKeyPair>;
}

function device(): Device {
  const identity = generateIdentity();
  return {
    identity,
    spk: generateSignedPreKey(identity, 1),
    otks: new Map(generateOneTimePreKeys(1, 5).map((k) => [k.id, k])),
  };
}

function bundle(d: Device, withOtk = true): PreKeyBundle {
  const otk = withOtk ? [...d.otks.values()][0]! : null;
  return {
    identity: publicIdentity(d.identity),
    signedPreKey: { id: d.spk.id, pub: d.spk.pub, sig: d.spk.sig },
    oneTimePreKey: otk && { id: otk.id, pub: otk.pub },
  };
}

const store = (d: Device) => ({
  signedPreKey: (id: number) => (id === d.spk.id ? d.spk : undefined),
  oneTimePreKey: (id: number) => d.otks.get(id),
});

/** Bob receives an envelope the way an app would, deleting the one-time prekey it used. */
function bobReceives(bob: Device, existing: Session | null, env: Envelope) {
  const out = receive(bob.identity, store(bob), existing, env);
  if (out.usedOneTimePreKeyId !== null) bob.otks.delete(out.usedOneTimePreKeyId);
  return out;
}

const text = (b: Uint8Array) => fromUtf8(b);
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof CryptoError ? err.code : String(err);
  }
  return "no error";
};

describe("sessions", () => {
  it("lets two devices talk back and forth", () => {
    const alice = device();
    const bob = device();
    let a = initiateSession(alice.identity, bundle(bob));

    let sent = encrypt(a, utf8("hello bob"));
    a = sent.session;
    expect(sent.envelope.x3dh).toBeDefined();
    let r = bobReceives(bob, null, sent.envelope);
    let b = r.session;
    expect(text(r.plaintext)).toBe("hello bob");
    expect(bob.otks.size).toBe(4);

    for (let round = 0; round < 5; round++) {
      const fromBob = encrypt(b, utf8(`bob ${round}`));
      b = fromBob.session;
      const ra = decrypt(a, fromBob.envelope);
      a = ra.session;
      expect(text(ra.plaintext)).toBe(`bob ${round}`);

      const fromAlice = encrypt(a, utf8(`alice ${round}`));
      a = fromAlice.session;
      expect(fromAlice.envelope.x3dh).toBeUndefined();
      r = bobReceives(bob, b, fromAlice.envelope);
      b = r.session;
      expect(text(r.plaintext)).toBe(`alice ${round}`);
    }
  });

  it("works without a one-time prekey", () => {
    const alice = device();
    const bob = device();
    const sent = encrypt(initiateSession(alice.identity, bundle(bob, false)), utf8("hi"));
    expect(sent.envelope.x3dh?.oneTimePreKeyId).toBeNull();
    expect(text(bobReceives(bob, null, sent.envelope).plaintext)).toBe("hi");
  });

  it("keeps decrypting repeated session starts on the existing session", () => {
    const alice = device();
    const bob = device();
    let a = initiateSession(alice.identity, bundle(bob));
    const first = encrypt(a, utf8("one"));
    a = first.session;
    const second = encrypt(a, utf8("two"));
    expect(second.envelope.x3dh).toBeDefined();

    const r1 = bobReceives(bob, null, first.envelope);
    const r2 = bobReceives(bob, r1.session, second.envelope);
    expect(text(r2.plaintext)).toBe("two");
  });

  it("decrypts messages that arrive out of order or late", () => {
    const alice = device();
    const bob = device();
    let a = initiateSession(alice.identity, bundle(bob));
    const first = encrypt(a, utf8("start"));
    a = first.session;
    let b = bobReceives(bob, null, first.envelope).session;

    const envs: Envelope[] = [];
    for (let i = 0; i < 6; i++) {
      const sent = encrypt(a, utf8(`m${i}`));
      a = sent.session;
      envs.push(sent.envelope);
    }
    for (const i of [3, 0, 5, 1, 4, 2]) {
      const r = decrypt(b, envs[i]!);
      b = r.session;
      expect(text(r.plaintext)).toBe(`m${i}`);
    }
  });

  it("handles late messages from a previous sending chain after a ratchet step", () => {
    const alice = device();
    const bob = device();
    let a = initiateSession(alice.identity, bundle(bob));
    const s0 = encrypt(a, utf8("a0"));
    a = s0.session;
    const s1 = encrypt(a, utf8("a1"));
    a = s1.session;
    let b = bobReceives(bob, null, s0.envelope).session;

    const reply = encrypt(b, utf8("b0"));
    b = reply.session;
    a = decrypt(a, reply.envelope).session;
    const s2 = encrypt(a, utf8("a2"));
    a = s2.session;

    let r = decrypt(b, s2.envelope);
    b = r.session;
    expect(text(r.plaintext)).toBe("a2");
    r = decrypt(b, s1.envelope);
    expect(text(r.plaintext)).toBe("a1");
  });

  it("rejects replays", () => {
    const alice = device();
    const bob = device();
    const a = initiateSession(alice.identity, bundle(bob));
    const sent = encrypt(a, utf8("once"));
    const b = bobReceives(bob, null, sent.envelope).session;
    expect(code(() => bobReceives(bob, b, sent.envelope))).toBe("DUPLICATE_MESSAGE");
  });

  it("refuses to rebuild a session from a replayed first message once its prekey is used", () => {
    const alice = device();
    const bob = device();
    const sent = encrypt(initiateSession(alice.identity, bundle(bob)), utf8("once"));
    bobReceives(bob, null, sent.envelope);
    expect(code(() => bobReceives(bob, null, sent.envelope))).toBe("UNKNOWN_PREKEY");
  });

  it("rejects tampered bodies and headers without changing the session", () => {
    const alice = device();
    const bob = device();
    let a = initiateSession(alice.identity, bundle(bob));
    const first = encrypt(a, utf8("start"));
    a = first.session;
    const b = bobReceives(bob, null, first.envelope).session;

    const sent = encrypt(a, utf8("secret"));
    const flip = (s: string) => (s[5] === "A" ? `${s.slice(0, 5)}B${s.slice(6)}` : `${s.slice(0, 5)}A${s.slice(6)}`);
    expect(code(() => decrypt(b, { ...sent.envelope, body: flip(sent.envelope.body) }))).toBe("DECRYPT_FAILED");
    expect(code(() => decrypt(b, { ...sent.envelope, header: flip(sent.envelope.header) }))).not.toBe("no error");
    expect(text(decrypt(b, sent.envelope).plaintext)).toBe("secret");
  });

  it("rejects a bundle whose signed prekey was not signed by its identity", () => {
    const alice = device();
    const bob = device();
    const mallory = device();
    const forged = bundle(bob);
    forged.signedPreKey = { id: mallory.spk.id, pub: mallory.spk.pub, sig: mallory.spk.sig };
    expect(code(() => initiateSession(alice.identity, forged))).toBe("BAD_SIGNATURE");

    const swapped = bundle(bob);
    swapped.identity = { ...swapped.identity, dhPub: mallory.identity.dhPub };
    expect(code(() => initiateSession(alice.identity, swapped))).toBe("BAD_SIGNATURE");
  });

  it("cannot be read by a device that is not the recipient", () => {
    const alice = device();
    const bob = device();
    const eve = device();
    eve.spk = { ...bob.spk };
    const sent = encrypt(initiateSession(alice.identity, bundle(bob)), utf8("for bob"));
    expect(code(() => receive(eve.identity, store(eve), null, sent.envelope))).toBe("DECRYPT_FAILED");
  });

  it("limits how many skipped messages one step may create", () => {
    const alice = device();
    const bob = device();
    let a = initiateSession(alice.identity, bundle(bob));
    const first = encrypt(a, utf8("start"));
    a = first.session;
    const b = bobReceives(bob, null, first.envelope).session;
    for (let i = 0; i <= MAX_SKIP + 1; i++) a = encrypt(a, utf8("x")).session;
    const far = encrypt(a, utf8("far"));
    expect(code(() => decrypt(b, far.envelope))).toBe("TOO_MANY_SKIPPED");
  });

  it("survives saving and loading in the middle of a conversation", () => {
    const alice = device();
    const bob = device();
    let a = initiateSession(alice.identity, bundle(bob));
    const first = encrypt(a, utf8("one"));
    a = first.session;
    const late = encrypt(a, utf8("late"));
    a = late.session;
    const now = encrypt(a, utf8("now"));
    a = now.session;

    let b = bobReceives(bob, null, first.envelope).session;
    b = decrypt(b, now.envelope).session;

    const roundTrip = (s: Session) => sessionFromJSON(JSON.parse(JSON.stringify(sessionToJSON(s))));
    a = roundTrip(a);
    b = roundTrip(b);

    expect(text(decrypt(b, late.envelope).plaintext)).toBe("late");
    const reply = encrypt(b, utf8("reply"));
    expect(text(decrypt(a, reply.envelope).plaintext)).toBe("reply");
  });

  it("gives forward secrecy: an old state cannot read messages from after it", () => {
    const alice = device();
    const bob = device();
    let a = initiateSession(alice.identity, bundle(bob));
    const first = encrypt(a, utf8("start"));
    a = first.session;
    let b = bobReceives(bob, null, first.envelope).session;

    const stolen = sessionToJSON(b);
    for (let i = 0; i < 3; i++) {
      const reply = encrypt(b, utf8("ping"));
      b = reply.session;
      a = decrypt(a, reply.envelope).session;
      const back = encrypt(a, utf8(`after ${i}`));
      a = back.session;
      b = decrypt(b, back.envelope).session;
    }
    const later = encrypt(a, utf8("private"));
    const old = sessionFromJSON(stolen);
    expect(code(() => decrypt(old, later.envelope))).not.toBe("no error");
  });

  it("starts a new session when the sender reinstalled", () => {
    const alice = device();
    const bob = device();
    const sent = encrypt(initiateSession(alice.identity, bundle(bob)), utf8("before"));
    const b = bobReceives(bob, null, sent.envelope).session;

    const alice2 = device();
    const fresh = encrypt(initiateSession(alice2.identity, bundle(bob)), utf8("after reinstall"));
    const r = bobReceives(bob, b, fresh.envelope);
    expect(text(r.plaintext)).toBe("after reinstall");
    expect(r.session.remoteIdentity.signPub).toEqual(alice2.identity.signPub);
  });
});
