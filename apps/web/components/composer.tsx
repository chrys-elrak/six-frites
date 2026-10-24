"use client";

import { type EntityType, type UploadKind, maskSpoilers } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bold,
  Check,
  Code,
  EyeOff,
  Italic,
  type LucideIcon,
  Mic,
  Paperclip,
  SendHorizontal,
  Strikethrough,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { editMessage } from "@/lib/actions";
import { useComposerMode } from "@/lib/composer";
import { EmojiButton } from "./emoji-picker";
import { useRealtime } from "@/lib/realtime";
import { kindFor } from "@six/sdk";
import { formatDuration } from "@/lib/format";
import { useRecorder } from "@/lib/recorder";
import { queueMessage } from "@/lib/send";
import { MARKERS, parseMarkup, toMarkup } from "@/lib/markup";

const drafts = new Map<string, string>();

const formats: { type: EntityType; label: string; keys: string; Icon: LucideIcon }[] = [
  { type: "bold", label: "Bold", keys: "B", Icon: Bold },
  { type: "italic", label: "Italic", keys: "I", Icon: Italic },
  { type: "strike", label: "Strikethrough", keys: "Shift+X", Icon: Strikethrough },
  { type: "code", label: "Code", keys: "E", Icon: Code },
  { type: "spoiler", label: "Spoiler", keys: "Shift+P", Icon: EyeOff },
];

const modifierKey = () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl+");

const keepSelection = (onPress: () => void) => ({
  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
  onTouchStart: (e: React.TouchEvent) => e.preventDefault(),
  onTouchEnd: (e: React.TouchEvent) => {
    e.preventDefault();
    onPress();
  },
  onClick: onPress,
});

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
  const [hasSelection, setHasSelection] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRecorder();
  const editing = mode?.kind === "edit" ? mode.message : null;

  useEffect(() => {
    setText(editing ? toMarkup(editing.text ?? "", editing.entities) : (drafts.get(chatId) ?? ""));
  }, [editing, chatId]);

  useEffect(() => {
    if (mode) ref.current?.focus();
  }, [mode]);

  function change(value: string) {
    setText(value);
    if (!editing) drafts.set(chatId, value);
  }

  function wrap(type: EntityType) {
    const el = ref.current;
    if (!el || el.selectionEnd <= el.selectionStart) return false;
    const { selectionStart: start, selectionEnd: end } = el;
    const marker = MARKERS[type];
    change(`${text.slice(0, start)}${marker}${text.slice(start, end)}${marker}${text.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + marker.length, end + marker.length);
      setHasSelection(true);
    });
    return true;
  }

  function insert(emoji: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    change(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => el?.setSelectionRange(start + emoji.length, start + emoji.length));
  }

  function spoilerButton() {
    if (!wrap("spoiler") && !editing) setSpoiler((v) => !v);
  }

  function shortcut(e: React.KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey)) return false;
    const key = e.key.toLowerCase();
    const type: EntityType | undefined = e.shiftKey
      ? ({ x: "strike", p: "spoiler" } as const)[key as "x" | "p"]
      : ({ b: "bold", i: "italic", e: "code" } as const)[key as "b" | "i" | "e"];
    if (!type) return false;
    e.preventDefault();
    wrap(type);
    return true;
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

  const parsed = parseMarkup(text);
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
    send();
  }

  function send(file?: { blob: Blob; kind: UploadKind; name: string; mime: string }) {
    if (!realtime) return;
    realtime.setTyping(chatId, false);
    void queueMessage(qc, realtime, chatId, {
      text: parsed.text,
      entities: parsed.entities,
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      spoiler: file ? false : spoiler,
      file,
    });
    setSpoiler(false);
    drafts.delete(chatId);
    setText("");
    if (mode) cancel();
    onSent();
  }

  function sendFiles(files: FileList | File[]) {
    [...files].forEach((f, i) => {
      const mime = f.type || "application/octet-stream";
      const file = { blob: f, kind: kindFor(mime), name: f.name || "file", mime };
      if (i === 0) send(file);
      else if (realtime) void queueMessage(qc, realtime, chatId, { text: "", file });
    });
  }

  async function sendVoice() {
    const rec = await recorder.stop();
    if (!rec || rec.durationMs < 500) return;
    const ext = rec.mime.includes("mp4") ? "m4a" : rec.mime.includes("ogg") ? "ogg" : "webm";
    send({
      blob: rec.blob,
      kind: "voice",
      name: `voice-${new Date().toISOString().slice(0, 19)}.${ext}`,
      mime: rec.mime,
    });
  }

  const showMic = !editing && parsed.text.length === 0;

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

      {hasSelection && (
        <div role="toolbar" aria-label="Formatting" className="flex gap-1">
          {formats.map(({ type, label, keys, Icon }) => (
            <button
              key={type}
              type="button"
              {...keepSelection(() => wrap(type))}
              aria-label={label}
              title={`${label} (${modifierKey()}${keys})`}
              className="grid size-9 place-items-center rounded-lg bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-800 dark:hover:bg-stone-800"
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      )}

      {recorder.error && (
        <p role="alert" className="px-1 text-sm text-red-600 dark:text-red-400">
          {recorder.error}
        </p>
      )}

      {recorder.recording ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={recorder.cancel}
            aria-label="Discard recording"
            className="grid size-10 shrink-0 place-items-center rounded-full text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            <Trash2 className="size-5" />
          </button>
          <div className="flex min-h-10 flex-1 items-center gap-2 rounded-2xl bg-white px-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
            <span className="font-mono text-sm tabular-nums">{formatDuration(recorder.elapsed)}</span>
            <span className="text-sm text-stone-500">Recording…</span>
          </div>
          <button
            type="button"
            onClick={() => void sendVoice()}
            aria-label="Send voice message"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition active:scale-95"
          >
            <SendHorizontal className="size-5" strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          {!editing && (
            <>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileInput.current?.click()}
                aria-label="Attach a file"
                className="grid size-10 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
              >
                <Paperclip className="size-5" />
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) sendFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
          <div className="flex min-h-10 flex-1 items-end rounded-2xl bg-white ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-brand dark:bg-stone-900 dark:ring-stone-800">
            <EmojiButton onPick={insert} />
            <textarea
              ref={ref}
              value={text}
              onChange={(e) => change(e.target.value)}
              onSelect={(e) => setHasSelection(e.currentTarget.selectionEnd > e.currentTarget.selectionStart)}
              onBlur={() => setHasSelection(false)}
              onPaste={(e) => {
                const files = [...e.clipboardData.files];
                if (!files.length || editing) return;
                e.preventDefault();
                sendFiles(files);
              }}
              onKeyDown={(e) => {
                if (shortcut(e)) return;
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
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-[16px] leading-6 outline-none"
            />
            <button
              type="button"
              {...keepSelection(spoilerButton)}
              aria-pressed={!editing && spoiler}
              aria-label={spoiler && !editing ? "Send as normal message" : "Spoiler"}
              title="Select text to hide just that part, or tap to send the whole message as a spoiler"
              className={`grid size-10 shrink-0 place-items-center rounded-full transition ${
                spoiler && !editing ? "text-brand" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              }`}
            >
              <EyeOff className="size-5" />
            </button>
          </div>
          {showMic ? (
            <button
              type="button"
              onClick={() => void recorder.start()}
              disabled={!realtime}
              aria-label="Record a voice message"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition active:scale-95 disabled:opacity-40"
            >
              <Mic className="size-5" />
            </button>
          ) : (
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
          )}
        </div>
      )}
    </form>
  );
}
