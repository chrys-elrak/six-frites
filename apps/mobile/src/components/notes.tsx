import { unwrap } from "@six/sdk";
import {
  NOTE_BACKGROUNDS,
  emojifyEnd,
  emojifyTyped,
  NOTE_LIMIT,
  NOTE_SECS,
  noteChanged,
  noteSecs,
  type GifDTO,
  type LabelFont,
  type NoteDTO,
  type PublicUser,
  STORY_DURATIONS,
  STORY_DURATION_UNITS,
  STORY_LIMITS,
  STORY_REACTIONS,
  type StoryLocation,
  type StoryReaction,
  coordsLabel,
  countReactions,
  durationLabel,
  inkOn,
  mapsUrl,
  previewLink,
} from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useFonts } from "expo-font";
import { Ban, CheckCheck, Eye, MapPin, MessageCircle, SendHorizontal, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { BounceIn } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatingReactions, useFloaters } from "./floating-reactions";
import { FONT_FILES, Fonts, familyOf } from "./photo-editor";
import { useChats } from "@/lib/chats";
import { clockTime, shortDate, timeAgo } from "@/lib/format";
import { getLocale, useT } from "@/lib/i18n";
import { toastSent } from "@/lib/notify";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { six } from "@/lib/six";
import { brand, brandInk, stone, useTheme } from "@/lib/theme";
import { DurationPicker } from "./auto-delete-custom";
import { Avatar } from "./avatar";
import { currentPosition } from "./location-card";
import { LinkCard, Linked } from "./message-list";
import { Modal } from "./modal";
import { GifSearch } from "./story-composer";
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

/** A GIF playing muted on a loop, `height` tall and as wide as it needs, up to `maxWidth`. */
function Loop({ gif, height, maxWidth, radius }: { gif: NonNullable<NoteDTO["gif"]>; height: number; maxWidth: number; radius: number }) {
  const player = useVideoPlayer(gif.url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const width = Math.min(maxWidth, gif.width && gif.height ? (height * gif.width) / gif.height : height);
  return <VideoView player={player} style={{ width, height, borderRadius: radius, overflow: "hidden" }} contentFit="cover" nativeControls={false} />;
}

const placeName = (l: StoryLocation) => l.name ?? coordsLabel(l);

/** The thought bubble above someone's picture in the stories row: their GIF, or their words, on their colour. Without a note it shows `placeholder` greyed, as an invitation. */
export function NoteBubble({ note, placeholder, label, onPress }: { note: NoteDTO | null; placeholder?: string; label: string; onPress: () => void }) {
  const t = useTheme();
  useFonts(FONT_FILES);
  const bg = note?.background;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={[styles.bubble, { backgroundColor: bg ?? t.surface, borderColor: bg ?? t.border }, note?.gif && { padding: 2 }]}
    >
      {note?.gif ? (
        <Loop gif={note.gif} height={32} maxWidth={80} radius={14} />
      ) : (
        <Text
          numberOfLines={2}
          style={[
            { fontSize: 11, lineHeight: 13, textAlign: "center", color: bg ? inkOn(bg) : note ? t.text : stone[400], fontWeight: note ? "500" : "400" },
            !!note?.font && { fontFamily: familyOf(note.font), fontWeight: "normal" },
          ]}
        >
          {note?.fromChat ? `“${note.text}”` : (note?.text || (note?.location && `📍 ${placeName(note.location)}`) || placeholder)}
        </Text>
      )}
    </Pressable>
  );
}

