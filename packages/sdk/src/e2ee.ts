import {
  CryptoError,
  type Envelope,
  type Identity,
  type IdentityJSON,
  type Session,
  type SessionJSON,
  acceptSession,
  b64,
  backupKeyId,
  decrypt,
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
  identityFromJSON,
  identityToJSON,
  initiateSession,
  openBackup,
  publicIdentity,
  publicIdentityFromJSON,
  publicIdentityToJSON,
  recoveryKeyFromWords,
  safetyNumber,
  sameIdentity,
  sealBackup,
  sessionFromJSON,
  sessionToJSON,
  utf8,
} from "@six/crypto";
import {
  type DeviceDTO,
  type EncryptedFile,
  type EncryptedInput,
  type MessageContent,
  type MessageDTO,
  PREKEYS,
  MessageContent as MessageContentSchema,
} from "@six/shared";
import { SixApiError, unwrap } from "./errors.js";
import type { RestClient } from "./rest.js";

/**
 * Where a device keeps its private keys, sessions and decrypted messages. Everything in it is
 * secret: back it with the platform's secure storage (or data encrypted with a key kept there).
 */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Removes everything, for signing out. */
  clear(): Promise<void>;
}

/** What goes into a message besides the fields that tie it to its chat. */
export type ContentInput = Omit<MessageContent, "v" | "chatId" | "clientId">;

export type Opened =
  | { status: "ok"; content: MessageContent }
  | { status: "plain" }
  | { status: "unavailable"; reason: "no-envelope" | "failed" | "hidden" };

interface PreKeyState {
  signed: { id: number; pub: string; priv: string; sig: string; at: number }[];
  oneTime: Record<string, { pub: string; priv: string }>;
  nextOneTimeId: number;
}

interface Cached {
  content: MessageContent;
  editedAt: string | null;
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
/** Old signed prekeys stay usable this long, for session starts that were already on their way. */
const KEEP_SIGNED = 3;
const KEEP_ONE_TIME = 400;
const MAX_ARCHIVED = 2;

const backupLabel = (chatId: string, senderId: string, clientId: string) => utf8(`${chatId}:${senderId}:${clientId}`);

const identityKey = (d: { signPub: string; dhPub: string }) => `${d.signPub}.${d.dhPub}`;

/**
 * End-to-end encryption for one signed-in device. It publishes the device's keys, keeps a Double
 * Ratchet session with every device it talks to, seals message content for all the devices in a
 * chat and opens what arrives. Every change to keys or sessions runs one at a time and is saved
 * before anything is sent, so a crash can never reuse a message key.
 */
export class E2EE {
  deviceId: string | null = null;
  private identity: Identity | null = null;
  private setup: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private pendingBackups = new Map<string, string>();
  private backupTimer: ReturnType<typeof setTimeout> | null = null;
  private identityListeners = new Set<(userId: string) => void>();

