"use client";

import type { ChatDTO } from "@six/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { listTime } from "@/lib/format";
import { useChats } from "@/lib/chats";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";

const statusText = { connecting: "Connecting…", syncing: "Updating…", offline: "Waiting for network…", live: null };

function preview(chat: ChatDTO, meId: string) {
  const m = chat.lastMessage;
  if (!m) return "Say hi 👋";
  return `${m.senderId === meId ? "You: " : ""}${m.text ?? ""}`;
}

function ChatRow({ chat, meId, active }: { chat: ChatDTO; meId: string; active: boolean }) {
  const peer = chat.members.find((m) => m.user.id !== meId)?.user ?? chat.members[0]!.user;
  const unread = chat.unreadCount > 0;
  return (
    <Link
      href={`/chats/${chat.id}`}
      className={`flex items-center gap-3 px-4 py-3 transition active:bg-stone-100 dark:active:bg-stone-800 ${
        active ? "bg-stone-100 dark:bg-stone-800" : "hover:bg-stone-50 dark:hover:bg-stone-900"
      }`}
    >
      <Avatar user={peer} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate font-semibold">{chat.title}</p>
          <span className={`shrink-0 text-xs ${unread ? "font-semibold text-brand" : "text-stone-500"}`}>
            {listTime(chat.lastActivityAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p className={`min-w-0 flex-1 truncate text-sm ${unread ? "text-stone-900 dark:text-stone-100" : "text-stone-500 dark:text-stone-400"}`}>
            {preview(chat, meId)}
          </p>
          {unread && (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink">
              {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ChatList() {
  const meId = useSession((s) => s.user!.id);
  const user = useSession((s) => s.user!);
  const chats = useChats();
  const { status } = useRealtime();
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-stone-200 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 dark:border-stone-800">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Chats</h1>
          {statusText[status] && <p className="text-xs text-stone-500">{statusText[status]}</p>}
        </div>
        <Link href="/settings" aria-label="Settings" className="rounded-full">
          <Avatar user={user} />
        </Link>
      </header>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {chats.isPending && <p className="p-4 text-sm text-stone-500">Loading…</p>}
        {chats.isError && <p className="p-4 text-sm text-red-600">Couldn't load chats.</p>}
        {chats.data?.length === 0 && (
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
