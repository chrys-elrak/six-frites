import type { Realtime } from "@six/sdk";
import type { MessageDTO } from "@six/shared";
import type { QueryClient } from "@tanstack/react-query";
import { insertMessage, patchChat } from "./chats";
import { type PendingMessage, useOutbox } from "./outbox";

export async function deliver(qc: QueryClient, realtime: Realtime, pending: PendingMessage) {
  const outbox = useOutbox.getState();
  outbox.setStatus(pending.chatId, pending.clientId, "sending");
  try {
    const m = await realtime.sendMessage(pending.chatId, {
      clientId: pending.clientId,
      text: pending.text,
      replyToId: pending.replyTo?.id,
    });
    insertMessage(qc, m);
    patchChat(qc, m.chatId, (c) => ({ ...c, lastMessage: m, lastActivityAt: m.createdAt }));
    outbox.remove(pending.chatId, pending.clientId);
  } catch {
    outbox.setStatus(pending.chatId, pending.clientId, "failed");
  }
}

export function sendText(qc: QueryClient, realtime: Realtime, chatId: string, text: string, replyTo?: MessageDTO) {
  const pending: PendingMessage = {
    clientId: crypto.randomUUID(),
    chatId,
    text,
    replyTo: replyTo
      ? { id: replyTo.id, senderId: replyTo.senderId, type: replyTo.type, text: replyTo.text, deleted: false }
      : null,
    createdAt: new Date().toISOString(),
    status: "sending",
  };
  useOutbox.getState().add(pending);
  void deliver(qc, realtime, pending);
}
