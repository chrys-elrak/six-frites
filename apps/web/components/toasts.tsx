"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useToasts } from "@/lib/notify";
import { Avatar } from "./avatar";
import { Portal } from "./portal";

export function Toasts() {
  const tr = useT();
  const router = useRouter();
  const { toasts, dismiss } = useToasts();
  if (!toasts.length) return null;

  return (
    <Portal>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:items-end"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm animate-[toast-in_180ms_ease-out] items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-stone-200 backdrop-blur dark:bg-stone-900/95 dark:ring-stone-800"
          >
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                router.push(`/chats/${t.chatId}`);
              }}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <Avatar user={t.avatar} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{t.title}</span>
                <span className="block truncate text-sm text-stone-500 dark:text-stone-400">{t.body}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label={tr.common.dismiss}
              className="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Portal>
  );
}
