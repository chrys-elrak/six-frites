"use client";

import type { Realtime } from "@six/sdk";
import type { ChangeEventDTO } from "@six/shared";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { chatKeys, insertMessage, updateChat, upsertChat } from "./chats";
import { useOutbox } from "./outbox";
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

function applyEvent(qc: QueryClient, meId: string, e: ChangeEventDTO) {
  switch (e.type) {
    case "message.new": {
      const m = e.data;
      insertMessage(qc, m);
      if (m.senderId === meId) useOutbox.getState().remove(m.chatId, m.clientId);
      const viewing = activeChatId === m.chatId && document.visibilityState === "visible";
      const found = updateChat(qc, m.chatId, (c) => ({
        ...c,
        lastMessage: m,
        lastActivityAt: m.createdAt,
        unreadCount: m.senderId === meId || viewing ? c.unreadCount : c.unreadCount + 1,
      }));
      if (!found) void qc.invalidateQueries({ queryKey: chatKeys.list });
      break;
    }
    case "chat.updated":
      upsertChat(qc, e.data);
      break;
    case "chat.read": {
      const r = e.data;
      updateChat(qc, r.chatId, (c) => ({
        ...c,
        members: c.members.map((m) =>
          m.user.id === r.userId ? { ...m, lastReadMessageId: r.lastReadMessageId, lastReadAt: r.lastReadAt } : m,
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
    const rt = six.realtime({
      onEvent: (e) => me.current && applyEvent(qc, me.current, e),
      onStatus: setStatus,
      onResyncRequired: () => void qc.invalidateQueries(),
    });
    rt.start();
    setRealtime(rt);
    return () => {
      rt.stop();
      setRealtime(null);
    };
  }, [meId, qc]);

  return <Ctx.Provider value={{ realtime, status }}>{children}</Ctx.Provider>;
}
