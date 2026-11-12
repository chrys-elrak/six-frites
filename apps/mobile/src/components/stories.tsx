import { unwrap } from "@six/sdk";
import {
  type NoteDTO,
  STORY_BACKGROUNDS,
  STORY_REACTIONS,
  chatTheme,
  STORY_SHOW_MS,
  type StoryDTO,
  type StoryGroupDTO,
  type StoryLocation,
  coordsLabel,
  countReactions,
  mapsUrl,
  storyBackground,
  type PublicUser,
  STORY_STICKERS,
  STORY_STICKER_SCALE,
  type StoryPositions,
  type StoryReaction,
  type StorySpot,
  type StorySticker,
} from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { CalendarDays, Clock, Eye, MapPin, MessageCircle, MoveDiagonal2, Pause, Play, Plus, SendHorizontal, Trash2, X } from "lucide-react-native";
import { type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { BounceIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clockTime, shortDate, timeAgo } from "@/lib/format";
import { useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { fingers } from "@/lib/fingers";
import { useHiddenByArchive } from "@/lib/archive-lock";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, brandInk, stone, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { FloatingReactions, useFloaters } from "./floating-reactions";
import { Modal } from "./modal";
import { NoteBubble, NoteEditor, NoteReader, useNotes } from "./notes";
import { Sheet } from "./sheet";
import { StoryComposer } from "./story-composer";
import { StoryDrawingLayer } from "./story-drawing";
import { Text, TextInput } from "./text";

/** A story's background as a style: its colour, with the gradient on top when it has two. */
export function storyFill(background: string) {
  return { backgroundColor: background.split(",")[0], backgroundImage: storyBackground(background) };
}

export const storiesKey = ["stories"] as const;

const live = (s: StoryDTO) => Date.parse(s.expiresAt) > Date.now();

export function useStories() {
  return useQuery({
    queryKey: storiesKey,
    queryFn: async () => unwrap(await six.api.GET("/v1/stories")).items,
    select: (groups) =>
      groups.map((g) => ({ ...g, stories: g.stories.filter(live) })).filter((g) => g.stories.length > 0),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const clampScale = (v: number) => Math.min(STORY_STICKER_SCALE.max, Math.max(STORY_STICKER_SCALE.min, v));

type Move = (sticker: StorySticker, spot: StorySpot) => void;
type ViewRef = ComponentRef<typeof View>;

interface Editing {
  frame: React.RefObject<ViewRef | null>;
  onMove: Move;
  onRemove?: (sticker: StorySticker) => void;
  onTap?: (sticker: StorySticker) => void;
}

/**
 * A sticker at its size, which in the composer can be dragged anywhere on the story, pinched with a second finger or
 * resized by its corner handle, removed, or tapped. It follows the fingers while held and settles at its new spot
 * or size once let go, so it stays the same view for the whole gesture; whenever a finger lands or lifts, it carries
 * on from where it is then.
 */
function Sticker({ sticker, scale = 1, editing, children }: { sticker: StorySticker; scale?: number; editing?: Editing; children: React.ReactNode }) {
  const tr = useT();
  const self = useRef<ViewRef>(null);
  const start = useRef<{ x: number; y: number; cx: number; cy: number; px: number; py: number; w: number; h: number } | null>(null);
  const [shift, setShift] = useState({ dx: 0, dy: 0 });
  const [live, setLive] = useState<number | null>(null);
  const liveRef = useRef<number | null>(null);
  const hold = useRef({ count: 0, x: 0, y: 0, apart: 0, dx: 0, dy: 0, scale: 1, moved: false });
  const shiftRef = useRef({ dx: 0, dy: 0 });
  const shown = live ?? scale;
  if (!editing) return <View style={{ transform: [{ scale }] }}>{children}</View>;

  const measure = (pageX: number, pageY: number) => {
    start.current = null;
    editing.frame.current?.measureInWindow((fx, fy, fw, fh) =>
      self.current?.measureInWindow((x, y, w, h) => {
        const [cx, cy] = [x + w / 2, y + h / 2];
        start.current = { x: (cx - fx) / fw, y: (cy - fy) / fh, cx, cy, px: pageX, py: pageY, w: fw, h: fh };
      }),
    );
  };
  const keep = { transform: [{ scale: 1 / shown }] };

  return (
    <View
      ref={self}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        measure(e.nativeEvent.pageX, e.nativeEvent.pageY);
        hold.current = { ...fingers(e.nativeEvent.touches), dx: 0, dy: 0, scale, moved: false };
        shiftRef.current = { dx: 0, dy: 0 };
      }}
      onResponderMove={(e) => {
        const h = hold.current;
        const f = fingers(e.nativeEvent.touches);
        if (f.count !== h.count) {
          hold.current = { ...f, ...shiftRef.current, scale: liveRef.current ?? h.scale, moved: h.moved };
          return;
        }
        const [dx, dy] = [h.dx + f.x - h.x, h.dy + f.y - h.y];
        if (!h.moved && f.count < 2 && Math.hypot(dx, dy) <= 6) return;
        h.moved = true;
        shiftRef.current = { dx, dy };
        setShift({ dx, dy });
        if (f.count === 2 && h.apart) {
          liveRef.current = clampScale((h.scale * f.apart) / h.apart);
          setLive(liveRef.current);
        }
      }}
      onResponderRelease={() => {
        const s = start.current;
        const { dx, dy } = shiftRef.current;
        if (s && hold.current.moved) {
          editing.onMove(sticker, { x: clamp(s.x + dx / s.w), y: clamp(s.y + dy / s.h), scale: liveRef.current ?? scale });
        } else editing.onTap?.(sticker);
        liveRef.current = null;
        setLive(null);
        setShift({ dx: 0, dy: 0 });
      }}
      style={{ transform: [{ translateX: shift.dx }, { translateY: shift.dy }, { scale: shown }] }}
    >
      {children}
      {editing.onRemove && (
        <Pressable onPress={() => editing.onRemove!(sticker)} accessibilityLabel={tr.common.remove} hitSlop={8} style={[styles.handle, styles.remove, keep]}>
          <X size={14} color={stone[900]} strokeWidth={3} />
        </Pressable>
      )}
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => measure(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        onResponderMove={(e) => {
          const s = start.current;
          if (!s) return;
          const from = Math.hypot(s.px - s.cx, s.py - s.cy) || 1;
          liveRef.current = clampScale((scale * Math.hypot(e.nativeEvent.pageX - s.cx, e.nativeEvent.pageY - s.cy)) / from);
          setLive(liveRef.current);
        }}
        onResponderRelease={() => {
          const s = start.current;
          if (s && liveRef.current !== null) editing.onMove(sticker, { x: s.x, y: s.y, scale: liveRef.current });
          liveRef.current = null;
          setLive(null);
        }}
        hitSlop={8}
        style={[styles.handle, styles.resize, keep]}
      >
        <MoveDiagonal2 size={14} color={stone[900]} strokeWidth={2.5} />
      </View>
    </View>
  );
}

/** Puts a sticker with its centre on `spot` of the layer around it. */
function Placed({ spot, children }: { spot: StorySpot; children: React.ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{
        position: "absolute",
        left: `${spot.x * 100}%`,
        top: `${spot.y * 100}%`,
        opacity: size.w ? 1 : 0,
        transform: [{ translateX: -size.w / 2 }, { translateY: -size.h / 2 }],
      }}
    >
      {children}
    </View>
  );
}

/**
 * A story's GIF, place, date and time. With `placed` it draws the ones the poster dragged somewhere, at their spot
 * and size (inside a full-size layer); without, the others in a row at the bottom. In the composer, `onMove` lets
 * each be dragged anywhere on `frame` (the whole story) and resized, `onRemove` adds a button to take it off, and
 * `onTap` is called when it is tapped rather than dragged.
 */
export function StoryStickers({
  ask,
  gif,
  location,
  showDate,
  showTime,
  at,
  positions,
  placed,
  frame,
  onMove,
  onRemove,
  onTap,
}: {
  ask: StoryDTO["ask"];
  gif: React.ReactNode | null;
  location: StoryLocation | null;
  showDate: boolean;
  showTime: boolean;
  at: string;
  positions: StoryPositions;
  placed: boolean;
  frame?: React.RefObject<ViewRef | null>;
  onMove?: Move;
  onRemove?: (sticker: StorySticker) => void;
  onTap?: (sticker: StorySticker) => void;
}) {
  const tr = useT();
  const has = { ask: !!ask, gif: !!gif, location: !!location, date: showDate, time: showTime };
  const shown = STORY_STICKERS.filter((k) => has[k] && !!positions[k] === placed);
  if (!shown.length) return null;
  const editing = onMove && frame ? { frame, onMove, onRemove, onTap } : undefined;

  const node = (k: StorySticker) => {
    const body =
      k === "ask" && ask ? (
        <View style={styles.askCard}>
          <Text style={[styles.askPrompt, { backgroundImage: `linear-gradient(90deg, #fbbf24, ${brand}, #f43f5e)` }]}>
            {ask.prompt ?? tr.ask.prompt}
          </Text>
          {ask.photoUrl && <Image source={{ uri: ask.photoUrl }} style={styles.askMedia} contentFit="cover" />}
          {ask.gif && <AskGif url={ask.gif.url} />}
          {!!ask.text.trim() && <Text style={styles.askText}>{ask.text}</Text>}
        </View>
      ) : k === "gif" ? (
        gif
      ) : k === "location" && location ? (
        editing ? (
          <View style={styles.chip}>
            <MapPin size={16} color="#e11d48" />
            <Text numberOfLines={1} style={styles.chipText}>
              {location.name ?? coordsLabel(location)}
            </Text>
          </View>
        ) : (
          <Pressable onPress={() => void Linking.openURL(mapsUrl(location))} accessibilityRole="link" style={styles.chip}>
            <MapPin size={16} color="#e11d48" />
            <Text numberOfLines={1} style={styles.chipText}>
              {location.name ?? coordsLabel(location)}
            </Text>
          </Pressable>
        )
      ) : k === "date" ? (
        <View style={styles.chip}>
          <CalendarDays size={16} color={brand} />
          <Text style={styles.chipText}>{shortDate(at)}</Text>
        </View>
      ) : (
        <View style={styles.chip}>
          <Clock size={16} color={brand} />
          <Text style={styles.chipText}>{clockTime(at)}</Text>
        </View>
      );
    return (
      <Sticker key={k} sticker={k} scale={positions[k]?.scale} editing={editing}>
        {body}
      </Sticker>
    );
  };

  if (placed) {
    return shown.map((k) => (
      <Placed key={k} spot={positions[k]!}>
        {node(k)}
      </Placed>
    ));
  }
  const chips = shown.filter((k) => k !== "gif" && k !== "ask");
  return (
    <>
      {shown.includes("ask") && node("ask")}
      {shown.includes("gif") && node("gif")}
      {chips.length > 0 && <View style={styles.stickers}>{chips.map(node)}</View>}
    </>
  );
}

/**
 * A chat's avatar, ringed while that person has stories up: orange until you've seen them all. Tapping it
 * opens their stories rather than the chat around it.
 */
export function StoryAvatar({ userId, name, children }: { userId: string; name: string; children: React.ReactNode }) {
  const t = useTheme();
  const tr = useT();
  const groups = useStories().data ?? [];
  const at = groups.findIndex((g) => g.user.id === userId);
  const [open, setOpen] = useState(false);
  if (at < 0) return children;
  const unseen = groups[at]!.stories.some((s) => !s.seen);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={tr.stories.open(name)} hitSlop={4}>
        <View pointerEvents="none" style={[styles.storyRing, { borderColor: unseen ? brand : t.dark ? stone[600] : stone[300] }]} />
        {children}
      </Pressable>
      {open && <StoryViewer groups={groups} start={at} onClose={() => setOpen(false)} />}
    </>
  );
}

function Ring({ unseen, children }: { unseen: boolean; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.ring,
        unseen
          ? { backgroundImage: `linear-gradient(45deg, #fbbf24, ${brand}, #f43f5e)` }
          : { backgroundColor: t.dark ? stone[700] : stone[300] },
      ]}
    >
      <View style={[styles.ringGap, { backgroundColor: t.bg }]}>{children}</View>
    </View>
  );
}