  constructor(
    private readonly api: RestClient,
    private readonly store: SecretStore,
    readonly userId: string,
  ) {}

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => null);
    return run;
  }

  private async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.store.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  private setJSON(key: string, value: unknown) {
    return this.store.set(key, JSON.stringify(value));
  }

  /** Calls `fn` with the user id whenever someone's set of devices changes after we first saw it. */
  onIdentityChange(fn: (userId: string) => void) {
    this.identityListeners.add(fn);
    return () => void this.identityListeners.delete(fn);
  }

  /** Publishes this device's keys if needed and tops up prekeys. Safe to call often. */
  ready() {
    this.setup ??= this.serial(() => this.prepare()).catch((err) => {
      this.setup = null;
      throw err;
    });
    return this.setup;
  }

  private async prepare() {
    const saved = await this.getJSON<IdentityJSON>("identity");
    this.identity = saved ? identityFromJSON(saved) : generateIdentity();
    if (!saved) await this.setJSON("identity", identityToJSON(this.identity));
    let prekeys = await this.getJSON<PreKeyState>("prekeys");
    if (!prekeys) {
      prekeys = { signed: [], oneTime: {}, nextOneTimeId: 1 };
      this.addSignedPreKey(prekeys, 1);
    }

    const current = await this.api.GET("/v1/devices/me");
    const same =
      current.data &&
      current.data.identity.signPub === b64(this.identity.signPub) &&
      current.data.signedPreKeyId === prekeys.signed[0]!.id;
    if (current.data && same) {
      this.deviceId = current.data.id;
      if (Date.now() - prekeys.signed[0]!.at > WEEK) await this.rotateSignedPreKey(prekeys);
      if (current.data.oneTimePreKeys < PREKEYS.low) {
        const fresh = this.addOneTimePreKeys(prekeys, PREKEYS.batch - current.data.oneTimePreKeys);
        await this.setJSON("prekeys", prekeys);
        unwrap(await this.api.POST("/v1/devices/me/prekeys", { body: { oneTimePreKeys: fresh } }));
      }
      return;
    }
    const code = (current.error as { error?: { code?: string } } | undefined)?.error?.code;
    if (!current.response.ok && code !== "DEVICE_NOT_REGISTERED") unwrap(current);

    const fresh = this.addOneTimePreKeys(prekeys, PREKEYS.batch);
    await this.setJSON("prekeys", prekeys);
    const spk = prekeys.signed[0]!;
    const device = unwrap(
      await this.api.PUT("/v1/devices/me", {
        body: {
          identity: publicIdentityToJSON(publicIdentity(this.identity)),
          signedPreKey: { id: spk.id, pub: spk.pub, sig: spk.sig },
          oneTimePreKeys: fresh,
        },
      }),
    );
    this.deviceId = device.id;
  }

  private addSignedPreKey(state: PreKeyState, id: number) {
    const spk = generateSignedPreKey(this.identity!, id);
    state.signed = [
      { id, pub: b64(spk.pub), priv: b64(spk.priv), sig: b64(spk.sig), at: Date.now() },
      ...state.signed,
    ].slice(0, KEEP_SIGNED);
    return state.signed[0]!;
  }

  private async rotateSignedPreKey(state: PreKeyState) {
    const spk = this.addSignedPreKey(state, (state.signed[0]!.id + 1) >>> 0);
    await this.setJSON("prekeys", state);
    unwrap(
      await this.api.PUT("/v1/devices/me/signed-prekey", {
        body: { signedPreKey: { id: spk.id, pub: spk.pub, sig: spk.sig } },
      }),
    );
  }

  private addOneTimePreKeys(state: PreKeyState, count: number) {
    const keys = generateOneTimePreKeys(state.nextOneTimeId, count);
    state.nextOneTimeId += count;
    for (const k of keys) state.oneTime[k.id] = { pub: b64(k.pub), priv: b64(k.priv) };
    const ids = Object.keys(state.oneTime).map(Number).sort((a, b) => a - b);
    for (const id of ids.slice(0, Math.max(0, ids.length - KEEP_ONE_TIME))) delete state.oneTime[id];
    return keys.map((k) => ({ id: k.id, pub: b64(k.pub) }));
  }

  private async loadSession(deviceId: string) {
    const json = await this.getJSON<SessionJSON>(`session:${deviceId}`);
    return json ? sessionFromJSON(json) : null;
  }

  private saveSession(deviceId: string, s: Session) {
    return this.setJSON(`session:${deviceId}`, sessionToJSON(s));
  }

  private async devicesOf(userIds: string[]) {
    const devices = unwrap(await this.api.GET("/v1/devices", { params: { query: { userIds: userIds.join(",") } } }))
      .items as DeviceDTO[];
    for (const userId of userIds) await this.noteIdentities(userId, devices.filter((d) => d.userId === userId));
    return devices;
  }

  /** Remembers which identities a person has, and reports a change after the first sighting. */
  private async noteIdentities(userId: string, devices: DeviceDTO[]) {
    if (userId === this.userId) return;
    const now = devices.map((d) => identityKey(d.identity)).sort();
    const before = await this.getJSON<string[]>(`seen:${userId}`);
    if (before && before.join() === now.join()) return;
    await this.setJSON(`seen:${userId}`, now);
    if (before && now.some((k) => !before.includes(k))) for (const fn of this.identityListeners) fn(userId);
  }

  /**
   * Encrypts content for every device in a chat except this one, starting sessions where needed,
   * plus a backup copy when a recovery key is set up. `memberIds` are the chat's members.
   */
  async seal(chatId: string, memberIds: string[], clientId: string, input: ContentInput): Promise<EncryptedInput> {
    await this.ready();
    const content = MessageContentSchema.parse({ v: 1, chatId, clientId, ...input });
    return this.serial(async () => {
      const devices = (await this.devicesOf(memberIds)).filter((d) => d.id !== this.deviceId);
      const missing: string[] = [];
      const sessions = new Map<string, Session>();
      for (const d of devices) {
        const s = await this.loadSession(d.id);
        if (s && sameIdentity(s.remoteIdentity, publicIdentityFromJSON(d.identity))) sessions.set(d.id, s);
        else missing.push(d.id);
      }
      if (missing.length) {
        const bundles = unwrap(await this.api.POST("/v1/devices/prekeys/claim", { body: { deviceIds: missing } })).items;
        for (const b of bundles) {
          sessions.set(
            b.deviceId,
            initiateSession(this.identity!, {
              identity: publicIdentityFromJSON(b.identity),
              signedPreKey: { id: b.signedPreKey.id, pub: fromB64(b.signedPreKey.pub), sig: fromB64(b.signedPreKey.sig) },
              oneTimePreKey: b.oneTimePreKey && { id: b.oneTimePreKey.id, pub: fromB64(b.oneTimePreKey.pub) },
            }),
          );
        }
      }

      const plaintext = utf8(JSON.stringify(content));
      const envelopes: EncryptedInput["envelopes"] = [];
      for (const [deviceId, session] of sessions) {
        const out = encrypt(session, plaintext);
        await this.saveSession(deviceId, out.session);
        envelopes.push({ deviceId, envelope: out.envelope });
      }
      await this.setJSON(`sent:${chatId}:${clientId}`, content);
      const key = await this.backupKey();
      const backup = key ? sealBackup(key, plaintext, backupLabel(chatId, this.userId, clientId)) : undefined;
      return { envelopes, ...(backup && { backup }) };
    });
  }

  /**
   * Seals and posts, sealing again when the server says the devices changed in between (someone
   * signed in or out). `post` should throw SixApiError (or anything with a `code`) on failure.
   */
  async send<T>(
    chatId: string,
    memberIds: string[],
    clientId: string,
    input: ContentInput,
    post: (encrypted: EncryptedInput) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const encrypted = await this.seal(chatId, memberIds, clientId, input);
      try {
        return await post(encrypted);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (attempt >= 2 || (code !== "DEVICES_CHANGED" && code !== "DEVICE_NOT_REGISTERED")) throw err;
        if (code === "DEVICE_NOT_REGISTERED") this.setup = null;
      }
    }
  }

  /**
   * Decrypts a message for this device: from the local copy if it was opened before, from its
   * envelope, from what this device sent, or from the user's backup, in that order.
   */
  async open(m: MessageDTO): Promise<Opened> {
    if (!m.encryption) return { status: "plain" };
    if (m.deletedAt || m.ephemeral?.locked || m.ephemeral?.purged) return { status: "unavailable", reason: "hidden" };
    const cached = await this.getJSON<Cached>(`plain:${m.id}`);
    if (cached && cached.editedAt === m.editedAt) return { status: "ok", content: cached.content };
    await this.ready();

    const fromEnvelope = await this.serial(() => this.openEnvelope(m));
    const content =
      fromEnvelope ??
      (m.senderId === this.userId && m.encryption.senderDeviceId === this.deviceId
        ? await this.getJSON<MessageContent>(`sent:${m.chatId}:${m.clientId}`)
        : null) ??
      (await this.openBackup(m));
    if (!content) {
      const hasEnvelope = m.encryption.envelopes.some((e) => e.deviceId === this.deviceId);
      return { status: "unavailable", reason: hasEnvelope ? "failed" : "no-envelope" };
    }
    if (content.chatId !== m.chatId || content.clientId !== m.clientId) {
      return { status: "unavailable", reason: "failed" };
    }
    await this.setJSON(`plain:${m.id}`, { content, editedAt: m.editedAt } satisfies Cached);
    if (!m.encryption.backup) void this.queueBackup(m, content);
    return { status: "ok", content };
  }

  private async openEnvelope(m: MessageDTO): Promise<MessageContent | null> {
    const mine = m.encryption!.envelopes.find((e) => e.deviceId === this.deviceId);
    const from = m.encryption!.senderDeviceId;
    if (!mine || !from) return null;
    try {
      const plaintext = await this.receive(from, mine.envelope as Envelope, m.senderId);
      return MessageContentSchema.parse(JSON.parse(fromUtf8(plaintext)));
    } catch (err) {
      if (err instanceof CryptoError || err instanceof SyntaxError) return null;
      throw err;
    }
  }

  /**
   * Decrypts with the session for `from`, trying recently replaced sessions too (both sides may
   * have started one at the same time), and starts a new session when the envelope opens one.
   */
  private async receive(from: string, envelope: Envelope, senderId: string) {
    const archived = (await this.getJSON<SessionJSON[]>(`archive:${from}`)) ?? [];
    const current = await this.loadSession(from);
    const candidates = [...(current ? [current] : []), ...archived.map(sessionFromJSON)];
    for (const [i, s] of candidates.entries()) {
      try {
        const out = decrypt(s, envelope);
        if (i > 0 || !current) await this.promote(from, out.session, current);
        else await this.saveSession(from, out.session);
        return out.plaintext;
      } catch (err) {
        if (!(err instanceof CryptoError) || err.code === "DUPLICATE_MESSAGE") throw err;
      }
    }
    if (!envelope.x3dh) throw new CryptoError("DECRYPT_FAILED", "No session for this device");

    const device = (await this.devicesOf([senderId])).find((d) => d.id === from);
    if (!device || identityKey(device.identity) !== identityKey(envelope.x3dh.identity)) {
      throw new CryptoError("BAD_KEY", "The sender's identity does not match their device");
    }
    const prekeys = (await this.getJSON<PreKeyState>("prekeys"))!;
    const out = acceptSession(this.identity!, {
      signedPreKey: (id) => {
        const k = prekeys.signed.find((s) => s.id === id);
        return k && { id, pub: fromB64(k.pub), priv: fromB64(k.priv), sig: fromB64(k.sig) };
      },
      oneTimePreKey: (id) => {
        const k = prekeys.oneTime[id];
        return k && { id, pub: fromB64(k.pub), priv: fromB64(k.priv) };
      },
    }, envelope);
    if (out.usedOneTimePreKeyId !== null) {
      delete prekeys.oneTime[out.usedOneTimePreKeyId];
      await this.setJSON("prekeys", prekeys);
    }
    await this.promote(from, out.session, current);
    return out.plaintext;
  }

  private async promote(deviceId: string, session: Session, replaced: Session | null) {
    const archived = (await this.getJSON<SessionJSON[]>(`archive:${deviceId}`)) ?? [];
    const keep = archived.filter((j) => sessionFromJSON(j).ratchet !== session.ratchet);
    if (replaced) keep.unshift(sessionToJSON(replaced));
    await this.setJSON(`archive:${deviceId}`, keep.slice(0, MAX_ARCHIVED));
    await this.saveSession(deviceId, session);
  }

  private async openBackup(m: MessageDTO): Promise<MessageContent | null> {
    const key = await this.backupKey();
    if (!key || !m.encryption!.backup) return null;
    try {
      const plaintext = openBackup(key, m.encryption!.backup, backupLabel(m.chatId, m.senderId, m.clientId));
      return MessageContentSchema.parse(JSON.parse(fromUtf8(plaintext)));
    } catch {
      return null;
    }
  }

  private async queueBackup(m: MessageDTO, content: MessageContent) {
    const key = await this.backupKey();
    if (!key) return;
    const sealed = sealBackup(key, utf8(JSON.stringify(content)), backupLabel(m.chatId, m.senderId, m.clientId));
    this.pendingBackups.set(m.id, sealed);
    this.backupTimer ??= setTimeout(() => void this.flushBackups(), 2000);
  }

  private async flushBackups() {
    this.backupTimer = null;
    const items = [...this.pendingBackups].slice(0, 100).map(([messageId, sealed]) => ({ messageId, sealed }));
    for (const i of items) this.pendingBackups.delete(i.messageId);
    if (!items.length) return;
    const res = await this.api.POST("/v1/messages/backups", { body: { items } }).catch(() => null);
    if (!res?.response.ok && res?.response.status !== 404) for (const i of items) this.pendingBackups.set(i.messageId, i.sealed);
    if (this.pendingBackups.size) this.backupTimer = setTimeout(() => void this.flushBackups(), 10_000);
  }

  private async backupKey() {
    const raw = await this.store.get("backupKey");
    return raw ? fromB64(raw) : null;
  }

  async hasRecoveryKey() {
    return (await this.store.get("backupKey")) !== null;
  }

  /** Makes a new recovery key, shown to the user once as 24 words, and starts backing up with it. */
  async createRecoveryKey() {
    const { entropy, words } = generateRecoveryKey();
    const key = deriveBackupKey(entropy);
    unwrap(await this.api.PUT("/v1/me/backup-key", { body: { backupKeyId: backupKeyId(key) } }));
    await this.store.set("backupKey", b64(key));
    return words;
  }

  /**
   * Unlocks backups on this device with the 24 words. Throws BAD_RECOVERY_KEY for words that are
   * not a valid key and BACKUP_KEY_MISMATCH for a valid key that is not the account's.
   */
  async restoreRecoveryKey(words: string, accountBackupKeyId: string | null) {
    const key = deriveBackupKey(recoveryKeyFromWords(words));
    if (backupKeyId(key) !== accountBackupKeyId) {
      throw new SixApiError(409, "BACKUP_KEY_MISMATCH", "That is not this account's recovery key");
    }
    await this.store.set("backupKey", b64(key));
  }

  /** The number two people compare to check nobody is in between, covering all their devices. */
  async safetyNumber(peerId: string) {
    const devices = await this.devicesOf([this.userId, peerId]);
    const of = (userId: string) => ({
      userId,
      identities: devices.filter((d) => d.userId === userId).map((d) => publicIdentityFromJSON(d.identity)),
    });
    return safetyNumber(of(this.userId), of(peerId));
  }

  /** Forgets every key and session, for signing out. */
  async forget() {
    await this.store.clear();
    this.identity = null;
    this.deviceId = null;
    this.setup = null;
  }
}

/** Encrypts a file before upload; the result's `file` fields go into the message content. */
export function encryptFile(bytes: Uint8Array) {
  const { data, key, digest } = encryptMedia(bytes);
  return { data, key: b64(key), digest: b64(digest) };
}

/** Checks and decrypts a downloaded encrypted file. */
export function decryptFile(data: Uint8Array, file: Pick<EncryptedFile, "key" | "digest">) {
  return decryptMedia(data, fromB64(file.key), fromB64(file.digest));
}
