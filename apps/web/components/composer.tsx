"use client";

import {
  type EmojiEntry,
  type EntityType,
  type EphemeralInput,
  type GifDTO,
  type TypingKind,
  type UploadKind,
  albumIds,
  emojiQuery,
  emojifyEnd,
  emojifyTyped,
  maskSpoilers,
  parseCommand,
  suggestEmoji,
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
  Paperclip,
  SendHorizontal,
  Square,
  Strikethrough,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { editMessage } from "@/lib/actions";
import { useLongPress } from "@/lib/long-press";
import { useComposerMode } from "@/lib/composer";
import { useDrafts } from "@/lib/drafts";
import { isTouch } from "@/lib/camera";
import { shortRule } from "@/lib/ephemeral";
import { AttachDialog, type PickedFile } from "./attach-dialog";
import { ChecklistDialog } from "./checklist";
import { currentPosition } from "./location-card";
import { EphemeralPicker } from "./ephemeral-picker";
import { CameraDialog } from "./camera-dialog";
import { ScheduleDialog, ScheduledPanel } from "./scheduled";
import { Sheet } from "./sheet";
import { VoicePlayer } from "./attachment";
import { RecordButton, type RecordMode } from "./record-button";
import { VideoNoteCapture, type VideoNoteHandle, VideoNotePreview } from "./video-note-capture";
import { CommandBar, type CommandBarHandle } from "./command-bar";
import { EmojiButton } from "./emoji-picker";
import { emojiList } from "@/lib/emoji";
import { useRealtime } from "@/lib/realtime";
import { formatDuration, sendAtLabel } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { mediaMeta } from "@/lib/media-meta";
import { type Recording, useRecorder } from "@/lib/recorder";
import { useSession } from "@/lib/session";
import { type Draft, queueMessage } from "@/lib/send";
import { looksLikeSticker } from "@/lib/image";
import { MARKERS, parseMarkup, toMarkup } from "@/lib/markup";

const formats: { type: EntityType; keys: string; Icon: LucideIcon }[] = [
  { type: "bold", keys: "B", Icon: Bold },
  { type: "italic", keys: "I", Icon: Italic },
  { type: "strike", keys: "Shift+X", Icon: Strikethrough },
  { type: "code", keys: "E", Icon: Code },
  { type: "spoiler", keys: "Shift+P", Icon: EyeOff },
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
  const tr = useT();
  return (
    <div className="flex items-center gap-3 border-l-4 border-brand py-1 pr-1 pl-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-brand">{label}</p>
        <p className="truncate text-sm text-stone-600 dark:text-stone-300">{text}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label={tr.common.cancel}
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
  pickerSlot,
}: {
  chatId: string;
  nameOf: (userId: string) => string;
  scheduledCount: number;
  onSent: () => void;
  pickerSlot?: HTMLElement | null;
}) {
  const tr = useT();
  const meId = useSession((s) => s.user?.id);
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const mode = useComposerMode((s) => s.byChat[chatId]);
  const setMode = useComposerMode((s) => s.set);
  const [text, setText] = useState(() => useDrafts.getState().byChat[chatId] ?? "");
  const draftsReady = useDrafts((s) => s.ready);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spoiler, setSpoiler] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [caret, setCaret] = useState(0);
  const [suggested, setSuggested] = useState<{ start: number; end: number; items: EmojiEntry[] } | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const commands = useRef<CommandBarHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [askLocation, setAskLocation] = useState(false);
  const [writingChecklist, setWritingChecklist] = useState(false);
  const [camera, setCamera] = useState(false);
  const recorder = useRecorder();
  const [recMode, setRecMode] = useState<RecordMode>("voice");
  const [capture, setCapture] = useState<{ kind: RecordMode } | null>(null);
  const captureNow = useRef(capture);
  captureNow.current = capture;
  const [noteMs, setNoteMs] = useState(0);
  const [noteBottom, setNoteBottom] = useState(0);
  const note = useRef<VideoNoteHandle>(null);
  const form = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<
    | { kind: "voice"; rec: Recording; url: string; waveform: number[] | null }
    | { kind: "video"; file: File; url: string; durationMs: number }
    | null
  >(null);
  const [picked, setPicked] = useState<File[] | null>(null);
  const closePicker = useCallback(() => setPicked(null), []);
  const handed = useComposerMode((s) => s.handed[chatId]);
  const resent = useRef<File[] | null>(null);
  useEffect(() => {
    if (!handed) return;
    resent.current = [handed];
    setPicked(resent.current);
    useComposerMode.getState().hand(chatId, undefined);
  }, [handed, chatId]);
  const [ephemeral, setEphemeral] = useState<EphemeralInput | null>(null);
  const closeCamera = useCallback(() => setCamera(false), []);
  const [scheduling, setScheduling] = useState<"now" | "next" | null>(null);
  const [sendAt, setSendAt] = useState<Date | null>(null);
  const [showScheduled, setShowScheduled] = useState(false);
  const closeScheduling = useCallback(() => setScheduling(null), []);
  const closeScheduled = useCallback(() => setShowScheduled(false), []);

  function queue(draft: Draft) {
    if (!realtime) return;
    void queueMessage(qc, realtime, chatId, { ...draft, sendAt: draft.sendAt ?? sendAt });
    setSendAt(null);
  }

  function sendVideoNote(file: File, chosen: EphemeralInput | null) {
    if (!realtime) return;
    queue({
      text: "",
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      ephemeral: chosen,
      file: { blob: file, kind: "video_note", name: file.name, mime: file.type || "video/webm" },
    });
    setEphemeral(null);
    if (mode) cancel();
    onSent();
  }

  function sendSpecial(extra: Pick<Draft, "location" | "checklist">) {
    if (!realtime) return;
    queue({
      text: "",
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      ...extra,
    });
    if (mode) cancel();
    onSent();
  }

  async function sendLocation() {
    setError(null);
    try {
      sendSpecial({ location: await currentPosition() });
    } catch (err) {
      setError((err as Error).message === "denied" ? tr.composer.locationDenied : tr.composer.locationFailed);
    }
  }

  const attachActions = [
    { label: tr.composer.photoOrVideo, onSelect: () => mediaInput.current?.click() },
    { label: tr.composer.camera, onSelect: () => (isTouch() ? cameraInput.current?.click() : setCamera(true)) },
    { label: tr.summary.kinds.file, onSelect: () => fileInput.current?.click() },
    { label: tr.composer.audio, onSelect: () => audioInput.current?.click() },
    { label: tr.composer.location, onSelect: () => setAskLocation(true) },
    { label: tr.composer.checklist, onSelect: () => setWritingChecklist(true) },
    { label: tr.composer.scheduleMessage, onSelect: () => setScheduling("next") },
  ];
  const editing = mode?.kind === "edit" ? mode.message : null;

  useEffect(() => {
    setText(editing ? toMarkup(editing.text ?? "", editing.entities) : (useDrafts.getState().byChat[chatId] ?? ""));
  }, [editing, chatId, draftsReady]);

  useEffect(() => {
    if (mode) ref.current?.focus();
  }, [mode]);

  function change(value: string) {
    setText(value);
    if (!editing) useDrafts.getState().set(chatId, value);
  }

  function typeText(value: string) {
    const swapped = emojifyTyped(text, value);
    if (!swapped) return change(value);
    change(swapped.text);
    requestAnimationFrame(() => ref.current?.setSelectionRange(swapped.caret, swapped.caret));
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

  useEffect(() => {
    const q = parseCommand(text) ? null : emojiQuery(text, caret);
    if (!q) return setSuggested(null);
    let live = true;
    void emojiList().then((list) => {
      if (!live) return;
      setSuggested({ start: q.start, end: caret, items: suggestEmoji(list, q.query) });
      setActive(0);
    });
    return () => {
      live = false;
    };
  }, [text, caret]);

  function pickSuggestion(emoji: string) {
    if (!suggested) return;
    const at = suggested.start + emoji.length;
    change(text.slice(0, suggested.start) + emoji + text.slice(suggested.end));
    setSuggested(null);
    setCaret(at);
    requestAnimationFrame(() => ref.current?.setSelectionRange(at, at));
  }

  function completeCommand(value: string) {
    change(value);
    setCaret(value.length);
    requestAnimationFrame(() => ref.current?.setSelectionRange(value.length, value.length));
  }

  function suggestionKey(e: React.KeyboardEvent) {
    const items = suggested?.items;
    if (!items?.length || e.nativeEvent.isComposing) return false;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      setActive((i) => (i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      pickSuggestion(items[active]!.e);
    } else if (e.key === "Escape") {
      setSuggested(null);
    } else return false;
    e.preventDefault();
    return true;
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

  const busyWith: TypingKind | null = recorder.recording
    ? "voice"
    : capture?.kind === "video" || picked?.some((f) => f.type.startsWith("video/"))
      ? "video"
      : camera || picked?.some((f) => f.type.startsWith("image/"))
        ? "photo"
        : null;

  useEffect(() => {
    if (!realtime || !busyWith) return;
    const ping = () => realtime.setTyping(chatId, true, busyWith);
    ping();
    const timer = setInterval(ping, 4000);
    return () => {
      clearInterval(timer);
      realtime.setTyping(chatId, false);
    };
  }, [realtime, chatId, busyWith]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) ref.current?.focus();
  }, [chatId]);

  const parsed = parseMarkup(emojifyEnd(text));
  const canSubmit = parsed.text.length > 0 && realtime !== null && !saving;
  const sendPress = useLongPress(() => canSubmit && !editing && setScheduling("now"));

  function cancel() {
    setError(null);
    setMode(chatId, undefined);
  }

  async function submit() {
    if (!canSubmit || commands.current?.submit()) return;
    if (editing) {
      const changed =
        parsed.text !== editing.text || JSON.stringify(parsed.entities) !== JSON.stringify(editing.entities);
      if (changed) {
        setSaving(true);
        setError(null);
        try {
          await editMessage(qc, editing, parsed.text, parsed.entities);
        } catch {
          setError(tr.composer.couldNotSaveEdit);
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

  function send(file?: { blob: Blob; kind: UploadKind; name: string; mime: string }, at?: Date) {
    if (!realtime) return;
    realtime.setTyping(chatId, false);
    queue({
      sendAt: at,
      text: parsed.text,
      entities: parsed.entities,
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      spoiler: file ? false : spoiler,
      ephemeral,
      file,
    });
    setSpoiler(false);
    setEphemeral(null);
    useDrafts.getState().set(chatId, "");
    setText("");
    if (mode) cancel();
    onSent();
  }

  function schedule(at: Date) {
    setScheduling(null);
    if (scheduling === "now") send(undefined, at);
    else setSendAt(at);
  }

  function sendGifOrSticker(extra: { gif?: GifDTO; file?: Draft["file"] }) {
    if (!realtime || editing) return;
    queue({
      text: "",
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      ephemeral,
      ...extra,
    });
    setEphemeral(null);
    if (mode) cancel();
    onSent();
  }

  /** Sends a GIPHY or KLIPY sticker as a sticker image, like one from the keyboard; the command stays if it can't be fetched. */
  async function sendFoundSticker(found: GifDTO) {
    const blob = await fetch(found.previewUrl).then((r) => (r.ok ? r.blob() : null), () => null);
    if (!blob) return;
    change("");
    const name = `${(found.title || "sticker").slice(0, 100)}.webp`;
    sendGifOrSticker({ file: { blob, kind: "image", name, mime: blob.type || "image/webp", sticker: true } });
  }

  function sendFiles(files: FileList | File[]) {
    setPicked([...files]);
  }

  /** A GIF or sticker from the keyboard goes straight out as one; anything else pasted opens the attach dialog. */
  async function sendPasted(files: File[]) {
    const [file] = files;
    const sticker = files.length === 1 && (await looksLikeSticker(file!));
    if (files.length !== 1 || (file!.type !== "image/gif" && !sticker)) return sendFiles(files);
    sendGifOrSticker({ file: { blob: file!, kind: "image", name: file!.name || "image", mime: file!.type, sticker } });
  }

  function sendPicked(items: PickedFile[], caption: string, chosen: EphemeralInput | null) {
    setPicked(null);
    if (!realtime) return;
    const { text: captionText, entities } = parseMarkup(emojifyEnd(caption));
    realtime.setTyping(chatId, false);
    const albums = chosen ? [] : albumIds(items.map((it) => it.kind), () => crypto.randomUUID());
    items.forEach(({ file, kind, spoiler: hidden }, i) => {
      const first = i === 0;
      queue({
        groupId: albums[i],
        text: first ? captionText : "",
        entities: first ? entities : [],
        replyTo: first && mode?.kind === "reply" ? mode.message : undefined,
        spoiler: hidden && (kind === "image" || kind === "video"),
        ephemeral: chosen,
        file: { blob: file, kind, name: file.name || "file", mime: file.type || "application/octet-stream" },
      });
    });
    useDrafts.getState().set(chatId, "");
    setText("");
    setSpoiler(false);
    setEphemeral(null);
    if (mode) cancel();
    onSent();
  }

  function sendVoice(rec: Recording) {
    const ext = rec.mime.includes("mp4") ? "m4a" : rec.mime.includes("ogg") ? "ogg" : "webm";
    send({
      blob: rec.blob,
      kind: "voice",
      name: `voice-${new Date().toISOString().slice(0, 19)}.${ext}`,
      mime: rec.mime,
    });
  }

  function startCapture() {
    setError(null);
    setNoteMs(0);
    if (recMode === "video") {
      setNoteBottom(window.innerHeight - (form.current?.getBoundingClientRect().top ?? window.innerHeight));
    } else {
      void recorder.start().then((ok) => {
        if (!ok) setCapture(null);
        else if (!captureNow.current) recorder.cancel();
      });
    }
    setCapture({ kind: recMode });
  }

  async function finishCapture() {
    const c = captureNow.current;
    if (!c) return;
    const clip = c.kind === "video" ? note.current?.stop() : null;
    setCapture(null);
    if (c.kind === "voice") {
      const rec = await recorder.stop();
      if (rec && rec.durationMs >= 500) sendVoice(rec);
      return;
    }
    const file = await clip;
    if (file) sendVideoNote(file, ephemeral);
  }

  async function previewCapture() {
    const c = captureNow.current;
    if (!c) return;
    if (c.kind === "voice") {
      const rec = await recorder.stop();
      setCapture(null);
      if (!rec || rec.durationMs < 500) return;
      setPreview({ kind: "voice", rec, url: URL.createObjectURL(rec.blob), waveform: null });
      void mediaMeta(rec.blob, "voice").then(
        ({ waveform }) =>
          waveform && setPreview((p) => (p?.kind === "voice" && p.rec === rec ? { ...p, waveform } : p)),
      );
      return;
    }
    const durationMs = noteMs;
    const file = await note.current?.stop();
    setCapture(null);
    if (file) setPreview({ kind: "video", file, url: URL.createObjectURL(file), durationMs });
  }

  function closePreview(send: boolean) {
    const p = preview;
    if (!p) return;
    setPreview(null);
    URL.revokeObjectURL(p.url);
    if (!send) return;
    if (p.kind === "voice") sendVoice(p.rec);
    else sendVideoNote(p.file, ephemeral);
  }

  function cancelCapture() {
    const c = captureNow.current;
    setCapture(null);
    if (c?.kind === "voice") recorder.cancel();
    else note.current?.cancel();
  }

  const showMic = (!editing && parsed.text.length === 0) || !!capture || !!preview;
  const overVideo = capture?.kind === "video" || preview?.kind === "video";

  return (
    <>
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className={`space-y-2 border-t border-black/5 bg-stone-50/45 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-stone-950/40 ${
          overVideo ? "relative z-50" : ""
        }`}
      >
        {mode?.kind === "reply" && (
          <ModeBar
            label={tr.composer.replyingTo(mode.message.senderId === meId ? null : nameOf(mode.message.senderId))}
            text={mode.message.spoiler ? tr.summary.spoiler : maskSpoilers(mode.message.text ?? "", mode.message.entities)}
            onCancel={cancel}
          />
        )}
        {editing && (
          <ModeBar
            label={tr.composer.editingMessage}
            text={maskSpoilers(editing.text ?? "", editing.entities)}
            onCancel={cancel}
          />
        )}
        {ephemeral && !editing && (
          <div className="flex items-center gap-2 px-1 text-sm text-orange-600 dark:text-orange-400">
            <Flame className="size-4 fill-current" />
            <span className="flex-1">
              {tr.composer.selfDestructRule(
                shortRule({ maxViews: ephemeral.maxViews ?? null, ttlSeconds: ephemeral.ttlSeconds ?? null }, tr),
              )}
            </span>
            <button
              type="button"
              onClick={() => setEphemeral(null)}
              aria-label={tr.composer.turnOffSelfDestruct}
              className="grid size-7 place-items-center rounded-full hover:bg-orange-500/10"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {sendAt && !editing && (
          <div className="flex items-center gap-2 px-1 text-sm text-brand">
            <CalendarClock className="size-4" />
            <span className="flex-1">{tr.composer.scheduledFor(sendAtLabel(sendAt.toISOString()))}</span>
            <button
              type="button"
              onClick={() => setSendAt(null)}
              aria-label={tr.composer.dontSchedule}
              className="grid size-7 place-items-center rounded-full hover:bg-stone-500/10"
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
          <div role="toolbar" aria-label={tr.composer.formatting} className="flex gap-1">
            {formats.map(({ type, keys, Icon }) => (
              <button
                key={type}
                type="button"
                {...keepSelection(() => wrap(type))}
                aria-label={tr.composer.formats[type]}
                title={`${tr.composer.formats[type]} (${modifierKey()}${keys})`}
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

        <div className="flex items-end gap-1.5">
          {capture || preview ? (
            <button
              type="button"
              onClick={preview ? () => closePreview(false) : cancelCapture}
              aria-label={tr.composer.discardRecording}
              className="grid size-10 shrink-0 place-items-center rounded-full text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              <Trash2 className="size-5" />
            </button>
          ) : !editing && (
            <>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setAttachMenu(true)}
                aria-label={tr.composer.attach}
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
                  [audioInput, "audio/*", undefined],
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
          <div
            className={`relative min-h-10 flex-1 items-end rounded-2xl bg-white ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-brand dark:bg-stone-900 dark:ring-stone-800 ${
              capture || preview ? "hidden" : "flex"
            }`}
          >
            {!editing && (
              <CommandBar
                ref={commands}
                text={text}
                onComplete={completeCommand}
                onGif={(gif) => {
                  change("");
                  sendGifOrSticker({ gif });
                }}
                onSticker={(found) => void sendFoundSticker(found)}
              />
            )}
            {!!suggested?.items.length && (
              <div
                role="listbox"
                aria-label={tr.composer.emojiSuggestions}
                className="absolute bottom-full left-0 z-30 mb-2 flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
              >
                {suggested.items.map((x, i) => (
                  <button
                    key={x.e}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    title={`:${x.n.replace(/ /g, "_")}:`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pickSuggestion(x.e)}
                    className={`grid size-10 shrink-0 place-items-center rounded-lg text-2xl ${
                      i === active ? "bg-stone-100 dark:bg-stone-800" : ""
                    }`}
                  >
                    {x.e}
                  </button>
                ))}
              </div>
            )}
            <EmojiButton
              slot={pickerSlot}
              onPick={insert}
              onGif={(gif) => sendGifOrSticker({ gif })}
            />
            <textarea
              ref={ref}
              value={text}
              onChange={(e) => {
                setCaret(e.target.selectionEnd);
                typeText(e.target.value);
              }}
              onSelect={(e) => {
                setHasSelection(e.currentTarget.selectionEnd > e.currentTarget.selectionStart);
                setCaret(e.currentTarget.selectionEnd);
              }}
              onBlur={() => {
                setHasSelection(false);
                setSuggested(null);
              }}
              onPaste={(e) => {
                const files = [...e.clipboardData.files];
                if (!files.length || editing) return;
                e.preventDefault();
                void sendPasted(files);
              }}
              onKeyDown={(e) => {
                if (commands.current?.key(e) || suggestionKey(e) || shortcut(e)) return;
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
              placeholder={spoiler ? tr.composer.spoilerPlaceholder : tr.common.message}
              aria-label={tr.common.message}
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-[16px] leading-6 outline-none [-webkit-user-modify:read-write]"
            />
            <button
              type="button"
              {...keepSelection(spoilerButton)}
              aria-pressed={!editing && spoiler}
              aria-label={spoiler && !editing ? tr.composer.sendAsNormal : tr.summary.spoiler}
              title={tr.composer.spoilerHint}
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
                aria-label={tr.composer.scheduledCount(scheduledCount)}
                title={tr.composer.scheduledMessages}
                className="grid size-10 shrink-0 place-items-center rounded-full text-brand"
              >
                <CalendarClock className="size-5" />
              </button>
            )}
            {!editing && <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />}
          </div>
          {capture && (
            <div className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-white px-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
              <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
              <span className="font-mono text-sm tabular-nums">
                {formatDuration(capture.kind === "voice" ? recorder.elapsed : noteMs)}
              </span>
              <span className="truncate text-sm text-stone-500">{tr.composer.recording}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {capture.kind === "voice" && (
                  <button
                    type="button"
                    onClick={() => void previewCapture()}
                    aria-label={tr.composer.stopRecording}
                    title={tr.composer.stopRecording}
                    className="grid size-8 place-items-center rounded-full text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    <Square className="size-4 fill-current" />
                  </button>
                )}
                <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
              </span>
            </div>
          )}
          {preview && (
            <div className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-white px-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
              {preview.kind === "voice" ? (
                <VoicePlayer
                  key={preview.url}
                  url={preview.url}
                  durationMs={preview.rec.durationMs}
                  waveform={preview.waveform}
                  mine={false}
                  label={tr.composer.playPreview}
                  compact
                />
              ) : (
                <span className="truncate px-1 text-sm">
                  {tr.summary.kinds.video_note} · {formatDuration(preview.durationMs)}
                </span>
              )}
              <span className="ml-auto shrink-0">
                <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
              </span>
            </div>
          )}
          {showMic ? (
            <RecordButton
              mode={preview?.kind ?? recMode}
              active={!!(capture || preview)}
              disabled={!realtime}
              onToggle={() => setRecMode((m) => (m === "voice" ? "video" : "voice"))}
              onStart={startCapture}
              onSend={() => (preview ? closePreview(true) : void finishCapture())}
            />
          ) : (
            <button
              type="submit"
              disabled={!canSubmit}
              {...(editing ? {} : sendPress)}
              onMouseDown={(e) => e.preventDefault()}
              aria-label={editing ? tr.common.save : tr.common.send}
              title={editing ? undefined : tr.composer.holdOrRightClickToSchedule}
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
      </form>
      {capture?.kind === "video" && (
        <VideoNoteCapture
          ref={note}
          bottom={noteBottom}
          onTick={setNoteMs}
          onLimit={() => void finishCapture()}
          onStop={() => void previewCapture()}
        />
      )}
      {preview?.kind === "video" && <VideoNotePreview url={preview.url} bottom={noteBottom} />}
      {attachMenu && <Sheet title={tr.common.send} actions={attachActions} onClose={() => setAttachMenu(false)} />}
      {askLocation && (
        <Sheet
          title={tr.composer.sendLocationTitle}
          actions={[{ label: tr.composer.sendLocation, onSelect: () => void sendLocation() }]}
          onClose={() => setAskLocation(false)}
        />
      )}
      {writingChecklist && (
        <ChecklistDialog onClose={() => setWritingChecklist(false)} onSend={(checklist) => sendSpecial({ checklist })} />
      )}
      {scheduling && (
        <ScheduleDialog
          title={tr.composer.scheduleMessage}
          initial={sendAt ?? undefined}
          onClose={closeScheduling}
          onPick={schedule}
        />
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
      {picked && (
        <AttachDialog
          files={picked}
          editFirst={picked === resent.current}
          initialCaption={editing ? "" : text}
          initialEphemeral={ephemeral}
          onCancel={closePicker}
          onSend={sendPicked}
        />
      )}
    </>
  );
}
