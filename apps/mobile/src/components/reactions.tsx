import { QUICK_REACTIONS, type MessageDTO, type ReactionGif, type StickerDTO, reactionGlyph } from "@six/shared";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Plus } from "lucide-react-native";
import { type ComponentRef, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { AnimatedEmoji } from "./animated-emoji";
import { Text } from "./text";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { EmojiPicker } from "./emoji-picker";
import { ExpressionPanel } from "./expression-panel";
import { StickerView } from "./sticker";
import { Card, SectionTitle, TextButton } from "./ui";

type Reaction = MessageDTO["reactions"][number];

/** What a sticker or GIF reaction shows, so it appears before the server answers. */
export type ReactionMedia = { sticker?: StickerDTO; gif?: ReactionGif };

function LoopingGif({ url, size }: { url: string; size: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={{ width: size, height: size, borderRadius: 4 }} contentFit="cover" nativeControls={false} />;
}

/** A reaction as it shows: the emoji, the sticker, or the GIF playing on a loop. */
export function ReactionFace({ r, size }: { r: Pick<Reaction, "emoji" | "sticker" | "gif">; size: number }) {
  if (r.sticker?.url) return <StickerView sticker={r.sticker} size={size} />;
  if (r.gif) {
    return /\.(webp|gif|png)(\?|$)/i.test(r.gif.url) ? (
      <Image source={{ uri: r.gif.url }} style={{ width: size, height: size, borderRadius: 4 }} contentFit="cover" />
    ) : (
      <LoopingGif url={r.gif.url} size={size} />
    );
  }
  return <Text style={{ fontSize: size * 0.8 }}>{reactionGlyph(r)}</Text>;
}

/** Every emoji, sticker and GIF to react with, in the composer's tabs, in a sheet over the chat. */
export function ReactionPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string, media?: ReactionMedia) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!open) return null;
  const gif = (g: { id: string; previewUrl: string; width: number; height: number }) =>
    onPick(`gif:${g.id}`, { gif: { url: g.previewUrl, width: g.width, height: g.height } });
  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.3)" }]} onPress={onClose} />
      <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
        <View style={{ height: 380, paddingBottom: insets.bottom, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" }}>
          <ExpressionPanel onEmoji={(e) => onPick(e)} onSticker={(s) => onPick(`sticker:${s.id}`, { sticker: s })} onGif={gif} onFoundSticker={gif} />
        </View>
      </View>
    </Modal>
  );
}

/** Your own quick reactions, or the app's when you haven't picked any. */
export function useQuickReactions(): readonly string[] {
  const own = useSession((s) => s.user?.quickReactions);
  return own?.length === QUICK_REACTIONS.length ? own : QUICK_REACTIONS;
}

/** Quick reactions plus a button for the full picker. Each emoji you already have is highlighted and toggles off. */
export function ReactionBar({
  mine,
  onPick,
  onMore,
}: {
  mine: string[];
  onPick: (emoji: string) => void;
  onMore: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const chosen = { backgroundColor: "rgba(235,138,0,0.2)" };
  const quick = useQuickReactions();
  return (
    <View style={styles.bar}>
      {quick.map((e) => (
        <Pressable
          key={e}
          onPress={() => onPick(e)}
          accessibilityLabel={mine.includes(e) ? tr.messages.removeReaction(e) : tr.messages.reactWith(e)}
          style={({ pressed }) => [styles.quick, mine.includes(e) && chosen, pressed && { backgroundColor: t.pressed }]}
        >
          <Text style={{ fontSize: 24 }}>{e}</Text>
        </Pressable>
      ))}
      <Pressable
        onPress={onMore}
        accessibilityLabel={tr.messages.moreReactions}
        style={[styles.quick, { backgroundColor: t.field }]}
      >
        <Plus size={20} color={t.textSoft} />
      </Pressable>
    </View>
  );
}

/** A reaction shown big (an emoji plays its animation), with who used it and a button to add or take off yours. */
function MediaPreview({
  r,
  own,
  names,
  onToggle,
  onClose,
}: {
  r: Reaction;
  own: boolean;
  names: string;
  onToggle: () => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.4)" }]} onPress={onClose} />
      <View style={{ flex: 1, justifyContent: "flex-end", padding: 12, paddingBottom: Math.max(insets.bottom, 12) }} pointerEvents="box-none">
        <View style={{ backgroundColor: t.surface, borderRadius: 24, padding: 12, gap: 10, alignItems: "center" }}>
          {r.gif || r.sticker ? <ReactionFace r={r} size={240} /> : <AnimatedEmoji emoji={r.emoji} size={180} />}
          <Text numberOfLines={2} style={{ color: t.textSoft, fontSize: 14, textAlign: "center" }}>
            {names}
          </Text>
          <Pressable
            onPress={() => {
              onToggle();
              onClose();
            }}
            style={{ alignSelf: "stretch", borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: own ? t.dangerBg : "rgba(235,138,0,0.18)" }}
          >
            <Text style={{ color: own ? t.danger : t.text, fontSize: 15, fontWeight: "700" }}>
              {own ? tr.messages.removeMine : tr.messages.reactWithThis}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ r, own, onPress }: { r: Reaction; own: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: t.surface, borderColor: t.border },
        own && { backgroundColor: t.dark ? "#3b2a12" : "#fdebd0", borderColor: brand },
      ]}
    >
      <ReactionFace r={r} size={18} />
      {!!r.gif && <Text style={{ color: t.textSoft, fontSize: 10, fontWeight: "800" }}>GIF</Text>}
      {r.userIds.length > 1 && (
        <Text style={{ color: t.textSoft, fontSize: 12, fontWeight: "600" }}>{r.userIds.length}</Text>
      )}
    </Pressable>
  );
}

