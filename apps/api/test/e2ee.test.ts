import {
  type Envelope,
  type Identity,
  type PreKeyPair,
  type Session,
  type SignedPreKeyPair,
  b64,
  backupKeyId,
  decryptMedia,
  deriveBackupKey,
  encrypt,
  encryptMedia,
  fromB64,
  fromUtf8,
  generateIdentity,
  generateOneTimePreKeys,
  generateRecoveryKey,
  generateSignedPreKey,
  initiateSession,
  openBackup,
  publicIdentityFromJSON,
  publicIdentityToJSON,
  receive,
  sealBackup,
  utf8,
} from "@six/crypto";
import { describe, expect, it } from "vitest";
import { type Auth, bearer, chatHelpers, loginAs, prisma, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, makeFriends } = chatHelpers(ctx);

interface DeviceEnvelope {
  deviceId: string;
  envelope: Envelope;
}

/** A device the way an app would run one: its keys, its sessions, and what it can decrypt. */
class Device {
  identity: Identity = generateIdentity();
  spk: SignedPreKeyPair = generateSignedPreKey(this.identity, 1);
  otks = new Map<number, PreKeyPair>(generateOneTimePreKeys(1, 5).map((k) => [k.id, k]));
  sessions = new Map<string, Session>();
  id = "";

  constructor(readonly auth: Auth) {}

  keysBody() {
    return {
      identity: publicIdentityToJSON(this.identity),
      signedPreKey: { id: this.spk.id, pub: b64(this.spk.pub), sig: b64(this.spk.sig) },
      oneTimePreKeys: [...this.otks.values()].map((k) => ({ id: k.id, pub: b64(k.pub) })),
    };
  }

  async register() {
    const res = await call(this.auth, "PUT", "/v1/devices/me", this.keysBody());
    expect(res.statusCode, res.body).toBe(200);
    this.id = res.json().id;
    return res.json();
  }

  /** Seals `text` for every device that should get a message in this chat, starting sessions as needed. */
  async seal(chatId: string, text: string): Promise<DeviceEnvelope[]> {
    const chat = await get(this.auth, `/v1/chats/${chatId}`);
    const userIds = chat.members.map((m: { user: { id: string } }) => m.user.id).join(",");
    const devices: { id: string }[] = (await get(this.auth, `/v1/devices?userIds=${userIds}`)).items;
    const targets = devices.map((d) => d.id).filter((id) => id !== this.id);
    const missing = targets.filter((id) => !this.sessions.has(id));
    if (missing.length) {
      const claimed = await call(this.auth, "POST", "/v1/devices/prekeys/claim", { deviceIds: missing });
      for (const b of claimed.json().items) {
        this.sessions.set(
          b.deviceId,
          initiateSession(this.identity, {
            identity: publicIdentityFromJSON(b.identity),
            signedPreKey: { id: b.signedPreKey.id, pub: fromB64(b.signedPreKey.pub), sig: fromB64(b.signedPreKey.sig) },
            oneTimePreKey: b.oneTimePreKey && { id: b.oneTimePreKey.id, pub: fromB64(b.oneTimePreKey.pub) },
          }),
        );
      }
    }
    return targets.map((deviceId) => {
      const out = encrypt(this.sessions.get(deviceId)!, utf8(text));
      this.sessions.set(deviceId, out.session);
      return { deviceId, envelope: out.envelope };
    });
  }

  read(message: { senderId: string; encryption: { envelopes: DeviceEnvelope[] } }, fromDevice: string) {
    const mine = message.encryption.envelopes.find((e) => e.deviceId === this.id);
    if (!mine) throw new Error("no envelope for this device");
    const store = {
      signedPreKey: (id: number) => (id === this.spk.id ? this.spk : undefined),
      oneTimePreKey: (id: number) => this.otks.get(id),
    };
    const out = receive(this.identity, store, this.sessions.get(fromDevice) ?? null, mine.envelope);
    if (out.usedOneTimePreKeyId !== null) this.otks.delete(out.usedOneTimePreKeyId);
    this.sessions.set(fromDevice, out.session);
    return fromUtf8(out.plaintext);
  }
}

