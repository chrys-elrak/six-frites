"use client";

import { MessageCircle, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useChats } from "@/lib/chats";

export type Tab = "chats" | "contacts" | "settings";

const tabs = [
  { id: "chats", href: "/", label: "Chats", Icon: MessageCircle },
  { id: "contacts", href: "/contacts", label: "Contacts", Icon: Users },
  { id: "settings", href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function TabBar({ active }: { active: Tab }) {
  const chats = useChats();
  const unread = chats.data?.filter((c) => !c.muted && c.unreadCount > 0).length ?? 0;

  return (
    <nav className="grid shrink-0 grid-cols-3 border-t border-stone-200 bg-stone-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
      {tabs.map(({ id, href, label, Icon }) => {
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
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
