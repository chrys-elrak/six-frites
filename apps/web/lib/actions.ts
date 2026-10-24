import { unwrap } from "@six/sdk";
import type { ChatDTO, DeleteScope, MessageDTO } from "@six/shared";
import type { QueryClient } from "@tanstack/react-query";
import { chatKeys, mapMessages, patchChat, removeChat, resetMessages, upsertChat } from "./chats";
import { six } from "./six";

export function applyEdited(qc: QueryClient, m: MessageDTO) {
  mapMessages(qc, m.chatId, (x) =>
    x.id === m.id ? m : x.replyTo?.id === m.id ? { ...x, replyTo: { ...x.replyTo, text: m.text } } : x,
  );
  patchChat(qc, m.chatId, (c) => (c.lastMessage?.id === m.id ? { ...c, lastMessage: m } : c));
}

export function applyDeleted(qc: QueryClient, chatId: string, ids: string[], scope: DeleteScope) {
  const gone = new Set(ids);
  const now = new Date().toISOString();
  mapMessages(qc, chatId, (x) => {
    if (gone.has(x.id)) return scope === "me" ? null : { ...x, text: null, deletedAt: x.deletedAt ?? now };
    if (scope === "all" && x.replyTo && gone.has(x.replyTo.id)) {
      return { ...x, replyTo: { ...x.replyTo, text: null, deleted: true } };
    }
    return x;
  });
  void qc.invalidateQueries({ queryKey: chatKeys.lists });
  void qc.invalidateQueries({ queryKey: chatKeys.chat(chatId) });
}

export function applyChatDeleted(qc: QueryClient, chatId: string, scope: DeleteScope) {
  if (scope === "me") removeChat(qc, chatId);
  else resetMessages(qc, chatId);
}

export async function editMessage(qc: QueryClient, messageId: string, text: string) {
  const m = unwrap(await six.api.PATCH("/v1/messages/{id}", { params: { path: { id: messageId } }, body: { text } }));
  applyEdited(qc, m);
  return m;
}

export async function deleteMessage(qc: QueryClient, m: MessageDTO, scope: DeleteScope) {
  applyDeleted(qc, m.chatId, [m.id], m.deletedAt ? "me" : scope);
  try {
    unwrap(await six.api.DELETE("/v1/messages", { params: { query: { ids: m.id, scope } } }));
  } catch (err) {
    await qc.invalidateQueries({ queryKey: chatKeys.messages(m.chatId) });
    throw err;
  }
}

export async function updateChatSettings(
  qc: QueryClient,
  chatId: string,
  input: Partial<Pick<ChatDTO, "archived" | "muted" | "pinned">>,
) {
  const chat = unwrap(await six.api.PATCH("/v1/chats/{id}", { params: { path: { id: chatId } }, body: input }));
  upsertChat(qc, chat);
  return chat;
}

export async function deleteChat(qc: QueryClient, chatId: string, scope: DeleteScope) {
  unwrap(await six.api.DELETE("/v1/chats/{id}", { params: { path: { id: chatId }, query: { scope } } }));
  applyChatDeleted(qc, chatId, scope);
}
