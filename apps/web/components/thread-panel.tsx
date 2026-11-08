"use client";

import { type ChatDTO, commentsClosedNow } from "@six/shared";
import { ChevronLeft, Lock, LockOpen } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { setCommentsClosed } from "@/lib/actions";
import { useMessages } from "@/lib/chats";
import { listTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { BubbleColors, ChatBackground } from "./chat-background";
import { Composer } from "./composer";
import { MessageList, type MessageListHandle } from "./message-list";

const noop = () => {};
const wide = () => matchMedia("(width >= 48rem)").matches;
/** Where the panel slides from: the right edge beside the chat on a wide screen, the bottom on a phone. */
const away = () => (wide() ? "translateX(100%)" : "translateY(100%)");

/**
 * A group message's comments over the chat: the message on top, a line saying how many comments follow, the
 * comments, and a box to add one unless an admin closed them. Slides in, and back out when closed.
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
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<MessageListHandle>(null);
  const closing = useRef(false);
  const root = useMessages(chat.id)
    .data?.pages.flatMap((p) => p.items)
    .find((m) => m.id === threadId);
  const count = root?.thread?.count ?? 0;
  const closed = !!root?.thread && commentsClosedNow(root.thread);
  const ends =
    root?.thread &&
    !closed &&
    (root.thread.closesAt
      ? tr.groups.closesAt(listTime(root.thread.closesAt))
      : root.thread.limit && tr.groups.closesAfter(root.thread.limit));
  const admin = !!chat.group && chat.group.myRole !== "member";

  useEffect(() => {
    panel.current?.animate([{ transform: away() }, { transform: "none" }], {
      duration: 260,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }, []);

  const close = useCallback(() => {
    const el = panel.current;
    if (closing.current) return;
    closing.current = true;
    if (!el) return onClose();
    const out = el.animate([{ transform: "none" }, { transform: away() }], {
      duration: 200,
      easing: "ease-in",
      fill: "forwards",
    });
    out.onfinish = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={tr.groups.commentsTitle}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-stone-50 shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:w-[28rem] md:border-l md:border-stone-200 dark:bg-stone-950 md:dark:border-stone-800"
    >
      <ChatBackground themeId={chat.theme} />
      <BubbleColors themeId={chat.theme} scope="chat-colors" />
      <header className="relative flex items-center gap-1 border-b border-black/5 bg-stone-50/45 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur-xl backdrop-saturate-150 md:h-16 md:py-0 dark:border-white/10 dark:bg-stone-950/40">
        <button
          type="button"
          onClick={close}
          aria-label={tr.common.close}
          className="grid size-10 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <ChevronLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate leading-tight font-semibold">
            {tr.groups.commentsTitle}
          </h2>
          <p className="flex items-center gap-1 truncate text-xs text-stone-500">
            {closed && <Lock className="size-3 shrink-0" />}
            {count ? tr.groups.comments(count) : tr.groups.noComments}
            {ends ? ` · ${ends}` : ""} · {chat.title}
          </p>
        </div>
        {admin && root && (
          <button
            type="button"
            onClick={() =>
              void setCommentsClosed(threadId, !closed).catch(() => null)
            }
            aria-label={
              closed ? tr.groups.reopenComments : tr.groups.closeComments
            }
            title={closed ? tr.groups.reopenComments : tr.groups.closeComments}
            className={`grid size-10 shrink-0 place-items-center rounded-full hover:bg-stone-200 dark:hover:bg-stone-800 ${closed ? "text-brand" : "text-stone-600 dark:text-stone-300"}`}
          >
            {closed ? (
              <LockOpen className="size-5" />
            ) : (
              <Lock className="size-5" />
            )}
          </button>
        )}
      </header>
      <div className="chat-colors relative flex min-h-0 flex-1 flex-col">
        <MessageList
          ref={list}
          chat={chat}
          meId={meId}
          onSeen={noop}
          threadId={threadId}
        />
      </div>
      {closed ? (
        <p className="relative flex items-center justify-center gap-2 border-t border-black/5 bg-stone-50/45 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm text-stone-500 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-stone-950/40">
          <Lock className="size-4" /> {tr.groups.commentsClosedHint}
        </p>
      ) : (
        <div className="chat-colors relative">
          <Composer
            chatId={chat.id}
            threadId={threadId}
            nameOf={nameOf}
            scheduledCount={0}
            onSent={() =>
              requestAnimationFrame(() => list.current?.scrollToBottom())
            }
            onSearch={noop}
          />
        </div>
      )}
    </div>
  );
}
