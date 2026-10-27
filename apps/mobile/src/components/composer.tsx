import {
  type EmojiEntry,
  type EntityType,
  type EphemeralInput,
  type GifDTO,
  type TypingKind,
  emojiQuery,
  emojifyEnd,
  emojifyTyped,
  maskSpoilers,
  parseCommand,
  suggestEmoji,
} from "@six/shared";
import emojis from "@six/shared/emojis.json";
import { useQueryClient } from "@tanstack/react-query";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
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
} from "lucide-react-native";
import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { File, Paths } from "expo-file-system";
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, findNodeHandle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { editMessage, scheduleMessage } from "@/lib/actions";
import { useComposerMode } from "@/lib/composer";
import { useDrafts } from "@/lib/drafts";
import { shortRule } from "@/lib/ephemeral";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { MARKERS, parseMarkup, toMarkup } from "@/lib/markup";
import { pickFiles, pickMedia, receivedImage, takePhoto } from "@/lib/media";
import { useRealtime } from "@/lib/realtime";
import { type Draft, type LocalFile, queueMessage } from "@/lib/send";
import { useSession } from "@/lib/session";
import { brand, brandInk, flame, stone, useTheme } from "@/lib/theme";
import { AttachDialog, type PickedFile } from "./attach-dialog";
import { NewChecklist } from "./checklist";
import { currentPosition } from "./location-card";
import { CommandBar, type CommandBarHandle } from "./command-bar";
import { EphemeralPicker } from "./ephemeral-picker";
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
  { type: "strike", Icon: Strikethrough },
  { type: "code", Icon: Code },
  { type: "spoiler", Icon: EyeOff },
];

interface Range {
  start: number;
  end: number;
}

