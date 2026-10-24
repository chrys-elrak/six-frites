import type { Realtime } from "@six/sdk";
import { type MessageDTO, type MessageEntity, type UploadKind, maskSpoilers } from "@six/shared";
import type { QueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { insertMessage, patchChat } from "./chats";
import { type PendingMessage, useOutbox } from "./outbox";
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
  file?: LocalFile;
}

export async function deliver(qc: QueryClient, realtime: Realtime, pending: PendingMessage) {
  const outbox = useOutbox.getState();
  const { chatId, clientId } = pending;
  outbox.setStatus(chatId, clientId, "sending");
  try {
    let attachmentId = pending.attachment?.uploadId ?? undefined;
    if (pending.attachment && !attachmentId) {
      const { kind, name, mime, localUrl } = pending.attachment;
      const blob = await (await fetch(localUrl)).blob();
      const upload = await six.upload(blob, {
        kind,
        name,
        mime,
        onProgress: (progress) => outbox.patchAttachment(chatId, clientId, { progress }),
      });
      attachmentId = upload.id;
      outbox.patchAttachment(chatId, clientId, { uploadId: upload.id, progress: 1 });
    }

    const m = await realtime.sendMessage(chatId, {
      clientId,
      text: pending.text || undefined,
      entities: pending.entities.length ? pending.entities : undefined,
      attachmentId,
      replyToId: pending.replyTo?.id,
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
          text: replyTo.text === null ? null : maskSpoilers(replyTo.text, replyTo.entities),
          spoiler: replyTo.spoiler,
          deleted: false,
        }
      : null,
    spoiler: draft.spoiler ?? false,
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
