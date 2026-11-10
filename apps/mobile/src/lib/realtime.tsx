import type { Realtime } from "@six/sdk";
import { type AnonMessageDTO, type ChangeEventDTO, type ChatDTO, type MessageDTO, isLimited, pageName } from "@six/shared";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "expo-router";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLatest } from "./latest";
import { AppState } from "react-native";
import { applyChatDeleted, applyDeleted, applyEdited, scheduledKey } from "./actions";
import { chatKeys, insertMessage, patchChat, upsertChat } from "./chats";
import { attachCalls, onCallSignal } from "./calls";
import { hydrateNow, startE2EE } from "./e2ee";
import { notifyAnon, notifyIncoming, notifyReaction, notifyStoryReaction } from "./notify";
import { usePresenceStore } from "./presence";
import { useOutbox } from "./outbox";
import { resendWaiting } from "./send";
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

/** Refreshes the inbox for an anonymous message that just came in, and tells the user unless `onInbox` and looking. */
export function receiveAnon(qc: QueryClient, m: AnonMessageDTO, onInbox: boolean) {
  void qc.invalidateQueries({ queryKey: ["ask"] });
  notifyAnon(m, onInbox && AppState.currentState === "active");
}

function applyEvent(qc: QueryClient, meId: string, e: ChangeEventDTO) {
  switch (e.type) {
    case "message.new": {
      const m = e.data;
      insertMessage(qc, m);
      if (m.senderId === meId) useOutbox.getState().remove(m.chatId, m.clientId);
      else useTypingStore.getState().set(m.chatId, m.senderId, null);
      if (m.threadId) break;
      const viewing = activeChatId === m.chatId && AppState.currentState === "active";
      if (m.senderId !== meId) {
        const chat = cachedChat(qc, m.chatId);
        void hydrateNow(meId, m).then((shown) => notifyIncoming(shown, chat, viewing), () => notifyIncoming(m, chat, viewing));
      }
      const found = patchChat(qc, m.chatId, (c) => ({
        ...c,
        lastMessage: m,
        lastActivityAt: m.createdAt,
        unreadCount: m.senderId === meId ? 0 : c.unreadCount + 1,
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
      applyDeleted(qc, e.data.chatId, e.data.messageIds, e.data.scope, e.data.by);
      break;
    case "chat.updated":
      upsertChat(qc, e.data);
      void qc.invalidateQueries({ queryKey: scheduledKey(e.data.id) });
      break;
    case "chat.deleted":
      applyChatDeleted(qc, e.data.chatId, e.data.scope);
      break;
    case "devices.changed":
      void qc.invalidateQueries({ queryKey: ["safety-number"] });
      break;
    case "me.updated":
      useSession.getState().setUser(e.data);
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
  const me = useLatest(meId);
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);
  useEffect(() => realtime?.setPage(pageName(pathname)), [realtime, pathname]);

  useEffect(() => {
    if (!meId) return;
    const user = useSession.getState().user;
    if (user && !isLimited(user)) startE2EE(meId);
    const rt = six.realtime({
      device: "app",
      onEvent: (e) => me.current && applyEvent(qc, me.current, e),
      onTyping: (e) => useTypingStore.getState().set(e.chatId, e.userId, e.typing ? (e.kind ?? "text") : null),
      onStatus: (s) => {
        setStatus(s);
        if (s === "live") resendWaiting(qc, rt);
      },
      onResyncRequired: () => void qc.invalidateQueries(),
    });
    rt.socket.on("presence", (p) => usePresenceStore.getState().set([p]));
    rt.socket.on("ask:new", (m) => receiveAnon(qc, m, path.current === "/inbox"));
    rt.socket.on("stories:changed", () => void qc.invalidateQueries({ queryKey: ["stories"] }));
    rt.socket.on("notifications:changed", () => void qc.invalidateQueries({ queryKey: ["notifications"] }));
    rt.socket.on("story:reacted", (e) => {
      void qc.invalidateQueries({ queryKey: ["stories", e.note ? "notes" : e.storyId, "viewers"] });
      const archived = qc.getQueryData<ChatDTO[]>(chatKeys.list(true));
      if (archived?.some((c) => c.type === "direct" && c.members.some((m) => m.user.id === e.user.id))) return;
      notifyStoryReaction(e);
    });
    rt.socket.on("connect", () => {
      void qc.invalidateQueries({ queryKey: ["ask"] });
      void qc.invalidateQueries({ queryKey: ["stories"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    rt.socket.on("call:signal", (dto) => void onCallSignal(dto, (chatId) => cachedChat(qc, chatId)).catch(() => null));
    attachCalls(meId, rt);
    rt.start();
    rt.setPresence(AppState.currentState === "active");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the effect owns the socket, so it hands it out once it exists
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
  }, [meId, qc, me]);

  return <Ctx.Provider value={{ realtime, status }}>{children}</Ctx.Provider>;
}
