import { QUICK_REACTIONS, type MessageDTO } from "@six/shared";
import { Plus } from "lucide-react-native";
import { type ComponentRef, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, useTheme } from "@/lib/theme";

type Reaction = MessageDTO["reactions"][number];

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
  const chosen = { backgroundColor: "rgba(235,138,0,0.2)" };
  return (
    <View style={styles.bar}>
      {QUICK_REACTIONS.map((e) => (
        <Pressable
          key={e}
          onPress={() => onPick(e)}
          accessibilityLabel={mine.includes(e) ? `Remove ${e}` : `React ${e}`}
          style={({ pressed }) => [styles.quick, mine.includes(e) && chosen, pressed && { backgroundColor: t.pressed }]}
        >
          <Text style={{ fontSize: 24 }}>{e}</Text>
        </Pressable>
      ))}
      <Pressable
        onPress={onMore}
        accessibilityLabel="More reactions"
        style={[styles.quick, { backgroundColor: t.field }]}
      >
        <Plus size={20} color={t.textSoft} />
      </Pressable>
    </View>
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
      <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
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
                <Text style={{ fontSize: 20 }}>{r.emoji}</Text>
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
  const more = useRef<ComponentRef<typeof Pressable>>(null);
  const [listAt, setListAt] = useState<Anchor | null>(null);
  if (!reactions.length) return null;

  const sorted = reactions
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.userIds.length - a.r.userIds.length || a.i - b.i)
    .map((x) => x.r);
  const shown = sorted.length <= 4 ? sorted : sorted.slice(0, 3);
  const hidden = sorted.length - shown.length;
  if (listAt && hidden === 0) setListAt(null);

  return (
    <View style={[styles.chips, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
      {shown.map((r) => (
        <Chip key={r.emoji} r={r} own={r.userIds.includes(meId)} onPress={() => onReact(r.emoji)} />
      ))}
      {hidden > 0 && (
        <Pressable
          ref={more}
          onPress={() =>
            more.current?.measureInWindow((x, y, width, height) => setListAt({ x, y, width, height }))
          }
          accessibilityLabel={`${hidden} more reactions`}
          style={[styles.chip, { backgroundColor: t.surface, borderColor: t.border }]}
        >
          <Text style={{ color: t.textSoft, fontSize: 12, fontWeight: "700" }}>+{hidden}</Text>
        </Pressable>
      )}
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
}: {
  anchor: Anchor;
  alignRight: boolean;
  mine: string[];
  onPick: (emoji: string) => void;
  onMore: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screen } = useWindowDimensions();
  const [size, setSize] = useState({ width: 330, height: 52 });

  const above = anchor.y - size.height - 8;
  const top = above >= insets.top + 8 ? above : anchor.y + anchor.height + 8;
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

const styles = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 2 },
  quick: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: -10, marginBottom: 6, paddingHorizontal: 6 },
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