async function secondDevice(sub: string) {
  return (await loginAs(ctx.app, sub)).json() as Auth;
}

async function friendsWithDevices() {
  const sub = uniqueSub("multi");
  const first = (await loginAs(ctx.app, sub)).json() as Auth;
  const invite = await call(first, "POST", "/v1/invites", {});
  const guestAuth = (await loginAs(ctx.app, uniqueSub("guest"), "ios", { inviteCode: invite.json().code })).json();
  const chatId = (await get(first, "/v1/contacts")).items[0].chatId as string;
  const phone = new Device(first);
  const laptop = new Device(await secondDevice(sub));
  const guest = new Device(guestAuth);
  for (const d of [phone, laptop, guest]) await d.register();
  return { phone, laptop, guest, chatId };
}

const sendEncrypted = (from: Device, chatId: string, envelopes: DeviceEnvelope[], extra: object = {}) =>
  call(from.auth, "POST", `/v1/chats/${chatId}/messages`, {
    clientId: `e-${Math.random()}`,
    encrypted: { envelopes, ...extra },
  });

describe("device keys", () => {
  it("publishes keys, refuses forged ones and reports what is left", async () => {
    const { host } = await makeFriends();
    const device = new Device(host);
    expect((await get(host, "/v1/devices/me")).error.code).toBe("DEVICE_NOT_REGISTERED");

    const forged = device.keysBody();
    forged.signedPreKey.sig = b64(new Uint8Array(64));
    expect((await call(host, "PUT", "/v1/devices/me", forged)).json().error.code).toBe("BAD_KEY");

    const mine = await device.register();
    expect(mine).toMatchObject({ userId: host.user.id, signedPreKeyId: 1, oneTimePreKeys: 5 });
    expect((await device.register()).id).toBe(mine.id);

    const more = generateOneTimePreKeys(100, 3).map((k) => ({ id: k.id, pub: b64(k.pub) }));
    expect((await call(host, "POST", "/v1/devices/me/prekeys", { oneTimePreKeys: more })).json().oneTimePreKeys).toBe(8);

    const reinstalled = new Device(host);
    const replaced = await reinstalled.register();
    expect(replaced.id).not.toBe(mine.id);
    expect((await get(host, `/v1/devices?userIds=${host.user.id}`)).items.map((d: { id: string }) => d.id)).toEqual([
      replaced.id,
    ]);
  });

  it("hands out each one-time prekey once, then only the signed prekey", async () => {
    const { host, guest } = await makeFriends();
    const device = new Device(guest);
    await device.register();
    const claim = async () =>
      (await call(host, "POST", "/v1/devices/prekeys/claim", { deviceIds: [device.id] })).json().items[0];

    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await claim()).oneTimePreKey.id);
    expect(new Set(ids).size).toBe(5);
    expect(await claim()).toMatchObject({ deviceId: device.id, oneTimePreKey: null, signedPreKey: { id: 1 } });
  });

  it("only shows devices of people you share a chat with", async () => {
    const { host } = await makeFriends();
    const { guest: stranger } = await makeFriends();
    const device = new Device(stranger);
    await device.register();
    expect((await get(host, `/v1/devices?userIds=${stranger.user.id}`)).error.code).toBe("USER_NOT_FOUND");
    const claim = await call(host, "POST", "/v1/devices/prekeys/claim", { deviceIds: [device.id] });
    expect(claim.json().error.code).toBe("USER_NOT_FOUND");
  });

  it("forgets a device when it signs out and tells the people who write to it", async () => {
    const { phone, laptop, guest } = await friendsWithDevices();
    const { cursor } = await get(guest.auth, "/v1/sync");
    expect((await call(laptop.auth, "POST", "/v1/auth/logout")).statusCode).toBe(204);

    const ids = (await get(guest.auth, `/v1/devices?userIds=${phone.auth.user.id}`)).items.map((d: { id: string }) => d.id);
    expect(ids).toEqual([phone.id]);
    const events = (await get(guest.auth, `/v1/sync?since=${cursor}`)).events;
    expect(events).toContainEqual(expect.objectContaining({ type: "devices.changed", data: { userId: phone.auth.user.id } }));
  });
});

