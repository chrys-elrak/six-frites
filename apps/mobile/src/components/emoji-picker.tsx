import AsyncStorage from "@react-native-async-storage/async-storage";
import categories from "@six/shared/emojis.json";
import { Search, X } from "lucide-react-native";
import { type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Keyboard, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Modal } from "./modal";
import { Text, TextInput } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { useLatest } from "@/lib/latest";
import { brand, useTheme } from "@/lib/theme";
import { IconButton } from "./ui";

interface Emoji {
  e: string;
  n: string;
  k: string;
}

const RECENT_KEY = "six:recent-emoji";
const COLUMNS = 8;

const all = (categories as { title: string; data: Emoji[] }[]).flatMap((c) => c.data);

/**
 * Search, category tabs and the grid of emoji, remembering the recent ones; swiping the grid sideways moves to the next
 * or previous category. With `onClose`, a close button too.
 */
/** How tall a picker's results are while the keyboard is up. */
export const SEARCHING_HEIGHT = 170;

/**
 * Whether someone is typing in a picker's search field: it has focus and the keyboard is up. Pickers then get shorter
 * and drop their tabs, so the keyboard doesn't cover the results; `onChange` hears about it.
 */
export function useSearching(onChange?: (searching: boolean) => void) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(Keyboard.isVisible());
  useEffect(() => {
    const up = Keyboard.addListener("keyboardDidShow", () => setShown(true));
    const down = Keyboard.addListener("keyboardDidHide", () => setShown(false));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);
  const searching = focused && shown;
  const report = useLatest(onChange);
  useEffect(() => report.current?.(searching), [searching, report]);
  return { searching, field: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) } };
}

/**
 * A search box's one-line input. On iOS the placeholder is our own text behind it: the emoji, sticker and GIF searches
 * reuse one native field, and a reused field draws its own placeholder several points too low.
 */
export function SearchInput({ placeholder, style, ...props }: ComponentProps<typeof TextInput> & { placeholder: string }) {
  const t = useTheme();
  const own = Platform.OS === "ios";
  return (
    <View style={{ flex: 1 }}>
      {own && !props.value && (
        <Text numberOfLines={1} style={[style, styles.placeholder, { color: t.muted }]}>
          {placeholder}
        </Text>
      )}
      <TextInput
        {...props}
        placeholder={own ? undefined : placeholder}
        placeholderTextColor={t.muted}
        accessibilityLabel={placeholder}
        style={style}
      />
    </View>
  );
}

