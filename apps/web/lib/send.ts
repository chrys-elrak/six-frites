import type { Realtime } from "@six/sdk";
import type { QueryClient } from "@tanstack/react-query";
import { insertMessage, updateChat } from "./chats";
import { type PendingMessage, useOutbox } from "./outbox";

export async function deliver(qc: QueryClient, realtime: Realtime, pending: PendingMessage) {
  const outbox = useOutbox.getState();
  outbox.setStatus(pending.chatId, pending.clientId, "sending");
  try {
    const m = await realtime.sendMessage(pending.chatId, { clientId: pending.clientId, text: pending.text });
    insertMessage(qc, m);
    updateChat(qc, m.chatId, (c) => ({ ...c, lastMessage: m, lastActivityAt: m.createdAt }));
    outbox.remove(pending.chatId, pending.clientId);
  } catch {
    outbox.setStatus(pending.chatId, pending.clientId, "failed");
  }
}

export function sendText(qc: QueryClient, realtime: Realtime, chatId: string, text: string) {
  const pending: PendingMessage = {
    clientId: crypto.randomUUID(),
    chatId,
    text,
    createdAt: new Date().toISOString(),
    status: "sending",
  };
  useOutbox.getState().add(pending);
  void deliver(qc, realtime, pending);
}
