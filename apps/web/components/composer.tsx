"use client";

import {
  type EntityType,
  type EphemeralInput,
  type GifDTO,
  type StickerDTO,
  type UploadKind,
  maskSpoilers,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bold,
  CalendarClock,
  Check,
  Code,
  EyeOff,
  Flame,
  Italic,
  type LucideIcon,
  Mic,
  Paperclip,
  SendHorizontal,
  Strikethrough,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { editMessage, scheduleMessage } from "@/lib/actions";
import { useLongPress } from "@/lib/long-press";
import { useComposerMode } from "@/lib/composer";
import { isTouch } from "@/lib/camera";
import { shortRule } from "@/lib/ephemeral";
import { AttachDialog, type PickedFile } from "./attach-dialog";
import { EphemeralPicker } from "./ephemeral-picker";
import { CameraDialog } from "./camera-dialog";
import { ScheduleDialog, ScheduledPanel } from "./scheduled";
import { Sheet } from "./sheet";
import { VideoNoteRecorder } from "./video-note-recorder";
import { EmojiButton } from "./emoji-picker";
import { useRealtime } from "@/lib/realtime";
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
  scheduledCount,
  onSent,
}: {
  chatId: string;
  nameOf: (userId: string) => string;
  scheduledCount: number;
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
  const mediaInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [camera, setCamera] = useState(false);
  const [noteRecorder, setNoteRecorder] = useState(false);
  const recorder = useRecorder();
  const [picked, setPicked] = useState<File[] | null>(null);
  const closePicker = useCallback(() => setPicked(null), []);
  const [ephemeral, setEphemeral] = useState<EphemeralInput | null>(null);
  const closeCamera = useCallback(() => setCamera(false), []);
  const closeNoteRecorder = useCallback(() => setNoteRecorder(false), []);
  const [scheduling, setScheduling] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);
  const closeScheduling = useCallback(() => setScheduling(false), []);
  const closeScheduled = useCallback(() => setShowScheduled(false), []);

  function sendVideoNote(file: File, chosen: EphemeralInput | null) {
    setNoteRecorder(false);
    if (!realtime) return;
    void queueMessage(qc, realtime, chatId, {
      text: "",
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      ephemeral: chosen,
      file: { blob: file, kind: "video_note", name: file.name, mime: file.type || "video/webm" },
    });
    setEphemeral(null);
    if (mode) cancel();
    onSent();
  }

  const attachActions = [
    { label: "Photo or video", onSelect: () => mediaInput.current?.click() },
    { label: "Camera", onSelect: () => (isTouch() ? cameraInput.current?.click() : setCamera(true)) },
    { label: "Video message", onSelect: () => setNoteRecorder(true) },
    { label: "File", onSelect: () => fileInput.current?.click() },
  ];
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
  const sendPress = useLongPress(() => canSubmit && !editing && setScheduling(true));

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
      ephemeral,
      file,
    });
    setSpoiler(false);
    setEphemeral(null);
    drafts.delete(chatId);
    setText("");
    if (mode) cancel();
    onSent();
  }

  async function schedule(at: Date) {
    setScheduling(false);
    setError(null);
    try {
      await scheduleMessage(
        qc,
        chatId,
        {
          text: parsed.text,
          entities: parsed.entities.length ? parsed.entities : undefined,
          replyToId: mode?.kind === "reply" ? mode.message.id : undefined,
          spoiler: spoiler || undefined,
          ephemeral: ephemeral ?? undefined,
        },
        at,
      );
    } catch {
      setError("Couldn't schedule your message. Try again.");
      return;
    }
    realtime?.setTyping(chatId, false);
    setSpoiler(false);
    setEphemeral(null);
    drafts.delete(chatId);
    setText("");
    if (mode) cancel();
  }

  function sendGifOrSticker(extra: { gif?: GifDTO; sticker?: StickerDTO }) {
    if (!realtime || editing) return;
    void queueMessage(qc, realtime, chatId, {
      text: "",
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      ephemeral,
      ...extra,
    });
    setEphemeral(null);
    if (mode) cancel();
    onSent();
  }

  function sendFiles(files: FileList | File[]) {
    setPicked([...files]);
  }

  function sendPicked(items: PickedFile[], caption: string, chosen: EphemeralInput | null) {
    setPicked(null);
    if (!realtime) return;
    const { text: captionText, entities } = parseMarkup(caption);
    realtime.setTyping(chatId, false);
    items.forEach(({ file, kind, spoiler: hidden }, i) => {
      const first = i === 0;
      void queueMessage(qc, realtime, chatId, {
        text: first ? captionText : "",
        entities: first ? entities : [],
        replyTo: first && mode?.kind === "reply" ? mode.message : undefined,
        spoiler: hidden && (kind === "image" || kind === "video"),
        ephemeral: chosen,
        file: { blob: file, kind, name: file.name || "file", mime: file.type || "application/octet-stream" },
      });
    });
    drafts.delete(chatId);
    setText("");
    setSpoiler(false);
    setEphemeral(null);
    if (mode) cancel();
    onSent();
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
    <>
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
          <ModeBar
            label="Editing message"
            text={maskSpoilers(editing.text ?? "", editing.entities)}
            onCancel={cancel}
          />
        )}
        {ephemeral && !editing && (
          <div className="flex items-center gap-2 px-1 text-sm text-orange-600 dark:text-orange-400">
            <Flame className="size-4 fill-current" />
            <span className="flex-1">
              Self-destruct:{" "}
              {shortRule({ maxViews: ephemeral.maxViews ?? null, ttlSeconds: ephemeral.ttlSeconds ?? null })}
            </span>
            <button
              type="button"
              onClick={() => setEphemeral(null)}
              aria-label="Turn off self-destruct"
              className="grid size-7 place-items-center rounded-full hover:bg-orange-500/10"
            >
              <X className="size-4" />
            </button>
          </div>
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
            <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
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
                  onClick={() => setAttachMenu(true)}
                  aria-label="Attach"
                  aria-haspopup="menu"
                  className="grid size-10 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
                >
                  <Paperclip className="size-5" />
                </button>
                {(
                  [
                    [mediaInput, "image/*,video/*", undefined],
                    [fileInput, undefined, undefined],
                    [cameraInput, "image/*", "environment"],
                  ] as const
                ).map(([ref, accept, capture], i) => (
                  <input
                    key={i}
                    ref={ref}
                    type="file"
                    accept={accept}
                    capture={capture}
                    multiple={!capture}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) sendFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                ))}
              </>
            )}
            <div className="flex min-h-10 flex-1 items-end rounded-2xl bg-white ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-brand dark:bg-stone-900 dark:ring-stone-800">
              <EmojiButton
                onPick={insert}
                onGif={(gif) => sendGifOrSticker({ gif })}
                onSticker={(sticker) => sendGifOrSticker({ sticker })}
              />
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
              {!editing && scheduledCount > 0 && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowScheduled(true)}
                  aria-label={`${scheduledCount} scheduled message${scheduledCount === 1 ? "" : "s"}`}
                  title="Scheduled messages"
                  className="grid size-10 shrink-0 place-items-center rounded-full text-brand"
                >
                  <CalendarClock className="size-5" />
                </button>
              )}
              {!editing && <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />}
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
                {...(editing ? {} : sendPress)}
                onMouseDown={(e) => e.preventDefault()}
                aria-label={editing ? "Save" : "Send"}
                title={editing ? undefined : "Hold or right-click to schedule"}
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
      {attachMenu && <Sheet title="Send" actions={attachActions} onClose={() => setAttachMenu(false)} />}
      {scheduling && (
        <ScheduleDialog title="Schedule message" onClose={closeScheduling} onPick={(at) => void schedule(at)} />
      )}
      {showScheduled && <ScheduledPanel chatId={chatId} onClose={closeScheduled} />}
      {camera && (
        <CameraDialog
          onClose={closeCamera}
          onCapture={(file) => {
            setCamera(false);
            setPicked([file]);
          }}
        />
      )}
      {noteRecorder && (
        <VideoNoteRecorder initialEphemeral={ephemeral} onClose={closeNoteRecorder} onSend={sendVideoNote} />
      )}
      {picked && (
        <AttachDialog
          files={picked}
          initialCaption={editing ? "" : text}
          initialEphemeral={ephemeral}
          onCancel={closePicker}
          onSend={sendPicked}
        />
      )}
    </>
  );
}
