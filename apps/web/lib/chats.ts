import { unwrap } from "@six/sdk";
import { type ChatDTO, FRITE_BOT_ID, type MessageDTO } from "@six/shared";
import { type InfiniteData, type QueryClient, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Hydrated, hydrateAll, hydrateChat } from "./e2ee";
import { getLocale } from "./i18n";
import { six } from "./six";

export const isBotChat = (chat: Pick<ChatDTO, "members">) => chat.members.some((m) => m.user.id === FRITE_BOT_ID);

let botChecked = false;

/** Makes the chat with Frite Bot the first time, once a session, without bringing back one the user deleted. */
export function ensureBotChat(qc: QueryClient, chats: ChatDTO[]) {
  if (botChecked) return;
  botChecked = true;
  if (chats.some(isBotChat)) return;
  void six.api
    .POST("/v1/bot", { body: { locale: getLocale(), open: false } })
    .then(() => qc.invalidateQueries({ queryKey: chatKeys.lists }))
    .catch(() => (botChecked = false));
}

/** Brings Frite Bot's chat back to the chat list, for opening it. */
export async function openBotChat(qc: QueryClient) {
  const chat = unwrap(await six.api.POST("/v1/bot", { body: { locale: getLocale(), open: true } }));
  void qc.invalidateQueries({ queryKey: chatKeys.lists });
  return chat;
}

export interface MessagePage {
  items: Hydrated[];
  nextCursor: string | null;
}

type Messages = InfiniteData<MessagePage>;

export const chatKeys = {
  list: (archived: boolean) => ["chats", archived] as const,
  lists: ["chats"] as const,
  chat: (chatId: string) => ["chat", chatId] as const,
  /** A chat's own messages, or with `threadId` the comments on one of them; both sit under ["messages", chatId]. */
  messages: (chatId: string, threadId?: string) =>
    (threadId ? ["messages", chatId, "thread", threadId] : ["messages", chatId]) as readonly string[],
};

export function sortChats(chats: ChatDTO[]) {
  return [...chats].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
  );
}

/**
 * A refreshed chat list can know of a message an open conversation never got, when its live event was lost or is
 * still stuck decrypting behind another one. Fetch that conversation again then, instead of leaving it behind.
 */
function catchUp(qc: QueryClient, chats: ChatDTO[]) {
  for (const { id, lastMessage: last } of chats) {
    const data = qc.getQueryData<Messages>(chatKeys.messages(id));
    const newest = data?.pages[0]?.items[0];
    if (!last || !newest || Date.parse(last.createdAt) <= Date.parse(newest.createdAt)) continue;
    if (!data.pages.some((p) => p.items.some((m) => m.id === last.id))) void qc.invalidateQueries({ queryKey: chatKeys.messages(id) });
  }
}

export function useChats(archived = false) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: chatKeys.list(archived),
    queryFn: async () => {
      const { items } = unwrap(
        await six.api.GET("/v1/chats", { params: { query: { archived: archived ? "true" : "false", limit: 100 } } }),
      );
      const chats = sortChats(await Promise.all(items.map(hydrateChat)));
      catchUp(qc, chats);
      return chats;
    },
  });
}

export function findCached(qc: QueryClient, chatId: string) {
  for (const archived of [false, true]) {
    const hit = qc.getQueryData<ChatDTO[]>(chatKeys.list(archived))?.find((c) => c.id === chatId);
    if (hit) return hit;
  }
  return undefined;
}

export function useChat(qc: QueryClient, chatId: string) {
  return useQuery({
    queryKey: chatKeys.chat(chatId),
    queryFn: async () => hydrateChat(unwrap(await six.api.GET("/v1/chats/{id}", { params: { path: { id: chatId } } }))),
    initialData: () => findCached(qc, chatId),
    retry: false,
  });
}

/** About a phone screen of messages: more load as the list scrolls up. */
const PAGE = 20;

/** Messages that came in live, kept a minute so a page fetched while they arrived doesn't drop them. */
const arrived = new Map<string, { at: number; m: MessageDTO }[]>();

/**
 * Adds the messages that came in live after `started` to a freshly fetched first page. The fetch saw the chat
 * as it was when it left, and the live copy went into the cache it then replaces, or nowhere on a first load.
 */
function withArrived<P extends { items: MessageDTO[] }>(slot: string, page: P, started: number): P {
  const late = (arrived.get(slot) ?? []).filter((x) => x.at >= started && !page.items.some((m) => m.id === x.m.id));
  return late.length ? { ...page, items: [...late.map((x) => x.m).reverse(), ...page.items] } : page;
}