function ModeBar({ label, text, onCancel }: { label: string; text: string; onCancel: () => void }) {
  const t = useTheme();
  const tr = useT();
  return (
    <View style={styles.modeBar}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: brand, fontSize: 12, fontWeight: "700" }}>{label}</Text>
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
  const t = useTheme();
  const tr = useT();
  const meId = useSession((s) => s.user?.id);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const mode = useComposerMode((s) => s.byChat[chatId]);
  const setMode = useComposerMode((s) => s.set);
  const [text, setText] = useState(() => useDrafts.getState().byChat[chatId] ?? "");
  const draftsReady = useDrafts((s) => s.ready);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spoiler, setSpoiler] = useState(false);
  const selection = useRef<Range>({ start: 0, end: 0 });
  const [forced, setForced] = useState<Range | undefined>(undefined);
  const [hasSelection, setHasSelection] = useState(false);
  const [caret, setCaret] = useState(0);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const commands = useRef<CommandBarHandle>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [askLocation, setAskLocation] = useState(false);
  const [writingChecklist, setWritingChecklist] = useState(false);
  const [recMode, setRecMode] = useState<RecordMode>("voice");
  const [capture, setCapture] = useState<{ kind: RecordMode; locked: boolean } | null>(null);
  const captureNow = useRef(capture);
  captureNow.current = capture;
  const [slide, setSlide] = useState(0);
  const [noteMs, setNoteMs] = useState(0);
  const [barHeight, setBarHeight] = useState(0);
  const note = useRef<VideoNoteHandle>(null);
  const voiceOn = useRef(false);
  const [preview, setPreview] = useState<{ kind: RecordMode; file: LocalFile } | null>(null);
  const [picked, setPicked] = useState<LocalFile[] | null>(null);
  const closePicker = useCallback(() => setPicked(null), []);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 200);
  const [recording, setRecording] = useState(false);
  const [ephemeral, setEphemeral] = useState<EphemeralInput | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);

  const editing = mode?.kind === "edit" ? mode.message : null;

  useEffect(() => {
    setText(editing ? toMarkup(editing.text ?? "", editing.entities) : (useDrafts.getState().byChat[chatId] ?? ""));
  }, [editing, chatId, draftsReady]);

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
    if (!editing) useDrafts.getState().set(chatId, value);
  }

  function typeText(value: string) {
    const swapped = emojifyTyped(text, value);
    if (!swapped) return change(value);
    change(swapped.text);
    setForced({ start: swapped.caret, end: swapped.caret });
  }

  function wrap(type: EntityType) {
    const { start, end } = selection.current;
    if (end <= start) return false;
    const marker = MARKERS[type];
    change(`${text.slice(0, start)}${marker}${text.slice(start, end)}${marker}${text.slice(end)}`);
    setForced({ start: start + marker.length, end: end + marker.length });
    return true;
  }

  const query = parseCommand(text) ? null : emojiQuery(text, caret);
  const suggestions = useMemo(() => (query ? suggestEmoji(allEmoji, query.query) : []), [query?.query]);

  function pickSuggestion(emoji: string) {
    if (!query) return;
    const at = query.start + emoji.length;
    change(text.slice(0, query.start) + emoji + text.slice(caret));
    setForced({ start: at, end: at });
    setCaret(at);
  }

  function spoilerButton() {
    if (!wrap("spoiler") && !editing) setSpoiler((v) => !v);
  }

  const parsed = parseMarkup(emojifyEnd(text));
  const canSubmit = parsed.text.length > 0 && realtime !== null && !saving;

  function cancel() {
    setError(null);
    setMode(chatId, undefined);
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

  function sendGif(gif: GifDTO) {
    if (!realtime) return;
    realtime.setTyping(chatId, false);
    queueMessage(qc, realtime, chatId, {
      text: "",
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      ephemeral,
      gif,
    });
    reset();
  }

  function reset() {
    useDrafts.getState().set(chatId, "");
    setText("");
    setSpoiler(false);
    setEphemeral(null);
    if (mode) cancel();
    onSent();
  }

  async function schedule(when: Date) {
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
        when,
      );
    } catch {
      setError(tr.composer.couldNotSchedule);
      return;
    }
    realtime?.setTyping(chatId, false);
    setSpoiler(false);
    setEphemeral(null);
    useDrafts.getState().set(chatId, "");
    setText("");
    if (mode) cancel();
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

  function send(file?: LocalFile, chosen: EphemeralInput | null = ephemeral) {
    if (!realtime) return;
    realtime.setTyping(chatId, false);
    queueMessage(qc, realtime, chatId, {
      text: file ? "" : parsed.text,
      entities: file ? [] : parsed.entities,
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
      spoiler: file ? false : spoiler,
      ephemeral: chosen,
      file,
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
    items.forEach(({ file, spoiler: hidden }, i) => {
      const first = i === 0;
      queueMessage(qc, realtime, chatId, {
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

  function sendSpecial(extra: Pick<Draft, "location" | "checklist">) {
    if (!realtime) return;
    queueMessage(qc, realtime, chatId, {
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

  function startCapture(locked: boolean) {
    setError(null);
    setSlide(0);
    setNoteMs(0);
    if (recMode === "video") Keyboard.dismiss();
    else {
      void startRecording().then((ok) => {
        if (!ok) setCapture(null);
        else if (!captureNow.current) void stopRecording();
      });
    }
    setCapture({ kind: recMode, locked });
  }

  async function finishCapture() {
    const c = captureNow.current;
    if (!c) return;
    const clip = c.kind === "video" ? note.current?.stop() : null;
    setCapture(null);
    const file = c.kind === "voice" ? voiceOn.current && (await stopRecording()) : await clip;
    if (file) send(file);
  }

  async function previewCapture() {
    const c = captureNow.current;
    if (!c) return;
    const file = c.kind === "voice" ? voiceOn.current && (await stopRecording()) : await note.current?.stop();
    setCapture(null);
    if (file) setPreview({ kind: c.kind, file });
  }

  function cancelCapture() {
    const c = captureNow.current;
    setCapture(null);
    if (c?.kind === "video") note.current?.cancel();
    else if (voiceOn.current) void stopRecording();
  }

  function closePreview(keep: boolean) {
    if (preview && keep) send(preview.file);
    setPreview(null);
  }

  const showMic = (!editing && parsed.text.length === 0) || !!capture || !!preview;

  return (
    <>
      {capture?.kind === "video" && (
        <VideoNoteCapture
          ref={note}
          bottom={barHeight}
          onTick={setNoteMs}
          onLimit={() => void finishCapture()}
          onStop={() => void previewCapture()}
        />
      )}
      {preview?.kind === "video" && <VideoNotePreview uri={preview.file.uri} bottom={barHeight} />}
      <View
        onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        style={[
          styles.bar,
          { backgroundColor: t.bg, borderColor: t.border, paddingBottom: Math.max(insets.bottom, 8) },
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
          <ModeBar label={tr.composer.editingMessage} text={maskSpoilers(editing.text ?? "", editing.entities)} onCancel={cancel} />
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
        {error && <Text style={{ color: t.danger, fontSize: 14, paddingHorizontal: 4 }}>{error}</Text>}

        {!editing && <CommandBar
            ref={commands}
            text={text}
            onComplete={completeCommand}
            onGif={sendGif}
            onSticker={(found) => void sendFoundSticker(found)}
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

        {hasSelection && (
          <View style={styles.toolbar} accessibilityRole="toolbar">
            {formats.map(({ type, Icon }) => (
              <Pressable
                key={type}
                onPress={() => wrap(type)}
                accessibilityLabel={tr.composer.formats[type]}
                style={[styles.format, { backgroundColor: t.surface, borderColor: t.border }]}
              >
                <Icon size={16} color={t.textSoft} />
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.row}>
          {capture || preview ? (
            (capture?.locked || preview) && (
              <Pressable
                onPress={preview ? () => closePreview(false) : cancelCapture}
                accessibilityLabel={tr.composer.discardRecording}
                style={styles.round40}
              >
                <Trash2 size={20} color={t.danger} />
              </Pressable>
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
              <CalendarClock size={22} color={brand} />
            </Pressable>
          )}
          <View style={[styles.field, { backgroundColor: t.surface, borderColor: t.border }, (capture || preview) && styles.gone]}>
            <TextInput
              ref={input}
              value={text}
              onChangeText={typeText}
              selection={forced}
              onSelectionChange={(e) => {
                selection.current = e.nativeEvent.selection;
                setCaret(e.nativeEvent.selection.end);
                setHasSelection(e.nativeEvent.selection.end > e.nativeEvent.selection.start);
                if (forced) setForced(undefined);
              }}
              multiline
              maxLength={4000}
              placeholder={spoiler ? tr.composer.spoilerPlaceholder : tr.common.message}
              placeholderTextColor={t.muted}
              accessibilityLabel={tr.common.message}
              style={[styles.input, { color: t.text }]}
            />
            <Pressable
              onPress={spoilerButton}
              accessibilityLabel={spoiler && !editing ? tr.composer.sendAsNormal : tr.summary.spoiler}
              accessibilityState={{ selected: !editing && spoiler }}
              style={styles.round40}
            >
              <EyeOff size={20} color={spoiler && !editing ? brand : t.faint} />
            </Pressable>
            {!editing && <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />}
          </View>
          {capture && (
            <View style={[styles.field, styles.recordingField, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={styles.redDot} />
              <Text style={{ color: t.text, fontFamily: "monospace" }}>
                {formatDuration(capture.kind === "voice" ? recState.durationMillis : noteMs)}
              </Text>
              {capture.locked ? (
                <>
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
                </>
              ) : (
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    color: t.muted,
                    fontSize: 14,
                    textAlign: "right",
                    opacity: Math.max(0.2, 1 + slide / 110),
                    transform: [{ translateX: slide / 2 }],
                  }}
                >
                  ‹ {tr.composer.slideToCancel}
                </Text>
              )}
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
                  />
                ) : (
                  <Text numberOfLines={1} style={{ color: t.text, fontSize: 14 }}>
                    {tr.summary.kinds.video_note} · {formatDuration(preview.file.durationMs ?? 0)}
                  </Text>
                )}
              </View>
              <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
            </View>
          )}
          {showMic ? (
            <RecordButton
              mode={preview?.kind ?? recMode}
              state={preview ? "locked" : capture ? (capture.locked ? "locked" : "holding") : "idle"}
              disabled={!realtime}
              onToggle={() => setRecMode((m) => (m === "voice" ? "video" : "voice"))}
              onStart={startCapture}
              onLock={() => setCapture((c) => c && { ...c, locked: true })}
              onRelease={() => void finishCapture()}
              onCancel={cancelCapture}
              onSend={() => (preview ? closePreview(true) : void finishCapture())}
              onSlide={setSlide}
            />
          ) : (
            <Pressable
              onPress={() => void submit()}
              onLongPress={editing ? undefined : () => canSubmit && setScheduling(true)}
              accessibilityHint={editing ? undefined : tr.composer.holdToSchedule}
              disabled={!canSubmit}
              accessibilityLabel={editing ? tr.common.save : tr.common.send}
              style={[styles.round40, { backgroundColor: brand, opacity: canSubmit ? 1 : 0.4 }]}
            >
              {editing ? (
                <Check size={20} strokeWidth={2.6} color={brandInk} />
              ) : (
                <SendHorizontal size={20} color={brandInk} />
              )}
            </Pressable>
          )}
        </View>
      </View>

      {attachMenu && (
        <Sheet
          title={tr.common.send}
          onClose={() => setAttachMenu(false)}
          actions={[
            { label: tr.composer.photoOrVideo, onSelect: () => void pick(pickMedia) },
            { label: tr.composer.camera, onSelect: () => void pick(takePhoto) },
            { label: tr.summary.kinds.file, onSelect: () => void pick(pickFiles) },
            { label: tr.composer.audio, onSelect: () => void pick(() => pickFiles("audio/*")) },
            { label: tr.composer.location, onSelect: () => setAskLocation(true) },
            { label: tr.composer.checklist, onSelect: () => setWritingChecklist(true) },
          ]}
        />
      )}
      {askLocation && (
        <Sheet
          title={tr.composer.sendLocationTitle}
          onClose={() => setAskLocation(false)}
          actions={[{ label: tr.composer.sendLocation, onSelect: () => void sendLocation() }]}
        />
      )}
      {writingChecklist && (
        <NewChecklist onClose={() => setWritingChecklist(false)} onSend={(checklist) => sendSpecial({ checklist })} />
      )}
      {scheduling && (
        <ScheduleDialog title={tr.composer.scheduleMessage} onClose={() => setScheduling(false)} onPick={(when) => void schedule(when)} />
      )}
      {showScheduled && <ScheduledPanel chatId={chatId} onClose={() => setShowScheduled(false)} />}
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

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingTop: 8, gap: 8 },
  modeBar: { flexDirection: "row", alignItems: "center", gap: 12, borderLeftWidth: 4, borderLeftColor: brand, paddingLeft: 12 },
  ephemeralBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  toolbar: { flexDirection: "row", gap: 6 },
  suggestion: { fontSize: 22 },
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
  gone: { display: "none" },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" },
  input: { flex: 1, fontSize: 16, lineHeight: 22, maxHeight: 160, paddingTop: 9, paddingBottom: 9, paddingLeft: 16 },
  round40: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  round32: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
