"use client";

import type { ChatDTO } from "@six/shared";
import { Lock, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMessages } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { BubbleColors, ChatBackground } from "./chat-background";
import { Composer } from "./composer";
import { MessageList, type MessageListHandle } from "./message-list";

const noop = () => {};

/**
 * A group message's comments over the chat: the message on top, the comments under it, and a box to add one
 * unless an admin closed them. Full screen on a phone, a side panel on a wider screen.
 */
export function ThreadPanel({
  chat,
  meId,
  threadId,
  nameOf,
  onClose,
}: {
  chat: ChatDTO;
  meId: string;
  threadId: string;
  nameOf: (userId: string) => string;
  onClose: () => void;
}) {
  const tr = useT();
  const list = useRef<MessageListHandle>(null);
  const root = useMessages(chat.id)
    .data?.pages.flatMap((p) => p.items)
    .find((m) => m.id === threadId);
  const closed = root?.thread?.closed ?? false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={tr.groups.commentsTitle}
      className="fixed inset-0 z-50 flex flex-col bg-stone-50 shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:w-[28rem] md:border-l md:border-stone-200 dark:bg-stone-950 md:dark:border-stone-800"
    >
      <header className="flex items-center gap-2 border-b border-stone-200 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 dark:border-stone-800">
        <h2 className="min-w-0 flex-1 truncate px-1 font-semibold">{tr.groups.commentsTitle}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-10 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <X className="size-5" />
        </button>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ChatBackground themeId={chat.theme} />
        <BubbleColors themeId={chat.theme} scope="chat-colors" />
        <div className="chat-colors relative flex min-h-0 flex-1 flex-col">
          <MessageList ref={list} chat={chat} meId={meId} onSeen={noop} threadId={threadId} />
        </div>
      </div>
      {closed ? (
        <p className="flex items-center justify-center gap-2 border-t border-stone-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm text-stone-500 dark:border-stone-800">
          <Lock className="size-4" /> {tr.groups.commentsClosedHint}
        </p>
      ) : (
        <div className="chat-colors contents">
          <Composer
            chatId={chat.id}
            threadId={threadId}
            nameOf={nameOf}
            scheduledCount={0}
            onSent={() => requestAnimationFrame(() => list.current?.scrollToBottom())}
            onSearch={noop}
          />
        </div>
      )}
    </div>
  );
}
