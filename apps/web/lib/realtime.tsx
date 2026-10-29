"use client";

import type { Realtime } from "@six/sdk";
import type { ChangeEventDTO, ChatDTO } from "@six/shared";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { applyChatDeleted, applyDeleted, applyEdited, scheduledKey } from "./actions";
import { receiveSignal, setCallRealtime } from "./call";
import { chatKeys, findMessage, insertMessage, patchChat, upsertChat } from "./chats";
import { hydrate, hydrateChat } from "./e2ee";
import { useOutbox } from "./outbox";
import { notifyIncoming, notifyReaction } from "./notify";
import { usePresenceStore } from "./presence";
import { useTypingStore } from "./typing";
import { useSession } from "./session";
import { six } from "./six";

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

async function hydrateEvent(e: ChangeEventDTO): Promise<ChangeEventDTO> {
  switch (e.type) {
    case "message.new":
    case "message.edited":
      return { ...e, data: await hydrate(e.data) };
    case "chat.updated":
      return { ...e, data: await hydrateChat(e.data) };
    default:
      return e;
  }
}

function applyEvent(qc: QueryClient, meId: string, e: ChangeEventDTO, open: (chatId: string) => void) {
  switch (e.type) {
    case "message.new": {
      const m = e.data;
      insertMessage(qc, m);
      if (m.senderId === meId) useOutbox.getState().remove(m.chatId, m.clientId);
      else useTypingStore.getState().set(m.chatId, m.senderId, null);
      const viewing = activeChatId === m.chatId && document.visibilityState === "visible";
      const found = patchChat(qc, m.chatId, (c) => ({
        ...c,
        lastMessage: m,
        lastActivityAt: m.createdAt,
        unreadCount: m.senderId === meId ? 0 : c.unreadCount + 1,
      }));
      if (!found) void qc.invalidateQueries({ queryKey: chatKeys.lists });
      if (m.senderId !== meId) notifyIncoming(m, cachedChat(qc, m.chatId), viewing, open);
      break;
    }
    case "message.edited":
      applyEdited(qc, e.data);
      break;
    case "message.reacted": {
      const r = e.data;
      const viewing = activeChatId === r.chatId && document.visibilityState === "visible";
      const message = findMessage(qc, r.chatId, r.messageId) ?? cachedChat(qc, r.chatId)?.lastMessage ?? undefined;
      notifyReaction(r, e.createdAt, message?.id === r.messageId ? message : undefined, cachedChat(qc, r.chatId), viewing, open);
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
      void qc.invalidateQueries({ queryKey: ["safety-number", e.data.userId] });
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
  const router = useRouter();
  const meId = useSession((s) => s.user?.id);
  const [status, setStatus] = useState<Status>("connecting");
  const [realtime, setRealtime] = useState<Realtime | null>(null);
  const me = useRef(meId);
  me.current = meId;

  useEffect(() => {
    if (!meId) return;
    let queue: Promise<unknown> = Promise.resolve();
    const rt = six.realtime({
      onEvent: (e) => {
        queue = queue
          .then(() => hydrateEvent(e))
          .then((h) => me.current && applyEvent(qc, me.current, h, (chatId) => router.push(`/chats/${chatId}`)))
          .catch((err) => console.error("could not apply event:", err));
      },
      onTyping: (e) => useTypingStore.getState().set(e.chatId, e.userId, e.typing ? (e.kind ?? "text") : null),
      onStatus: setStatus,
      onResyncRequired: () => void qc.invalidateQueries(),
    });
    rt.socket.on("presence", (p) => usePresenceStore.getState().set([p]));
    rt.socket.on("call:signal", (dto) => me.current && receiveSignal(dto, me.current, (id) => cachedChat(qc, id)));
    rt.start();
    setRealtime(rt);
    setCallRealtime(rt);
    const presence = () => rt.setPresence(document.visibilityState === "visible");
    presence();
    document.addEventListener("visibilitychange", presence);
    return () => {
      document.removeEventListener("visibilitychange", presence);
      rt.stop();
      setRealtime(null);
      setCallRealtime(null);
    };
  }, [meId, qc, router]);

  return <Ctx.Provider value={{ realtime, status }}>{children}</Ctx.Provider>;
}
