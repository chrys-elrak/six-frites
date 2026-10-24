import { unwrap } from "@six/sdk";
import type { ChatDTO, MessageDTO } from "@six/shared";
import { type InfiniteData, type QueryClient, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { six } from "./six";

export interface MessagePage {
  items: MessageDTO[];
  nextCursor: string | null;
}

type Messages = InfiniteData<MessagePage>;

export const chatKeys = {
  list: (archived: boolean) => ["chats", archived] as const,
  lists: ["chats"] as const,
  chat: (chatId: string) => ["chat", chatId] as const,
  messages: (chatId: string) => ["messages", chatId] as const,
};

export function sortChats(chats: ChatDTO[]) {
  return [...chats].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
  );
}

export function useChats(archived = false) {
  return useQuery({
    queryKey: chatKeys.list(archived),
    queryFn: async () =>
      sortChats(
        unwrap(
          await six.api.GET("/v1/chats", { params: { query: { archived: archived ? "true" : "false", limit: 100 } } }),
        ).items,
      ),
  });
}

function findCached(qc: QueryClient, chatId: string) {
  for (const archived of [false, true]) {
    const hit = qc.getQueryData<ChatDTO[]>(chatKeys.list(archived))?.find((c) => c.id === chatId);
    if (hit) return hit;
  }
  return undefined;
}

export function useChat(qc: QueryClient, chatId: string) {
  return useQuery({
    queryKey: chatKeys.chat(chatId),
    queryFn: async () => unwrap(await six.api.GET("/v1/chats/{id}", { params: { path: { id: chatId } } })),
    initialData: () => findCached(qc, chatId),
    retry: false,
  });
}

export function useMessages(chatId: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(chatId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await six.api.GET("/v1/chats/{id}/messages", {
          params: { path: { id: chatId }, query: { limit: 50, cursor: pageParam } },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: Infinity,
  });
}

export function insertMessage(qc: QueryClient, m: MessageDTO) {
  qc.setQueryData<Messages>(chatKeys.messages(m.chatId), (data) => {
    if (!data) return data;
    if (data.pages.some((p) => p.items.some((x) => x.id === m.id))) return data;
    const [first, ...rest] = data.pages;
    if (!first) return data;
    return { ...data, pages: [{ ...first, items: [m, ...first.items] }, ...rest] };
  });
}

export function mapMessages(qc: QueryClient, chatId: string, fn: (m: MessageDTO) => MessageDTO | null) {
  qc.setQueryData<Messages>(chatKeys.messages(chatId), (data) =>
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
