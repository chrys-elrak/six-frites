import { type Hydrated, unwrap } from "@six/sdk";
import {
  type ChatDTO,
  type DeleteScope,
  type MessageDTO,
  type MessageEntity,
  type ScheduleMessageInput,
  type ScheduledMessageDTO,
  maskSpoilers,
} from "@six/shared";
import { randomUUID } from "expo-crypto";
import type { QueryClient } from "@tanstack/react-query";
import {
  chatFor,
  chatKeys,
  insertMessage,
  mapMessages,
  patchChat,
  removeChat,
  resetMessages,
  upsertChat,
} from "./chats";
import { e2eeFor, shouldEncrypt } from "./e2ee";
import { useSession } from "./session";
import { six } from "./six";

export function applyEdited(qc: QueryClient, m: MessageDTO) {
  mapMessages(qc, m.chatId, (x) =>
    x.id === m.id
      ? m
      : x.replyTo?.id === m.id
        ? { ...x, replyTo: { ...x.replyTo, text: m.text === null ? null : maskSpoilers(m.text, m.entities) } }
        : x,
  );
  patchChat(qc, m.chatId, (c) => (c.lastMessage?.id === m.id ? { ...c, lastMessage: m } : c));
}

/** Toggles one emoji reaction of yours on a message, showing it straight away. */
export async function react(qc: QueryClient, m: MessageDTO, meId: string, emoji: string) {
  const current = m.reactions ?? [];
  const on = !current.some((r) => r.emoji === emoji && r.userIds.includes(meId));
  const reactions = on
    ? current.some((r) => r.emoji === emoji)
      ? current.map((r) => (r.emoji === emoji ? { ...r, userIds: [...r.userIds, meId] } : r))
      : [...current, { emoji, userIds: [meId] }]
    : current
        .map((r) => (r.emoji === emoji ? { ...r, userIds: r.userIds.filter((id) => id !== meId) } : r))
        .filter((r) => r.userIds.length);
  applyEdited(qc, { ...m, reactions });
  try {
    const params = { path: { id: m.id } };
    applyEdited(
      qc,
      unwrap(
        on
          ? await six.api.POST("/v1/messages/{id}/reactions", { params, body: { emoji } })
          : await six.api.DELETE("/v1/messages/{id}/reactions/{emoji}", { params: { path: { id: m.id, emoji } } }),
      ),
    );
  } catch {
    void qc.invalidateQueries({ queryKey: ["messages", m.chatId] });
  }
}

/** Ticks or unticks a checklist item, showing the change before the server answers. */
export async function check(qc: QueryClient, m: MessageDTO, meId: string, item: number) {
  const done = !m.checks.some((c) => c.item === item);
  const checks = done
    ? [...m.checks, { item, userId: meId, at: new Date().toISOString() }]
    : m.checks.filter((c) => c.item !== item);
  applyEdited(qc, { ...m, checks });
  try {
    const params = { path: { id: m.id, item } };
    applyEdited(qc, unwrap(await six.api.PUT("/v1/messages/{id}/checklist/{item}", { params, body: { done } })));
  } catch {
    void qc.invalidateQueries({ queryKey: ["messages", m.chatId] });
  }
}

/** Shows a self-destructing message as opened straight away instead of waiting for the server's update. */
export function markOpenedLocally(qc: QueryClient, chatId: string, messageId: string) {
  const expire = (m: MessageDTO): MessageDTO =>
    m.id !== messageId || !m.ephemeral
      ? m
      : {
          ...m,
          text: null,
          entities: [],
          attachment: null,
          ephemeral: { ...m.ephemeral, locked: false, expired: true },
        };
  mapMessages(qc, chatId, expire);
  patchChat(qc, chatId, (c) => (c.lastMessage ? { ...c, lastMessage: expire(c.lastMessage) } : c));
}

