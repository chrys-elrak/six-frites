import { type Realtime, encryptFile, unwrap } from "@six/sdk";
import {
  cleanLinksIn,
  type ChatDTO,
  type ChatGame,
  type Checklist,
  ENCRYPT_MAX_BYTES,
  type EncryptedFile,
  type EphemeralInput,
  type GeoPoint,
  type GifDTO,
  type MessageDTO,
  type MessageEffect,
  type MessageEntity,
  type SendMessageInput,
  type StickerDTO,
  type UploadKind,
  maskSpoilers,
  type StoryReply,
  type CommentRule,
} from "@six/shared";
import type { QueryClient } from "@tanstack/react-query";
import { chatKeys, findCached, insertMessage, patchChat } from "./chats";
import { type Hydrated, e2ee, hydrate, messageFile, shouldEncrypt, unreachable } from "./e2ee";
import { useDataSaver } from "./data-saver";
import { lighterPhoto } from "./image";
import { mediaMeta } from "./media-meta";
import { type PendingMessage, pendingFiles, sealedFiles, useOutbox } from "./outbox";
import { six } from "./six";

export interface Draft {
  text: string;
  entities?: MessageEntity[];
  replyTo?: MessageDTO;
  story?: StoryReply;
  spoiler?: boolean;
  effect?: MessageEffect;
  silent?: boolean;
  bump?: boolean;
  ephemeral?: EphemeralInput | null;
  file?: { blob: Blob; kind: UploadKind; name: string; mime: string; sticker?: boolean; disguised?: boolean };
  gif?: GifDTO;
  sticker?: StickerDTO;
  location?: GeoPoint;
  checklist?: Checklist;
  game?: ChatGame;
  groupId?: string;
  threadId?: string;
  comments?: CommentRule;
  sendAt?: Date | null;
}

/** What a reply shows of the message it quotes: no spoilers, nothing from self-destructing messages. */
export const replyQuote = (m: MessageDTO) =>
  m.text === null || m.ephemeral ? null : maskSpoilers(m.text, m.entities);

async function imageSize(blob: Blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: null, height: null };
  }
}

/** Uploads a photo that replaces a sent one's; in an encrypted chat it is sealed with a key of its own. */
export async function uploadPhoto(photo: File, encrypt: boolean) {
  const { name, type: mime } = photo;
  if (!encrypt || photo.size > ENCRYPT_MAX_BYTES) {
    return { attachmentId: (await six.upload(photo, { kind: "image", name, mime, encrypted: false })).id };
  }
  const [bytes, meta, size] = await Promise.all([photo.arrayBuffer(), mediaMeta(photo, "image"), imageSize(photo)]);
  const { data, key, digest } = encryptFile(new Uint8Array(bytes));
  const file: EncryptedFile = { key, digest, name, mime, size: photo.size, ...size, ...meta };
  const upload = await six.upload(new Blob([data as Uint8Array<ArrayBuffer>]), { kind: "image", name, mime, encrypted: true });
  return { attachmentId: upload.id, file };
}

/** Encrypts a pending file once, so retries and re-seals reuse the same upload and key. */
async function sealFile(pending: PendingMessage, blob: Blob) {
  const saved = sealedFiles.get(pending.clientId);
  if (saved) return saved;
  const { kind, name, mime, width, height, sticker, disguised } = pending.attachment!;
  const [bytes, meta] = await Promise.all([blob.arrayBuffer(), mediaMeta(blob, kind)]);
  const { data, key, digest } = encryptFile(new Uint8Array(bytes));
  const file: EncryptedFile = {
    key,
    digest,
    name,
    mime,
    size: blob.size,
    width,
    height,
    ...meta,
    ...(sticker && { sticker }),
    ...(disguised && { disguised }),
  };
  const sealed = { file, blob: new Blob([data as Uint8Array<ArrayBuffer>]) };
  sealedFiles.set(pending.clientId, sealed);
  return sealed;
}

