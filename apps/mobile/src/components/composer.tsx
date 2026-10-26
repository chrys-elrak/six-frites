import { type EntityType, type EphemeralInput, emojifyEnd, emojifyTyped, maskSpoilers } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Haptics from "expo-haptics";
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
  Smile,
  Strikethrough,
  Trash2,
  X,
} from "lucide-react-native";
import { type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { editMessage, scheduleMessage } from "@/lib/actions";
import { useComposerMode } from "@/lib/composer";
import { shortRule } from "@/lib/ephemeral";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { MARKERS, parseMarkup, toMarkup } from "@/lib/markup";
import { pickFiles, pickMedia, takePhoto } from "@/lib/media";
import { useRealtime } from "@/lib/realtime";
import { type LocalFile, queueMessage } from "@/lib/send";
import { useSession } from "@/lib/session";
import { brand, brandInk, flame, stone, useTheme } from "@/lib/theme";
import { AttachDialog, type PickedFile } from "./attach-dialog";
import { EmojiPicker } from "./emoji-picker";
import { EphemeralPicker } from "./ephemeral-picker";
import { ScheduleDialog, ScheduledPanel } from "./scheduled";
import { Sheet } from "./sheet";
import { VideoNoteRecorder } from "./video-note-recorder";

const drafts = new Map<string, string>();

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
  const [text, setText] = useState(() => drafts.get(chatId) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spoiler, setSpoiler] = useState(false);
  const selection = useRef<Range>({ start: 0, end: 0 });
  const [forced, setForced] = useState<Range | undefined>(undefined);
  const [hasSelection, setHasSelection] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [noteRecorder, setNoteRecorder] = useState(false);
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
    setText(editing ? toMarkup(editing.text ?? "", editing.entities) : (drafts.get(chatId) ?? ""));
  }, [editing, chatId]);

  useEffect(() => {
    if (mode) input.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (!realtime || editing) return;
    realtime.setTyping(chatId, text.trim().length > 0);
  }, [realtime, chatId, text, editing]);

  useEffect(() => () => realtime?.setTyping(chatId, false), [realtime, chatId]);

  function change(value: string) {
    setText(value);
    if (!editing) drafts.set(chatId, value);
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

  function insert(value: string) {
    const { start, end } = selection.current;
    change(text.slice(0, start) + value + text.slice(end));
    setForced({ start: start + value.length, end: start + value.length });
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

  function reset() {
    drafts.delete(chatId);
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
    drafts.delete(chatId);
    setText("");
    if (mode) cancel();
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

  async function pick(source: () => Promise<LocalFile[]>) {
    setError(null);
    try {
      const files = await source();
      if (files.length) setPicked(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.composer.couldNotOpen);
    }
  }

  async function startRecording() {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError(tr.composer.micDenied);
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function stopRecording(keep: boolean) {
    const durationMs = recState.durationMillis;
    await recorder.stop();
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false }).catch(() => null);
    const uri = recorder.uri;
    if (!keep || !uri || durationMs < 500) return;
    const size = (await (await fetch(uri)).blob()).size;
    send({
      uri,
      kind: "voice",
      name: `voice-${new Date().toISOString().slice(0, 19)}.m4a`,
      mime: "audio/mp4",
      size,
      durationMs,
    });
  }

  const showMic = !editing && parsed.text.length === 0;

  return (
    <>
      <View
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

        {recording ? (
          <View style={styles.row}>
            <Pressable
              onPress={() => void stopRecording(false)}
              accessibilityLabel={tr.composer.discardRecording}
              style={styles.round40}
            >
              <Trash2 size={20} color={t.danger} />
            </Pressable>
            <View style={[styles.field, styles.recordingField, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={styles.redDot} />
              <Text style={{ color: t.text, fontFamily: "monospace" }}>{formatDuration(recState.durationMillis)}</Text>
              <Text style={{ color: t.muted, fontSize: 14, flex: 1 }}>{tr.composer.recording}</Text>
              <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
            </View>
            <Pressable
              onPress={() => void stopRecording(true)}
              accessibilityLabel={tr.composer.sendVoice}
              style={[styles.round40, { backgroundColor: brand }]}
            >
              <SendHorizontal size={20} color={brandInk} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.row}>
            {!editing && (
              <Pressable onPress={() => setAttachMenu(true)} accessibilityLabel={tr.composer.attach} style={styles.round40}>
                <Paperclip size={22} color={t.muted} />
              </Pressable>
            )}
            {!editing && scheduledCount > 0 && (
              <Pressable
                onPress={() => setShowScheduled(true)}
                accessibilityLabel={tr.composer.scheduledCount(scheduledCount)}
                style={styles.round40}
              >
                <CalendarClock size={22} color={brand} />
              </Pressable>
            )}
            <View style={[styles.field, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Pressable
                onPress={() => setEmoji(true)}
                accessibilityLabel={tr.composer.pickerTabs.emoji}
                style={[styles.round40, emoji && { backgroundColor: "rgba(235,138,0,0.2)" }]}
              >
                <Smile size={22} color={emoji ? brand : t.muted} />
              </Pressable>
              <TextInput
                ref={input}
                value={text}
                onChangeText={typeText}
                selection={forced}
                onSelectionChange={(e) => {
                  selection.current = e.nativeEvent.selection;
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
            {showMic ? (
              <Pressable
                onPress={() => void startRecording()}
                disabled={!realtime}
                accessibilityLabel={tr.composer.recordVoice}
                style={[styles.round40, { backgroundColor: brand, opacity: realtime ? 1 : 0.4 }]}
              >
                <Mic size={20} color={brandInk} />
              </Pressable>
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
        )}
      </View>

      {attachMenu && (
        <Sheet
          title={tr.common.send}
          onClose={() => setAttachMenu(false)}
          actions={[
            { label: tr.composer.photoOrVideo, onSelect: () => void pick(pickMedia) },
            { label: tr.composer.camera, onSelect: () => void pick(takePhoto) },
            { label: tr.summary.kinds.video_note, onSelect: () => setNoteRecorder(true) },
            { label: tr.summary.kinds.file, onSelect: () => void pick(pickFiles) },
          ]}
        />
      )}
      <EmojiPicker open={emoji} onClose={() => setEmoji(false)} onPick={insert} />
      {noteRecorder && (
        <VideoNoteRecorder
          initialEphemeral={ephemeral}
          onClose={() => setNoteRecorder(false)}
          onSend={(file, chosen) => {
            setNoteRecorder(false);
            send(file, chosen);
          }}
        />
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
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" },
  input: { flex: 1, fontSize: 16, lineHeight: 22, maxHeight: 160, paddingTop: 9, paddingBottom: 9 },
  round40: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  round32: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
