import { type Realtime, encryptFile } from "@six/sdk";
import {
  type EncryptedFile,
  type EphemeralInput,
  type MessageDTO,
  type MessageEntity,
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
}

export interface Draft {
  text: string;
  entities?: MessageEntity[];
  replyTo?: MessageDTO;
  spoiler?: boolean;
  ephemeral?: EphemeralInput | null;
  file?: LocalFile;
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
    const encrypt = await shouldEncrypt(meId, chat);

    let attachmentId = pending.attachment?.uploadId ?? undefined;
    let file = pending.attachment?.file;
    if (pending.attachment && (!attachmentId || (encrypt && !file))) {
      const { kind, name, mime, localUrl } = pending.attachment;
      const sealed = encrypt ? await sealFile(localUrl, pending.attachment) : null;
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
            replyText: pending.replyTo ? pending.replyTo.text : undefined,
            file,
          },
          (encrypted) => realtime.sendMessage(chatId, { ...base, encrypted }),
        )
      : await realtime.sendMessage(chatId, {
          ...base,
          text: pending.text || undefined,
          entities: pending.entities.length ? pending.entities : undefined,
          spoiler: pending.spoiler || undefined,
        });
    insertMessage(qc, m);
    patchChat(qc, m.chatId, (c) => ({ ...c, lastMessage: m, lastActivityAt: m.createdAt }));
    outbox.remove(chatId, clientId);
  } catch {
    outbox.setStatus(chatId, clientId, "failed");
  }
}

export function queueMessage(qc: QueryClient, realtime: Realtime, chatId: string, draft: Draft) {
  const { replyTo, file } = draft;
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
          progress: 0,
          uploadId: null,
        }
      : null,
    createdAt: new Date().toISOString(),
    status: "sending",
  };
  useOutbox.getState().add(pending);
  void deliver(qc, realtime, pending);
}
