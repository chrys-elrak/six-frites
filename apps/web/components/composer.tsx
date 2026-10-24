"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRealtime } from "@/lib/realtime";
import { sendText } from "@/lib/send";

const drafts = new Map<string, string>();

export function Composer({ chatId, onSent }: { chatId: string; onSent: () => void }) {
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const [text, setText] = useState(() => drafts.get(chatId) ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    drafts.set(chatId, text);
  }, [chatId, text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) ref.current?.focus();
  }, [chatId]);

  const canSend = text.trim().length > 0 && realtime !== null;

  function submit() {
    if (!canSend) return;
    sendText(qc, realtime, chatId, text.trim());
    setText("");
    onSent();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 border-t border-stone-200 bg-stone-50/90 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-stone-800 dark:bg-stone-950/90"
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          const desktop = window.matchMedia("(pointer: fine)").matches;
          if (e.key === "Enter" && !e.shiftKey && desktop && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        maxLength={4000}
        enterKeyHint="send"
        placeholder="Message"
        aria-label="Message"
        className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl bg-white px-4 py-2 text-[16px] leading-6 outline-none ring-1 ring-stone-200 focus:ring-2 focus:ring-brand dark:bg-stone-900 dark:ring-stone-800"
      />
      <button
        type="submit"
        disabled={!canSend}
        onMouseDown={(e) => e.preventDefault()}
        aria-label="Send"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition active:scale-95 disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
          <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z" />
        </svg>
      </button>
    </form>
  );
}
