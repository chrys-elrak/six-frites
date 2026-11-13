"use client";

import { emojifyEnd, emojifyTyped } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Check, MessageCircle, Reply, SendHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { type Toast, useToasts } from "@/lib/notify";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { Avatar } from "./avatar";
import { Portal } from "./portal";

export function Toasts() {
  const { toasts } = useToasts();
  if (!toasts.length) return null;

  return (
    <Portal>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2.5 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:items-end md:p-4"
        aria-live="polite"
      >
        {toasts.map((t) => (t.sent ? <SentPill key={t.id} toast={t} /> : <ToastCard key={t.id} toast={t} />))}
      </div>
    </Portal>
  );
}

const SWIPE_AWAY = 90;

function SentPill({ toast: t }: { toast: Toast }) {
  const router = useRouter();
  const { dismiss } = useToasts();
  return (
    <button
      type="button"
      onClick={() => {
        dismiss(t.id);
        router.push(t.href);
      }}
      className="pointer-events-auto flex max-w-sm animate-[toast-in_320ms_cubic-bezier(0.2,0.9,0.3,1.15)] items-center gap-2 rounded-full bg-white/80 py-2 pr-4 pl-2 text-sm text-stone-900 shadow-lg ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 dark:bg-stone-900/80 dark:text-stone-100 dark:ring-white/10"
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      <span className="shrink-0 font-semibold">{t.title}</span>
      <span className="min-w-0 truncate opacity-70">{t.body}</span>
    </button>
  );
}

/** One popup: tap to open, swipe it sideways or up to put it away, or answer a message right from it. */
function ToastCard({ toast: t }: { toast: Toast }) {
  const tr = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const { dismiss, hold } = useToasts();
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [leaving, setLeaving] = useState<{ x: number; y: number } | null>(null);
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const from = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const leave = (to: { x: number; y: number }) => {
    setLeaving(to);
    setTimeout(() => dismiss(t.id), 180);
  };

  const send = () => {
    if (!text.trim() || !realtime || !t.replyChatId) return;
    void queueMessage(qc, realtime, t.replyChatId, { text: emojifyEnd(text).trim() }).catch(() => null);
    dismiss(t.id);
  };

  const shift = leaving ?? drag;

  return (
    <div
      onPointerDown={(e) => {
        if ((e.target as Element).closest("input")) return;
        from.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
      }}
      onPointerMove={(e) => {
        if (!from.current) return;
        const x = e.clientX - from.current.x;
        const y = Math.min(0, e.clientY - from.current.y);
        if (!swiped.current && Math.hypot(x, y) > 6) {
          swiped.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (swiped.current) setDrag({ x, y });
      }}
      onPointerUp={() => {
        from.current = null;
        if (Math.abs(drag.x) > SWIPE_AWAY) leave({ x: Math.sign(drag.x) * 480, y: 0 });
        else if (drag.y < -SWIPE_AWAY / 2) leave({ x: 0, y: -160 });
        else setDrag({ x: 0, y: 0 });
      }}
      onPointerCancel={() => {
        from.current = null;
        setDrag({ x: 0, y: 0 });
      }}
      onClickCapture={(e) => {
        if (!swiped.current) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        transform: `translate(${shift.x}px, ${shift.y}px)`,
        opacity: 1 - Math.min(1, Math.max(Math.abs(shift.x) / 300, -shift.y / 120)),
        transition: from.current && !leaving ? "none" : "transform 180ms ease-out, opacity 180ms ease-out",
      }}
      className="pointer-events-auto relative w-full max-w-sm touch-none animate-[toast-in_320ms_cubic-bezier(0.2,0.9,0.3,1.15)] overflow-hidden rounded-3xl bg-white/80 shadow-2xl shadow-stone-900/20 ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 select-none dark:bg-stone-900/80 dark:shadow-black/50 dark:ring-white/10"
    >
      <button
        type="button"
        onClick={() => {
          dismiss(t.id);
          router.push(t.href);
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
      {t.replyChatId && realtime && !replying && (
        <button
          type="button"
          onClick={() => {
            hold(t.id);
            setReplying(true);
          }}
          className="mb-3 ml-[3.75rem] flex items-center gap-1.5 rounded-full bg-stone-900/5 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-stone-900/10 dark:bg-white/10 dark:hover:bg-white/15"
        >
          <Reply className="size-4" />
          {tr.messages.reply}
        </button>
      )}
      {replying && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2 px-3.5 pb-3.5"
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(emojifyTyped(text, e.target.value)?.text ?? e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && dismiss(t.id)}
            placeholder={tr.stories.replyTo(t.title)}
            aria-label={tr.messages.reply}
            className="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-4 py-2 text-[15px] outline-none select-text focus:border-brand dark:border-stone-700 dark:bg-stone-900"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label={tr.common.send}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-ink disabled:opacity-40"
          >
            <SendHorizontal className="size-4" />
          </button>
        </form>
      )}
      {!replying && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[3px] origin-left animate-[toast-life_5s_linear_forwards] bg-gradient-to-r from-brand/60 to-brand"
        />
      )}
    </div>
  );
}
