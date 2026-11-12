import { unwrap } from "@six/sdk";
import type { GifDTO, StickerDTO } from "@six/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Smile, Sticker } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { EmojiGrid, useSearching } from "./emoji-picker";
import { StickerView } from "./sticker";
import { Text, TextInput } from "./text";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";

type Tab = "emoji" | "sticker" | "gif";
const HEIGHT = 300;

function useDebounced(value: string) {
  const [q, setQ] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setQ(value.trim()), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return q;
}

function useFound(q: string, kind: "gif" | "sticker", enabled = true) {
  return useInfiniteQuery({
    queryKey: ["gifs-grid", kind, q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/gifs", { params: { query: { q: q || undefined, kind, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30 * 60_000,
    retry: false,
    enabled,
  });
}

function Search({
  value,
  onChange,
  placeholder,
  field,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  field: ReturnType<typeof useSearching>["field"];
}) {
  const t = useTheme();
  return (
    <TextInput
      {...field}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.muted}
      autoCapitalize="none"
      autoCorrect={false}
      style={[styles.search, { backgroundColor: t.field, color: t.text }]}
    />
  );
}

function Stickers({ onSticker, onSearching, cell }: { onSticker: (s: StickerDTO) => void; onSearching: (on: boolean) => void; cell: number }) {
  const t = useTheme();
  const tr = useT();
  const { searching, field } = useSearching(onSearching);
  const [input, setInput] = useState("");
  const q = useDebounced(input);
  const packs = useQuery({
    queryKey: ["sticker-packs"],
    queryFn: async () => unwrap(await six.api.GET("/v1/sticker-packs")).items,
    enabled: !q,
  });
  const own = useQuery({
    queryKey: ["sticker-search", q],
    queryFn: async () => unwrap(await six.api.GET("/v1/stickers/search", { params: { query: { q } } })).items,
    enabled: !!q,
    staleTime: 60_000,
  });
  const tile = (s: StickerDTO) => (
    <Pressable key={s.id} onPress={() => onSticker(s)} style={{ width: cell, height: cell, alignItems: "center", justifyContent: "center" }}>
      <StickerView sticker={s} size={cell - 8} />
    </Pressable>
  );

  if (searching) {
    const row = q ? (own.data ?? []) : (packs.data ?? []).flatMap((p) => p.stickers);
    return (
      <View>
        <Search value={input} onChange={setInput} placeholder={tr.composer.searchStickers} field={field} />
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={{ height: cell }} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {row.map(tile)}
          {q && own.data?.length === 0 && <Text style={[styles.empty, { color: t.muted, padding: 12 }]}>{tr.composer.noStickersFound}</Text>}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ height: HEIGHT }}>
      <Search value={input} onChange={setInput} placeholder={tr.composer.searchStickers} field={field} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}>
        {q ? (
          <View style={styles.grid}>
            {own.data?.map(tile)}
            {own.data?.length === 0 && <Text style={[styles.empty, { color: t.muted, width: "100%" }]}>{tr.composer.noStickersFound}</Text>}
          </View>
        ) : (
          packs.data?.map((p) => (
            <View key={p.id}>
              <Text style={[styles.packTitle, { color: t.muted }]}>{p.title}</Text>
              <View style={styles.grid}>{p.stickers.map(tile)}</View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/** GIPHY and KLIPY: GIFs, or their stickers, which go out like a picture and aren't one of our stickers. */
function Gifs({
  onGif,
  onSticker,
  onSearching,
  width,
}: {
  onGif: (g: GifDTO) => void;
  onSticker: (g: GifDTO) => void;
  onSearching: (on: boolean) => void;
  width: number;
}) {
  const t = useTheme();
  const tr = useT();
  const { searching, field } = useSearching(onSearching);
  const [input, setInput] = useState("");
  const [kind, setKind] = useState<"gif" | "sticker">("gif");
  const q = useDebounced(input);
  const gifs = useFound(q, kind);
  const items = gifs.data?.pages.flatMap((p) => p.items) ?? [];
  const columns = kind === "gif" ? 3 : 4;
  const cell = Math.floor((width - 16 - (columns - 1) * 4) / columns);
  return (
    <View style={searching ? undefined : { height: HEIGHT }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Search value={input} onChange={setInput} placeholder={tr.ask.searchGifs} field={field} />
        </View>
        <View style={[styles.kinds, { backgroundColor: t.field }]}>
          {(["gif", "sticker"] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              accessibilityState={{ selected: kind === k }}
              style={[styles.kind, kind === k && { backgroundColor: t.surface }]}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: kind === k ? brand : t.muted }}>{k === "gif" ? "Giphy" : "Klipy"}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        key={searching ? `${kind}-row` : kind}
        data={items}
        horizontal={searching}
        numColumns={searching ? undefined : columns}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(g) => g.id}
        keyboardShouldPersistTaps="handled"
        style={searching ? { height: cell, flexGrow: 0 } : undefined}
        contentContainerStyle={{ paddingHorizontal: 8, gap: 4 }}
        columnWrapperStyle={searching ? undefined : { gap: 4 }}
        onEndReached={() => gifs.hasNextPage && !gifs.isFetchingNextPage && void gifs.fetchNextPage()}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: t.muted }]}>
            {gifs.isPending ? tr.common.loading : gifs.isError ? tr.composer.couldNotLoadGifs : tr.composer.noGifs}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => (kind === "gif" ? onGif : onSticker)(item)}
            style={{ width: cell, height: cell, borderRadius: 8, overflow: "hidden", backgroundColor: kind === "gif" ? t.field : undefined }}
          >
            <Image source={{ uri: item.previewUrl }} style={StyleSheet.absoluteFill} contentFit={kind === "gif" ? "cover" : "contain"} />
          </Pressable>
        )}
      />
      {!searching && <Text style={[styles.powered, { color: t.faint }]}>{tr.composer.poweredByGiphy}</Text>}
    </View>
  );
}