const LIST_WIDTH = 260;

/** The reactions hidden behind the "+X" pill, anchored to it. Tapping a row toggles that emoji for you. */
function ReactionList({
  anchor,
  reactions,
  meId,
  nameOf,
  onReact,
  onClose,
}: {
  anchor: Anchor;
  reactions: Reaction[];
  meId: string;
  nameOf: (id: string) => string;
  onReact: (emoji: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screen, height: screenH } = useWindowDimensions();
  const height = Math.min(320, reactions.length * 40 + 12);
  const below = anchor.y + anchor.height + 6;
  const top = below + height <= screenH - insets.bottom - 8 ? below : Math.max(insets.top + 8, anchor.y - height - 6);
  const left = Math.min(Math.max(anchor.x, 8), screen - LIST_WIDTH - 8);

  return (
    <Modal transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        entering={ZoomIn.duration(140)}
        style={[styles.list, { top, left, height, backgroundColor: t.surface }]}
      >
        <ScrollView contentContainerStyle={{ paddingVertical: 6 }}>
          {reactions.map((r) => {
            const own = r.userIds.includes(meId);
            return (
              <Pressable
                key={r.emoji}
                onPress={() => onReact(r.emoji)}
                style={({ pressed }) => [
                  styles.row,
                  own && { backgroundColor: "rgba(235,138,0,0.1)" },
                  pressed && { backgroundColor: t.pressed },
                ]}
              >
                <ReactionFace r={r} size={24} />
                <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 14 }}>
                  {r.userIds.map(nameOf).join(", ")}
                </Text>
                {r.userIds.length > 1 && (
                  <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>{r.userIds.length}</Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

/**
 * Reaction chips under a bubble, most popular first. Past four kinds, the top three show and a "+X"
 * pill opens the full list. Tapping a chip toggles that emoji for you.
 */
export function ReactionChips({
  reactions,
  meId,
  mine,
  nameOf,
  onReact,
}: {
  reactions: Reaction[];
  meId: string;
  mine: boolean;
  nameOf: (id: string) => string;
  onReact: (emoji: string) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const more = useRef<ComponentRef<typeof Pressable>>(null);
  const [listAt, setListAt] = useState<Anchor | null>(null);
  const [gifFor, setGifFor] = useState<string | null>(null);
  if (!reactions.length) return null;

  const sorted = reactions
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.userIds.length - a.r.userIds.length || a.i - b.i)
    .map((x) => x.r);
  const shown = sorted.length <= 4 ? sorted : sorted.slice(0, 3);
  const hidden = sorted.length - shown.length;
  if (listAt && hidden === 0) setListAt(null);

  return (
    <View
      style={[
        styles.chips,
        { justifyContent: mine ? "flex-end" : "flex-start", width: 0, minWidth: "100%", alignSelf: "stretch" },
      ]}
    >
      {shown.map((r) => (
        <Chip key={r.emoji} r={r} own={r.userIds.includes(meId)} onPress={() => setGifFor(r.emoji)} />
      ))}
      {hidden > 0 && (
        <Pressable
          ref={more}
          onPress={() =>
            more.current?.measureInWindow((x, y, width, height) => setListAt({ x, y, width, height }))
          }
          accessibilityLabel={tr.messages.nMoreReactions(hidden)}
          style={[styles.chip, { backgroundColor: t.surface, borderColor: t.border }]}
        >
          <Text style={{ color: t.textSoft, fontSize: 12, fontWeight: "700" }}>+{hidden}</Text>
        </Pressable>
      )}
      {gifFor &&
        (() => {
          const r = reactions.find((x) => x.emoji === gifFor);
          return (
            r && (
              <MediaPreview
                r={r}
                own={r.userIds.includes(meId)}
                names={r.userIds.map(nameOf).join(", ")}
                onToggle={() => onReact(r.emoji)}
                onClose={() => setGifFor(null)}
              />
            )
          );
        })()}
      {listAt && hidden > 0 && (
        <ReactionList
          anchor={listAt}
          reactions={sorted.slice(shown.length)}
          meId={meId}
          nameOf={nameOf}
          onReact={onReact}
          onClose={() => setListAt(null)}
        />
      )}
    </View>
  );
}

export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The reaction bar floating just above (or below, when there is no room) the long-pressed bubble. */
export function ReactionPopover({
  anchor,
  alignRight,
  mine,
  onPick,
  onMore,
  sheetTop,
}: {
  anchor: Anchor;
  alignRight: boolean;
  mine: string[];
  onPick: (emoji: string) => void;
  onMore: () => void;
  sheetTop: number;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screen } = useWindowDimensions();
  const [size, setSize] = useState({ width: 330, height: 52 });

  const above = anchor.y - size.height - 8;
  const top = Math.min(above >= insets.top + 8 ? above : anchor.y + anchor.height + 8, sheetTop - size.height - 8);
  const preferred = alignRight ? anchor.x + anchor.width - size.width : anchor.x;
  const left = Math.min(Math.max(preferred, 8), screen - size.width - 8);

  return (
    <Animated.View
      entering={ZoomIn.duration(140)}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      style={[styles.popover, { top, left, backgroundColor: t.surface }]}
    >
      <ReactionBar mine={mine} onPick={onPick} onMore={onMore} />
    </Animated.View>
  );
}

/** Settings card for your six quick reactions: tap one to swap it for any emoji. */
export function QuickReactionsSettings() {
  const t = useTheme();
  const tr = useT();
  const quick = useQuickReactions();
  const setUser = useSession((s) => s.setUser);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(next: readonly string[]) {
    setSaving(true);
    const res = await six.api.PATCH("/v1/me", { body: { quickReactions: [...next] } }).catch(() => null);
    if (res?.data) setUser(res.data);
    setSaving(false);
  }

  function pick(index: number, emoji: string) {
    const next = [...quick];
    const was = next.indexOf(emoji);
    if (was >= 0) next[was] = next[index]!;
    next[index] = emoji;
    void save(next);
  }

  return (
    <View>
      <SectionTitle
        action={
          quick.join() !== QUICK_REACTIONS.join() && (
            <TextButton title={tr.messages.resetQuickReactions} disabled={saving} onPress={() => void save(QUICK_REACTIONS)} />
          )
        }
      >
        {tr.messages.quickReactions}
      </SectionTitle>
      <Card style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: t.muted, fontSize: 13 }}>{tr.messages.quickReactionsHint}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {quick.map((emoji, i) => (
            <Pressable
              key={emoji}
              disabled={saving}
              onPress={() => setEditing(i)}
              accessibilityLabel={tr.messages.changeQuickReaction(emoji)}
              style={({ pressed }) => [styles.quick, { width: 46, height: 46, borderRadius: 23, backgroundColor: pressed ? t.pressed : t.field }]}
            >
              <Text style={{ fontSize: 26 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <EmojiPicker
        open={editing !== null}
        onClose={() => setEditing(null)}
        onPick={(emoji) => {
          if (editing !== null) pick(editing, emoji);
          setEditing(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 2 },
  quick: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 2, marginBottom: 6, paddingHorizontal: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  list: {
    position: "absolute",
    width: LIST_WIDTH,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, height: 40, paddingHorizontal: 12 },
  popover: {
    position: "absolute",
    borderRadius: 999,
    padding: 6,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
});