/** A card at the bottom of the screen, over a dimmed backdrop that closes it, which rises with the keyboard. */
export function Popup({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
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

/** How many contacts opened my note, and who, once asked. */
function NoteViewers({ count }: { count: number }) {
  const t = useTheme();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const viewers = useQuery({
    queryKey: [...notesKey, "viewers"],
    queryFn: async () => unwrap(await six.api.GET("/v1/notes/viewers")).items,
    enabled: open,
  });
  return (
    <View style={{ gap: 4 }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6} style={styles.actions}>
        <Eye size={16} color={t.muted} />
        <Text style={{ color: t.muted, fontSize: 14, fontWeight: "600" }}>{tr.stories.views(viewers.data?.length ?? count)}</Text>
      </Pressable>
      {open && (
        <ScrollView style={{ maxHeight: 192 }} keyboardShouldPersistTaps="always">
          {viewers.isPending && <Text style={{ color: t.muted, fontSize: 14 }}>{tr.common.loading}</Text>}
          {viewers.data?.length === 0 && <Text style={{ color: t.muted, fontSize: 14 }}>{tr.stories.noViews}</Text>}
          {viewers.data?.map((v) => (
            <View key={v.user.id} style={[styles.actions, { gap: 12, paddingVertical: 6 }]}>
              <Avatar user={v.user} />
              <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 15 }}>
                {v.user.displayName}
              </Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{timeAgo(v.viewedAt)}</Text>
              {v.clickedAt && <Text accessibilityLabel={tr.stories.openedLink}>🔗</Text>}
              {countReactions(v.reactions).map(([emoji, n]) => (
                <Text key={emoji} style={{ fontSize: 20 }}>
                  {emoji}
                  {n > 1 && <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>{n}</Text>}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** Writes, changes or takes down my note. */
/**
 * Writes or changes your note. Given `fromMessage`, or opened on a note made from one, the text is that message's and
 * can't be changed: only its colour and a GIF can.
 */
export function NoteEditor({
  note,
  fromMessage,
  onClose,
}: {
  note: NoteDTO | null;
  fromMessage?: { text: string; messageId: string; quote: NoteDTO["quote"] };
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const locked = fromMessage?.text ?? (note?.fromChat ? note.text : null);
  const start = fromMessage ? null : note;
  const [text, setText] = useState(locked ?? note?.text ?? "");
  const [background, setBackground] = useState(start?.background ?? null);
  const [gif, setGif] = useState<{ id: string; video: NoteDTO["gif"]; preview: string | null } | null>(
    start?.gif ? { id: start.gif.id, video: start.gif, preview: null } : null,
  );
  const [font, setFont] = useState<LabelFont>(start?.font ?? "classic");
  const [pickingGif, setPickingGif] = useState(false);
  const [location, setLocation] = useState<StoryLocation | null>(start?.location ?? null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [durationSecs, setDurationSecs] = useState(note ? noteSecs(note) : NOTE_SECS);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const changed = !!fromMessage || noteChanged(note, { text: emojifyEnd(text).trim(), background, gifId: gif?.id, location, durationSecs, font });
  const filled = !!text.trim() || !!gif || !!location;
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

  async function locate() {
    if (location) return setLocation(null);
    setLocating(true);
    setLocateError(null);
    try {
      const spot = await currentPosition();
      setLocation(spot);
      void six.api
        .GET("/v1/place-name", { params: { query: { lat: spot.lat, lng: spot.lng, locale: getLocale() } } })
        .then(({ data }) => data?.name && setLocation((l) => (l && !l.name ? { ...l, name: data.name! } : l)))
        .catch(() => null);
    } catch (err) {
      setLocateError((err as Error).message === "denied" ? tr.composer.locationDenied : tr.composer.locationFailed);
    } finally {
      setLocating(false);
    }
  }

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
  const place = location ? { ...location, name: location.name?.trim() || undefined } : undefined;
  const share = () =>
    changed &&
    filled &&
    void run(async () =>
      unwrap(await six.api.PUT("/v1/notes", { body: { text: emojifyEnd(text).trim(), fromChat: !!locked, messageId: fromMessage?.messageId, font, gifId: gif?.id, location: place, background: background ?? undefined, durationSecs } })),
    );
  const ink = background ? inkOn(background) : t.text;

  return (
    <Popup onClose={onClose}>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{tr.stories.yourNote}</Text>
      {gif && (
        <View style={{ alignSelf: "center" }}>
          {gif.preview ? (
            <Image source={{ uri: gif.preview }} style={{ height: 128, aspectRatio: 1.33, borderRadius: 16 }} contentFit="cover" />
          ) : (
            gif.video && <Loop gif={gif.video} height={128} maxWidth={240} radius={16} />
          )}
          <Pressable onPress={() => setGif(null)} accessibilityRole="button" accessibilityLabel={tr.common.remove} hitSlop={6} style={styles.removeGif}>
            <X size={16} color="#fff" />
          </Pressable>
        </View>
      )}
      {locked ? (
        <View style={{ alignItems: "center" }}>
          <ChatNote note={{ text: locked, background, font: font === "classic" ? null : font, gif: null, quote: fromMessage?.quote ?? note?.quote ?? null }} onOpen={() => null} />
        </View>
      ) : (
        <View>
          <TextInput
            autoFocus
            value={text}
            onChangeText={(v) => setText(emojifyTyped(text, v)?.text ?? v)}
            maxLength={NOTE_LIMIT}
            placeholder={tr.stories.notePlaceholder}
            placeholderTextColor={t.muted}
            accessibilityLabel={tr.stories.note}
            returnKeyType="done"
            onSubmitEditing={share}
            style={[styles.field, { color: ink, backgroundColor: background ?? t.field, paddingRight: 48 }, font !== "classic" && { fontFamily: familyOf(font), fontWeight: "normal" }]}
          />
          <Text style={[styles.count, { color: background ? ink : t.muted, opacity: background ? 0.7 : 1 }]}>{NOTE_LIMIT - text.length}</Text>
        </View>
      )}
      <Fonts light value={font} onChange={setFont} />
      <View style={styles.actions}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ flex: 1 }} contentContainerStyle={[styles.actions, { padding: 3 }]}>
          <Pressable
            onPress={() => setBackground(null)}
            accessibilityRole="radio"
            accessibilityState={{ checked: !background }}
            accessibilityLabel={tr.stories.noColour}
            style={[styles.swatch, { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" }, !background && styles.picked]}
          >
            <Ban size={16} color={stone[400]} />
          </Pressable>
          {NOTE_BACKGROUNDS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setBackground(c)}
              accessibilityRole="radio"
              accessibilityState={{ checked: background === c }}
              accessibilityLabel={c}
              style={[styles.swatch, { backgroundColor: c }, background === c && styles.picked]}
            />
          ))}
        </ScrollView>
        {chip(pickingGif, tr.stories.gif, () => setPickingGif(!pickingGif))}
        <Pressable
          onPress={() => void locate()}
          accessibilityRole="button"
          accessibilityState={{ selected: !!location }}
          accessibilityLabel={tr.stories.location}
          style={[styles.chip, { backgroundColor: location ? brand : t.field }]}
        >
          {locating ? <ActivityIndicator size="small" color={location ? brandInk : t.text} /> : <MapPin size={16} color={location ? brandInk : t.text} />}
        </Pressable>
      </View>
      {location && (
        <View style={[styles.place, { backgroundColor: t.field }]}>
          <MapPin size={16} color="#e11d48" />
          <TextInput
            value={location.name ?? ""}
            onChangeText={(name) => setLocation({ ...location, name })}
            maxLength={STORY_LIMITS.place}
            placeholder={coordsLabel(location)}
            placeholderTextColor={t.muted}
            accessibilityLabel={tr.stories.location}
            style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 0 }}
          />
          <Pressable onPress={() => setLocation(null)} accessibilityRole="button" accessibilityLabel={tr.common.remove} hitSlop={8}>
            <X size={16} color={t.muted} />
          </Pressable>
        </View>
      )}
      {locateError && <Text style={{ color: "#dc2626", fontSize: 14 }}>{locateError}</Text>}
      {pickingGif && (
        <View style={styles.gifs}>
          <GifSearch
            onPick={(g) => {
              setGif({ id: g.id, video: null, preview: g.previewUrl });
              setPickingGif(false);
            }}
          />
        </View>
      )}
      {!locked && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.actions}>
          <Text style={{ color: t.muted, fontSize: 14 }}>{tr.stories.lasts}</Text>
          {STORY_DURATIONS.map((secs) => chip(durationSecs === secs, durationLabel(secs, tr), () => setDurationSecs(secs)))}
          {chip(!preset, preset ? tr.stories.custom : durationLabel(durationSecs, tr), () => setCustom(true))}
        </ScrollView>
      )}
      <Text style={{ color: t.muted, fontSize: 14 }}>{tr.stories.noteHint}</Text>
      {note && <NoteViewers count={note.viewCount ?? 0} />}
      {custom && <LastsPicker value={durationSecs} onSet={setDurationSecs} onClose={() => setCustom(false)} />}
      {failed && <Text style={{ color: "#dc2626", fontSize: 14 }}>{tr.common.somethingWrongRetry}</Text>}
      <View style={styles.actions}>
        {note && (
          <Pressable onPress={() => void run(() => six.api.DELETE("/v1/notes"))} disabled={busy} accessibilityRole="button" hitSlop={6}>
            <Text style={{ color: "#dc2626", fontSize: 15, fontWeight: "600" }}>{tr.stories.deleteNote}</Text>
          </Pressable>
        )}
        {changed && <PrimaryButton title={tr.stories.post} onPress={share} disabled={busy || !filled} busy={busy} style={{ marginLeft: "auto" }} />}
      </View>
    </Popup>
  );
}

/** A contact's note, with quick reactions only they see and a box to answer it in your chat with them. */
export function NoteReader({ user, note, onClose }: { user: PublicUser; note: NoteDTO; onClose: () => void }) {
  const t = useTheme();
  useFonts(FONT_FILES);
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const chats = [...(useChats().data ?? []), ...(useChats(true).data ?? [])];
  const chat = chats.find((c) => c.type === "direct" && c.members.some((m) => m.user.id === user.id));
  const [text, setText] = useState("");
  const [pickingGif, setPickingGif] = useState(false);
  const [popped, setPopped] = useState({ emoji: "", n: 0 });
  const [floaters, float] = useFloaters();
  useEffect(() => {
    void six.api.POST("/v1/notes/{id}/view", { params: { path: { id: note.id } } });
  }, [note.id]);
  const clicked = () => void six.api.POST("/v1/notes/{id}/click", { params: { path: { id: note.id } } });

  const react = (emoji: StoryReaction) => {
    void six.api.POST("/v1/notes/{id}/react", { params: { path: { id: note.id } }, body: { emoji } });
    setPopped((p) => ({ emoji, n: p.n + 1 }));
    float(emoji);
  };

  function send(gif?: GifDTO) {
    if ((!text.trim() && !gif) || !chat || !realtime) return;
    const story = { id: note.id, ownerId: user.id, kind: "note" as const, text: note.text || (note.location && `📍 ${placeName(note.location)}`) || null, background: note.background, imageUrl: null };
    if (text.trim()) void queueMessage(qc, realtime, chat.id, { text: emojifyEnd(text).trim(), story });
    if (gif) void queueMessage(qc, realtime, chat.id, { text: "", gif, story });
    toastSent(chat.id, user, text.trim() || tr.stories.gif);
    onClose();
  }

  return (
    <Popup onClose={onClose}>
      <FloatingReactions reactions={floaters} />
      <View style={{ alignItems: "center", gap: 12 }}>
        {note.fromChat && !!note.text ? (
          <ChatNote note={note} onOpen={clicked} />
        ) : (
          (!!note.text || !!note.gif) && (
            <View style={[styles.bigBubble, { backgroundColor: note.background ?? t.surfaceAlt }, note.gif && { padding: 6 }]}>
              {note.gif && <Loop gif={note.gif} height={180} maxWidth={280} radius={18} />}
              {!!note.text && (
                <Text
                  style={[
                    { color: note.background ? inkOn(note.background) : t.text, fontSize: 16, fontWeight: "500", textAlign: "center" },
                    note.gif && { padding: 6 },
                    !!note.font && { fontFamily: familyOf(note.font), fontWeight: "normal" },
                  ]}
                >
                  <Linked text={note.text} selecting={false} onOpen={clicked} />
                </Text>
              )}
            </View>
          )
        )}
        {note.location && (
          <Pressable
            onPress={() => void Linking.openURL(mapsUrl(note.location!))}
            accessibilityRole="link"
            style={[styles.place, { backgroundColor: t.field, maxWidth: "100%" }]}
          >
            <MapPin size={16} color="#e11d48" />
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: "600", flexShrink: 1 }}>
              {placeName(note.location)}
            </Text>
          </Pressable>
        )}
        {previewLink(note.text) && <LinkCard url={previewLink(note.text)!} mine={false} width={280} onOpen={clicked} />}
        {!note.fromChat && (
          <>
            <Avatar user={user} size="lg" />
            <Text style={{ color: t.text, fontSize: 15 }}>
              <Text style={{ fontWeight: "700" }}>{user.displayName}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}> · {timeAgo(note.createdAt)}</Text>
            </Text>
          </>
        )}
        <View style={styles.actions}>
          {STORY_REACTIONS.map((emoji) => (
            <Pressable key={emoji} onPress={() => react(emoji)} accessibilityLabel={emoji} hitSlop={4} style={styles.reaction}>
              <Animated.View key={popped.emoji === emoji ? popped.n : 0} entering={popped.emoji === emoji ? BounceIn.duration(300) : undefined}>
                <Text style={{ fontSize: 26 }}>{emoji}</Text>
              </Animated.View>
            </Pressable>
          ))}
        </View>
      </View>
      {chat && realtime && pickingGif && <GifSearch onPick={(g) => send(g)} />}
      {chat && realtime && (
        <View style={styles.actions}>
          <TextInput
            autoFocus
            value={text}
            onChangeText={(v) => setText(emojifyTyped(text, v)?.text ?? v)}
            maxLength={4000}
            placeholder={tr.stories.replyTo(user.displayName)}
            placeholderTextColor={t.muted}
            accessibilityLabel={tr.stories.replyTo(user.displayName)}
            returnKeyType="send"
            onSubmitEditing={() => send()}
            style={[styles.field, { flex: 1, color: t.text, backgroundColor: t.field }]}
          />
          <Pressable
            onPress={() => setPickingGif(!pickingGif)}
            accessibilityRole="button"
            accessibilityState={{ selected: pickingGif }}
            style={[styles.chip, { backgroundColor: pickingGif ? brand : t.field }]}
          >
            <Text style={{ color: pickingGif ? brandInk : t.text, fontSize: 14, fontWeight: "700" }}>{tr.stories.gif}</Text>
          </Pressable>
          <Pressable
            onPress={() => send()}
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
  chatNote: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  chatNoteColumn: { flexShrink: 1, alignItems: "flex-start", gap: 4 },
  chatNoteBubble: { flexDirection: "row", alignItems: "flex-end", gap: 8, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 8, maxWidth: "100%" },
  chatNoteText: { flexShrink: 1, fontSize: 19, lineHeight: 25 },
  chatNoteTime: { flexDirection: "row", alignItems: "center", gap: 3, paddingBottom: 3 },
  bubble: { zIndex: 1, marginBottom: -8, maxWidth: 72, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 4 },
  backdrop: { backgroundColor: "rgba(0,0,0,0.4)" },
  card: { marginHorizontal: 12, borderRadius: 24, padding: 20, gap: 12 },
  field: { borderRadius: 999, fontSize: 16, paddingHorizontal: 16, paddingVertical: 11 },
  count: { position: "absolute", right: 16, top: 0, bottom: 0, textAlignVertical: "center", fontSize: 12, lineHeight: 44 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  place: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: brand },
  bigBubble: { borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, maxWidth: "90%", alignItems: "center", gap: 4 },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  reaction: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  picked: { outlineWidth: 2, outlineOffset: 2, outlineColor: brand, outlineStyle: "solid" },
  gifs: { borderRadius: 16, backgroundColor: "rgba(0,0,0,0.75)", padding: 10 },
  removeGif: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: stone[900],
  },
});

/** A note made from a chat message, drawn as that message: a sent bubble next to who wrote it, with when. */
function ChatNote({ note, onOpen }: { note: Pick<NoteDTO, "text" | "background" | "font" | "gif" | "quote">; onOpen: () => void }) {
  const t = useTheme();
  const tr = useT();
  const { quote } = note;
  const bg = note.background ?? brand;
  const ink = note.background ? inkOn(note.background) : brandInk;
  return (
    <View style={{ alignItems: "center", gap: 12, maxWidth: "100%" }}>
      {note.gif && <Loop gif={note.gif} height={180} maxWidth={280} radius={18} />}
      <View style={styles.chatNote}>
        {quote && <Avatar user={quote.from} size="sm" />}
        <View style={styles.chatNoteColumn}>
          {quote && (
            <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12, paddingHorizontal: 12 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>{quote.from.displayName}</Text> · {shortDate(quote.sentAt)}
            </Text>
          )}
          <View style={[styles.chatNoteBubble, { backgroundColor: bg }]}>
            <Text style={[styles.chatNoteText, { color: ink }, !!note.font && { fontFamily: familyOf(note.font), fontWeight: "normal" }]}>
              <Linked text={note.text} selecting={false} onOpen={onOpen} />
            </Text>
            {quote && (
              <View style={styles.chatNoteTime}>
                <Text style={{ color: ink, fontSize: 12, opacity: 0.7 }}>{clockTime(quote.sentAt)}</Text>
                <CheckCheck size={15} color={ink} style={{ opacity: 0.7 }} />
              </View>
            )}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <MessageCircle size={13} color={t.muted} />
        <Text style={{ color: t.muted, fontSize: 12 }}>{tr.stories.fromChat}</Text>
      </View>
    </View>
  );
}
