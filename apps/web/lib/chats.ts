import { unwrap } from "@six/sdk";
import type { ChatDTO, MessageDTO } from "@six/shared";
import { type InfiniteData, type QueryClient, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { six } from "./six";

export interface MessagePage {
  items: MessageDTO[];
  nextCursor: string | null;
}

export const chatKeys = {
  list: ["chats"] as const,
  messages: (chatId: string) => ["messages", chatId] as const,
};

export function sortChats(chats: ChatDTO[]) {
  return [...chats].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
  );
}

export function useChats() {
  return useQuery({
    queryKey: chatKeys.list,
    queryFn: async () =>
      sortChats(unwrap(await six.api.GET("/v1/chats", { params: { query: { archived: "false", limit: 100 } } })).items),
  });
}

export function useChat(chatId: string) {
  const list = useChats();
  return { ...list, data: list.data?.find((c) => c.id === chatId) };
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
  qc.setQueryData<InfiniteData<MessagePage>>(chatKeys.messages(m.chatId), (data) => {
    if (!data) return data;
    if (data.pages.some((p) => p.items.some((x) => x.id === m.id))) return data;
    const [first, ...rest] = data.pages;
    if (!first) return data;
    return { ...data, pages: [{ ...first, items: [m, ...first.items] }, ...rest] };
  });
}

export function updateChat(qc: QueryClient, chatId: string, fn: (chat: ChatDTO) => ChatDTO) {
  let found = false;
  qc.setQueryData<ChatDTO[]>(chatKeys.list, (list) => {
    if (!list) return list;
    return sortChats(
      list.map((c) => {
        if (c.id !== chatId) return c;
        found = true;
        return fn(c);
      }),
    );
  });
  return found;
}

export function upsertChat(qc: QueryClient, chat: ChatDTO) {
  qc.setQueryData<ChatDTO[]>(chatKeys.list, (list) =>
    list ? sortChats([chat, ...list.filter((c) => c.id !== chat.id)]) : list,
  );
}
