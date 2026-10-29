import AsyncStorage from "@react-native-async-storage/async-storage";
import categories from "@six/shared/emojis.json";
import { Search, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Text, TextInput } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
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
  const tr = useT();
  const labels: Record<string, string> = tr.composer.emojiCategories;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<string>("recent");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const cell = Math.floor((Math.min(width, 520) - 16) / COLUMNS);

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

  const panel = (
    <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.head}>
        <View style={[styles.search, { backgroundColor: t.field }]}>
          <Search size={16} color={t.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tr.composer.searchEmoji}
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: t.text }]}
          />
        </View>
        <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
      </View>

      {!query && (
        <FlatList
          horizontal
          data={tabs}
          keyExtractor={(x) => x.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8, gap: 2 }}
          style={{ flexGrow: 0 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setTab(item.id)}
              accessibilityLabel={labels[item.id] ?? tr.composer.recent}
              style={[styles.tab, tab === item.id && { borderBottomColor: brand }]}
            >
              <Text style={{ fontSize: 22, opacity: tab === item.id ? 1 : 0.55 }}>{item.icon}</Text>
            </Pressable>
          )}
        />
      )}

      <FlatList
        key={query ? "search" : tab}
        data={data}
        numColumns={COLUMNS}
        keyExtractor={(e, i) => `${e}:${i}`}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={64}
        style={{ height: 300 }}
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
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.3)" }]} onPress={onClose} />
      <View style={styles.wrap} pointerEvents="box-none">
        {panel}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  panel: { width: "100%", maxWidth: 520, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 12, paddingRight: 4 },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  tab: { paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: "transparent" },
  empty: { textAlign: "center", padding: 24, fontSize: 14 },
});
