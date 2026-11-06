"use client";

import { type NotificationDTO, notificationText } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Mail, MailOpen, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { deleteNotification, markNotification, markNotificationsSeen, useNotifications } from "@/lib/notifications";
import { useSwipeRow } from "@/lib/swipe";
import { Avatar } from "./avatar";
import { BrandActions } from "./brand-actions";
import { Dialog } from "./dialog";
import { NotificationSettings } from "./notification-settings";

export function Notifications() {
  const tr = useT();
  const qc = useQueryClient();
  const list = useNotifications();
  const unread = list.data?.unread ?? 0;
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    if (unread > 0) void markNotificationsSeen(qc);
  }, [unread, qc]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BrandActions>
        <button
          onClick={() => setSettings((s) => !s)}
          aria-label={tr.settings.notifications}
          title={tr.settings.notifications}
          className="grid size-9 place-items-center rounded-full text-brand hover:bg-stone-200 dark:hover:bg-stone-800"
        >
          <Settings2 className="size-5" />
        </button>
      </BrandActions>
      {settings && (
        <Dialog onClose={() => setSettings(false)}>
          <div className="p-4">
            <NotificationSettings />
          </div>
        </Dialog>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {list.isPending ? (
          <p className="p-4 text-sm text-stone-500">{tr.common.loading}</p>
        ) : list.isError ? (
          <p className="p-4 text-sm text-red-600">{tr.common.somethingWrong}</p>
        ) : list.data.items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800">
              <Bell className="size-8" strokeWidth={1.6} />
            </span>
            <p className="text-sm text-stone-500">{tr.notifications.empty}</p>
          </div>
        ) : (
          list.data.items.map((n) => <Row key={n.id} n={n} />)
        )}
      </div>
    </div>
  );
}

/** One notification: swipe it right to delete it, left to mark it unread or read; on a computer, the same from buttons on hover. */
function Row({ n }: { n: NotificationDTO }) {
  const tr = useT();
  const qc = useQueryClient();
  const remove = () => void deleteNotification(qc, n.id);
  const toggle = () => void markNotification(qc, n.id, !n.unread);
  const swipe = useSwipeRow(remove, toggle);
  const Read = n.unread ? MailOpen : Mail;
  const readLabel = n.unread ? tr.notifications.markRead : tr.notifications.markUnread;

  return (
    <div {...swipe.handlers} className="group relative touch-pan-y overflow-x-clip">
      <div ref={swipe.right} className="pointer-events-none absolute inset-y-0 left-5 flex items-center opacity-0">
        <span className="grid size-10 place-items-center rounded-full bg-red-600 text-white">
          <Trash2 className="size-5" />
        </span>
      </div>
      <div ref={swipe.left} className="pointer-events-none absolute inset-y-0 right-5 flex items-center opacity-0">
        <span className="grid size-10 place-items-center rounded-full bg-brand text-brand-ink">
          <Read className="size-5" />
        </span>
      </div>
      <div ref={swipe.moving} className="relative">
        <Link
          href={n.chatId ? `/chats/${n.chatId}` : "/notifications"}
          onClick={() => n.unread && void markNotification(qc, n.id, false)}
          className={`flex items-center gap-3 px-4 py-3 transition hover:bg-black/[0.03] active:bg-black/5 dark:hover:bg-white/5 dark:active:bg-white/10 ${
            n.unread ? "bg-brand/10" : ""
          }`}
        >
          <Avatar user={n.user} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-snug">{notificationText(tr.notifications, n)}</span>
            <span className={`text-xs ${n.unread ? "font-semibold text-brand" : "text-stone-500"}`}>{listTime(n.createdAt)}</span>
          </span>
        </Link>
        <div className="absolute inset-y-0 right-3 hidden items-center gap-1 group-focus-within:flex pointer-fine:group-hover:flex">
          <button
            type="button"
            onClick={toggle}
            aria-label={readLabel}
            title={readLabel}
            className="grid size-9 place-items-center rounded-full bg-white text-stone-600 shadow ring-1 ring-black/5 hover:text-brand dark:bg-stone-800 dark:text-stone-300"
          >
            <Read className="size-4" />
          </button>
          <button
            type="button"
            onClick={remove}
            aria-label={tr.common.delete}
            title={tr.common.delete}
            className="grid size-9 place-items-center rounded-full bg-white text-stone-600 shadow ring-1 ring-black/5 hover:text-red-600 dark:bg-stone-800 dark:text-stone-300"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
