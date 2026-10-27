"use client";

import { MessageCircle, Settings } from "lucide-react";
import Link from "next/link";
import { isMuted } from "@six/shared";
import { useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";

export type Tab = "chats" | "settings";

const tabs = [
  { id: "chats", href: "/", Icon: MessageCircle },
  { id: "settings", href: "/settings", Icon: Settings },
] as const;

export function TabBar({ active }: { active: Tab }) {
  const tr = useT();
  const chats = useChats();
  const unread = chats.data?.filter((c) => !isMuted(c) && c.unreadCount > 0).length ?? 0;

  return (
    <nav className="grid shrink-0 grid-cols-2 border-t md:px-[max(0px,calc(50%-8rem))] border-stone-200 bg-stone-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
      {tabs.map(({ id, href, Icon }) => {
        const on = active === id;
        return (
          <Link
            key={id}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium transition ${
              on ? "text-brand" : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            <span className="relative">
              <Icon className="size-6" strokeWidth={on ? 2.4 : 1.8} />
              {id === "chats" && unread > 0 && (
                <span className="absolute -top-1 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            {tr.common[id]}
          </Link>
        );
      })}
    </nav>
  );
}
