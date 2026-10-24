"use client";

import { maskSpoilers } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Check, EyeOff, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { editMessage } from "@/lib/actions";
import { useComposerMode } from "@/lib/composer";
import { useRealtime } from "@/lib/realtime";
import { sendText } from "@/lib/send";
import { parseSpoilers, toSpoilerMarkup } from "@/lib/spoiler-markup";

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
  const [spoiler, setSpoiler] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const editing = mode?.kind === "edit" ? mode.message : null;

  useEffect(() => {
    setText(editing ? toSpoilerMarkup(editing.text ?? "", editing.entities) : (drafts.get(chatId) ?? ""));
  }, [editing, chatId]);

  useEffect(() => {
    if (mode) ref.current?.focus();
  }, [mode]);

  function change(value: string) {
    setText(value);
    if (!editing) drafts.set(chatId, value);
  }

  function spoilerButton() {
    const el = ref.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    if (!el || end <= start) {
      if (!editing) setSpoiler((v) => !v);
      return;
    }
    change(`${text.slice(0, start)}||${text.slice(start, end)}||${text.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(end + 4, end + 4);
    });
  }

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

  const parsed = parseSpoilers(text);
  const canSubmit = parsed.text.length > 0 && realtime !== null && !saving;

  function cancel() {
    setError(null);
    setMode(chatId, undefined);
  }

  async function submit() {
    if (!canSubmit) return;
    if (editing) {
      const changed =
        parsed.text !== editing.text || JSON.stringify(parsed.entities) !== JSON.stringify(editing.entities);
      if (changed) {
        setSaving(true);
        setError(null);
        try {
          await editMessage(qc, editing.id, parsed.text, parsed.entities);
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
    sendText(qc, realtime, chatId, parsed.text, {
      entities: parsed.entities,
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      spoiler,
    });
    setSpoiler(false);
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
          text={mode.message.spoiler ? "Spoiler" : maskSpoilers(mode.message.text ?? "", mode.message.entities)}
          onCancel={cancel}
        />
      )}
      {editing && (
        <ModeBar label="Editing message" text={maskSpoilers(editing.text ?? "", editing.entities)} onCancel={cancel} />
      )}
      {error && (
        <p role="alert" className="px-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={spoilerButton}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onTouchEnd={(e) => {
            e.preventDefault();
            spoilerButton();
          }}
          aria-pressed={!editing && spoiler}
          aria-label={spoiler && !editing ? "Send as normal message" : "Spoiler"}
          title="Select text to hide just that part, or tap to send the whole message as a spoiler"
          className={`grid size-10 shrink-0 place-items-center rounded-full transition ${
            spoiler && !editing ? "bg-brand/20 text-brand" : "text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
          }`}
        >
          <EyeOff className="size-5" />
        </button>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => change(e.target.value)}
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
          placeholder={spoiler ? "Spoiler message" : "Message"}
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
