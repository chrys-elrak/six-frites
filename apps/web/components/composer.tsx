"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { editMessage } from "@/lib/actions";
import { useComposerMode } from "@/lib/composer";
import { useRealtime } from "@/lib/realtime";
import { sendText } from "@/lib/send";

const drafts = new Map<string, string>();

function ModeBar({ label, text, onCancel }: { label: string; text: string; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-3 border-l-4 border-brand py-1 pr-1 pl-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-brand">{label}</p>
        <p className="truncate text-sm text-stone-600 dark:text-stone-300">{text}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function Composer({
  chatId,
  nameOf,
  onSent,
}: {
  chatId: string;
  nameOf: (userId: string) => string;
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const mode = useComposerMode((s) => s.byChat[chatId]);
  const setMode = useComposerMode((s) => s.set);
  const [text, setText] = useState(() => drafts.get(chatId) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const editing = mode?.kind === "edit" ? mode.message : null;

  useEffect(() => {
    if (!editing) drafts.set(chatId, text);
  }, [chatId, text, editing]);

  useEffect(() => {
    if (editing) setText(editing.text ?? "");
    else setText(drafts.get(chatId) ?? "");
    if (mode) ref.current?.focus();
  }, [mode, editing, chatId]);

  useEffect(() => {
    if (!realtime || editing) return;
    realtime.setTyping(chatId, text.trim().length > 0);
  }, [realtime, chatId, text, editing]);

  useEffect(() => () => realtime?.setTyping(chatId, false), [realtime, chatId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) ref.current?.focus();
  }, [chatId]);

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && realtime !== null && !saving;

  function cancel() {
    setError(null);
    setMode(chatId, undefined);
  }

  async function submit() {
    if (!canSubmit) return;
    if (editing) {
      if (trimmed !== editing.text) {
        setSaving(true);
        setError(null);
        try {
          await editMessage(qc, editing.id, trimmed);
        } catch {
          setError("Couldn't save your edit. Try again.");
          return;
        } finally {
          setSaving(false);
        }
      }
      cancel();
      return;
    }
    realtime.setTyping(chatId, false);
    sendText(qc, realtime, chatId, trimmed, mode?.kind === "reply" ? mode.message : undefined);
    drafts.delete(chatId);
    setText("");
    if (mode) cancel();
    onSent();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-2 border-t border-stone-200 bg-stone-50/90 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-stone-800 dark:bg-stone-950/90"
    >
      {mode?.kind === "reply" && (
        <ModeBar
          label={`Replying to ${nameOf(mode.message.senderId)}`}
          text={mode.message.text ?? ""}
          onCancel={cancel}
        />
      )}
      {editing && <ModeBar label="Editing message" text={editing.text ?? ""} onCancel={cancel} />}
      {error && (
        <p role="alert" className="px-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mode) {
              e.preventDefault();
              cancel();
              return;
            }
            const desktop = window.matchMedia("(pointer: fine)").matches;
            if (e.key === "Enter" && !e.shiftKey && desktop && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          maxLength={4000}
          enterKeyHint={editing ? "done" : "send"}
          placeholder="Message"
          aria-label="Message"
          className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl bg-white px-4 py-2 text-[16px] leading-6 outline-none ring-1 ring-stone-200 focus:ring-2 focus:ring-brand dark:bg-stone-900 dark:ring-stone-800"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          onMouseDown={(e) => e.preventDefault()}
          aria-label={editing ? "Save" : "Send"}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition active:scale-95 disabled:opacity-40"
        >
          {editing ? (
            <Check className="size-5" strokeWidth={2.6} aria-hidden />
          ) : (
            <SendHorizontal className="size-5" strokeWidth={2.2} aria-hidden />
          )}
        </button>
      </div>
    </form>
  );
}
