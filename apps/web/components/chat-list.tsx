"use client";

import type { ChatDTO } from "@six/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { listTime } from "@/lib/format";
import { useChats } from "@/lib/chats";
import { useLongPress } from "@/lib/long-press";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useIsTyping } from "@/lib/typing";
import { Avatar } from "./avatar";
import { ChatMenu } from "./chat-menu";

const statusText = { connecting: "Connecting…", syncing: "Updating…", offline: "Waiting for network…", live: null };

function preview(chat: ChatDTO, meId: string) {
  const m = chat.lastMessage;
  if (!m) return "Say hi 👋";
  if (m.deletedAt) return "🚫 Message deleted";
  return `${m.senderId === meId ? "You: " : ""}${m.text ?? ""}`;
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
          <div className="flex items-baseline gap-2">
            <p className="min-w-0 flex-1 truncate font-semibold">{chat.title}</p>
            {chat.muted && (
              <span aria-label="Muted" className="text-xs">
                🔕
              </span>
            )}
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
              {typing ? "typing…" : preview(chat, meId)}
            </p>
            {chat.pinned && !unread && (
              <span aria-label="Pinned" className="text-xs">
                📌
              </span>
            )}
            {unread && (
              <span
                className={`grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-xs font-bold ${
                  chat.muted ? "bg-stone-300 text-stone-700 dark:bg-stone-700 dark:text-stone-200" : "bg-brand text-brand-ink"
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
        ⋯
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
  const user = useSession((s) => s.user!);
  const chats = useChats(archived);
  const archivedChats = useChats(true);
  const { status } = useRealtime();
  const pathname = usePathname();
  const archivedCount = archivedChats.data?.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-stone-200 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 dark:border-stone-800">
        {archived && (
          <Link
            href="/"
            aria-label="Back to chats"
            className="-ml-2 grid size-10 place-items-center rounded-full text-2xl hover:bg-stone-200 dark:hover:bg-stone-800"
          >
            ‹
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{archived ? "Archived" : "Chats"}</h1>
          {statusText[status] && <p className="text-xs text-stone-500">{statusText[status]}</p>}
        </div>
        <Link href="/settings" aria-label="Settings" className="rounded-full">
          <Avatar user={user} />
        </Link>
      </header>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {!archived && archivedCount > 0 && (
          <Link
            href="/archived"
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-900"
          >
            <span className="grid size-14 place-items-center text-xl" aria-hidden>
              🗄️
            </span>
            <span className="flex-1">Archived</span>
            <span className="text-stone-500">{archivedCount}</span>
          </Link>
        )}
        {chats.isPending && <p className="p-4 text-sm text-stone-500">Loading…</p>}
        {chats.isError && <p className="p-4 text-sm text-red-600">Couldn't load chats.</p>}
        {archived && chats.data?.length === 0 && (
          <p className="p-8 text-center text-sm text-stone-500">No archived chats.</p>
        )}
        {!archived && chats.data?.length === 0 && archivedCount === 0 && (
          <div className="space-y-3 p-8 text-center">
            <p className="text-4xl">🍟</p>
            <p className="font-medium">No chats yet</p>
            <p className="text-sm text-stone-500">Chats start when someone joins with your invite link.</p>
            <Link
              href="/settings"
              className="inline-block rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900"
            >
              Invite someone
            </Link>
          </div>
        )}
        {chats.data?.map((c) => (
          <ChatRow key={c.id} chat={c} meId={meId} active={pathname === `/chats/${c.id}`} />
        ))}
      </nav>
    </div>
  );
}
