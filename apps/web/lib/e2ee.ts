import { E2EE, type Hydrated, type SecretStore, decryptFile } from "@six/sdk";
import type {
  AttachmentDTO,
  ChatDTO,
  EncryptedFile,
  MessageContent,
  MessageDTO,
  ScheduledMessageDTO,
} from "@six/shared";
import { create } from "zustand";
import { closeDrafts, openDrafts } from "./drafts";
import { six } from "./six";

function request<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/**
 * A SecretStore in IndexedDB. Values are sealed with AES-GCM under a non-extractable key that lives
 * in the same database, so the raw secrets never sit on disk in the clear and scripts can't export it.
 */
function indexedStore(name: string): SecretStore {
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("kv");
      open.result.createObjectStore("meta");
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });

  const store = async (name: "kv" | "meta", mode: IDBTransactionMode) =>
    (await db).transaction(name, mode).objectStore(name);

  let key: Promise<CryptoKey> | null = null;
  const wrapKey = () =>
    (key ??= (async () => {
      const saved = await request<CryptoKey | undefined>((await store("meta", "readonly")).get("key"));
      if (saved) return saved;
      const fresh = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await request((await store("meta", "readwrite")).put(fresh, "key"));
      return fresh;
    })());

  return {
    async get(k) {
      const sealed = await request<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer } | undefined>(
        (await store("kv", "readonly")).get(k),
      );
      if (!sealed) return null;
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.iv }, await wrapKey(), sealed.data);
      return new TextDecoder().decode(plain);
    },
    async set(k, value) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        await wrapKey(),
        new TextEncoder().encode(value),
      );
      await request((await store("kv", "readwrite")).put({ iv, data }, k));
    },
    async delete(k) {
      await request((await store("kv", "readwrite")).delete(k));
    },
    async clear() {
      await request((await store("kv", "readwrite")).clear());
      await request((await store("meta", "readwrite")).clear());
      key = null;
    },
  };
}

interface IdentityChanges {
  changed: Record<string, true>;
  add: (userId: string) => void;
  dismiss: (userId: string) => void;
}

/** People whose keys changed since we first talked to them, until the notice is dismissed. */
export const useIdentityChanges = create<IdentityChanges>((set) => ({
  changed: {},
  add: (userId) => set((s) => ({ changed: { ...s.changed, [userId]: true } })),
  dismiss: (userId) =>
    set((s) => {
      const { [userId]: _gone, ...rest } = s.changed;
      return { changed: rest };
    }),
}));

let current: { client: E2EE; store: SecretStore } | null = null;

/** The encryption client for the signed-in user, created and readied on first use. */
export function startE2EE(userId: string) {
  if (current?.client.userId !== userId) {
    const store = indexedStore(`six-e2ee-${userId}`);
    current = { client: new E2EE(six.api, store, userId), store };
    current.client.onIdentityChange(useIdentityChanges.getState().add);
    void openDrafts(store);
  }
  void current.client.ready().catch((err) => console.error("could not set up encryption:", err));
  return current.client;
}

export const e2ee = () => current?.client ?? null;

/** Wipes this device's keys and decrypted messages, before signing out. */
export async function forgetE2EE() {
  closeDrafts();
  await current?.client.forget().catch(() => null);
  current = null;
}

export type { Hydrated };

export async function hydrate<T extends MessageDTO>(m: T): Promise<Hydrated<T>> {
  const client = e2ee();
  if (!m.encryption || !client) return m;
  try {
    return await client.hydrate(m);
  } catch {
    return { ...m, undecryptable: true };
  }
}

export const hydrateAll = <T extends MessageDTO>(items: T[]) => Promise.all(items.map(hydrate));

export async function hydrateChat<T extends ChatDTO>(chat: T): Promise<T> {
  return chat.lastMessage ? { ...chat, lastMessage: await hydrate(chat.lastMessage) } : chat;
}

/**
 * Fills in my own encrypted scheduled message from the copy this device kept when sealing it.
 * Scheduled messages carry no envelopes until they are sent, so another device shows them as locked.
 */
export async function hydrateScheduled(
  s: ScheduledMessageDTO,
): Promise<ScheduledMessageDTO & { undecryptable?: boolean }> {
  if (!s.encryption || !current) return s;
  const raw = await current.store.get(`sent:${s.chatId}:${s.clientId}`).catch(() => null);
  if (!raw) return { ...s, undecryptable: true };
  const c = JSON.parse(raw) as MessageContent;
  return {
    ...s,
    text: c.text ?? null,
    entities: c.entities ?? [],
    spoiler: c.spoiler ?? false,
    replyTo: s.replyTo?.encrypted ? { ...s.replyTo, text: c.replyText ?? null } : s.replyTo,
  };
}

export async function shouldEncrypt(chat: Pick<ChatDTO, "encrypted" | "members"> | undefined) {
  const client = e2ee();
  if (!chat || !client) return chat?.encrypted ?? false;
  return client.shouldEncrypt(chat);
}

const decrypted = new Map<string, Promise<string>>();

/** Downloads, checks and decrypts an encrypted attachment once, returning a blob: URL for it. */
export function decryptedUrl(a: Pick<AttachmentDTO, "id" | "url">, file: EncryptedFile) {
  let url = decrypted.get(a.id);
  if (!url) {
    url = (async () => {
      if (!a.url) throw new Error("The file is not ready");
      const res = await fetch(a.url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const bytes = decryptFile(new Uint8Array(await res.arrayBuffer()), file);
      return URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: file.mime }));
    })();
    url.catch(() => decrypted.delete(a.id));
    decrypted.set(a.id, url);
  }
  return url;
}

/** Signs out after wiping this browser's keys, as the server forgets this device too. */
export async function signOut() {
  await forgetE2EE();
  await six.auth.logout().catch(() => null);
}
