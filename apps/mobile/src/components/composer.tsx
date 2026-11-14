import {
  type EmojiEntry,
  type EntityType,
  type EphemeralInput,
  type GifDTO,
  LABEL_FONTS,
  type MenuCommand,
  type TypingKind,
  albumIds,
  emojiQuery,
  type MentionOption,
  mentionOptions,
  mentionQuery,
  emojifyEnd,
  emojifyTyped,
  maskSpoilers,
  attachCommands,
  type CommandName,
  type StickerDTO,
  parseCommand,
  silentMessage,
  suggestEmoji,
  MESSAGE_TEXT_SIZES,
  TEXT_COLORS,
  TEXT_FONTS,
  TEXT_GRADIENTS,
  type TextColor,
  type TextGradient,
  type CommentRule,
} from "@six/shared";
import emojis from "@six/shared/emojis.json";
import { unwrap } from "@six/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import {
  ALargeSmall,
  AudioLines,
  BellOff,
  Bold,
  CalendarClock,
  Camera,
  Check,
  Code,
  Dices,
  EyeOff,
  FileText,
  Film,
  Flame,
  Gamepad2,
  Ghost,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  ListChecks,
  ChartBar,
  ShieldCheck,
  Users,
  MapPin,
  Music,
  NotebookPen,
  Palette,
  Highlighter,
  TypeOutline,
  Paperclip,
  Plus,
  RotateCcw,
  SendHorizontal,
  Smile,
  Square,
  Sticker,
  Strikethrough,
  TicketPlus,
  Trash2,
  Type,
  type LucideIcon,
  Underline,
  X,
} from "lucide-react-native";
import { type ComponentRef, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { Image } from "expo-image";
import { File, Paths } from "expo-file-system";
import { Keyboard, Pressable, ScrollView, StyleSheet, View, findNodeHandle } from "react-native";
import { Text, TextInput } from "./text";
import { DraftText, RichTextInput } from "./rich-input";
import { ColorPicker } from "./story-composer";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { editMessage, updateChatSettings } from "@/lib/actions";
import { useChat } from "@/lib/chats";
import { useComposerMode } from "@/lib/composer";
import { receiveDraft, useDrafts } from "@/lib/drafts";
import { shortRule } from "@/lib/ephemeral";
import { formatDuration, inviteUrl, sendAtLabel } from "@/lib/format";
import { useBubbleColors } from "@/lib/bubble-colors";
import { useT } from "@/lib/i18n";
import { markupMap, parseMarkup, parseRaw, plainAt, toMarkup, toggleFormat } from "@/lib/markup";
import { muteVideo, pickFiles, pickMedia, receivedImage, takePhoto } from "@/lib/media";
import { useRealtime } from "@/lib/realtime";
import { type Draft, type LocalFile, queueMessage } from "@/lib/send";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { flame, useTheme } from "@/lib/theme";
import { AttachDialog, type PickedFile } from "./attach-dialog";
import { NewChecklist } from "./checklist";
import { Avatar } from "./avatar";
import { NewPoll } from "./poll";
import { NewGame } from "./game";
import { LocationPicker, currentPosition } from "./location-card";
import { CommandBar, type CommandBarHandle } from "./command-bar";
import { CommentsPicker } from "./comments-picker";
import { EphemeralPicker } from "./ephemeral-picker";
import { ExpressionPanel } from "./expression-panel";
import { ScheduleDialog, ScheduledPanel } from "./scheduled";
import { Sheet } from "./sheet";
import { RecordButton, type RecordMode } from "./record-button";
import { VoicePlayer } from "./attachment";
import { VideoNoteCapture, type VideoNoteHandle, VideoNotePreview } from "./video-note-capture";
import RichInput, { type ReceivedImage } from "../../modules/rich-input";

const allEmoji = (emojis as { data: EmojiEntry[] }[]).flatMap((c) => c.data);

const formats: { type: EntityType; Icon: LucideIcon }[] = [
  { type: "bold", Icon: Bold },
  { type: "italic", Icon: Italic },
  { type: "underline", Icon: Underline },
  { type: "strike", Icon: Strikethrough },
  { type: "code", Icon: Code },
  { type: "spoiler", Icon: EyeOff },
];

interface Range {
  start: number;
  end: number;
}

function ModeBar({ label, text, photo, onCancel }: { label: string; text: string; photo?: LocalFile; onCancel: () => void }) {
  const t = useTheme();
  const tr = useT();
  const accent = useBubbleColors();
  return (
    <View style={[styles.modeBar, { borderLeftColor: accent.bg }]}>
      {photo && <Image source={{ uri: photo.uri }} style={{ width: 40, height: 40, borderRadius: 6 }} contentFit="cover" />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: accent.bg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
        <Text numberOfLines={1} style={{ color: t.textSoft, fontSize: 14 }}>
          {text}
        </Text>
      </View>
      <Pressable onPress={onCancel} accessibilityLabel={tr.common.cancel} hitSlop={8} style={styles.round32}>
        <X size={16} color={t.muted} />
      </Pressable>
    </View>
  );
}


const COMMAND_ICONS: Record<CommandName, LucideIcon> = {
  giphy: Film,
  sticker: Sticker,
  silent: BellOff,
  emoji: Smile,
  game: Gamepad2,
  play: Dices,
  location: MapPin,
  schedule: CalendarClock,
  voice: AudioLines,
  vanish: Ghost,
};
export function Composer({
  chatId,
  nameOf,
  scheduledCount,
  onSent,
  onSearch,
  limited = false,
  threadId,
}: {
  chatId: string;
  nameOf: (userId: string) => string;
  scheduledCount: number;
  onSent: () => void;
  onSearch: (q: string) => void;
  /** A support chat: text only, plus a button for admins to send an invite link. */
  limited?: boolean;
  /** Writes comments on this group message instead of in the chat; its draft and reply mode are its own. */
  threadId?: string;
}) {
  const slot = threadId ? `${chatId}:${threadId}` : chatId;
  const accent = useBubbleColors();
  const [focused, setFocused] = useState(false);
  const t = useTheme();
  const tr = useT();
  const admin = useQuery({
    queryKey: ["admin", "me"],
    queryFn: async () => {
      const res = await six.api.GET("/v1/admin/me");
      return res.response.ok ? unwrap(res).admin : false;
    },
    enabled: limited,
    staleTime: Infinity,
    retry: false,
  }).data;
  const meId = useSession((s) => s.user?.id);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const chat = useChat(qc, chatId).data;
  const { realtime } = useRealtime();
  const mode = useComposerMode((s) => s.byChat[slot]);
  const setMode = useComposerMode((s) => s.set);
  const [comments, setComments] = useState<CommentRule | null>(null);
  const [text, setText] = useState(() => useDrafts.getState().byChat[slot] ?? "");
  const draftsReady = useDrafts((s) => s.ready);
  const parkedMarkup = useDrafts((s) => s.parked[slot]);
  const parked = parkedMarkup ? parseMarkup(parkedMarkup) : null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selection = useRef<Range>({ start: 0, end: 0 });
  const [forced, setForced] = useState<Range | undefined>(undefined);
  const [expressions, setExpressions] = useState(false);
  const [tall, setTall] = useState(false);
  useEffect(() => {
    if (!text) setTall(false);
  }, [text]);
  const [hasSelection, setHasSelection] = useState(false);
  const [panel, setPanel] = useState<"color" | "highlight" | "outline" | "custom" | "font" | "size" | null>(null);
  const [paint, setPaint] = useState<"color" | "highlight" | "outline">("color");
  const [stops, setStops] = useState<[string, string]>(["#ec4899", "#3b82f6"]);
  const [stop, setStop] = useState<0 | 1 | null>(null);
  const [caret, setCaret] = useState(0);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const commands = useRef<CommandBarHandle>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [askLocation, setAskLocation] = useState(false);
  const [writingChecklist, setWritingChecklist] = useState(false);
  const [writingPoll, setWritingPoll] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [recMode, setRecMode] = useState<RecordMode>("voice");
  const [capture, setCapture] = useState<{ kind: RecordMode; muted?: boolean; spoiler?: boolean } | null>(null);
  const captureNow = useRef(capture);
  captureNow.current = capture;
  const [noteMs, setNoteMs] = useState(0);
  const [barHeight, setBarHeight] = useState(0);
  const note = useRef<VideoNoteHandle>(null);
  const voiceOn = useRef(false);
  const [preview, setPreview] = useState<{ kind: RecordMode; file: LocalFile; muted?: LocalFile; spoiler?: boolean } | null>(
    null,
  );
  const [picked, setPicked] = useState<LocalFile[] | null>(null);
  const closePicker = useCallback(() => setPicked(null), []);
  const handed = useComposerMode((s) => s.handed[slot]);
  const resent = useRef<LocalFile[] | null>(null);
  useEffect(() => {
    if (!handed) return;
    resent.current = [handed];
    setPicked(resent.current);
    useComposerMode.getState().hand(slot, undefined);
  }, [handed, slot]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 200);
  const [recording, setRecording] = useState(false);
  const [ephemeral, setEphemeral] = useState<EphemeralInput | null>(null);
  const [scheduling, setScheduling] = useState<"now" | "next" | null>(null);
  const [sendAt, setSendAt] = useState<Date | null>(null);
  const [showScheduled, setShowScheduled] = useState(false);

  async function sendInvite() {
    try {
      const { code } = unwrap(await six.api.POST("/v1/invites", { body: {} }));
      queue({ text: inviteUrl(code) });
      onSent();
    } catch {
      setError(tr.support.inviteFailed);
    }
  }

  function queue(draft: Draft) {
    if (!realtime) return;
    if (draft.game) return queueMessage(qc, realtime, chatId, draft);
    queueMessage(qc, realtime, chatId, {
      ...draft,
      threadId,
      comments: comments ?? undefined,
      sendAt: draft.sendAt ?? sendAt,
    });
    setSendAt(null);
    setComments(null);
  }

  const editing = mode?.kind === "edit" ? mode.message : null;

  const stored = useDrafts((s) => s.byChat[slot] ?? "");
  const [shownFor, setShownFor] = useState({ editing: null as typeof editing, chatId, draftsReady, stored });
  if (shownFor.editing !== editing || shownFor.chatId !== chatId || shownFor.draftsReady !== draftsReady) {
    setShownFor({ editing, chatId, draftsReady, stored });
    const shown = editing ? toMarkup(editing.text ?? "", editing.entities) : stored;
    setText(shown);
    if (editing) setForced({ start: shown.length, end: shown.length });
  } else if (shownFor.stored !== stored) {
    setShownFor({ ...shownFor, stored });
    if (!editing && stored.trim() !== text.trim()) setText(stored);
  }

  const pullDraft = useEffectEvent(() => chat && void receiveDraft(chat));
  useEffect(() => {
    pullDraft();
  }, [chat?.id, chat?.encrypted, chat?.draft?.at]);

  useEffect(() => {
    if (mode) input.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (!realtime || editing) return;
    realtime.setTyping(chatId, text.trim().length > 0);
  }, [realtime, chatId, text, editing]);

  useEffect(() => () => realtime?.setTyping(chatId, false), [realtime, chatId]);

  const busyWith: TypingKind | null = recording
    ? "voice"
    : capture?.kind === "video" || picked?.some((f) => f.kind === "video")
      ? "video"
      : picked?.some((f) => f.kind === "image")
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

  const onImage = useRef<(image: ReceivedImage) => void>(() => {});
  onImage.current = (image) => {
    if (editing) return;
    void pick(async () => {
      const file = await receivedImage(image);
      if (!image.fromKeyboard) return [file];
      send(file);
      return [];
    });
  };

  useEffect(() => {
    const sub = RichInput?.addListener("onImage", (image) => onImage.current(image));
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    const tag = findNodeHandle(input.current);
    if (tag) void RichInput?.watch(tag);
  }, [recording]);

  function change(value: string) {
    setText(value);
    if (!editing) useDrafts.getState().set(slot, value);
  }

  function swapDraft() {
    const back = parkedMarkup ?? "";
    useDrafts.getState().park(slot, text);
    change(back);
    input.current?.focus();
  }

  function typeText(value: string) {
    const swapped = emojifyTyped(text, value);
    if (!swapped) return change(value);
    change(swapped.text);
    setForced({ start: swapped.caret, end: swapped.caret });
  }

  function wrap(type: EntityType, value?: string) {
    const model = parseRaw(text);
    const before = markupMap(model.text, model.entities).at;
    const start = plainAt(before, selection.current.start);
    const end = plainAt(before, selection.current.end);
    if (end <= start) return false;
    const after = markupMap(model.text, toggleFormat(model.entities, start, end, type, value));
    change(after.markup);
    setForced({ start: after.at[start]!, end: after.at[end]! });
    setPanel(null);
    return true;
  }

  const query = parseCommand(text) && silentMessage(text) === null ? null : emojiQuery(text, caret);
  const typed = query?.query;
  const suggestions = useMemo(() => (typed ? suggestEmoji(allEmoji, typed) : []), [typed]);

  const mentioning = chat?.group ? mentionQuery(text, caret) : null;
  const mentionable = mentioning ? mentionOptions(chat!, meId ?? "", mentioning.query) : [];

  function pickMention(option: MentionOption) {
    if (!mentioning) return;
    const mention = `${option.insert} `;
    const at = mentioning.start + mention.length;
    change(text.slice(0, mentioning.start) + mention + text.slice(caret));
    setForced({ start: at, end: at });
    setCaret(at);
  }

  function pickSuggestion(emoji: string) {
    if (!query) return;
    const at = query.start + emoji.length;
    change(text.slice(0, query.start) + emoji + text.slice(caret));
    setForced({ start: at, end: at });
    setCaret(at);
  }

  const silent = editing ? null : silentMessage(text);
  const commanding = silent === null && parseCommand(text) !== null;
  const parsed = parseMarkup(emojifyEnd(silent ?? text));
  const captionOnly = !!editing && (!!editing.attachment || (mode?.kind === "edit" && !!mode.photo));
  const canSubmit = (parsed.text.length > 0 || captionOnly) && realtime !== null && !saving;

  function cancel() {
    setError(null);
    setMode(slot, undefined);
  }

  function runCommand(name: MenuCommand) {
    change("");
    if (name === "game") setStartingGame(true);
    else setScheduling("next");
  }

  /** Puts an emoji where the caret is, replacing any selection, and leaves the caret after it. */
  function insertEmoji(e: string) {
    const { start, end } = selection.current;
    const value = text.slice(0, start) + e + text.slice(end);
    change(value);
    setForced({ start: start + e.length, end: start + e.length });
    setCaret(start + e.length);
  }

  function completeCommand(value: string) {
    change(value);
    setForced({ start: value.length, end: value.length });
    setCaret(value.length);
  }

  /** Sends a GIPHY or KLIPY sticker as a sticker image, like one from the keyboard; the command stays if it can't be fetched. */
  async function sendFoundSticker(found: GifDTO) {
    const saved = await File.downloadFileAsync(
      found.previewUrl,
      new File(Paths.cache, `sticker-${Date.now()}.webp`),
    ).catch(() => null);
    if (!saved) return;
    send({
      uri: saved.uri,
      kind: "image",
      name: `${(found.title || "sticker").slice(0, 100)}.webp`,
      mime: "image/webp",
      size: saved.size,
      width: found.width,
      height: found.height,
      sticker: true,
    });
    reset();
  }

  function sendGif(pick: { gif: GifDTO } | { sticker: StickerDTO }) {
    if (!realtime) return;
    realtime.setTyping(chatId, false);
    queue({
      text: "",
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      ephemeral,
      ...pick,
    });
    reset();
  }

  function reset() {
    useDrafts.getState().set(slot, "");
    setText("");
    setEphemeral(null);
    if (mode) cancel();
    onSent();
  }

  function schedule(when: Date) {
    setScheduling(null);
    if (scheduling === "now") send(undefined, ephemeral, when);
    else setSendAt(when);
  }

  async function submit() {
    if (!canSubmit || commands.current?.submit()) return;
    if (editing) {
      const photo = mode?.kind === "edit" ? mode.photo : undefined;
      const changed =
        !!photo || parsed.text !== editing.text || JSON.stringify(parsed.entities) !== JSON.stringify(editing.entities);
      if (changed) {
        setSaving(true);
        setError(null);
        try {
          await editMessage(qc, editing, parsed.text, parsed.entities, photo);
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

  function send(file?: LocalFile, chosen: EphemeralInput | null = ephemeral, at?: Date, spoiler = false) {
    if (!realtime) return;
    realtime.setTyping(chatId, false);
    queue({
      sendAt: at,
      text: file ? "" : parsed.text,
      entities: file ? [] : parsed.entities,
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      ephemeral: chosen,
      spoiler,
      file,
      silent: silent !== null,
    });
    if (file) {
      setEphemeral(null);
      if (mode) cancel();
      onSent();
    } else reset();
  }

  function sendPicked(items: PickedFile[], caption: string, chosen: EphemeralInput | null) {
    setPicked(null);
    if (!realtime) return;
    const { text: captionText, entities } = parseMarkup(emojifyEnd(caption));
    realtime.setTyping(chatId, false);
    const albums = chosen ? [] : albumIds(items.map((it) => it.file.kind), randomUUID);
    items.forEach(({ file, spoiler: hidden }, i) => {
      const first = i === 0;
      queue({
        groupId: albums[i],
        text: first ? captionText : "",
        entities: first ? entities : [],
        replyTo: first && mode?.kind === "reply" ? mode.message : undefined,
        spoiler: hidden && (file.kind === "image" || file.kind === "video"),
        ephemeral: chosen,
        file,
      });
    });
    reset();
  }

  function sendSpecial(extra: Pick<Draft, "location" | "checklist" | "poll" | "pollVisible" | "game" | "ephemeral">) {
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

  async function pick(source: () => Promise<LocalFile[]>) {
    setError(null);
    try {
      const files = await source();
      if (files.length) setPicked(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.composer.couldNotOpen);
    }
  }

  /** Resolves true once the voice message is recording, false when the microphone was refused. */
  async function startRecording() {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError(tr.composer.micDenied);
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    voiceOn.current = true;
    setRecording(true);
    return true;
  }

  /** Stops the voice message and returns it, or null when it was too short to keep. */
  async function stopRecording(): Promise<LocalFile | null> {
    voiceOn.current = false;
    const durationMs = recState.durationMillis;
    await recorder.stop();
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false }).catch(() => null);
    const uri = recorder.uri;
    if (!uri || durationMs < 500) return null;
    const size = (await (await fetch(uri)).blob()).size;
    return {
      uri,
      kind: "voice",
      name: `voice-${new Date().toISOString().slice(0, 19)}.m4a`,
      mime: "audio/mp4",
      size,
      durationMs,
    };
  }

  function startCapture(kind: RecordMode = recMode) {
    setError(null);
    setNoteMs(0);
    if (kind === "video") Keyboard.dismiss();
    else {
      void startRecording().then((ok) => {
        if (!ok) setCapture(null);
        else if (!captureNow.current) void stopRecording();
      });
    }
    setCapture({ kind });
  }

  async function finishCapture() {
    const c = captureNow.current;
    if (!c) return;
    const clip = c.kind === "video" ? note.current?.stop() : null;
    setCapture(null);
    const file = c.kind === "voice" ? voiceOn.current && (await stopRecording()) : await clip;
    if (!file) return;
    const out = c.muted ? await muteVideo(file).catch(() => null) : file;
    if (out) return send(out, ephemeral, undefined, !!c.spoiler);
    setError(tr.composer.couldNotMute);
    setPreview({ kind: c.kind, file, spoiler: c.spoiler });
  }

  async function previewCapture() {
    const c = captureNow.current;
    if (!c) return;
    const file = c.kind === "voice" ? voiceOn.current && (await stopRecording()) : await note.current?.stop();
    setCapture(null);
    if (!file) return;
    const muted = c.muted ? await muteVideo(file).catch(() => null) : null;
    if (c.muted && !muted) setError(tr.composer.couldNotMute);
    setPreview({ kind: c.kind, file, muted: muted ?? undefined, spoiler: c.spoiler });
  }

  function cancelCapture() {
    const c = captureNow.current;
    setCapture(null);
    if (c?.kind === "video") note.current?.cancel();
    else if (voiceOn.current) void stopRecording();
  }

  async function toggleNoteMute() {
    const p = preview;
    if (!p) return;
    setError(null);
    const muted = p.muted ? undefined : await muteVideo(p.file).catch(() => null);
    if (muted === null) return setError(tr.composer.couldNotMute);
    setPreview((cur) => (cur?.file === p.file ? { ...cur, muted } : cur));
  }

  function closePreview(keep: boolean) {
    if (preview && keep) send(preview.muted ?? preview.file, ephemeral, undefined, preview.spoiler);
    setPreview(null);
  }

  const showMic = !limited && ((!editing && parsed.text.length === 0) || !!capture || !!preview);

  return (
    <>
      {capture?.kind === "video" && (
        <VideoNoteCapture
          ref={note}
          bottom={barHeight}
          onTick={setNoteMs}
          onLimit={() => void finishCapture()}
          onStop={() => void previewCapture()}
          muted={!!capture.muted}
          spoiler={!!capture.spoiler}
          onToggleMute={() => setCapture((c) => c && { ...c, muted: !c.muted })}
          onToggleSpoiler={() => setCapture((c) => c && { ...c, spoiler: !c.spoiler })}
        />
      )}
      {preview?.kind === "video" && (
        <VideoNotePreview
          uri={preview.file.uri}
          bottom={barHeight}
          muted={!!preview.muted}
          spoiler={!!preview.spoiler}
          onToggleMute={() => void toggleNoteMute()}
          onToggleSpoiler={() => setPreview({ ...preview, spoiler: !preview.spoiler })}
        />
      )}
      <View
        onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        style={[
          styles.bar,
          { backgroundColor: t.bar, borderColor: t.border, paddingBottom: Math.max(insets.bottom, 8) },
        ]}
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
            photo={mode?.kind === "edit" ? mode.photo : undefined}
            onCancel={cancel}
          />
        )}
        {parked && !editing && (
          <Pressable onPress={swapDraft} style={[styles.modeBar, { borderLeftColor: t.muted, paddingRight: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700" }}>{tr.composer.parkedDraft}</Text>
              <Text numberOfLines={1} style={{ color: t.textSoft, fontSize: 14 }}>
                <DraftText markup={parkedMarkup!} codeBg={t.dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)"} />
              </Text>
            </View>
            <NotebookPen size={16} color={t.muted} />
          </Pressable>
        )}
        {chat?.vanish && !editing && (
          <View style={styles.ephemeralBar}>
            <Ghost size={16} color={accent.bg} />
            <Text style={{ flex: 1, color: accent.bg, fontSize: 14 }}>{tr.composer.vanishBanner}</Text>
            <Pressable
              onPress={() => void updateChatSettings(qc, chatId, { vanish: false }).catch(() => null)}
              accessibilityLabel={tr.composer.turnOffVanish}
              hitSlop={8}
              style={styles.round32}
            >
              <X size={16} color={accent.bg} />
            </Pressable>
          </View>
        )}
        {ephemeral && !editing && (
          <View style={styles.ephemeralBar}>
            <Flame size={16} color={flame} fill={flame} />
            <Text style={{ flex: 1, color: flame, fontSize: 14 }}>
              {tr.composer.selfDestructRule(
                shortRule({ maxViews: ephemeral.maxViews ?? null, ttlSeconds: ephemeral.ttlSeconds ?? null }, tr),
              )}
            </Text>
            <Pressable onPress={() => setEphemeral(null)} accessibilityLabel={tr.composer.turnOffSelfDestruct} hitSlop={8} style={styles.round32}>
              <X size={16} color={flame} />
            </Pressable>
          </View>
        )}
        {sendAt && !editing && (
          <View style={styles.ephemeralBar}>
            <CalendarClock size={16} color={accent.bg} />
            <Text style={{ flex: 1, color: accent.bg, fontSize: 14 }}>
              {tr.composer.scheduledFor(sendAtLabel(sendAt.toISOString()))}
            </Text>
            <Pressable onPress={() => setSendAt(null)} accessibilityLabel={tr.composer.dontSchedule} hitSlop={8} style={styles.round32}>
              <X size={16} color={accent.bg} />
            </Pressable>
          </View>
        )}
        {error && <Text style={{ color: t.danger, fontSize: 14, paddingHorizontal: 4 }}>{error}</Text>}

        {!editing && !limited && <CommandBar
            ref={commands}
            chatId={chatId}
            text={text}
            onComplete={completeCommand}
            onGif={(gif) => sendGif({ gif })}
            onSticker={(found) => void sendFoundSticker(found)}
            onPackSticker={(sticker) => sendGif({ sticker })}
            onMenu={runCommand}
            onLocation={() => {
              change("");
              void sendLocation();
            }}
          />}

        {suggestions.length > 0 && (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={tr.composer.emojiSuggestions}
            contentContainerStyle={styles.toolbar}
          >
            {suggestions.map((x) => (
              <Pressable
                key={x.e}
                onPress={() => pickSuggestion(x.e)}
                accessibilityLabel={x.n}
                style={[styles.format, { backgroundColor: t.surface, borderColor: t.border }]}
              >
                <Text style={styles.suggestion}>{x.e}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {mentionable.length > 0 && (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={tr.composer.mentionSuggestions}
            contentContainerStyle={styles.toolbar}
          >
            {mentionable.map((m) => {
              const label = m.member ? m.member.user.displayName : m.group === "everyone" ? tr.composer.mentionEveryone : tr.composer.mentionAdmins;
              return (
                <Pressable
                  key={m.insert}
                  onPress={() => pickMention(m)}
                  accessibilityLabel={label}
                  style={[styles.mention, { backgroundColor: t.surface, borderColor: t.border }]}
                >
                  {m.member ? (
                    <Avatar user={m.member.user} size="sm" />
                  ) : (
                    <View style={[styles.mentionGroup, { backgroundColor: t.surfaceAlt }]}>
                      {m.group === "everyone" ? <Users size={18} color={t.text} /> : <ShieldCheck size={18} color={t.text} />}
                    </View>
                  )}
                  <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: "600", maxWidth: 140 }}>
                    {m.member ? label : m.insert}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {hasSelection && (panel === "color" || panel === "highlight" || panel === "outline") && (
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.glass, { backgroundColor: t.surface, borderColor: t.border }]}>
            {(Object.keys(TEXT_COLORS) as TextColor[]).map((c) => (
              <Pressable key={c} onPress={() => wrap(paint, c)} accessibilityLabel={tr.composer.textColors[c]} style={styles.glassItem}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: TEXT_COLORS[c], borderWidth: 1, borderColor: "rgba(120,113,108,0.6)" }} />
              </Pressable>
            ))}
            <View style={{ width: StyleSheet.hairlineWidth, height: 22, marginHorizontal: 4, backgroundColor: t.border }} />
            {(Object.keys(TEXT_GRADIENTS) as TextGradient[]).map((g) => (
              <Pressable key={g} onPress={() => wrap(paint, g)} accessibilityLabel={tr.composer.textGradients[g]} style={styles.glassItem}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundImage: `linear-gradient(135deg, ${TEXT_GRADIENTS[g][0]}, ${TEXT_GRADIENTS[g][1]})` }} />
              </Pressable>
            ))}
            <Pressable onPress={() => setPanel("custom")} accessibilityLabel={tr.composer.customColor} style={styles.glassItem}>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundImage: "linear-gradient(135deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f)" }}>
                <Plus size={14} color="#fff" strokeWidth={3} />
              </View>
            </Pressable>
          </ScrollView>
        )}
        {hasSelection && panel === "custom" && (
          <View style={[styles.glass, { flexDirection: "column", alignItems: "stretch", gap: 10, padding: 12, backgroundColor: t.surface, borderColor: t.border }]}>
            <ColorPicker key={stop ?? 0} onChange={(hex) => setStops((s) => (stop === 1 ? [s[0], hex] : [hex, s[1]]))} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {(stop === null ? [0] : [0, 1]).map((i) => (
                <Pressable
                  key={i}
                  onPress={() => stop !== null && setStop(i as 0 | 1)}
                  accessibilityLabel={`${tr.composer.customColor} ${i + 1}`}
                  style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: stops[i], borderWidth: 2, borderColor: (stop ?? 0) === i ? accent.bg : "transparent" }}
                />
              ))}
              <Pressable
                onPress={() => setStop(stop === null ? 1 : null)}
                accessibilityState={{ checked: stop !== null }}
                style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: stop !== null ? accent.bg : t.field }}
              >
                <Text style={{ color: stop !== null ? accent.ink : t.text, fontSize: 13, fontWeight: "600" }}>{tr.composer.gradient}</Text>
              </Pressable>
              <Pressable
                onPress={() => wrap(paint, stop !== null ? `${stops[0]}-${stops[1]}` : stops[0])}
                style={{
                  marginLeft: "auto",
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  backgroundColor: stops[0],
                  ...(stop !== null && { backgroundImage: `linear-gradient(135deg, ${stops[0]}, ${stops[1]})` }),
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>{tr.composer.apply}</Text>
              </Pressable>
            </View>
          </View>
        )}
        {hasSelection && panel === "size" && (
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.glass, { backgroundColor: t.surface, borderColor: t.border }]}>
            {MESSAGE_TEXT_SIZES.map((n) => (
              <Pressable key={n} onPress={() => wrap("size", String(n))} accessibilityLabel={`${tr.composer.formats.size} ${n} px`} style={[styles.glassItem, { minWidth: 50 }]}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                  {n}
                  <Text style={{ fontSize: 10, fontWeight: "500", color: t.muted }}>px</Text>
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {hasSelection && panel === "font" && (
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.glass, { backgroundColor: t.surface, borderColor: t.border }]}>
            {TEXT_FONTS.map((f) => (
              <Pressable key={f} onPress={() => wrap("font", f)} style={[styles.glassItem, { paddingHorizontal: 12 }]}>
                <Text style={{ color: t.text, fontSize: 16, fontFamily: LABEL_FONTS[f] }}>{tr.composer.fonts[f]}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {hasSelection && (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            accessibilityRole="toolbar"
            accessibilityLabel={tr.composer.formatting}
            style={styles.clearOfSelectionMenu}
            contentContainerStyle={[styles.glass, { backgroundColor: t.surface, borderColor: t.border }]}
          >
            {formats.map(({ type, Icon }) => (
              <Pressable key={type} onPress={() => wrap(type)} accessibilityLabel={tr.composer.formats[type]} style={styles.glassItem}>
                <Icon size={18} color={t.textSoft} />
              </Pressable>
            ))}
            <View style={{ width: StyleSheet.hairlineWidth, height: 22, marginHorizontal: 4, backgroundColor: t.border }} />
            {(["color", "highlight", "outline", "font", "size"] as const).map((p) => {
              const on = panel === p || (panel === "custom" && p === paint);
              const Icon = { color: Palette, highlight: Highlighter, outline: TypeOutline, font: Type, size: ALargeSmall }[p];
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    if (p === "color" || p === "highlight" || p === "outline") setPaint(p);
                    setPanel(on ? null : p);
                  }}
                  accessibilityLabel={tr.composer.formats[p]}
                  accessibilityState={{ expanded: on }}
                  style={[styles.glassItem, on && { backgroundColor: "rgba(235,138,0,0.18)" }]}
                >
                  <Icon size={18} color={t.textSoft} />
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.row}>
          {capture || preview ? (
            <Pressable
              onPress={preview ? () => closePreview(false) : cancelCapture}
              accessibilityLabel={tr.composer.discardRecording}
              style={styles.round40}
            >
              <Trash2 size={20} color={t.danger} />
            </Pressable>
          ) : limited ? (
            !editing && (
              <>
                <Pressable
                  onPress={() => void pick(() => pickMedia(["images"]))}
                  accessibilityLabel={tr.ask.addPhoto}
                  style={styles.round40}
                >
                  <ImagePlus size={22} color={t.muted} />
                </Pressable>
                {admin && (
                  <Pressable onPress={() => void sendInvite()} accessibilityLabel={tr.support.sendInvite} style={styles.round40}>
                    <TicketPlus size={22} color={t.muted} />
                  </Pressable>
                )}
              </>
            )
          ) : !editing && (
            <Pressable onPress={() => setAttachMenu(true)} accessibilityLabel={tr.composer.attach} style={styles.round40}>
              <Paperclip size={22} color={t.muted} />
            </Pressable>
          )}
          {!capture && !preview && !editing && scheduledCount > 0 && (
            <Pressable
              onPress={() => setShowScheduled(true)}
              accessibilityLabel={tr.composer.scheduledCount(scheduledCount)}
              style={styles.round40}
            >
              <CalendarClock size={22} color={accent.bg} />
            </Pressable>
          )}
          <View
            style={[
              styles.field,
              { backgroundColor: t.surface, borderColor: t.border },
              focused && { borderColor: accent.bg },
              chat?.vanish && [styles.vanishField, { borderColor: accent.bg }],
              (capture || preview) && styles.gone,
              tall && styles.tallField,
            ]}
          >
            <RichTextInput
              ref={input}
              value={text}
              onChangeText={typeText}
              selection={forced}
              codeBg={t.dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)"}
              onSelectionChange={(sel) => {
                selection.current = sel;
                setCaret(sel.end);
                setHasSelection(sel.end > sel.start);
                if (forced) setForced(undefined);
              }}
              multiline
              onFocus={() => {
                setFocused(true);
                setExpressions(false);
              }}
              onBlur={() => setFocused(false)}
              cursorColor={accent.bg}
              selectionColor={accent.bg}
              maxLength={4000}
              placeholder={tr.common.message}
              placeholderTextColor={t.muted}
              accessibilityLabel={tr.common.message}
              onLayout={(e) => e.nativeEvent.layout.height > 44 && setTall(true)}
              style={[styles.input, { color: t.text }, tall && styles.tallInput]}
            />
            {!editing && !parked && !!text.trim() && !commanding && (
              <Pressable onPress={swapDraft} accessibilityLabel={tr.composer.parkDraft} style={styles.round40}>
                <NotebookPen size={20} color={t.faint} />
              </Pressable>
            )}
            {!editing && !limited && (
              <Pressable
                onPress={() => {
                  if (expressions) {
                    setExpressions(false);
                    input.current?.focus();
                  } else {
                    Keyboard.dismiss();
                    setExpressions(true);
                  }
                }}
                accessibilityLabel={tr.composer.expressions}
                accessibilityState={{ expanded: expressions }}
                style={styles.round40}
              >
                <Smile size={22} color={expressions ? accent.bg : t.faint} />
              </Pressable>
            )}
            {!editing && !threadId && chat?.group && chat.group.myRole !== "member" && (
              <CommentsPicker value={comments} onChange={setComments} />
            )}
            {!editing && !limited && <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />}
          </View>
          {capture && (
            <View style={[styles.field, styles.recordingField, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={styles.redDot} />
              <Text style={{ color: t.text, fontFamily: "monospace" }}>
                {formatDuration(capture.kind === "voice" ? recState.durationMillis : noteMs)}
              </Text>
              <Text style={{ color: t.muted, fontSize: 14, flex: 1 }}>{tr.composer.recording}</Text>
              {capture.kind === "voice" && (
                <Pressable
                  onPress={() => void previewCapture()}
                  accessibilityLabel={tr.composer.stopRecording}
                  hitSlop={6}
                  style={styles.round32}
                >
                  <Square size={16} color={t.danger} fill={t.danger} />
                </Pressable>
              )}
              <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
            </View>
          )}
          {preview && (
            <View style={[styles.field, styles.recordingField, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={{ flex: 1 }}>
                {preview.kind === "voice" ? (
                  <VoicePlayer
                    url={preview.file.uri}
                    durationMs={preview.file.durationMs ?? null}
                    waveform={null}
                    mine={false}
                    label={tr.composer.playPreview}
                    compact
                  />
                ) : (
                  <Text numberOfLines={1} style={{ color: t.text, fontSize: 14 }}>
                    {tr.summary.kinds.video_note} · {formatDuration(preview.file.durationMs ?? 0)}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => {
                  const kind = preview.kind;
                  closePreview(false);
                  startCapture(kind);
                }}
                accessibilityLabel={tr.composer.recordAgain}
                hitSlop={6}
                style={{ padding: 4 }}
              >
                <RotateCcw size={20} color={t.muted} />
              </Pressable>
              <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
            </View>
          )}
          {showMic ? (
            <RecordButton
              mode={preview?.kind ?? recMode}
              active={!!(capture || preview)}
              disabled={!realtime}
              onToggle={() => setRecMode((m) => (m === "voice" ? "video" : "voice"))}
              onStart={() => startCapture()}
              onSend={() => (preview ? closePreview(true) : void finishCapture())}
            />
          ) : (
            <Pressable
              onPress={() => void submit()}
              onLongPress={editing ? undefined : () => canSubmit && setScheduling("now")}
              accessibilityHint={editing ? undefined : tr.composer.holdToSchedule}
              disabled={!canSubmit}
              accessibilityLabel={editing ? tr.common.save : tr.common.send}
              style={[styles.round40, { backgroundColor: accent.bg, opacity: canSubmit ? 1 : 0.4 }]}
            >
              {editing ? (
                <Check size={20} strokeWidth={2.6} color={accent.ink} />
              ) : (
                <SendHorizontal size={20} color={accent.ink} />
              )}
            </Pressable>
          )}
        </View>
        {expressions && !editing && !limited && (
          <ExpressionPanel
            onEmoji={insertEmoji}
            onSticker={(sticker) => sendGif({ sticker })}
            onFoundSticker={(found) => void sendFoundSticker(found)}
            onGif={(gif) => sendGif({ gif })}
          />
        )}
      </View>

      {attachMenu && (
        <Sheet
          bar
          onClose={() => setAttachMenu(false)}
          actions={[
            { label: tr.composer.photoOrVideo, icon: ImageIcon, onSelect: () => void pick(pickMedia) },
            { label: tr.composer.camera, icon: Camera, onSelect: () => void pick(takePhoto) },
            { label: tr.summary.kinds.file, icon: FileText, onSelect: () => void pick(pickFiles) },
            { label: tr.composer.audio, icon: Music, onSelect: () => void pick(() => pickFiles("audio/*")) },
            { label: tr.composer.location, icon: MapPin, onSelect: () => setAskLocation(true) },
            { label: tr.composer.checklist, icon: ListChecks, onSelect: () => setWritingChecklist(true) },
            ...(chat?.group ? [{ label: tr.composer.poll, icon: ChartBar, onSelect: () => setWritingPoll(true) }] : []),
            { label: tr.composer.game, icon: Gamepad2, onSelect: () => setStartingGame(true) },
            { label: tr.composer.scheduleMessage, icon: CalendarClock, onSelect: () => setScheduling("next") },
            ...attachCommands(!!chat?.group).map((name) => ({
              label: `/${name}`,
              icon: COMMAND_ICONS[name],
              onSelect: () => {
                completeCommand(`/${name} `);
                setTimeout(() => input.current?.focus(), 50);
              },
            })),
          ]}
        />
      )}
      {askLocation && (
        <LocationPicker
          initialEphemeral={ephemeral}
          onClose={() => setAskLocation(false)}
          onSend={(location, chosen) => {
            setAskLocation(false);
            sendSpecial({ location, ephemeral: chosen });
            setEphemeral(null);
          }}
        />
      )}
      {writingPoll && <NewPoll onClose={() => setWritingPoll(false)} onSend={(poll, pollVisible) => sendSpecial({ poll, pollVisible })} />}
      {writingChecklist && (
        <NewChecklist onClose={() => setWritingChecklist(false)} onSend={(checklist) => sendSpecial({ checklist })} />
      )}
      {startingGame && <NewGame onClose={() => setStartingGame(false)} onSend={(game) => sendSpecial({ game })} />}
      {scheduling && (
        <ScheduleDialog
          title={tr.composer.scheduleMessage}
          initial={sendAt ?? undefined}
          onClose={() => setScheduling(null)}
          onPick={schedule}
        />
      )}
      {showScheduled && <ScheduledPanel chatId={chatId} onClose={() => setShowScheduled(false)} />}
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

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingTop: 8, gap: 8 },
  modeBar: { flexDirection: "row", alignItems: "center", gap: 12, borderLeftWidth: 4, paddingLeft: 12 },
  ephemeralBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  toolbar: { flexDirection: "row", gap: 6 },
  glass: { flexDirection: "row", alignItems: "center", gap: 2, padding: 4, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  glassItem: { minWidth: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  clearOfSelectionMenu: { marginBottom: 80 },
  suggestion: { fontSize: 22 },
  mentionGroup: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  mention: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 2,
    paddingRight: 12,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  format: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recordingField: { alignItems: "center", gap: 8, paddingHorizontal: 16 },
  vanishField: { borderWidth: 1.5, borderStyle: "dashed" },
  gone: { display: "none" },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" },
  input: { flex: 1, fontSize: 16, lineHeight: 22, maxHeight: 160, paddingTop: 9, paddingBottom: 9, paddingLeft: 16 },
  tallField: { flexWrap: "wrap", justifyContent: "flex-end" },
  tallInput: { flexBasis: "100%", paddingRight: 16 },
  round40: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  round32: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
