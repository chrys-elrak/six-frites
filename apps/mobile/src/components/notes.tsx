import { unwrap } from "@six/sdk";
import {
  NOTE_LIMIT,
  NOTE_SECS,
  type NoteDTO,
  type PublicUser,
  STORY_DURATIONS,
  STORY_DURATION_UNITS,
  STORY_LIMITS,
  durationLabel,
} from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SendHorizontal } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChats } from "@/lib/chats";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { six } from "@/lib/six";
import { brand, brandInk, stone, useTheme } from "@/lib/theme";
import { DurationPicker } from "./auto-delete-custom";
import { Avatar } from "./avatar";
import { Text, TextInput } from "./text";
import { PrimaryButton } from "./ui";

/** Under the stories key, so `stories:changed` refreshes notes too. */
export const notesKey = ["stories", "notes"] as const;
const live = (n: NoteDTO) => Date.parse(n.expiresAt) > Date.now();

export function useNotes() {
  return useQuery({
    queryKey: notesKey,
    queryFn: async () => unwrap(await six.api.GET("/v1/notes")),
    select: (d) => ({ mine: d.mine && live(d.mine) ? d.mine : null, items: d.items.filter((n) => live(n.note)) }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** The thought bubble above someone's picture in the stories row; `empty` shows the text greyed, as an invitation. */
export function NoteBubble({ text, empty, label, onPress }: { text: string; empty?: boolean; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={[styles.bubble, { backgroundColor: t.surface, borderColor: t.border }]}
    >
      <Text numberOfLines={2} style={{ fontSize: 11, lineHeight: 13, textAlign: "center", color: empty ? stone[400] : t.text, fontWeight: empty ? "400" : "500" }}>
        {text}
      </Text>
    </Pressable>
  );
}

/** A card at the bottom of the screen, over a dimmed backdrop that closes it, which rises with the keyboard. */
function Popup({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable onPress={onClose} accessibilityLabel={tr.common.close} style={[StyleSheet.absoluteFill, styles.backdrop]} />
        <View style={[styles.card, { backgroundColor: t.surface, marginBottom: Math.max(insets.bottom, 12) }]}>{children}</View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Asks how long a story or a note stays up, in hours. */
export function LastsPicker({ value, onSet, onClose }: { value: number; onSet: (secs: number) => void; onClose: () => void }) {
  const tr = useT();
  return (
    <DurationPicker
      value={value}
      units={STORY_DURATION_UNITS}
      range={{ min: STORY_LIMITS.minSecs, max: STORY_LIMITS.maxSecs }}
      title={tr.stories.customDuration}
      hint={tr.stories.durationHint}
      rangeHint={tr.stories.durationRange}
      submit={tr.stories.setDuration}
      onSet={onSet}
      onClose={onClose}
    />
  );
}

/** Writes, changes or takes down my note. */
export function NoteEditor({ note, onClose }: { note: NoteDTO | null; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const [text, setText] = useState(note?.text ?? "");
  const [durationSecs, setDurationSecs] = useState(NOTE_SECS);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const preset = (STORY_DURATIONS as readonly number[]).includes(durationSecs);
  const chip = (on: boolean, label: string, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={[styles.chip, { backgroundColor: on ? brand : t.field }]}
    >
      <Text style={{ color: on ? brandInk : t.text, fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );

  async function run(call: () => Promise<unknown>) {
    setBusy(true);
    setFailed(false);
    try {
      await call();
      await qc.invalidateQueries({ queryKey: notesKey });
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }
  const share = () => text.trim() && void run(async () => unwrap(await six.api.PUT("/v1/notes", { body: { text: text.trim(), durationSecs } })));

  return (
    <Popup onClose={onClose}>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{tr.stories.yourNote}</Text>
      <View>
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          maxLength={NOTE_LIMIT}
          placeholder={tr.stories.notePlaceholder}
          placeholderTextColor={t.muted}
          accessibilityLabel={tr.stories.note}
          returnKeyType="done"
          onSubmitEditing={share}
          style={[styles.field, { color: t.text, backgroundColor: t.field, paddingRight: 48 }]}
        />
        <Text style={[styles.count, { color: t.muted }]}>{NOTE_LIMIT - text.length}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.actions}>
        <Text style={{ color: t.muted, fontSize: 14 }}>{tr.stories.lasts}</Text>
        {STORY_DURATIONS.map((secs) => chip(durationSecs === secs, durationLabel(secs, tr), () => setDurationSecs(secs)))}
        {chip(!preset, preset ? tr.stories.custom : durationLabel(durationSecs, tr), () => setCustom(true))}
      </ScrollView>
      <Text style={{ color: t.muted, fontSize: 14 }}>{tr.stories.noteHint}</Text>
      {custom && <LastsPicker value={durationSecs} onSet={setDurationSecs} onClose={() => setCustom(false)} />}
      {failed && <Text style={{ color: "#dc2626", fontSize: 14 }}>{tr.common.somethingWrongRetry}</Text>}
      <View style={styles.actions}>
        {note && (
          <Pressable onPress={() => void run(() => six.api.DELETE("/v1/notes"))} disabled={busy} accessibilityRole="button" hitSlop={6}>
            <Text style={{ color: "#dc2626", fontSize: 15, fontWeight: "600" }}>{tr.stories.deleteNote}</Text>
          </Pressable>
        )}
        <PrimaryButton title={tr.stories.post} onPress={share} disabled={busy || !text.trim()} busy={busy} style={{ marginLeft: "auto" }} />
      </View>
    </Popup>
  );
}

/** A contact's note, with a box to answer it in your chat with them. */
export function NoteReader({ user, note, onClose }: { user: PublicUser; note: NoteDTO; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const chats = [...(useChats().data ?? []), ...(useChats(true).data ?? [])];
  const chat = chats.find((c) => c.type === "direct" && c.members.some((m) => m.user.id === user.id));
  const [text, setText] = useState("");

  function send() {
    if (!text.trim() || !chat || !realtime) return;
    const story = { id: note.id, ownerId: user.id, kind: "note" as const, text: note.text, background: null, imageUrl: null };
    void queueMessage(qc, realtime, chat.id, { text: text.trim(), story });
    onClose();
  }

  return (
    <Popup onClose={onClose}>
      <View style={{ alignItems: "center", gap: 12 }}>
        <View style={[styles.bigBubble, { backgroundColor: t.surfaceAlt }]}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: "500", textAlign: "center" }}>{note.text}</Text>
        </View>
        <Avatar user={user} size="lg" />
        <Text style={{ color: t.text, fontSize: 15 }}>
          <Text style={{ fontWeight: "700" }}>{user.displayName}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}> · {timeAgo(note.createdAt)}</Text>
        </Text>
      </View>
      {chat && realtime && (
        <View style={styles.actions}>
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            maxLength={4000}
            placeholder={tr.stories.replyTo(user.displayName)}
            placeholderTextColor={t.muted}
            accessibilityLabel={tr.stories.replyTo(user.displayName)}
            returnKeyType="send"
            onSubmitEditing={send}
            style={[styles.field, { flex: 1, color: t.text, backgroundColor: t.field }]}
          />
          <Pressable
            onPress={send}
            disabled={!text.trim()}
            accessibilityRole="button"
            accessibilityLabel={tr.common.send}
            style={[styles.send, { opacity: text.trim() ? 1 : 0.5 }]}
          >
            <SendHorizontal size={20} color={brandInk} />
          </Pressable>
        </View>
      )}
    </Popup>
  );
}

const styles = StyleSheet.create({
  bubble: { zIndex: 1, marginBottom: -8, maxWidth: 72, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 4 },
  backdrop: { backgroundColor: "rgba(0,0,0,0.4)" },
  card: { marginHorizontal: 12, borderRadius: 24, padding: 20, gap: 12 },
  field: { borderRadius: 999, fontSize: 16, paddingHorizontal: 16, paddingVertical: 11 },
  count: { position: "absolute", right: 16, top: 0, bottom: 0, textAlignVertical: "center", fontSize: 12, lineHeight: 44 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: brand },
  bigBubble: { borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, maxWidth: "90%" },
});
