"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { useChat } from "@/lib/chats";
import { setActiveChat, useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { MessageList, type MessageListHandle } from "./message-list";

export function Conversation({ chatId }: { chatId: string }) {
  const meId = useSession((s) => s.user!.id);
  const chat = useChat(chatId);
  const { realtime } = useRealtime();
  const list = useRef<MessageListHandle>(null);

  useEffect(() => {
    setActiveChat(chatId);
    return () => setActiveChat(null);
  }, [chatId]);

  const unread = chat.data?.unreadCount ?? 0;
  const onSeen = useCallback(() => {
    if (unread > 0 && realtime && document.visibilityState === "visible") void realtime.markRead(chatId).catch(() => null);
  }, [unread, realtime, chatId]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && onSeen();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [onSeen]);

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

  const peer = chat.data.members.find((m) => m.user.id !== meId)?.user ?? chat.data.members[0]!.user;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 bg-stone-50/90 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <Link
          href="/"
          aria-label="Back to chats"
          className="grid size-10 place-items-center rounded-full text-2xl hover:bg-stone-200 md:hidden dark:hover:bg-stone-800"
        >
          ‹
        </Link>
        <Avatar user={peer} />
        <p className="min-w-0 flex-1 truncate font-semibold">{chat.data.title}</p>
      </header>

      <MessageList ref={list} chat={chat.data} meId={meId} onSeen={onSeen} />
      <Composer chatId={chatId} onSent={() => requestAnimationFrame(() => list.current?.scrollToBottom())} />
    </div>
  );
}
