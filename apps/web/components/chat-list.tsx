"use client";

import type { ChatDTO } from "@six/shared";
import { Archive, Ban, BellOff, ChevronLeft, EyeOff, MessageCircle, MoreHorizontal, Pin } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useChats } from "@/lib/chats";
import { listTime } from "@/lib/format";
import { useLongPress } from "@/lib/long-press";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useIsTyping } from "@/lib/typing";
import { Avatar } from "./avatar";
import { ChatMenu } from "./chat-menu";

const statusText = { connecting: "Connecting…", syncing: "Updating…", offline: "Waiting for network…", live: null };

function Preview({ chat, meId }: { chat: ChatDTO; meId: string }) {
  const m = chat.lastMessage;
  if (!m) return <>No messages</>;
  if (m.deletedAt) {
    return (
      <span className="inline-flex items-center gap-1 italic">
        <Ban className="size-3.5" /> Message deleted
      </span>
    );
  }
  return (
    <>
      {m.senderId === meId && "You: "}
      {m.spoiler ? (
        <span className="inline-flex items-center gap-1 italic">
          <EyeOff className="size-3.5" /> Spoiler
        </span>
      ) : (
        m.text
      )}
    </>
  );
}

function ChatRow({ chat, meId, active }: { chat: ChatDTO; meId: string; active: boolean }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const press = useLongPress(() => setMenu(true));
  const typing = useIsTyping(chat.id);
  const peer = chat.members.find((m) => m.user.id !== meId)?.user ?? chat.members[0]!.user;
  const unread = chat.unreadCount > 0;

  return (
    <div className="group relative">
      <Link
        href={`/chats/${chat.id}`}
        {...press}
        className={`flex items-center gap-3 px-4 py-3 transition [-webkit-touch-callout:none] active:bg-stone-100 pointer-coarse:select-none dark:active:bg-stone-800 ${
          active ? "bg-stone-100 dark:bg-stone-800" : "hover:bg-stone-50 dark:hover:bg-stone-900"
        }`}
      >
        <Avatar user={peer} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate font-semibold">{chat.title}</p>
            {chat.muted && <BellOff aria-label="Muted" className="size-3.5 shrink-0 text-stone-400" />}
            <span className={`shrink-0 text-xs ${unread ? "font-semibold text-brand" : "text-stone-500"}`}>
              {listTime(chat.lastActivityAt)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <p
              className={`min-w-0 flex-1 truncate text-sm ${
                typing
                  ? "font-medium text-brand"
                  : unread
                    ? "text-stone-900 dark:text-stone-100"
                    : "text-stone-500 dark:text-stone-400"
              }`}
            >
              {typing ? "typing…" : <Preview chat={chat} meId={meId} />}
            </p>
            {chat.pinned && !unread && (
              <Pin aria-label="Pinned" className="size-3.5 shrink-0 rotate-45 text-stone-400" />
            )}
            {unread && (
              <span
                className={`grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-xs font-bold ${
                  chat.muted
                    ? "bg-stone-300 text-stone-700 dark:bg-stone-700 dark:text-stone-200"
                    : "bg-brand text-brand-ink"
                }`}
              >
                {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </Link>
      <button
        onClick={() => setMenu(true)}
        aria-label={`Options for ${chat.title}`}
        className="absolute top-1/2 right-2 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-stone-500 opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100 pointer-fine:grid dark:bg-stone-800/90"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menu && (
        <ChatMenu
          chat={chat}
          peerName={peer.displayName}
          onClose={() => setMenu(false)}
          onDeleted={(scope) => scope === "me" && active && router.replace("/")}
        />
      )}
    </div>
  );
}

export function ChatList({ archived = false }: { archived?: boolean }) {
  const meId = useSession((s) => s.user!.id);
  const chats = useChats(archived);
  const archivedChats = useChats(true);
  const { status } = useRealtime();
  const pathname = usePathname();

  const visible = chats.data?.filter((c) => c.lastMessage !== null) ?? [];
  const archivedCount = archivedChats.data?.filter((c) => c.lastMessage !== null).length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 dark:border-stone-800">
        {archived && (
          <Link
            href="/"
            aria-label="Back to chats"
            className="-ml-2 grid size-9 place-items-center rounded-full hover:bg-stone-200 dark:hover:bg-stone-800"
          >
            <ChevronLeft className="size-6" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{archived ? "Archived" : "Chats"}</h1>
          {statusText[status] && <p className="text-xs text-stone-500">{statusText[status]}</p>}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!archived && archivedCount > 0 && (
          <Link
            href="/archived"
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-900"
          >
            <span className="grid size-14 place-items-center rounded-full bg-stone-200/70 text-stone-500 dark:bg-stone-800">
              <Archive className="size-5" />
            </span>
            <span className="flex-1">Archived</span>
            <span className="text-stone-500">{archivedCount}</span>
          </Link>
        )}
        {chats.isPending && <p className="p-4 text-sm text-stone-500">Loading…</p>}
        {chats.isError && <p className="p-4 text-sm text-red-600">Couldn't load chats.</p>}
        {chats.isSuccess && visible.length === 0 && (archived || archivedCount === 0) && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800">
              {archived ? (
                <Archive className="size-8" strokeWidth={1.6} />
              ) : (
                <MessageCircle className="size-8" strokeWidth={1.6} />
              )}
            </span>
            <p className="font-medium">{archived ? "No archived chats" : "No conversations yet"}</p>
            {!archived && (
              <>
                <p className="text-sm text-stone-500">Pick someone from your contacts to start chatting.</p>
                <Link
                  href="/contacts"
                  className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900"
                >
                  Open contacts
                </Link>
              </>
            )}
          </div>
        )}
        {visible.map((c) => (
          <ChatRow key={c.id} chat={c} meId={meId} active={pathname === `/chats/${c.id}`} />
        ))}
      </div>
    </div>
  );
}