/**
 * A row of contacts' stories and notes above the chats, starting with mine, a button to add a story and my note.
 * Tapping a picture opens that person's stories, or their note when they only have a note.
 */
export function StoriesBar() {
  const t = useTheme();
  const tr = useT();
  const me = useSession((s) => s.user!);
  const stories = useStories();
  const notes = useNotes().data;
  const [open, setOpen] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [writingNote, setWritingNote] = useState(false);
  const [reading, setReading] = useState<{ user: PublicUser; note: NoteDTO } | null>(null);
  const hidden = useHiddenByArchive().userIds;
  const groups = (stories.data ?? []).filter((g) => !hidden.has(g.user.id));
  const noteItems = (notes?.items ?? []).filter((n) => !hidden.has(n.user.id));
  const mineAt = groups.findIndex((g) => g.user.id === me.id);
  const latest = groups[mineAt]?.stories[groups[mineAt]!.stories.length - 1];
  const cover = latest && (latest.media?.thumbUrl ?? (latest.type === "image" ? latest.media?.url : null));
  const noteOf = new Map(noteItems.map((n) => [n.user.id, n]));
  const people = [
    ...groups.flatMap((g, i) => (g.user.id === me.id ? [] : [{ user: g.user, at: i as number | null, unseen: g.stories.some((s) => !s.seen) }])),
    ...noteItems.filter((n) => !groups.some((g) => g.user.id === n.user.id)).map((n) => ({ user: n.user, at: null, unseen: false })),
  ];

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bar}>
        <View style={styles.item}>
          <View style={styles.noteSlot}>
            <NoteBubble
              note={notes?.mine ?? null}
              placeholder={tr.stories.leaveNote}
              label={notes?.mine ? tr.stories.yourNote : tr.stories.leaveNote}
              onPress={() => setWritingNote(true)}
            />
          </View>
          <Pressable
            onPress={() => (mineAt >= 0 ? setOpen(mineAt) : setComposing(true))}
            accessibilityLabel={mineAt >= 0 ? tr.stories.open(tr.stories.yours) : tr.stories.add}
          >
            <Ring unseen={false}>
              {cover ? (
                <Image source={cover} style={styles.cover} />
              ) : latest ? (
                <View style={[styles.cover, storyFill(latest.background ?? "#eb8a00")]} />
              ) : (
                <Avatar user={me} size="md" />
              )}
            </Ring>
          </Pressable>
          <Pressable
            onPress={() => setComposing(true)}
            accessibilityLabel={tr.stories.add}
            hitSlop={6}
            style={[styles.plus, { borderColor: t.bg }]}
          >
            <Plus size={14} color={brandInk} strokeWidth={3} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.name, { color: t.muted }]}>
            {tr.stories.yours}
          </Text>
        </View>
        {people.map(({ user, at, unseen }) => {
          const note = noteOf.get(user.id);
          return (
            <View key={user.id} style={styles.item}>
              <View style={styles.noteSlot}>
                {note && <NoteBubble note={note.note} label={tr.stories.noteBy(user.displayName)} onPress={() => setReading(note)} />}
              </View>
              <Pressable
                onPress={() => (at !== null ? setOpen(at) : note && setReading(note))}
                accessibilityLabel={at !== null ? tr.stories.open(user.displayName) : tr.stories.noteBy(user.displayName)}
              >
                {at !== null ? (
                  <Ring unseen={unseen}>
                    <Avatar user={user} size="md" />
                  </Ring>
                ) : (
                  <View style={{ padding: 5 }}>
                    <Avatar user={user} size="md" />
                  </View>
                )}
              </Pressable>
              <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>
                {user.displayName}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      {open !== null && groups[open] && <StoryViewer groups={groups} start={open} onClose={() => setOpen(null)} />}
      {composing && <StoryComposer onClose={() => setComposing(false)} />}
      {writingNote && <NoteEditor note={notes?.mine ?? null} onClose={() => setWritingNote(false)} />}
      {reading && <NoteReader user={reading.user} note={reading.note} onClose={() => setReading(null)} />}
    </>
  );
}

function Viewers({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const viewers = useQuery({
    queryKey: ["stories", storyId, "viewers"],
    queryFn: async () => unwrap(await six.api.GET("/v1/stories/{id}/viewers", { params: { path: { id: storyId } } })).items,
  });
  return (
    <View style={[styles.viewers, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.viewersHead}>
        <Text style={styles.viewersTitle}>{tr.stories.views(viewers.data?.length ?? 0)}</Text>
        <Pressable onPress={onClose} accessibilityLabel={tr.common.close} hitSlop={8}>
          <X size={22} color="#fff" />
        </Pressable>
      </View>
      {viewers.isPending && <ActivityIndicator color="#fff" />}
      <FlatList
        data={viewers.data ?? []}
        keyExtractor={(v) => v.user.id}
        ListEmptyComponent={viewers.data ? <Text style={styles.dim}>{tr.stories.noViews}</Text> : undefined}
        renderItem={({ item }) => (
          <View style={styles.viewerRow}>
            <Avatar user={item.user} />
            <Text numberOfLines={1} style={{ flex: 1, color: "#fff", fontSize: 15 }}>
              {item.user.displayName}
            </Text>
            <Text style={styles.dim}>{timeAgo(item.viewedAt)}</Text>
            {countReactions(item.reactions).map(([emoji, n]) => (
              <Text key={emoji} style={styles.viewerReaction}>
                {emoji}
                {n > 1 && <Text style={styles.reactionCount}>{n}</Text>}
              </Text>
            ))}
          </View>
        )}
      />
    </View>
  );
}

function StoryVideo({
  url,
  stopped,
  onTime,
  onEnd,
}: {
  url: string;
  stopped: boolean;
  onTime: (ms: number, totalMs: number) => void;
  onEnd: () => void;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });
  const time = useEvent(player, "timeUpdate");
  useEffect(() => {
    if (time && player.duration > 0) onTime(time.currentTime * 1000, player.duration * 1000);
  }, [time, player, onTime]);
  useEffect(() => {
    const sub = player.addListener("playToEnd", onEnd);
    return () => sub.remove();
  }, [player, onEnd]);
  useEffect(() => {
    if (stopped) player.pause();
    else player.play();
  }, [stopped, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

/** Opens the first story in a group the viewer hasn't seen yet, or the first one when all were seen. */
const firstUnseen = (g: StoryGroupDTO) => Math.max(0, g.stories.findIndex((s) => !s.seen));

/** Answers someone's story: a quick reaction they see in who opened it, or a few words in your chat with them. */
function ReplyBar({ story, owner, onTyping }: { story: StoryDTO; owner: PublicUser; onTyping: (typing: boolean) => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const chats = [...(useChats().data ?? []), ...(useChats(true).data ?? [])];
  const chat = chats.find((c) => c.type === "direct" && c.members.some((m) => m.user.id === owner.id));
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [popped, setPopped] = useState({ emoji: "", n: 0 });
  const [floaters, float] = useFloaters();
  if (!chat || !realtime) return null;

  const done = () => {
    setSent(true);
    setTimeout(() => setSent(false), 1500);
  };
  const react = (emoji: StoryReaction) => {
    void six.api.POST("/v1/stories/{id}/react", { params: { path: { id: story.id } }, body: { emoji } });
    setPopped((p) => ({ emoji, n: p.n + 1 }));
    float(emoji);
  };
  const send = (reply: string) => {
    if (!reply.trim()) return;
    const reference = {
      id: story.id,
      ownerId: owner.id,
      kind: story.type,
      text: story.text?.slice(0, 120) ?? null,
      background: story.background,
      imageUrl: story.media?.thumbUrl ?? (story.type === "image" ? story.media?.url : null) ?? null,
    };
    queueMessage(qc, realtime, chat.id, { text: reply.trim(), story: reference });
    setText("");
    done();
    Keyboard.dismiss();
  };

  return (
    <View style={styles.reply}>
      <FloatingReactions reactions={floaters} />
      <View style={styles.reactions}>
        {sent ? (
          <Text style={styles.sent}>{tr.stories.sent}</Text>
        ) : (
          STORY_REACTIONS.map((emoji) => (
            <Pressable key={emoji} onPress={() => react(emoji)} accessibilityLabel={emoji} hitSlop={4} style={styles.reaction}>
              <Animated.View key={popped.emoji === emoji ? popped.n : 0} entering={popped.emoji === emoji ? BounceIn.duration(300) : undefined}>
                <Text style={{ fontSize: 26 }}>{emoji}</Text>
              </Animated.View>
            </Pressable>
          ))
        )}
      </View>
      <View style={styles.replyRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          onFocus={() => onTyping(true)}
          onBlur={() => onTyping(false)}
          onSubmitEditing={() => send(text)}
          returnKeyType="send"
          maxLength={4000}
          placeholder={tr.stories.replyTo(owner.displayName)}
          placeholderTextColor="rgba(255,255,255,0.75)"
          accessibilityLabel={tr.stories.replyTo(owner.displayName)}
          style={styles.replyInput}
        />
        {!!text.trim() && (
          <Pressable onPress={() => send(text)} accessibilityLabel={tr.common.send} style={styles.replySend}>
            <SendHorizontal size={20} color={brandInk} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * Full-screen stories, one person after the other. Tap the right side for the next story, the left
 * for the previous one, and hold to pause.
 */
export function StoryViewer({ groups, start, onClose }: { groups: StoryGroupDTO[]; start: number; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const meId = useSession((s) => s.user!.id);
  const [gi, setGi] = useState(start);
  const [si, setSi] = useState(() => firstUnseen(groups[start]!));
  const [elapsed, setElapsed] = useState(0);
  const progress = useRef(0);
  const show = useCallback((ms: number) => {
    progress.current = ms;
    setElapsed(ms);
  }, []);
  const [videoMs, setVideoMs] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replying, setReplying] = useState(false);
  const [width, setWidth] = useState(1);
  const group = groups[gi];
  const story = group?.stories[si];
  const mine = group?.user.id === meId;
  const [shownId, setShownId] = useState<string | null>(null);
  const imageLoading = story?.type === "image" && !!story.media?.url && shownId !== story.id;
  const loading = imageLoading || (story?.type === "video" && !!story.media?.url && videoMs === null);
  const stopped = paused || held || showViewers || deleting || replying || imageLoading;
  const length = story?.type === "video" ? (videoMs ?? Infinity) : STORY_SHOW_MS;

  const go = useCallback(
    (step: 1 | -1) => {
      show(0);
      setVideoMs(null);
      setShowViewers(false);
      const g = groups[gi]!;
      if (step === 1 && si < g.stories.length - 1) return setSi(si + 1);
      if (step === -1 && si > 0) return setSi(si - 1);
      const next = gi + step;
      if (next < 0) return;
      if (next >= groups.length) return onClose();
      setGi(next);
      setSi(step === 1 ? firstUnseen(groups[next]!) : groups[next]!.stories.length - 1);
    },
    [groups, gi, si, onClose, show],
  );
  const next = useCallback(() => go(1), [go]);
  const onVideoTime = useCallback(
    (ms: number, total: number) => {
      show(ms);
      setVideoMs(total);
    },
    [show],
  );

  useEffect(() => {
    if (!story || story.seen || mine) return;
    void six.api.POST("/v1/stories/{id}/view", { params: { path: { id: story.id } } });
    qc.setQueryData<StoryGroupDTO[]>(storiesKey, (old) =>
      old?.map((g) => ({ ...g, stories: g.stories.map((s) => (s.id === story.id ? { ...s, seen: true } : s)) })),
    );
  }, [story, mine, qc]);

  useEffect(() => {
    if (stopped || story?.type === "video") return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const ms = progress.current + now - last;
      last = now;
      if (ms >= STORY_SHOW_MS) go(1);
      else show(ms);
    }, 50);
    return () => clearInterval(timer);
  }, [stopped, story, go, show]);

  if (!group || !story) return null;
  const media = story.media;
  const stickers = {
    ask: story.ask,
    gif: story.gif && <StoryGif url={story.gif.url} />,
    location: story.location,
    showDate: story.showDate,
    showTime: story.showTime,
    at: story.createdAt,
    positions: story.positions ?? {},
  };

  async function remove() {
    await six.api.DELETE("/v1/stories/{id}", { params: { path: { id: story!.id } } });
    void qc.invalidateQueries({ queryKey: storiesKey });
    if (group!.stories.length === 1) onClose();
    else go(si === group!.stories.length - 1 ? -1 : 1);
  }

  return (
    <Modal animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.screen} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.center, media ? { backgroundColor: "#000" } : storyFill(story.background ?? brand)]}
          onPressIn={() => setHeld(true)}
          onPressOut={() => setHeld(false)}
          onLongPress={() => undefined}
          onPress={(e) => go(e.nativeEvent.pageX < width / 3 ? -1 : 1)}
          accessibilityLabel={tr.stories.next}
        >
          {story.type === "image" && media?.url && (
            <Image
              source={{ uri: media.url }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              onLoad={() => setShownId(story.id)}
              onError={() => setShownId(story.id)}
            />
          )}
          {story.type === "video" && media?.url && (
            <StoryVideo key={story.id} url={media.url} stopped={stopped} onTime={onVideoTime} onEnd={next} />
          )}
          {loading && <ActivityIndicator size="large" color="#fff" />}
          {media && !media.url && (
            <View style={{ alignItems: "center", gap: 12 }}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.dim}>{tr.stories.processing}</Text>
            </View>
          )}
          {!media && !!story.text && !story.fromChat && <Text style={styles.bigText}>{story.text}</Text>}
          {!media && !!story.text && story.fromChat && (
            <>
              <ChatBubbleCard text={story.text} bubble={story.bubble} quote={story.quote} />
              <FromChatLabel />
            </>
          )}
        </Pressable>
        {!loading && (
          <>
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <StoryStickers {...stickers} placed />
            </View>
            <StoryDrawingLayer drawing={story.drawing} />
          </>
        )}

        <KeyboardStickyView
          pointerEvents="box-none"
          offset={{ opened: Math.max(insets.bottom, 20) - 8 }}
          style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 20) }]}
        >
          {!loading && <StoryStickers {...stickers} placed={false} />}
          {!loading && !!media && !!story.text && <Text style={styles.caption}>{story.text}</Text>}
          {mine && (
            <Pressable onPress={() => setShowViewers(true)} style={styles.views}>
              <Eye size={16} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>{tr.stories.views(story.viewCount ?? 0)}</Text>
            </Pressable>
          )}
          {!mine && <ReplyBar key={story.id} story={story} owner={group.user} onTyping={setReplying} />}
        </KeyboardStickyView>

        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {group.stories.map((s, i) => (
              <View key={s.id} style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${i < si ? 100 : i > si ? 0 : Math.min(100, (elapsed / length) * 100)}%` },
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={styles.head}>
            <Avatar user={group.user} />
            <Text numberOfLines={1} style={styles.headName}>
              {mine ? tr.stories.yours : group.user.displayName}
              <Text style={styles.dim}>{"  "}{timeAgo(story.createdAt)}</Text>
            </Text>
            <Pressable onPress={() => setPaused((p) => !p)} accessibilityLabel={paused ? tr.stories.play : tr.stories.pause} hitSlop={8} style={styles.round}>
              {paused ? <Play size={22} color="#fff" /> : <Pause size={22} color="#fff" />}
            </Pressable>
            {mine && (
              <Pressable onPress={() => setDeleting(true)} accessibilityLabel={tr.stories.delete} hitSlop={8} style={styles.round}>
                <Trash2 size={22} color="#fff" />
              </Pressable>
            )}
            <Pressable onPress={onClose} accessibilityLabel={tr.common.close} hitSlop={8} style={styles.round}>
              <X size={26} color="#fff" />
            </Pressable>
          </View>
        </View>
        {showViewers && <Viewers storyId={story.id} onClose={() => setShowViewers(false)} />}
        {deleting && (
          <Sheet
            title={tr.stories.deleteConfirm}
            actions={[{ label: tr.stories.delete, destructive: true, onSelect: () => void remove() }]}
            onClose={() => setDeleting(false)}
          />
        )}
      </View>
    </Modal>
  );
}

function AskGif({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={styles.askMedia} contentFit="cover" nativeControls={false} />;
}

function StoryGif({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={styles.gif} contentFit="contain" nativeControls={false} />;
}

const styles = StyleSheet.create({
  chatCard: { maxWidth: "85%", marginHorizontal: 32, alignItems: "flex-start", gap: 8 },
  chatFrom: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%" },
  chatFromName: { flexShrink: 1, color: "#fff", fontSize: 14, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 4 },
  chatBubble: { maxWidth: "100%", borderRadius: 28, paddingHorizontal: 20, paddingVertical: 12, elevation: 6 },
  chatBubbleText: { fontSize: 20, lineHeight: 27 },
  chatTime: { marginTop: 4, alignSelf: "flex-end", fontSize: 12, opacity: 0.7 },
  fromChat: { position: "absolute", left: 0, right: 0, bottom: 110, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  fromChatText: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
  cover: { width: 56, height: 56, borderRadius: 28 },
  askCard: { width: 256, borderRadius: 16, overflow: "hidden", backgroundColor: "#fff", elevation: 4 },
  askPrompt: { color: "#fff", fontSize: 14, fontWeight: "700", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: brand },
  askMedia: { width: 256, height: 220 },
  askText: { color: stone[900], fontSize: 16, lineHeight: 22, fontWeight: "600", paddingHorizontal: 16, paddingVertical: 12 },
  handle: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  remove: { top: -10, left: -10 },
  resize: { right: -10, bottom: -10 },
  storyRing: { position: "absolute", top: -4, left: -4, right: -4, bottom: -4, borderRadius: 999, borderWidth: 2.5 },
  reply: { alignSelf: "stretch", gap: 8 },
  reactions: { flexDirection: "row", justifyContent: "center", gap: 4, minHeight: 44, alignItems: "center" },
  reaction: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  sent: { color: "#1c1917", backgroundColor: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "700", borderRadius: 999, overflow: "hidden", paddingHorizontal: 12, paddingVertical: 6 },
  replyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  replyInput: { flex: 1, color: "#fff", fontSize: 16, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.6)", backgroundColor: "rgba(0,0,0,0.2)", paddingHorizontal: 16, paddingVertical: 10 },
  replySend: { width: 44, height: 44, borderRadius: 22, backgroundColor: brand, alignItems: "center", justifyContent: "center" },
  bar: { gap: 16, paddingVertical: 4 },
  item: { width: 68, alignItems: "center", gap: 4 },
  ring: { padding: 3, borderRadius: 40 },
  ringGap: { padding: 2, borderRadius: 40 },
  plus: {
    position: "absolute",
    top: 84,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: brand,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 12, maxWidth: 68 },
  noteSlot: { height: 36, justifyContent: "flex-end", alignItems: "center" },
  screen: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center" },
  bigText: { color: "#fff", fontSize: 26, lineHeight: 34, fontWeight: "700", textAlign: "center", paddingHorizontal: 32 },
  top: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 8, paddingBottom: 20, backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)" },
  track: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#fff" },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  headName: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600" },
  round: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 48,
    backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
  },
  gif: { width: 200, height: 150 },
  caption: { color: "#fff", fontSize: 16, textAlign: "center" },
  views: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 12, paddingVertical: 6 },
  stickers: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 240,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: stone[900], fontSize: 14, fontWeight: "600", flexShrink: 1 },
  dim: { color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "400" },
  viewers: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "60%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "rgba(28,25,23,0.97)",
    padding: 16,
    gap: 8,
  },
  viewersHead: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  viewersTitle: { flex: 1, color: "#fff", fontSize: 17, fontWeight: "600" },
  viewerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  viewerReaction: { fontSize: 20, includeFontPadding: false },
  reactionCount: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700" },
});

export function FromChatLabel() {
  const tr = useT();
  return (
    <View pointerEvents="none" style={styles.fromChat}>
      <MessageCircle size={16} color="rgba(255,255,255,0.85)" />
      <Text style={styles.fromChatText}>{tr.stories.fromChat}</Text>
    </View>
  );
}

const DEFAULT_BUBBLE = `${chatTheme(null).light.bubble},${chatTheme(null).light.bubbleInk}`;

/** The first story background that doesn't share its colour with a chat bubble put on it. */
export const backgroundAround = (bubble: string | undefined) =>
  STORY_BACKGROUNDS.find((b) => !b.startsWith((bubble ?? DEFAULT_BUBBLE).split(",")[0]!)) ?? STORY_BACKGROUNDS[0];

export function ChatBubbleCard({ text, bubble, quote }: { text: string; bubble: string | null; quote: StoryDTO["quote"] }) {
  const [backgroundColor, color] = (bubble ?? DEFAULT_BUBBLE).split(",");
  return (
    <View style={styles.chatCard}>
      {quote && (
        <View style={styles.chatFrom}>
          <Avatar user={quote.from} size="sm" />
          <Text numberOfLines={1} style={styles.chatFromName}>
            {quote.from.displayName}
          </Text>
        </View>
      )}
      <View style={[styles.chatBubble, { backgroundColor }]}>
        <Text numberOfLines={6} ellipsizeMode="tail" style={[styles.chatBubbleText, { color }]}>
          {text}
        </Text>
        {quote && (
          <Text style={[styles.chatTime, { color }]}>
            {shortDate(quote.sentAt)} · {clockTime(quote.sentAt)}
          </Text>
        )}
      </View>
    </View>
  );
}