/** Emoji, stickers and GIFs in tabs, under the message box where the keyboard was. */
export function ExpressionPanel({
  onEmoji,
  onSticker,
  onFoundSticker,
  onGif,
}: {
  onEmoji: (emoji: string) => void;
  onSticker: (sticker: StickerDTO) => void;
  onFoundSticker: (sticker: GifDTO) => void;
  onGif: (gif: GifDTO) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const { width } = useWindowDimensions();
  const [picked, setTab] = useState<Tab>("emoji");
  const [searching, setSearching] = useState(false);
  const packs = useQuery({ queryKey: ["sticker-packs"], queryFn: async () => unwrap(await six.api.GET("/v1/sticker-packs")).items });
  const hasStickers = !!packs.data?.some((p) => p.stickers.length > 0);
  const tab = picked === "sticker" && !hasStickers ? "emoji" : picked;
  const tabs: { id: Tab; label: string }[] = [
    { id: "emoji", label: tr.composer.pickerTabs.emoji },
    ...(hasStickers ? [{ id: "sticker" as const, label: tr.composer.pickerTabs.sticker }] : []),
    { id: "gif", label: tr.composer.pickerTabs.gif },
  ];

  return (
    <View style={{ backgroundColor: t.surface, paddingTop: 6 }}>
      <View style={[styles.tabs, { backgroundColor: t.field }, searching && { display: "none" }]}>
        {tabs.map((x) => (
          <Pressable
            key={x.id}
            onPress={() => setTab(x.id)}
            accessibilityRole="tab"
            accessibilityLabel={x.label}
            accessibilityState={{ selected: tab === x.id }}
            style={[styles.tab, tab === x.id && { backgroundColor: t.surface }]}
          >
            {x.id === "emoji" ? (
              <Smile size={20} color={tab === x.id ? brand : t.muted} />
            ) : x.id === "sticker" ? (
              <Sticker size={20} color={tab === x.id ? brand : t.muted} />
            ) : (
              <Text style={{ fontWeight: "800", fontSize: 13, color: tab === x.id ? brand : t.muted }}>GIF</Text>
            )}
          </Pressable>
        ))}
      </View>
      {tab === "emoji" && <EmojiGrid onPick={onEmoji} onSearching={setSearching} height={HEIGHT - 50} />}
      {tab === "sticker" && <Stickers onSticker={onSticker} onSearching={setSearching} cell={Math.floor((width - 16) / 4)} />}
      {tab === "gif" && <Gifs onGif={onGif} onSticker={onFoundSticker} onSearching={setSearching} width={width} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", marginHorizontal: 12, marginBottom: 6, borderRadius: 999, padding: 3 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", height: 34, borderRadius: 999 },
  search: { marginHorizontal: 8, marginBottom: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  row: { flexDirection: "row", alignItems: "flex-start", paddingRight: 8, gap: 0 },
  kinds: { flexDirection: "row", borderRadius: 999, padding: 2, marginTop: 2 },
  kind: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  packTitle: { fontSize: 12, fontWeight: "600", paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4 },
  empty: { textAlign: "center", padding: 24, fontSize: 14 },
  powered: { fontSize: 11, paddingHorizontal: 12, paddingVertical: 2 },
});
