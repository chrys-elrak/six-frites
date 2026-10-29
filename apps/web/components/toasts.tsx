"use client";

import { MessageCircle, X } from "lucide-react";
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
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2.5 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:items-end md:p-4"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto relative w-full max-w-sm animate-[toast-in_320ms_cubic-bezier(0.2,0.9,0.3,1.15)] overflow-hidden rounded-3xl bg-white/80 shadow-2xl shadow-stone-900/20 ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 dark:bg-stone-900/80 dark:shadow-black/50 dark:ring-white/10"
          >
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                router.push(`/chats/${t.chatId}`);
              }}
              className="flex w-full items-start gap-3 p-3.5 pr-11 text-left transition hover:bg-stone-900/[0.03] dark:hover:bg-white/[0.04]"
            >
              <span className="relative shrink-0">
                <Avatar user={t.avatar} />
                <span className="absolute -right-1 -bottom-1 grid size-[18px] place-items-center rounded-full bg-brand text-brand-ink ring-2 ring-white dark:ring-stone-900">
                  <MessageCircle className="size-2.5 fill-current" />
                </span>
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="block truncate text-[15px] leading-tight font-semibold">{t.title}</span>
                <span className="mt-0.5 line-clamp-2 text-sm leading-snug text-stone-600 dark:text-stone-300">{t.body}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label={tr.common.dismiss}
              className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full text-stone-400 transition hover:bg-stone-900/5 hover:text-stone-600 dark:hover:bg-white/10 dark:hover:text-stone-200"
            >
              <X className="size-4" />
            </button>
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[3px] origin-left animate-[toast-life_5s_linear_forwards] bg-gradient-to-r from-brand/60 to-brand"
            />
          </div>
        ))}
      </div>
    </Portal>
  );
}