describe("encrypted messages", () => {
  it("delivers each device its own envelope and turns encryption on for the chat", async () => {
    const { phone, laptop, guest, chatId } = await friendsWithDevices();

    const partial = await sendEncrypted(phone, chatId, (await phone.seal(chatId, "hi")).filter((e) => e.deviceId === guest.id));
    expect(partial.statusCode).toBe(409);
    expect(partial.json().error).toMatchObject({ code: "DEVICES_CHANGED", details: { missing: [laptop.id], extra: [] } });

    const sent = await sendEncrypted(phone, chatId, await phone.seal(chatId, "hello, privately"));
    expect(sent.statusCode, sent.body).toBe(201);
    expect(sent.json()).toMatchObject({ type: "text", text: null, encryption: { backup: null } });
    expect(sent.json().encryption.envelopes.map((e: DeviceEnvelope) => e.deviceId)).toEqual([laptop.id]);

    const [message, notice] = (await get(guest.auth, `/v1/chats/${chatId}/messages`)).items;
    expect(notice).toMatchObject({ type: "service", action: { type: "e2ee" } });
    expect(message.encryption.envelopes.map((e: DeviceEnvelope) => e.deviceId)).toEqual([guest.id]);
    expect(message.encryption.senderDeviceId).toBe(phone.id);
    expect(guest.read(message, phone.id)).toBe("hello, privately");

    const onLaptop = (await get(laptop.auth, `/v1/chats/${chatId}/messages`)).items[0];
    expect(onLaptop.encryption.envelopes.map((e: DeviceEnvelope) => e.deviceId)).toEqual([laptop.id]);
    expect(laptop.read(onLaptop, phone.id)).toBe("hello, privately");

    expect((await get(guest.auth, `/v1/chats/${chatId}`)).encrypted).toBe(true);
    const plain = await call(guest.auth, "POST", `/v1/chats/${chatId}/messages`, { clientId: "plain", text: "oops" });
    expect(plain.json().error.code).toBe("ENCRYPTION_REQUIRED");

    const reply = await sendEncrypted(guest, chatId, await guest.seal(chatId, "got it"));
    expect(reply.statusCode).toBe(201);
    const back = (await get(phone.auth, `/v1/chats/${chatId}/messages`)).items[0];
    expect(phone.read(back, guest.id)).toBe("got it");
    expect(laptop.read((await get(laptop.auth, `/v1/chats/${chatId}/messages`)).items[0], guest.id)).toBe("got it");
  });

  it("refuses encrypted content from a device that has no keys", async () => {
    const { host, guest, chatId } = await makeFriends();
    const g = new Device(guest);
    await g.register();
    const res = await call(host, "POST", `/v1/chats/${chatId}/messages`, {
      clientId: "nokeys",
      encrypted: { envelopes: [] },
    });
    expect(res.json().error.code).toBe("DEVICE_NOT_REGISTERED");
  });

  it("edits by replacing the envelopes, and drops them when deleted for everyone", async () => {
    const { phone, laptop, guest, chatId } = await friendsWithDevices();
    const { id } = (await sendEncrypted(phone, chatId, await phone.seal(chatId, "first"))).json();
    guest.read((await get(guest.auth, `/v1/chats/${chatId}/messages`)).items[0], phone.id);
    laptop.read((await get(laptop.auth, `/v1/chats/${chatId}/messages`)).items[0], phone.id);

    expect((await call(phone.auth, "PATCH", `/v1/messages/${id}`, { text: "plain" })).json().error.code).toBe(
      "ENCRYPTION_REQUIRED",
    );
    const edited = await call(phone.auth, "PATCH", `/v1/messages/${id}`, {
      encrypted: { envelopes: await phone.seal(chatId, "second") },
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json().editedAt).not.toBeNull();
    expect(guest.read((await get(guest.auth, `/v1/chats/${chatId}/messages`)).items[0], phone.id)).toBe("second");

    expect((await call(phone.auth, "DELETE", `/v1/messages?ids=${id}&scope=all`)).statusCode).toBe(204);
    expect(await prisma.messageEnvelope.count({ where: { messageId: id } })).toBe(0);
    const gone = (await get(guest.auth, `/v1/chats/${chatId}/messages`)).items[0];
    expect(gone.encryption).toEqual({ senderDeviceId: phone.id, envelopes: [], backup: null });
  });

  it("keeps backups per person, sealed with their recovery key", async () => {
    const { phone, guest, chatId } = await friendsWithDevices();
    const { entropy } = generateRecoveryKey();
    const key = deriveBackupKey(entropy);
    const keyId = backupKeyId(key);
    expect((await call(phone.auth, "PUT", "/v1/me/backup-key", { backupKeyId: keyId })).json().backupKeyId).toBe(keyId);

    const sealed = (clientId: string, text: string) => sealBackup(key, utf8(text), utf8(clientId));
    const sent = await call(phone.auth, "POST", `/v1/chats/${chatId}/messages`, {
      clientId: "with-backup",
      encrypted: { envelopes: await phone.seal(chatId, "kept safe"), backup: sealed("with-backup", "kept safe") },
    });
    expect(sent.statusCode, sent.body).toBe(201);

    const fresh = (await get(phone.auth, `/v1/chats/${chatId}/messages`)).items[0];
    expect(fromUtf8(openBackup(key, fresh.encryption.backup, utf8("with-backup")))).toBe("kept safe");
    const theirs = (await get(guest.auth, `/v1/chats/${chatId}/messages`)).items[0];
    expect(theirs.encryption.backup).toBeNull();

    const guestKey = deriveBackupKey(generateRecoveryKey().entropy);
    const items = [{ messageId: theirs.id, sealed: sealBackup(guestKey, utf8("kept safe"), utf8("with-backup")) }];
    expect((await call(guest.auth, "POST", "/v1/messages/backups", { items })).json().error.code).toBe(
      "BACKUP_KEY_MISMATCH",
    );
    await call(guest.auth, "PUT", "/v1/me/backup-key", { backupKeyId: backupKeyId(guestKey) });
    expect((await call(guest.auth, "POST", "/v1/messages/backups", { items })).statusCode).toBe(204);
    expect((await get(guest.auth, `/v1/chats/${chatId}/messages`)).items[0].encryption.backup).toBe(items[0]!.sealed);

    const other = deriveBackupKey(generateRecoveryKey().entropy);
    await call(phone.auth, "PUT", "/v1/me/backup-key", { backupKeyId: backupKeyId(other) });
    expect((await get(phone.auth, `/v1/chats/${chatId}/messages`)).items[0].encryption.backup).toBeNull();
  });

  it("stores encrypted files as they are, without processing", async () => {
    const { phone, guest, chatId } = await friendsWithDevices();
    const photo = encryptMedia(utf8("pretend this is a jpeg"));
    const presign = await call(phone.auth, "POST", "/v1/uploads/presign", {
      kind: "image",
      mime: "application/octet-stream",
      name: "encrypted",
      size: photo.data.length,
      encrypted: true,
    });
    expect(presign.statusCode, presign.body).toBe(201);
    const { url, headers, upload } = presign.json();
    expect((await fetch(url, { method: "PUT", body: photo.data, headers })).status).toBe(200);
    const done = (await call(phone.auth, "POST", `/v1/uploads/${upload.id}/complete`)).json();
    expect(done).toMatchObject({ status: "ready", encrypted: true, thumbUrl: null });

    const sent = await sendEncrypted(phone, chatId, await phone.seal(chatId, "photo key goes here"), {});
    expect(sent.statusCode).toBe(201);
    const withFile = await call(phone.auth, "POST", `/v1/chats/${chatId}/messages`, {
      clientId: "photo",
      attachmentId: upload.id,
      encrypted: { envelopes: await phone.seal(chatId, "caption and key") },
    });
    expect(withFile.json()).toMatchObject({ type: "image", attachment: { encrypted: true } });

    const seen = (await get(guest.auth, `/v1/chats/${chatId}/messages`)).items[0];
    const bytes = new Uint8Array(await (await fetch(seen.attachment.url)).arrayBuffer());
    expect(fromUtf8(decryptMedia(bytes, photo.key, photo.digest))).toBe("pretend this is a jpeg");
  });

  it("refuses to attach an encrypted file to a plain message", async () => {
    const { host, chatId } = await makeFriends();
    const presign = await call(host, "POST", "/v1/uploads/presign", {
      kind: "file",
      mime: "application/octet-stream",
      name: "encrypted",
      size: 40,
      encrypted: true,
    });
    const { url, headers, upload } = presign.json();
    await fetch(url, { method: "PUT", body: new Uint8Array(40), headers });
    await call(host, "POST", `/v1/uploads/${upload.id}/complete`);
    const res = await call(host, "POST", `/v1/chats/${chatId}/messages`, { clientId: "x", attachmentId: upload.id });
    expect(res.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("sends encrypted scheduled messages to the devices still signed in", async () => {
    const { phone, laptop, guest, chatId } = await friendsWithDevices();
    const scheduled = await call(phone.auth, "POST", `/v1/chats/${chatId}/scheduled-messages`, {
      clientId: "later",
      sendAt: new Date(Date.now() + 60_000).toISOString(),
      encrypted: { envelopes: await phone.seal(chatId, "see you tomorrow") },
    });
    expect(scheduled.statusCode, scheduled.body).toBe(201);
    expect(scheduled.json()).toMatchObject({ text: null, encryption: { envelopes: [] } });

    await call(laptop.auth, "POST", "/v1/auth/logout");
    const now = await call(phone.auth, "POST", `/v1/scheduled-messages/${scheduled.json().id}/send`);
    expect(now.statusCode, now.body).toBe(200);
    const message = (await get(guest.auth, `/v1/chats/${chatId}/messages`)).items[0];
    expect(message.encryption.senderDeviceId).toBe(phone.id);
    expect(guest.read(message, phone.id)).toBe("see you tomorrow");
    expect(await prisma.messageEnvelope.count({ where: { messageId: message.id } })).toBe(1);
  });
});

describe("existing chats", () => {
  it("keep their plain messages, which stay unencrypted after encryption starts", async () => {
    const { phone, guest, chatId } = await friendsWithDevices();
    const before = await call(guest.auth, "POST", `/v1/chats/${chatId}/messages`, { clientId: "old", text: "plain hi" });
    expect(before.json()).toMatchObject({ text: "plain hi", encryption: null });
    await sendEncrypted(phone, chatId, await phone.seal(chatId, "now private"));
    const items = (await get(guest.auth, `/v1/chats/${chatId}/messages`)).items;
    expect(items.at(-1)).toMatchObject({ text: "plain hi", encryption: null });
    expect(
      (await ctx.app.inject({ url: `/v1/chats/${chatId}`, headers: bearer(guest.auth.accessToken) })).json().lastMessage
        .encryption,
    ).not.toBeNull();
  });
});

describe("encrypted checklists", () => {
  it("keep their items in the envelopes while ticks stay on the server", async () => {
    const { phone, guest, chatId } = await friendsWithDevices();
    const sent = await call(phone.auth, "POST", `/v1/chats/${chatId}/messages`, {
      clientId: `e-${Math.random()}`,
      type: "checklist",
      encrypted: { envelopes: await phone.seal(chatId, "the list") },
    });
    expect(sent.statusCode, sent.body).toBe(201);
    expect(sent.json()).toMatchObject({ type: "checklist", checklist: null, checks: [] });

    const tick = (item: number) => call(guest.auth, "PUT", `/v1/messages/${sent.json().id}/checklist/${item}`, { done: true });
    expect((await tick(4)).json().checks).toMatchObject([{ item: 4, userId: guest.auth.user.id }]);
    expect((await tick(30)).statusCode).toBe(400);

    const plain = await call(guest.auth, "POST", `/v1/chats/${chatId}/messages`, {
      clientId: "plain-list",
      checklist: { title: "Leak", items: ["a"] },
    });
    expect(plain.json().error.code).toBe("ENCRYPTION_REQUIRED");
  });
});