export async function deliver(qc: QueryClient, realtime: Realtime, pending: PendingMessage) {
  const outbox = useOutbox.getState();
  const { chatId, clientId } = pending;
  outbox.setStatus(chatId, clientId, "sending");
  try {
    const chat = findCached(qc, chatId) ?? qc.getQueryData<ChatDTO>(chatKeys.chat(chatId));
    const encrypt = !pending.gif && !pending.sticker && (await shouldEncrypt(chat));
    const client = e2ee();
    if (encrypt && (!client || !chat)) throw new Error("Encryption is not ready");

    let file: EncryptedFile | undefined;
    let attachmentId = pending.attachment?.uploadId ?? undefined;
    if (pending.attachment && !pending.gif) {
      const blob = pendingFiles.get(clientId);
      const sealed = encrypt && blob && blob.size <= ENCRYPT_MAX_BYTES ? await sealFile(pending, blob) : null;
      file = sealed?.file;
      if (!attachmentId) {
        if (!blob) throw new Error("The file is no longer available");
        const { kind, name, mime } = pending.attachment;
        const upload = await six.upload(sealed?.blob ?? blob, {
          kind,
          name,
          mime,
          encrypted: !!sealed,
          onProgress: (progress) => outbox.patchAttachment(chatId, clientId, { progress }),
        });
        attachmentId = upload.id;
        outbox.patchAttachment(chatId, clientId, { uploadId: upload.id, progress: 1 });
      }
    }

    const base = {
      clientId,
      attachmentId,
      replyToId: pending.replyTo?.id,
      storyId: pending.story?.id,
      ephemeral: pending.ephemeral ?? undefined,
      groupId: pending.groupId,
      threadId: pending.threadId,
      ...pending.comments,
      silent: pending.silent,
      bump: pending.bump,
    };
    const type = pending.location
      ? ("location" as const)
      : pending.checklist
        ? ("checklist" as const)
        : pending.game
          ? ("game" as const)
          : undefined;
    const later = pending.sendAt && Date.parse(pending.sendAt) > Date.now() + 5000 ? pending.sendAt : null;
    const post = async (body: SendMessageInput) => {
      if (!later) return realtime.sendMessage(chatId, { ...body, sentAt: realtime.serverTime(Date.parse(pending.createdAt)) });
      const params = { path: { id: chatId } };
      unwrap(await six.api.POST("/v1/chats/{id}/scheduled-messages", { params, body: { ...body, sendAt: later } }));
      return null;
    };
    const sent = encrypt
      ? await client!.send(
          chatId,
          chat!.members.map((m) => m.user.id),
          clientId,
          {
            text: pending.text || undefined,
            entities: pending.entities.length ? pending.entities : undefined,
            spoiler: pending.spoiler || undefined,
            effect: pending.effect,
            replyText: pending.replyTo ? (pending.replyTo.text?.slice(0, 200) ?? null) : undefined,
            file,
            location: pending.location,
            checklist: pending.checklist,
            game: pending.game,
          },
          (encrypted) => post({ ...base, encrypted, type }),
        )
      : await post({
          ...base,
          text: pending.text || undefined,
          entities: pending.entities.length ? pending.entities : undefined,
          gifId: pending.gif?.id,
          stickerId: pending.sticker?.id,
          spoiler: pending.spoiler || undefined,
          effect: pending.effect,
          location: pending.location,
          checklist: pending.checklist,
          game: pending.game,
        });
    if (sent) {
      const m = await hydrate(sent);
      insertMessage(qc, m);
      patchChat(qc, m.chatId, (c) => ({ ...c, lastMessage: m, lastActivityAt: m.createdAt }));
    }
    outbox.remove(chatId, clientId);
    pendingFiles.delete(clientId);
    sealedFiles.delete(clientId);
    if (pending.attachment) setTimeout(() => URL.revokeObjectURL(pending.attachment!.localUrl), 60_000);
  } catch (err) {
    console.error("could not send:", err);
    if (!offline(err)) return outbox.setStatus(chatId, clientId, "failed");
    outbox.setStatus(chatId, clientId, "waiting");
    if (realtime.socket.connected) setTimeout(() => resendWaiting(qc, realtime, clientId), 15_000);
  }
}

const offline = (err: unknown) => unreachable(err) || (err instanceof Error && err.message.includes("timed out"));

