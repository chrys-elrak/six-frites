"use client";

import { Bell, MessageCircle, Settings, Users, VenetianMask } from "lucide-react";
import Link from "next/link";
import { isMuted } from "@six/shared";
import { useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { useNotifications } from "@/lib/notifications";

export type Tab = "chats" | "contacts" | "notifications" | "inbox" | "settings";

const tabs = [
  { id: "chats", href: "/", Icon: MessageCircle },
  { id: "contacts", href: "/contacts", Icon: Users },
  { id: "notifications", href: "/notifications", Icon: Bell },
  { id: "inbox", href: "/inbox", Icon: VenetianMask },
  { id: "settings", href: "/settings", Icon: Settings },
] as const;

const count = (n: number) => (n > 99 ? "99+" : n);

/**
 * The app's tabs, icons only. On wide screens `children`, the chat list as avatars, sits under Anonymous with Settings below it.
 * On wide but short screens (a phone in landscape) the tabs move to the top bar, where the `top` copy shows them in a row.
 */
export function TabBar({ active, children, top }: { active: Tab; children?: React.ReactNode; top?: boolean }) {
  const tr = useT();
  const chats = useChats();
  const notifications = useNotifications();
  const badges: Partial<Record<Tab, number>> = {
    chats: chats.data?.filter((c) => !isMuted(c) && c.unreadCount > 0).length ?? 0,
    notifications: notifications.data?.unread ?? 0,
  };
  const labels: Record<Tab, string> = {
    chats: tr.common.chats,
    contacts: tr.contacts.title,
    notifications: tr.notifications.title,
    inbox: tr.ask.tab,
    settings: tr.common.settings,
  };

  const link = ({ id, href, Icon }: (typeof tabs)[number]) => {
    const on = active === id;
    const badge = badges[id] ?? 0;
    return (
      <Link
        key={id}
        href={href}
        aria-label={labels[id]}
        title={labels[id]}
        aria-current={on ? "page" : undefined}
        className={`group relative flex items-center justify-center py-2.5 transition md:py-1 ${top ? "" : "md:last:mt-auto short:md:hidden"} ${
          on ? "text-brand" : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
        }`}
      >
        <span
          className={`relative grid h-8 ${top ? "w-10" : "w-12"} place-items-center rounded-full transition ${
            on ? "bg-brand/15" : "group-hover:bg-black/5 dark:group-hover:bg-white/10"
          }`}
        >
          <Icon className="size-[22px]" strokeWidth={on ? 2.4 : 1.8} />
          {badge > 0 && (
            <span className="absolute -top-1 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {count(badge)}
            </span>
          )}
        </span>
      </Link>
    );
  };

  if (top) return <nav className="-my-1 ml-auto hidden items-center short:md:flex">{tabs.map(link)}</nav>;

  return (
    <nav className={`${children ? "" : "short:md:hidden"} grid shrink-0 grid-cols-5 border-t border-black/5 pb-[env(safe-area-inset-bottom)] md:order-first md:flex md:w-20 md:flex-col md:gap-2 md:border-t-0 md:border-r md:py-3 dark:border-white/10`}>
      {tabs.slice(0, 4).map(link)}
      {children && <div className="hidden min-h-0 flex-1 flex-col md:flex">{children}</div>}
      {link(tabs[4])}
    </nav>
  );
}