export function applyDeleted(qc: QueryClient, chatId: string, ids: string[], scope: DeleteScope) {
  const gone = new Set(ids);
  const now = new Date().toISOString();
  mapMessages(qc, chatId, (x) => {
    if (gone.has(x.id))
      return scope === "me" ? null : { ...x, text: null, entities: [], deletedAt: x.deletedAt ?? now };
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

/** Saves an edit. Encrypted messages get new content for every device, keeping their quote and file. */
export async function editMessage(qc: QueryClient, message: Hydrated, text: string, entities: MessageEntity[]) {
  const params = { path: { id: message.id } };
  const meId = useSession.getState().user!.id;
  const chat = await chatFor(qc, message.chatId);
  const m =
    message.encryption || chat.encrypted
      ? await e2eeFor(meId)!.send(
          message.chatId,
          chat.members.map((x) => x.user.id),
          message.clientId,
          {
            text,
            entities: entities.length ? entities : undefined,
            spoiler: message.spoiler || undefined,
            replyText: message.replyTo ? message.replyTo.text : undefined,
            file: message.file,
          },
          async (encrypted) => unwrap(await six.api.PATCH("/v1/messages/{id}", { params, body: { encrypted } })),
        )
      : unwrap(await six.api.PATCH("/v1/messages/{id}", { params, body: { text, entities } }));
  applyEdited(qc, m);
  return m;
}

export async function deleteMessages(qc: QueryClient, chatId: string, messages: MessageDTO[], scope: DeleteScope) {
  if (!messages.length) return;
  const tombstones = messages.filter((m) => m.deletedAt).map((m) => m.id);
  const live = messages.filter((m) => !m.deletedAt).map((m) => m.id);
  if (live.length) applyDeleted(qc, chatId, live, scope);
  if (tombstones.length) applyDeleted(qc, chatId, tombstones, "me");
  try {
    const ids = messages.map((m) => m.id);
    for (let i = 0; i < ids.length; i += 100) {
      const query = { ids: ids.slice(i, i + 100).join(","), scope };
      unwrap(await six.api.DELETE("/v1/messages", { params: { query } }));
    }
  } catch (err) {
    await qc.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
    throw err;
  }
}

export function deleteMessage(qc: QueryClient, m: MessageDTO, scope: DeleteScope) {
  return deleteMessages(qc, m.chatId, [m], scope);
}

export async function updateContact(
  qc: QueryClient,
  userId: string,
  input: { displayName?: string | null; photo?: string | null },
) {
  const contact = unwrap(await six.api.PATCH("/v1/contacts/{userId}", { params: { path: { userId } }, body: input }));
  void qc.invalidateQueries({ queryKey: ["contact", userId] });
  void qc.invalidateQueries({ queryKey: ["referrals"] });
  void qc.invalidateQueries({ queryKey: chatKeys.lists });
  void qc.invalidateQueries({ queryKey: chatKeys.chat(contact.chatId) });
  return contact;
}

/** Removes a contact for both people; the server deletes the direct chat and tells both with chat.deleted. */
export async function removeContact(qc: QueryClient, chatId: string, userId: string) {
  unwrap(await six.api.DELETE("/v1/contacts/{userId}", { params: { path: { userId } } }));
  removeChat(qc, chatId);
}

export async function updateChatSettings(
  qc: QueryClient,
  chatId: string,
  input: Partial<Pick<ChatDTO, "archived" | "muted" | "pinned" | "autoDeleteSecs" | "theme">>,
) {
  const chat = unwrap(await six.api.PATCH("/v1/chats/{id}", { params: { path: { id: chatId } }, body: input }));
  upsertChat(qc, chat);
  return chat;
}

/** Deletes the whole chat, or with `range` only the messages sent in it, which the server's message.deleted removes. */
export async function deleteChat(
  qc: QueryClient,
  chatId: string,
  scope: DeleteScope,
  range?: { from?: string; to?: string },
) {
  unwrap(await six.api.DELETE("/v1/chats/{id}", { params: { path: { id: chatId }, query: { scope, ...range } } }));
  if (!range) applyChatDeleted(qc, chatId, scope);
}

/** Blocks or unblocks the other person in a chat; the server's chat.updated refreshes the chat. */
export async function setBlocked(qc: QueryClient, chat: ChatDTO, userId: string, blocked: boolean) {
  const params = { params: { path: { id: userId } } };
  unwrap(blocked ? await six.api.POST("/v1/users/{id}/block", params) : await six.api.DELETE("/v1/users/{id}/block", params));
  upsertChat(qc, { ...chat, blockedByMe: blocked });
  void qc.invalidateQueries({ queryKey: ["blocks"] });
}

export async function unblockUser(qc: QueryClient, userId: string) {
  unwrap(await six.api.DELETE("/v1/users/{id}/block", { params: { path: { id: userId } } }));
  void qc.invalidateQueries({ queryKey: ["blocks"] });
  void qc.invalidateQueries({ queryKey: chatKeys.lists });
}

export async function deleteAccount() {
  unwrap(await six.api.DELETE("/v1/me", { body: { confirm: "DELETE" } }));
}

export const scheduledKey = (chatId: string) => ["scheduled", chatId] as const;

export async function scheduleMessage(
  qc: QueryClient,
  chatId: string,
  input: Omit<ScheduleMessageInput, "clientId" | "sendAt">,
  sendAt: Date,
) {
  const clientId = randomUUID();
  const params = { path: { id: chatId } };
  const meId = useSession.getState().user!.id;
  const chat = await chatFor(qc, chatId);
  if (await shouldEncrypt(meId, chat)) {
    const { text, entities, spoiler, ...rest } = input;
    await e2eeFor(meId)!.send(
      chatId,
      chat.members.map((x) => x.user.id),
      clientId,
      { text, entities, spoiler },
      async (encrypted) =>
        unwrap(
          await six.api.POST("/v1/chats/{id}/scheduled-messages", {
            params,
            body: { ...rest, clientId, encrypted, sendAt: sendAt.toISOString() },
          }),
        ),
    );
  } else {
    const body = { ...input, clientId, sendAt: sendAt.toISOString() };
    unwrap(await six.api.POST("/v1/chats/{id}/scheduled-messages", { params, body }));
  }
  void qc.invalidateQueries({ queryKey: scheduledKey(chatId) });
}

export async function rescheduleMessage(qc: QueryClient, s: ScheduledMessageDTO, sendAt: Date) {
  const body = { sendAt: sendAt.toISOString() };
  unwrap(await six.api.PATCH("/v1/scheduled-messages/{id}", { params: { path: { id: s.id } }, body }));
  void qc.invalidateQueries({ queryKey: scheduledKey(s.chatId) });
}

export async function cancelScheduled(qc: QueryClient, s: ScheduledMessageDTO) {
  unwrap(await six.api.DELETE("/v1/scheduled-messages/{id}", { params: { path: { id: s.id } } }));
  void qc.invalidateQueries({ queryKey: scheduledKey(s.chatId) });
}

export async function sendScheduledNow(qc: QueryClient, s: ScheduledMessageDTO) {
  const m = unwrap(await six.api.POST("/v1/scheduled-messages/{id}/send", { params: { path: { id: s.id } } }));
  insertMessage(qc, m);
  void qc.invalidateQueries({ queryKey: scheduledKey(s.chatId) });
}
