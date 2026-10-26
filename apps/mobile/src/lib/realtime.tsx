import type { Realtime } from "@six/sdk";
import type { ChangeEventDTO, ChatDTO, MessageDTO } from "@six/shared";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { applyChatDeleted, applyDeleted, applyEdited, scheduledKey } from "./actions";
import { chatKeys, insertMessage, patchChat, upsertChat } from "./chats";
import { hydrateNow, startE2EE } from "./e2ee";
import { notifyIncoming, notifyReaction } from "./notify";
import { usePresenceStore } from "./presence";
import { useOutbox } from "./outbox";
import { useSession } from "./session";
import { six } from "./six";
import { useTypingStore } from "./typing";

type Status = "connecting" | "syncing" | "live" | "offline";

interface RealtimeContext {
  realtime: Realtime | null;
  status: Status;
}

const Ctx = createContext<RealtimeContext>({ realtime: null, status: "connecting" });

export const useRealtime = () => useContext(Ctx);

let activeChatId: string | null = null;
export function setActiveChat(id: string | null) {
  activeChatId = id;
}

function cachedChat(qc: QueryClient, chatId: string) {
  return (
    qc.getQueryData<ChatDTO[]>(chatKeys.list(false))?.find((c) => c.id === chatId) ??
    qc.getQueryData<ChatDTO[]>(chatKeys.list(true))?.find((c) => c.id === chatId) ??
    qc.getQueryData<ChatDTO>(chatKeys.chat(chatId))
  );
}

function applyEvent(qc: QueryClient, meId: string, e: ChangeEventDTO) {
  switch (e.type) {
    case "message.new": {
      const m = e.data;
      insertMessage(qc, m);
      if (m.senderId === meId) useOutbox.getState().remove(m.chatId, m.clientId);
      else useTypingStore.getState().set(m.chatId, m.senderId, false);
      const viewing = activeChatId === m.chatId && AppState.currentState === "active";
      if (m.senderId !== meId) {
        const chat = cachedChat(qc, m.chatId);
        void hydrateNow(meId, m).then((shown) => notifyIncoming(shown, chat, viewing), () => notifyIncoming(m, chat, viewing));
      }
      const found = patchChat(qc, m.chatId, (c) => ({
        ...c,
        lastMessage: m,
        lastActivityAt: m.createdAt,
        unreadCount: m.senderId === meId || viewing ? c.unreadCount : c.unreadCount + 1,
      }));
      if (!found) void qc.invalidateQueries({ queryKey: chatKeys.lists });
      break;
    }
    case "message.edited":
      applyEdited(qc, e.data);
      break;
    case "message.reacted": {
      const r = e.data;
      if (r.userId === meId) break;
      const chat = cachedChat(qc, r.chatId);
      const message =
        qc
          .getQueryData<{ pages: { items: MessageDTO[] }[] }>(chatKeys.messages(r.chatId))
          ?.pages.flatMap((p) => p.items)
          .find((m) => m.id === r.messageId) ?? (chat?.lastMessage?.id === r.messageId ? chat.lastMessage : undefined);
      const viewing = activeChatId === r.chatId && AppState.currentState === "active";
      void (message ? hydrateNow(meId, message) : Promise.resolve(undefined)).then(
        (shown) => notifyReaction(r, e.createdAt, chat, shown, viewing),
        () => notifyReaction(r, e.createdAt, chat, undefined, viewing),
      );
      break;
    }
    case "message.deleted":
      applyDeleted(qc, e.data.chatId, e.data.messageIds, e.data.scope);
      break;
    case "chat.updated":
      upsertChat(qc, e.data);
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: scheduledKey(e.data.id) });
      break;
    case "chat.deleted":
      applyChatDeleted(qc, e.data.chatId, e.data.scope);
      break;
    case "chat.delivered": {
      const d = e.data;
      patchChat(qc, d.chatId, (c) => ({
        ...c,
        members: c.members.map((m) =>
          m.user.id === d.userId
            ? { ...m, lastDeliveredMessageId: d.lastDeliveredMessageId, lastDeliveredAt: d.lastDeliveredAt }
            : m,
        ),
      }));
      break;
    }
    case "chat.read": {
      const r = e.data;
      patchChat(qc, r.chatId, (c) => ({
        ...c,
        members: c.members.map((m) =>
          m.user.id !== r.userId
            ? m
            : {
                ...m,
                lastReadMessageId: r.lastReadMessageId,
                lastReadAt: r.lastReadAt,
                ...(!m.lastDeliveredAt || Date.parse(m.lastDeliveredAt) < Date.parse(r.lastReadAt)
                  ? { lastDeliveredMessageId: r.lastReadMessageId, lastDeliveredAt: r.lastReadAt }
                  : {}),
              },
        ),
        unreadCount:
          r.userId !== meId
            ? c.unreadCount
            : c.lastMessage && Date.parse(c.lastMessage.createdAt) <= Date.parse(r.lastReadAt)
              ? 0
              : c.unreadCount,
      }));
      break;
    }
  }
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const meId = useSession((s) => s.user?.id);
  const [status, setStatus] = useState<Status>("connecting");
  const [realtime, setRealtime] = useState<Realtime | null>(null);
  const me = useRef(meId);
  me.current = meId;

  useEffect(() => {
    if (!meId) return;
    startE2EE(meId);
    const rt = six.realtime({
      onEvent: (e) => me.current && applyEvent(qc, me.current, e),
      onTyping: (e) => useTypingStore.getState().set(e.chatId, e.userId, e.typing),
      onStatus: setStatus,
      onResyncRequired: () => void qc.invalidateQueries(),
    });
    rt.socket.on("presence", (p) => usePresenceStore.getState().set([p]));
    rt.start();
    rt.setPresence(AppState.currentState === "active");
    setRealtime(rt);
    const sub = AppState.addEventListener("change", (state) => {
      rt.setPresence(state === "active");
      if (state === "active" && !rt.socket.connected) rt.socket.connect();
    });
    return () => {
      sub.remove();
      rt.stop();
      setRealtime(null);
    };
  }, [meId, qc]);

  return <Ctx.Provider value={{ realtime, status }}>{children}</Ctx.Provider>;
}
