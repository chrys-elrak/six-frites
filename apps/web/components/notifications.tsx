"use client";

import { notificationText } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { markNotificationsSeen, useNotifications } from "@/lib/notifications";
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
          list.data.items.map((n) => (
            <Link
              key={n.id}
              href={n.chatId ? `/chats/${n.chatId}` : "/notifications"}
              className={`flex items-center gap-3 px-4 py-3 transition hover:bg-black/[0.03] active:bg-black/5 dark:hover:bg-white/5 dark:active:bg-white/10 ${
                n.unread ? "bg-brand/10" : ""
              }`}
            >
              <Avatar user={n.user} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug">{notificationText(tr.notifications, n)}</span>
                <span className={`text-xs ${n.unread ? "font-semibold text-brand" : "text-stone-500"}`}>
                  {listTime(n.createdAt)}
                </span>
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
