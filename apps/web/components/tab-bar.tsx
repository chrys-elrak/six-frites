"use client";

import { Gamepad2, MessageCircle, Settings } from "lucide-react";
import Link from "next/link";
import { isMuted } from "@six/shared";
import { useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";

export type Tab = "chats" | "games" | "settings";

const tabs = [
  { id: "chats", href: "/", Icon: MessageCircle },
  { id: "games", href: "/games", Icon: Gamepad2 },
  { id: "settings", href: "/settings", Icon: Settings },
] as const;

/** The app's tabs. On wide screens `children`, the chat list as avatars, sits under Games with Settings below it. */
export function TabBar({ active, children }: { active: Tab; children?: React.ReactNode }) {
  const tr = useT();
  const chats = useChats();
  const unread = chats.data?.filter((c) => !isMuted(c) && c.unreadCount > 0).length ?? 0;

  const link = ({ id, href, Icon }: (typeof tabs)[number]) => {
    const on = active === id;
    return (
      <Link
        key={id}
        href={href}
        aria-current={on ? "page" : undefined}
        className={`group relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium transition md:gap-1 md:py-1 md:last:mt-auto ${
          on ? "text-brand" : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
        }`}
      >
        <span
          className={`relative grid place-items-center rounded-full transition md:h-8 md:w-14 ${
            on ? "md:bg-brand/15" : "md:group-hover:bg-black/5 dark:md:group-hover:bg-white/10"
          }`}
        >
          <Icon className="size-6" strokeWidth={on ? 2.4 : 1.8} />
          {id === "chats" && unread > 0 && (
            <span className="absolute -top-1 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white md:top-0 md:right-1">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </span>
        {tr.common[id]}
      </Link>
    );
  };

  return (
    <nav className="grid shrink-0 grid-cols-3 border-t border-black/5 pb-[env(safe-area-inset-bottom)] md:order-first md:flex md:w-20 md:flex-col md:gap-2 md:border-t-0 md:border-r md:py-3 dark:border-white/10">
      {tabs.slice(0, 2).map(link)}
      {children && <div className="hidden min-h-0 flex-1 flex-col md:flex">{children}</div>}
      {link(tabs[2])}
    </nav>
  );
}
