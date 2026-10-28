import { unwrap } from "@six/sdk";
import { type ChatDTO, findInText, maskSpoilers, messageLinks, previewText } from "@six/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CalendarDays, MessageSquareText, Search as SearchIcon, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Linking,
  type ListViewToken,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHydratedMessages } from "@/lib/e2ee";
import { dayLabel, listTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { AlbumViewer, AttachmentView, type LightboxItem, lightboxItem, type ShownAttachment } from "./attachment";
import { DateRangeDialog } from "./scheduled";
import { IconButton, ScreenHeader } from "./ui";

export type SharedTab = "search" | "media" | "files" | "links";
type Range = { from?: string; to?: string };

const ONLY = { search: "text", media: "media", files: "files", links: "links" } as const;
const VIEWABILITY = { itemVisiblePercentThreshold: 1 };

/** One tab's messages, decrypted as they scroll into view (or all of them, with `seeAll`). */
function useShared(chatId: string, tab: SharedTab, range: Range, { seeAll = false, enabled = true } = {}) {
  const meId = useSession((s) => s.user!.id);
  const only = ONLY[tab];
  const query = useInfiniteQuery({
    queryKey: ["shared", chatId, only, range.from ?? null, range.to ?? null],
    initialPageParam: undefined as string | undefined,
    enabled,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await six.api.GET("/v1/chats/{id}/messages", {
          params: {
            path: { id: chatId },
            query: { only, limit: tab === "media" || tab === "files" ? 60 : 100, cursor: pageParam, ...range },
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const { shown, see } = useHydratedMessages(meId, items);
  const seeRef = useRef(see);
  seeRef.current = see;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) =>
    seeRef.current(viewableItems.map((v) => (v.item as { id: string }).id)),
  ).current;
  useEffect(() => {
    if (seeAll) see(items.map((m) => m.id));
  }, [seeAll, see, items]);
  const more = () => void (query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage());
  const decrypting = shown.some((m) => m.decrypting);
  return { query, shown, onViewable, more, decrypting };
}

function Footer({ query, count, empty }: { query: ReturnType<typeof useShared>["query"]; count: number; empty: string }) {
  const t = useTheme();
  const tr = useT();
  const label = query.isPending || query.isFetchingNextPage ? tr.common.loading : count === 0 ? empty : null;
  return label ? <Text style={[styles.status, { color: t.muted }]}>{label}</Text> : null;
}

function Mine({ onPhoto = false }: { onPhoto?: boolean }) {
  const tr = useT();
  return (
    <View pointerEvents="none" style={[styles.mine, onPhoto && styles.mineOnPhoto]}>
      <Text style={[styles.mineText, onPhoto && { color: "#fff" }]}>{tr.common.you}</Text>
    </View>
  );
}

function ShowInChat({ onPress }: { onPress: () => void }) {
  const tr = useT();
  return <IconButton Icon={MessageSquareText} label={tr.chat.showInChat} size={20} onPress={onPress} />;
}

function Search({ chat, range, onJump }: { chat: ChatDTO; range: Range; onJump: (id: string) => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const meId = useSession((s) => s.user!.id);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);
  const active = !!q || !!range.from;
  const { query, shown, more, decrypting } = useShared(chat.id, "search", range, { seeAll: true, enabled: active });
  const names = new Map(chat.members.map((m) => [m.user.id, m.user.displayName]));
  const hits = shown.flatMap((m) => {
    if (m.undecryptable || m.decrypting) return [];
    if (!q) return [{ m, before: previewText(m, tr), match: "", after: "" }];
    const hit = findInText(m.spoiler && m.type === "text" ? "" : maskSpoilers(m.text ?? "", m.entities), q);
    return hit ? [{ m, ...hit }] : [];
  });
  const oldest = shown.at(-1)?.createdAt;

  useEffect(() => {
    if (active && hits.length < 30 && !decrypting) more();
  });

  return (
    <>
      <View style={[styles.search, { backgroundColor: t.field }]}>
        <SearchIcon size={16} color={t.muted} />
        <TextInput
          autoFocus
          value={input}
          onChangeText={setInput}
          placeholder={tr.chat.searchMessages}
          placeholderTextColor={t.muted}
          accessibilityLabel={tr.chat.searchMessages}
          style={[styles.searchInput, { color: t.text }]}
        />
      </View>
      {!active ? (
        <Text style={[styles.status, { color: t.muted }]}>{tr.chat.searchHint}</Text>
      ) : (
        <FlatList
          data={hits}
          keyExtractor={(h) => h.m.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          onEndReachedThreshold={0.5}
          onEndReached={more}
          renderItem={({ item: h }) => (
            <Pressable
              onPress={() => onJump(h.m.id)}
              style={({ pressed }) => [styles.hit, { borderColor: t.border }, pressed && { backgroundColor: t.pressed }]}
            >
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: "500" }}>
                  {h.m.senderId === meId ? tr.common.you : (names.get(h.m.senderId) ?? tr.common.someone)}
                </Text>
                <Text style={[styles.date, { color: t.muted }]}>{listTime(h.m.createdAt)}</Text>
              </View>
              <Text numberOfLines={2} style={{ color: t.textSoft, fontSize: 14 }}>
                {h.before}
                {h.match ? <Text style={styles.mark}>{h.match}</Text> : null}
                {h.after}
              </Text>
            </Pressable>
          )}
          ListFooterComponent={
            <>
              {query.hasNextPage && oldest && (
                <Text style={[styles.progress, { color: t.muted }]}>{tr.chat.searchedBack(dayLabel(oldest))}</Text>
              )}
              <Footer query={query} count={hits.length} empty={tr.chat.noResults} />
            </>
          }
        />
      )}
    </>
  );
}

function Media({ chat, range, onJump }: { chat: ChatDTO; range: Range; onJump: (id: string) => void }) {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const meId = useSession((s) => s.user!.id);
  const { query, shown, onViewable, more } = useShared(chat.id, "media", range);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [album, setAlbum] = useState<{ items: LightboxItem[]; ids: string[]; start: number } | null>(null);
  const side = Math.floor((width - 4) / 3);
  const media = shown.filter((m) => m.attachment && !m.undecryptable);
  const attachments: ShownAttachment[] = media.map((m) => ({ source: "server", data: m.attachment! }));

  function open(i: number) {
    const ready = attachments.flatMap((a, j) => {
      const item = lightboxItem(a);
      return item ? [{ item, id: media[j]!.id }] : [];
    });
    const start = ready.findIndex((r) => r.id === media[i]!.id);
    if (start >= 0) setAlbum({ items: ready.map((r) => r.item), ids: ready.map((r) => r.id), start });
  }

  return (
    <>
      <FlatList
        data={media}
        numColumns={3}
        keyExtractor={(m) => m.id}
        columnWrapperStyle={{ gap: 2 }}
        contentContainerStyle={{ gap: 2, paddingBottom: insets.bottom }}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={VIEWABILITY}
        onEndReachedThreshold={0.5}
        onEndReached={more}
        renderItem={({ item: m, index: i }) => {
          const safe = chat.safeView && m.senderId !== meId;
          return (
            <View style={{ width: side, height: side }}>
              <AttachmentView
                attachment={attachments[i]!}
                mine={false}
                tile
                maxWidth={side}
                hidden={(m.spoiler || safe) && !revealed.has(m.id)}
                hiddenLabel={m.spoiler ? undefined : tr.messages.tapToShow}
                onReveal={() => setRevealed((s) => new Set(s).add(m.id))}
                onOpen={() => open(i)}
              />
              {m.senderId === meId && <Mine onPhoto />}
            </View>
          );
        }}
        ListFooterComponent={<Footer query={query} count={media.length} empty={tr.chat.noMedia} />}
      />
      {album && (
        <AlbumViewer
          items={album.items}
          start={album.start}
          onClose={() => setAlbum(null)}
          onShow={(i) => {
            setAlbum(null);
            onJump(album.ids[i]!);
          }}
        />
      )}
    </>
  );
}

function Files({ chatId, range, onJump }: { chatId: string; range: Range; onJump: (id: string) => void }) {
  const t = useTheme();
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { query, shown, onViewable, more } = useShared(chatId, "files", range);
  const files = shown.filter((m) => m.attachment && !m.undecryptable);

  return (
    <FlatList
      data={files}
      keyExtractor={(m) => m.id}
      contentContainerStyle={{ paddingBottom: insets.bottom }}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={VIEWABILITY}
      onEndReachedThreshold={0.5}
      onEndReached={more}
      renderItem={({ item: m }) => (
        <View style={[styles.row, { borderColor: t.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AttachmentView
              attachment={{ source: "server", data: m.attachment! }}
              mine={false}
              maxWidth={width - 150}
              onOpen={() => {}}
            />
          </View>
          <View style={styles.when}>
            <Text style={[styles.date, { color: t.muted }]}>{listTime(m.createdAt)}</Text>
            {m.senderId === meId && <Mine />}
          </View>
          <ShowInChat onPress={() => onJump(m.id)} />
        </View>
      )}
      ListFooterComponent={<Footer query={query} count={files.length} empty={tr.chat.noFiles} />}
    />
  );
}

const host = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
};

function Links({ chatId, range, onJump }: { chatId: string; range: Range; onJump: (id: string) => void }) {
  const t = useTheme();
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const insets = useSafeAreaInsets();
  const { query, shown, more, decrypting } = useShared(chatId, "links", range, { seeAll: true });
  const links = shown.flatMap((m) =>
    messageLinks(m.text ?? "", m.entities).map((l, i) => ({
      ...l,
      key: `${m.id}:${i}`,
      id: m.id,
      at: m.createdAt,
      mine: m.senderId === meId,
    })),
  );

  useEffect(() => {
    if (links.length < 20 && !decrypting) more();
  });

  return (
    <FlatList
      data={links}
      keyExtractor={(l) => l.key}
      contentContainerStyle={{ paddingBottom: insets.bottom }}
      onEndReachedThreshold={0.5}
      onEndReached={more}
      renderItem={({ item: l }) => (
        <View style={[styles.row, { borderColor: t.border }]}>
          <Pressable
            onPress={() => void Linking.openURL(l.href)}
            accessibilityRole="link"
            style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.linkIcon}>
              <Text style={styles.linkLetter}>{host(l.href)[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: "500" }}>
                {host(l.href)}
              </Text>
              <Text numberOfLines={1} style={{ color: brand, fontSize: 12 }}>
                {l.text}
              </Text>
            </View>
            <View style={styles.when}>
              <Text style={[styles.date, { color: t.muted }]}>{listTime(l.at)}</Text>
              {l.mine && <Mine />}
            </View>
          </Pressable>
          <ShowInChat onPress={() => onJump(l.id)} />
        </View>
      )}
      ListFooterComponent={<Footer query={query} count={links.length} empty={tr.chat.noLinks} />}
    />
  );
}

/** Searches a chat and lists its photos and videos, files and links, newest first, like Telegram does. */
export function SharedMedia({
  chat,
  initial,
  onJump,
  onClose,
}: {
  chat: ChatDTO;
  initial: SharedTab;
  onJump: (messageId: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const [tab, setTab] = useState(initial);
  const [range, setRange] = useState<Range>({});
  const [picking, setPicking] = useState(false);
  const tabs: { value: SharedTab; label: string }[] = [
    { value: "search", label: tr.chat.search },
    { value: "media", label: tr.chat.media },
    { value: "files", label: tr.chat.files },
    { value: "links", label: tr.chat.links },
  ];

  return (
    <Modal animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ScreenHeader>
          <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          <Text numberOfLines={1} style={[styles.title, { color: t.text }]}>
            {chat.title}
          </Text>
          <IconButton
            Icon={CalendarDays}
            label={tr.chat.filterDates}
            color={range.from ? brand : undefined}
            onPress={() => setPicking(true)}
          />
        </ScreenHeader>
        <View style={[styles.tabs, { backgroundColor: t.chip }]} accessibilityRole="tablist">
          {tabs.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => setTab(o.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === o.value }}
              style={[styles.tab, tab === o.value && { backgroundColor: t.surface }]}
            >
              <Text style={{ color: tab === o.value ? t.text : t.textSoft, fontSize: 14, fontWeight: "500" }}>
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {range.from && range.to && (
          <Pressable onPress={() => setRange({})} accessibilityLabel={tr.chat.clearDates} style={styles.range}>
            <Text style={{ color: brand, fontSize: 12, fontWeight: "600" }}>
              {dayLabel(range.from)} – {dayLabel(range.to)}
            </Text>
            <X size={14} color={brand} />
          </Pressable>
        )}
        {tab === "search" && <Search chat={chat} range={range} onJump={onJump} />}
        {tab === "media" && <Media chat={chat} range={range} onJump={onJump} />}
        {tab === "files" && <Files chatId={chat.id} range={range} onJump={onJump} />}
        {tab === "links" && <Links chatId={chat.id} range={range} onJump={onJump} />}
      </View>
      {picking && (
        <DateRangeDialog
          title={tr.chat.whichDays}
          onPick={(r) => {
            setRange(r);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, fontSize: 17, fontWeight: "600" },
  tabs: { flexDirection: "row", alignSelf: "center", borderRadius: 12, padding: 4, margin: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  range: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 8,
    backgroundColor: "rgba(235,138,0,0.15)",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  hit: { gap: 2, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  mark: { backgroundColor: "rgba(235,138,0,0.3)" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  link: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  date: { fontSize: 12 },
  when: { alignItems: "flex-end", gap: 2 },
  mine: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: "rgba(235,138,0,0.15)" },
  mineOnPhoto: { position: "absolute", left: 4, bottom: 4, backgroundColor: "rgba(0,0,0,0.55)" },
  mineText: { color: brand, fontSize: 10, fontWeight: "600" },
  status: { padding: 32, textAlign: "center", fontSize: 14 },
  progress: { paddingTop: 12, textAlign: "center", fontSize: 12 },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(235,138,0,0.15)",
  },
  linkLetter: { color: brand, fontSize: 14, fontWeight: "700" },
});