/** Sends the messages that were waiting for the network, or only `clientId`; the server drops any it already has. */
export function resendWaiting(qc: QueryClient, realtime: Realtime, clientId?: string) {
  for (const list of Object.values(useOutbox.getState().byChat)) {
    for (const m of list) if (m.status === "waiting" && (!clientId || m.clientId === clientId)) void deliver(qc, realtime, m);
  }
}

/** With data saver on, swaps a photo for a lighter JPEG before it's queued. */
async function forDataSaver(file: Draft["file"]): Promise<Draft["file"]> {
  if (!file || file.kind !== "image" || file.sticker || file.mime === "image/gif" || !useDataSaver.getState().on) return file;
  const blob = await lighterPhoto(file.blob);
  if (blob === file.blob) return file;
  return { ...file, blob, mime: "image/jpeg", name: file.name.replace(/\.\w+$/, "") + ".jpg" };
}

/** Where a share link really leads, asked of our server so the site never sees who shares or reads it. */
const followLink = async (url: string) => (await six.api.GET("/v1/link-resolve", { params: { query: { url } } })).data?.url ?? null;

/** Messages wait for the ones before them to have their links cleaned, so they go out in the order they were sent. */
let cleaning: Promise<unknown> = Promise.resolve();

export async function queueMessage(qc: QueryClient, realtime: Realtime, chatId: string, draft: Draft) {
  const clientId = crypto.randomUUID();
  const cleaned = cleaning.then(() => cleanLinksIn(draft.text, draft.entities ?? [], followLink));
  cleaning = cleaned.catch(() => null);
  const { text, entities } = await cleaned;
  const { replyTo, gif } = draft;
  const file = await forDataSaver(draft.file);
  if (file) pendingFiles.set(clientId, file.blob);

  const pending: PendingMessage = {
    clientId,
    chatId,
    text,
    entities,
    replyTo: replyTo
      ? {
          id: replyTo.id,
          senderId: replyTo.senderId,
          type: replyTo.type,
          text: replyQuote(replyTo),
          spoiler: replyTo.spoiler,
          ephemeral: replyTo.ephemeral !== null,
          deleted: false,
          encrypted: replyTo.encryption !== null,
          sentAt: replyTo.createdAt,
        }
      : null,
    story: draft.story,
    spoiler: draft.spoiler ?? false,
    effect: draft.effect,
    silent: draft.silent,
    bump: draft.bump,
    ephemeral: draft.ephemeral ?? null,
    attachment: file
      ? {
          kind: file.kind,
          name: file.name,
          mime: file.mime,
          size: file.blob.size,
          localUrl: URL.createObjectURL(file.blob),
          ...(file.kind === "image" ? await imageSize(file.blob) : { width: null, height: null }),
          progress: 0,
          uploadId: null,
          sticker: file.sticker,
          disguised: file.disguised,
        }
      : gif
        ? {
            kind: "gif",
            name: gif.title,
            mime: "image/webp",
            size: 0,
            localUrl: gif.previewUrl,
            width: gif.width,
            height: gif.height,
            progress: 1,
            uploadId: null,
          }
        : null,
    gif: gif ?? null,
    sticker: draft.sticker ?? null,
    location: draft.location,
    checklist: draft.checklist,
    game: draft.game,
    groupId: draft.groupId,
    threadId: draft.threadId,
    comments: draft.comments,
    sendAt: draft.sendAt?.toISOString(),
    createdAt: new Date().toISOString(),
    status: "sending",
  };
  useOutbox.getState().add(pending);
  void deliver(qc, realtime, pending);
}

/** Sends copies of messages to a chat as if I wrote them there, with nothing saying where they came from. */
export async function forwardMessages(qc: QueryClient, realtime: Realtime, chatId: string, messages: Hydrated[]) {
  const groupId = messages.length > 1 ? crypto.randomUUID() : undefined;
  for (const m of messages) {
    const file = m.attachment ? await messageFile(m) : null;
    await queueMessage(qc, realtime, chatId, {
      text: m.text ?? "",
      entities: m.entities,
      spoiler: m.spoiler,
      location: m.location ?? undefined,
      checklist: m.checklist ?? undefined,
      groupId,
      file: file
        ? { blob: file, kind: m.attachment!.kind, name: file.name, mime: file.type, sticker: m.file?.sticker, disguised: m.file?.disguised }
        : undefined,
    });
  }
}
