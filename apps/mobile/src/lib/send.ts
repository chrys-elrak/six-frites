import { type Realtime, encryptFile, unwrap } from "@six/sdk";
import {
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
  type UploadKind,
  maskSpoilers,
} from "@six/shared";
import type { QueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { chatFor, insertMessage, patchChat } from "./chats";
import { e2eeFor, shouldEncrypt } from "./e2ee";
import { type PendingMessage, useOutbox } from "./outbox";
import { useSession } from "./session";
import { six } from "./six";

export interface LocalFile {
  uri: string;
  kind: UploadKind;
  name: string;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  sticker?: boolean;
}

export interface Draft {
  text: string;
  entities?: MessageEntity[];
  replyTo?: MessageDTO;
  spoiler?: boolean;
  effect?: MessageEffect;
  ephemeral?: EphemeralInput | null;
  file?: LocalFile;
  gif?: GifDTO;
  location?: GeoPoint;
  checklist?: Checklist;
  groupId?: string;
  sendAt?: Date | null;
}

/** Encrypts a picked file into the cache so it can be uploaded like any other file. */
async function sealFile(localUrl: string, a: NonNullable<PendingMessage["attachment"]>) {
  const sealed = encryptFile(await new File(localUrl).bytes());
  const out = new File(Paths.cache, `sealed-${randomUUID()}`);
  out.create();
  await out.write(sealed.data);
  const file: EncryptedFile = {
    key: sealed.key,
    digest: sealed.digest,
    name: a.name,
    mime: a.mime,
    size: a.size,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    ...(a.sticker && { sticker: true }),
  };
  return { uri: out.uri, file };
}

export async function deliver(qc: QueryClient, realtime: Realtime, pending: PendingMessage) {
  const outbox = useOutbox.getState();
  const { chatId, clientId } = pending;
  outbox.setStatus(chatId, clientId, "sending");
  try {
    const meId = useSession.getState().user!.id;
    const chat = await chatFor(qc, chatId);
    const encrypt = !pending.gif && (await shouldEncrypt(meId, chat));

    let attachmentId = pending.attachment?.uploadId ?? undefined;
    let file = pending.attachment?.file;
    const seal = encrypt && !!pending.attachment && pending.attachment.size <= ENCRYPT_MAX_BYTES;
    if (pending.attachment && !pending.gif && (!attachmentId || (seal && !file))) {
      const { kind, name, mime, localUrl } = pending.attachment;
      const sealed = seal ? await sealFile(localUrl, pending.attachment) : null;
      const blob = await (await fetch(sealed?.uri ?? localUrl)).blob();
      const upload = await six.upload(blob, {
        kind,
        name,
        mime,
        encrypted: !!sealed,
        onProgress: (progress) => outbox.patchAttachment(chatId, clientId, { progress }),
      });
      if (sealed) new File(sealed.uri).delete();
      attachmentId = upload.id;
      file = sealed?.file;
      outbox.patchAttachment(chatId, clientId, { uploadId: upload.id, progress: 1, file });
    }

    const base = {
      clientId,
      attachmentId,
      replyToId: pending.replyTo?.id,
      ephemeral: pending.ephemeral ?? undefined,
      groupId: pending.groupId,
    };
    const type = pending.location ? ("location" as const) : pending.checklist ? ("checklist" as const) : undefined;
    const later = pending.sendAt && Date.parse(pending.sendAt) > Date.now() + 5000 ? pending.sendAt : null;
    const post = async (body: SendMessageInput) => {
      if (!later) return realtime.sendMessage(chatId, { ...body, sentAt: realtime.serverTime(Date.parse(pending.createdAt)) });
      const params = { path: { id: chatId } };
      unwrap(await six.api.POST("/v1/chats/{id}/scheduled-messages", { params, body: { ...body, sendAt: later } }));
      return null;
    };
    const m = encrypt
      ? await e2eeFor(meId)!.send(
          chatId,
          chat.members.map((x) => x.user.id),
          clientId,
          {
            text: pending.text || undefined,
            entities: pending.entities.length ? pending.entities : undefined,
            spoiler: pending.spoiler || undefined,
            effect: pending.effect,
            replyText: pending.replyTo ? pending.replyTo.text : undefined,
            file,
            location: pending.location,
            checklist: pending.checklist,
          },
          (encrypted) => post({ ...base, encrypted, type }),
        )
      : await post({
          ...base,
          text: pending.text || undefined,
          entities: pending.entities.length ? pending.entities : undefined,
          gifId: pending.gif?.id,
          spoiler: pending.spoiler || undefined,
          effect: pending.effect,
          location: pending.location,
          checklist: pending.checklist,
        });
    if (m) {
      insertMessage(qc, m);
      patchChat(qc, m.chatId, (c) => ({ ...c, lastMessage: m, lastActivityAt: m.createdAt }));
    }
    outbox.remove(chatId, clientId);
  } catch {
    outbox.setStatus(chatId, clientId, "failed");
  }
}

export function queueMessage(qc: QueryClient, realtime: Realtime, chatId: string, draft: Draft) {
  const { replyTo, file, gif } = draft;
  const pending: PendingMessage = {
    clientId: randomUUID(),
    chatId,
    text: draft.text,
    entities: draft.entities ?? [],
    replyTo: replyTo
      ? {
          id: replyTo.id,
          senderId: replyTo.senderId,
          type: replyTo.type,
          text: replyTo.text === null || replyTo.ephemeral ? null : maskSpoilers(replyTo.text, replyTo.entities),
          spoiler: replyTo.spoiler,
          ephemeral: replyTo.ephemeral !== null,
          deleted: false,
          encrypted: false,
        }
      : null,
    spoiler: draft.spoiler ?? false,
    effect: draft.effect,
    ephemeral: draft.ephemeral ?? null,
    attachment: file
      ? {
          kind: file.kind,
          name: file.name,
          mime: file.mime,
          size: file.size,
          localUrl: file.uri,
          width: file.width ?? null,
          height: file.height ?? null,
          durationMs: file.durationMs ?? null,
          sticker: file.sticker,
          progress: 0,
          uploadId: null,
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
            durationMs: null,
            progress: 1,
            uploadId: null,
          }
        : null,
    gif,
    location: draft.location,
    checklist: draft.checklist,
    groupId: draft.groupId,
    sendAt: draft.sendAt?.toISOString(),
    createdAt: new Date().toISOString(),
    status: "sending",
  };
  useOutbox.getState().add(pending);
  void deliver(qc, realtime, pending);
}
