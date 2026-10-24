import type { Realtime } from "@six/sdk";
import { type MessageDTO, type MessageEntity, type UploadKind, maskSpoilers } from "@six/shared";
import type { QueryClient } from "@tanstack/react-query";
import { insertMessage, patchChat } from "./chats";
import { type PendingMessage, pendingFiles, useOutbox } from "./outbox";
import { six } from "./six";

export interface Draft {
  text: string;
  entities?: MessageEntity[];
  replyTo?: MessageDTO;
  spoiler?: boolean;
  file?: { blob: Blob; kind: UploadKind; name: string; mime: string };
}

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

export async function deliver(qc: QueryClient, realtime: Realtime, pending: PendingMessage) {
  const outbox = useOutbox.getState();
  const { chatId, clientId } = pending;
  outbox.setStatus(chatId, clientId, "sending");
  try {
    let attachmentId = pending.attachment?.uploadId ?? undefined;
    if (pending.attachment && !attachmentId) {
      const blob = pendingFiles.get(clientId);
      if (!blob) throw new Error("The file is no longer available");
      const { kind, name, mime } = pending.attachment;
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
    pendingFiles.delete(clientId);
    if (pending.attachment) setTimeout(() => URL.revokeObjectURL(pending.attachment!.localUrl), 60_000);
  } catch {
    outbox.setStatus(chatId, clientId, "failed");
  }
}

export async function queueMessage(qc: QueryClient, realtime: Realtime, chatId: string, draft: Draft) {
  const clientId = crypto.randomUUID();
  const { replyTo, file } = draft;
  if (file) pendingFiles.set(clientId, file.blob);

  const pending: PendingMessage = {
    clientId,
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
          size: file.blob.size,
          localUrl: URL.createObjectURL(file.blob),
          ...(file.kind === "image" ? await imageSize(file.blob) : { width: null, height: null }),
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