export function EmojiGrid({
  onPick,
  onClose,
  onSearching,
  height = 300,
}: {
  onPick: (emoji: string) => void;
  onClose?: () => void;
  onSearching?: (searching: boolean) => void;
  height?: number;
}) {
  const t = useTheme();
  const tr = useT();
  const labels: Record<string, string> = tr.composer.emojiCategories;
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<string>("recent");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const cell = Math.floor((Math.min(width, 520) - 16) / COLUMNS);
  const { searching, field } = useSearching(onSearching);

  useEffect(() => {
    void AsyncStorage.getItem(RECENT_KEY)
      .then((saved) => {
        const list = saved ? (JSON.parse(saved) as string[]) : [];
        setRecent(list);
        if (!list.length) setTab("smileys_emotion");
      })
      .catch(() => setTab("smileys_emotion"));
  }, []);

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return all.filter((x) => x.n.includes(q) || x.k.includes(q)).map((x) => x.e);
    if (tab === "recent") return recent;
    return (categories as { title: string; data: Emoji[] }[]).find((c) => c.title === tab)?.data.map((x) => x.e) ?? [];
  }, [query, tab, recent]);

  function pick(emoji: string) {
    onPick(emoji);
    const next = [emoji, ...recent.filter((x) => x !== emoji)].slice(0, 32);
    setRecent(next);
    void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => null);
  }

  const tabs = [
    ...(recent.length ? [{ id: "recent", icon: "🕘" }] : []),
    ...(categories as { title: string; data: Emoji[] }[]).map((c) => ({ id: c.title, icon: c.data[0]?.e ?? "" })),
  ];
  const moved = useRef(0);
  const dx = useSharedValue(0);
  const sliding = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }],
    opacity: 1 - Math.min(Math.abs(dx.value) / 200, 0.5),
  }));
  const latest = useLatest({ tabs, tab });

  /** Shows another category, sliding it in from the side it comes from. */
  function go(id: string) {
    const { tabs, tab } = latest.current;
    const from = tabs.findIndex((x) => x.id === tab);
    const to = tabs.findIndex((x) => x.id === id);
    if (to < 0 || to === from) {
      dx.set(withTiming(0, { duration: 200 }));
      return;
    }
    setTab(id);
    dx.set(to > from ? 60 : -60);
    dx.set(withTiming(0, { duration: 240 }));
  }

  const swipe = usePanGesture({
    enabled: !query,
    runOnJS: true,
    activeOffsetX: [-20, 20],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      moved.current = e.translationX;
      dx.set(e.translationX * 0.4);
    },
    onFinalize: () => {
      const { tabs, tab } = latest.current;
      const at = tabs.findIndex((x) => x.id === tab);
      const to = tabs[moved.current <= -50 ? at + 1 : moved.current >= 50 ? at - 1 : -1];
      moved.current = 0;
      go(to?.id ?? tab);
    },
  });

  return (
    <View>
      <View style={styles.head}>
        <View style={[styles.search, { backgroundColor: t.field }]}>
          <Search size={16} color={t.muted} />
          <SearchInput
            value={query}
            onChangeText={setQuery}
            placeholder={tr.composer.searchEmoji}
            autoCapitalize="none"
            autoCorrect={false}
            {...field}
            style={[styles.searchInput, { color: t.text }]}
          />
        </View>
        {onClose && <IconButton Icon={X} label={tr.common.close} onPress={onClose} />}
      </View>

      {!query && !searching && (
        <FlatList
          horizontal
          data={tabs}
          keyExtractor={(x) => x.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8, gap: 2 }}
          style={{ flexGrow: 0 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => go(item.id)}
              accessibilityLabel={labels[item.id] ?? tr.composer.recent}
              style={[styles.tab, tab === item.id && { borderBottomColor: brand }]}
            >
              <Text style={{ fontSize: 22, opacity: tab === item.id ? 1 : 0.55 }}>{item.icon}</Text>
            </Pressable>
          )}
        />
      )}

      <GestureDetector gesture={swipe}>
        <Animated.View style={sliding}>
          <FlatList
            key={query ? "search" : tab}
            data={data}
            numColumns={COLUMNS}
            keyExtractor={(e, i) => `${e}:${i}`}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={64}
            style={{ height: searching ? SEARCHING_HEIGHT : height }}
            contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 6 }}
            ListEmptyComponent={<Text style={[styles.empty, { color: t.muted }]}>{tr.composer.noEmoji}</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pick(item)}
                style={({ pressed }) => [
                  { width: cell, height: cell, alignItems: "center", justifyContent: "center", borderRadius: 8 },
                  pressed && { backgroundColor: t.pressed },
                ]}
              >
                <Text style={{ fontSize: cell * 0.6 }}>{item}</Text>
              </Pressable>
            )}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** Slides up over the screen to pick a reaction. */
export function EmojiPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const panel = (
    <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 8) }]}>
      <EmojiGrid onPick={onPick} onClose={onClose} />
    </View>
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.3)" }]} onPress={onClose} />
        <View style={styles.wrap} pointerEvents="box-none">
          {panel}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  panel: { width: "100%", maxWidth: 520, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 12, paddingRight: 4 },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { fontSize: 16, paddingVertical: 0 },
  placeholder: { position: "absolute", left: 0, right: 0 },
  tab: { paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: "transparent" },
  empty: { textAlign: "center", padding: 24, fontSize: 14 },
});
