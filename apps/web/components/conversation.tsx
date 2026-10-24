"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@/lib/chats";
import { setActiveChat, useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useIsTyping } from "@/lib/typing";
import { Avatar } from "./avatar";
import { ChatMenu } from "./chat-menu";
import { Composer } from "./composer";
import { MessageList, type MessageListHandle } from "./message-list";

export function Conversation({ chatId }: { chatId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const meId = useSession((s) => s.user!.id);
  const chat = useChat(qc, chatId);
  const { realtime } = useRealtime();
  const list = useRef<MessageListHandle>(null);
  const [menu, setMenu] = useState(false);
  const typing = useIsTyping(chatId);

  useEffect(() => {
    setActiveChat(chatId);
    return () => setActiveChat(null);
  }, [chatId]);

  const unread = chat.data?.unreadCount ?? 0;
  const onSeen = useCallback(() => {
    if (unread > 0 && realtime && document.visibilityState === "visible") {
      void realtime.markRead(chatId).catch(() => null);
    }
  }, [unread, realtime, chatId]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && onSeen();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [onSeen]);

  const members = chat.data?.members;
  const nameOf = useMemo(() => {
    const names = new Map(members?.map((m) => [m.user.id, m.user.displayName]));
    return (id: string) => (id === meId ? "You" : (names.get(id) ?? "Someone"));
  }, [members, meId]);

  if (chat.isPending) return <div className="grid h-full place-items-center text-sm text-stone-500">Loading…</div>;
  if (!chat.data) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="space-y-2">
          <p className="font-medium">Chat not found</p>
          <Link href="/" className="text-sm text-stone-500 underline">
            Back to chats
          </Link>
        </div>
      </div>
    );
  }

  const c = chat.data;
  const peer = c.members.find((m) => m.user.id !== meId)?.user ?? c.members[0]!.user;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 bg-stone-50/90 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <Link
          href={c.archived ? "/archived" : "/"}
          aria-label="Back to chats"
          className="grid size-10 place-items-center rounded-full hover:bg-stone-200 md:hidden dark:hover:bg-stone-800"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <Avatar user={peer} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{c.title}</p>
          {typing ? (
            <p className="text-xs font-medium text-brand">typing…</p>
          ) : (
            (c.muted || c.archived) && (
              <p className="text-xs text-stone-500">
                {[c.muted && "Muted", c.archived && "Archived"].filter(Boolean).join(" · ")}
              </p>
            )
          )}
        </div>
        <button
          onClick={() => setMenu(true)}
          aria-label="Chat options"
          className="grid size-10 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <MoreVertical className="size-5" />
        </button>
      </header>

      <MessageList ref={list} chat={c} meId={meId} onSeen={onSeen} />
      <Composer
        chatId={chatId}
        nameOf={nameOf}
        onSent={() => requestAnimationFrame(() => list.current?.scrollToBottom())}
      />

      {menu && (
        <ChatMenu
          chat={c}
          peerName={peer.displayName}
          onClose={() => setMenu(false)}
          onDeleted={(scope) => scope === "me" && router.replace("/")}
        />
      )}
    </div>
  );
}