export function useMessages(chatId: string, threadId?: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(chatId, threadId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const started = Date.now();
      const page = unwrap(
        await six.api.GET("/v1/chats/{id}/messages", {
          params: { path: { id: chatId }, query: { limit: PAGE, cursor: pageParam, thread: threadId } },
        }),
      );
      const hydrated = { ...page, items: await hydrateAll(page.items) };
      return pageParam ? hydrated : withArrived(`${chatId}:${threadId ?? ""}`, hydrated, started);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: Infinity,
  });
}

const UNTIL_MAX = 2000;

/**
 * Loads older messages until `messageId` is among them, so the list can scroll to it. The server sends
 * everything down to it in one page (up to 2000 messages); false when it isn't in the chat any more.
 */
export async function loadUntil(qc: QueryClient, chatId: string, messageId: string) {
  const key = chatKeys.messages(chatId);
  for (;;) {
    const data = qc.getQueryData<Messages>(key);
    if (!data) return false;
    if (data.pages.some((p) => p.items.some((m) => m.id === messageId))) return true;
    const cursor = data.pages.at(-1)?.nextCursor;
    if (!cursor) return false;
    const page = unwrap(
      await six.api.GET("/v1/chats/{id}/messages", {
        params: { path: { id: chatId }, query: { limit: 50, cursor, until: messageId } },
      }),
    );
    const items = await hydrateAll(page.items);
    qc.setQueryData<Messages>(key, (d) =>
      d && d.pages.at(-1)?.nextCursor === cursor
        ? { pages: [...d.pages, { ...page, items }], pageParams: [...d.pageParams, cursor] }
        : d,
    );
    if (page.items.length < UNTIL_MAX && !page.items.some((m) => m.id === messageId)) return false;
  }
}

export function insertMessage(qc: QueryClient, m: MessageDTO) {
  const now = Date.now();
  const slot = `${m.chatId}:${m.threadId ?? ""}`;
  arrived.set(slot, [...(arrived.get(slot) ?? []).filter((x) => now - x.at < 60_000), { at: now, m }]);
  qc.setQueryData<Messages>(chatKeys.messages(m.chatId, m.threadId ?? undefined), (data) => {
    if (!data) return data;
    if (data.pages.some((p) => p.items.some((x) => x.id === m.id))) return data;
    const [first, ...rest] = data.pages;
    if (!first) return data;
    return { ...data, pages: [{ ...first, items: [m, ...first.items] }, ...rest] };
  });
}

export function findMessage(qc: QueryClient, chatId: string, messageId: string) {
  return qc
    .getQueriesData<Messages>({ queryKey: chatKeys.messages(chatId) })
    .flatMap(([, data]) => data?.pages.flatMap((p) => p.items) ?? [])
    .find((m) => m.id === messageId);
}

/** Rewrites a chat's messages wherever they're loaded: its own list and any comments open on its messages. */
export function mapMessages(qc: QueryClient, chatId: string, fn: (m: MessageDTO) => MessageDTO | null) {
  qc.setQueriesData<Messages>({ queryKey: chatKeys.messages(chatId) }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.map(fn).filter((m): m is MessageDTO => m !== null),
          })),
        }
      : data,
  );
}

export function resetMessages(qc: QueryClient, chatId: string) {
  qc.setQueryData<Messages>(chatKeys.messages(chatId), (data) =>
    data ? { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] } : data,
  );
}

export function patchChat(qc: QueryClient, chatId: string, fn: (chat: ChatDTO) => ChatDTO) {
  let found = false;
  for (const archived of [false, true]) {
    qc.setQueryData<ChatDTO[]>(chatKeys.list(archived), (list) =>
      list
        ? sortChats(
            list.map((c) => {
              if (c.id !== chatId) return c;
              found = true;
              return fn(c);
            }),
          )
        : list,
    );
  }
  qc.setQueryData<ChatDTO>(chatKeys.chat(chatId), (c) => (c ? fn(c) : c));
  return found;
}

export function upsertChat(qc: QueryClient, chat: ChatDTO) {
  for (const archived of [false, true]) {
    qc.setQueryData<ChatDTO[]>(chatKeys.list(archived), (list) => {
      if (!list) return list;
      const rest = list.filter((c) => c.id !== chat.id);
      return chat.archived === archived ? sortChats([chat, ...rest]) : rest;
    });
  }
  qc.setQueryData(chatKeys.chat(chat.id), chat);
}

export function removeChat(qc: QueryClient, chatId: string) {
  for (const archived of [false, true]) {
    qc.setQueryData<ChatDTO[]>(chatKeys.list(archived), (list) => list?.filter((c) => c.id !== chatId));
  }
  qc.removeQueries({ queryKey: chatKeys.chat(chatId) });
  qc.removeQueries({ queryKey: chatKeys.messages(chatId) });
}
