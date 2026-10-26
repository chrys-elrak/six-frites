import { E2EE, type Hydrated, decryptFile } from "@six/sdk";
import type { ChatDTO, EncryptedFile, MessageDTO } from "@six/shared";
import { Directory, File, Paths } from "expo-file-system";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { DeviceSecretStore } from "./secret-store";
import { six } from "./six";

let current: E2EE | null = null;
let readyFor: string | null = null;

/** The encryption client of the signed-in account, or null while signed out. */
export function e2eeFor(userId: string | undefined) {
  if (!userId) return null;
  if (current?.userId !== userId) current = new E2EE(six.api, new DeviceSecretStore(userId), userId);
  return current;
}

/** Publishes this device's keys once per launch; failures are retried on the next use. */
export function startE2EE(userId: string) {
  const e = e2eeFor(userId)!;
  if (readyFor === userId) return;
  readyFor = userId;
  e.ready().catch((err) => {
    readyFor = null;
    console.warn("encryption setup failed:", err?.message ?? err);
  });
}

/** Wipes this device's keys and decrypted messages when signing out. */
export async function forgetE2EE() {
  const e = current;
  current = null;
  readyFor = null;
  useDecrypted.setState({ byKey: {} });
  await e?.forget().catch(() => null);
  const media = new Directory(Paths.cache, "e2ee-media");
  if (media.exists) media.delete();
}

/** What decrypting a message added to it; merged into the live message on every render. */
interface Patch {
  text: string | null;
  entities: MessageDTO["entities"];
  spoiler: boolean;
  replyText?: string | null;
  file?: EncryptedFile;
  fileUri?: string;
  undecryptable?: boolean;
}

const keyOf = (m: MessageDTO) => `${m.id}:${m.editedAt ?? ""}`;

export const useDecrypted = create<{ byKey: Record<string, Patch> }>(() => ({ byKey: {} }));

const queued = new Set<string>();
let chain: Promise<unknown> = Promise.resolve();

function patchOf(h: Hydrated): Patch {
  return {
    text: h.text,
    entities: h.entities,
    spoiler: h.spoiler,
    replyText: h.replyTo?.encrypted ? h.replyTo.text : undefined,
    file: h.file,
    undecryptable: h.undecryptable,
  };
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

/** Downloads an encrypted attachment, checks and decrypts it into the app cache, and returns its file:// uri. */
async function decryptToCache(m: MessageDTO, file: EncryptedFile) {
  const dir = new Directory(Paths.cache, "e2ee-media");
  if (!dir.exists) dir.create({ intermediates: true });
  const ext = EXT[file.mime] ?? file.name.split(".").pop()?.replace(/\W/g, "") ?? "bin";
  const out = new File(dir, `${m.attachment!.id}.${ext}`);
  if (out.exists) return out.uri;
  const res = await fetch(m.attachment!.url!);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const plain = decryptFile(new Uint8Array(await res.arrayBuffer()), file);
  out.create();
  await out.write(plain);
  return out.uri;
}

function decrypt(meId: string, m: MessageDTO) {
  const key = keyOf(m);
  if (queued.has(key) || useDecrypted.getState().byKey[key]) return;
  queued.add(key);
  const run = async () => {
    const e = e2eeFor(meId);
    if (!e) return;
    const patch = patchOf(await e.hydrate(m));
    useDecrypted.setState((s) => ({ byKey: { ...s.byKey, [key]: patch } }));
    if (patch.file && m.attachment?.url && m.attachment.status === "ready") {
      const fileUri = await decryptToCache(m, patch.file);
      useDecrypted.setState((s) => ({ byKey: { ...s.byKey, [key]: { ...patch, fileUri } } }));
    }
  };
  chain = chain.then(run, run).catch((err) => console.warn("could not decrypt message:", err?.message ?? err)).finally(() => queued.delete(key));
}

/** The message as the UI should show it: decrypted content merged in, or marked as not readable yet. */
export function withContent<T extends MessageDTO>(m: T, patch: Patch | undefined): Hydrated<T> & { decrypting?: boolean } {
  if (!m.encryption) return m;
  if (!patch) return { ...m, decrypting: true };
  if (patch.undecryptable) return { ...m, undecryptable: true };
  return {
    ...m,
    text: patch.text,
    entities: patch.entities,
    spoiler: patch.spoiler,
    replyTo: m.replyTo && patch.replyText !== undefined ? { ...m.replyTo, text: patch.replyText } : m.replyTo,
    attachment:
      m.attachment && patch.file
        ? {
            ...m.attachment,
            name: patch.file.name,
            mime: patch.file.mime,
            size: patch.file.size,
            width: patch.file.width ?? null,
            height: patch.file.height ?? null,
            durationMs: patch.file.durationMs ?? null,
            waveform: patch.file.waveform ?? null,
            status: patch.fileUri ? "ready" : m.attachment.status === "failed" ? "failed" : "processing",
            url: patch.fileUri ?? null,
            thumbUrl: patch.file.thumb ?? null,
          }
        : m.attachment,
    file: patch.file,
  };
}

/** Decrypts a list of messages, oldest first, and keeps them in sync as content arrives. */
export function useHydratedMessages(meId: string, messages: MessageDTO[]) {
  const byKey = useDecrypted((s) => s.byKey);
  useEffect(() => {
    for (const m of [...messages].reverse()) if (m.encryption) decrypt(meId, m);
  }, [meId, messages]);
  return useMemo(() => messages.map((m) => withContent(m, byKey[keyOf(m)])), [messages, byKey]);
}

export function useHydratedMessage<T extends MessageDTO>(meId: string | undefined, m: T | null | undefined) {
  const patch = useDecrypted((s) => (m ? s.byKey[keyOf(m)] : undefined));
  useEffect(() => {
    if (meId && m?.encryption) decrypt(meId, m);
  }, [meId, m]);
  return m ? withContent(m, patch) : m;
}

/** Decrypts one message now, for notifications. */
export async function hydrateNow<T extends MessageDTO>(meId: string, m: T): Promise<Hydrated<T>> {
  if (!m.encryption) return m;
  const e = e2eeFor(meId);
  return e ? e.hydrate(m) : { ...m, undecryptable: true };
}

/** Decrypts a self-destructing message the moment it is opened, file included. */
export async function revealNow<T extends MessageDTO>(meId: string, m: T) {
  const h = await hydrateNow(meId, m);
  if (!h.file || !h.attachment?.url) return h;
  const url = await decryptToCache(m, h.file);
  return { ...h, attachment: { ...h.attachment, url, thumbUrl: h.file.thumb ?? null } };
}

/** Whether to encrypt in this chat; any failure to tell falls back to what the chat requires. */
export async function shouldEncrypt(meId: string, chat: Pick<ChatDTO, "encrypted" | "members">) {
  const e = e2eeFor(meId);
  if (!e) return chat.encrypted;
  return e.shouldEncrypt(chat).catch(() => chat.encrypted);
}
