import { unwrap } from "@six/sdk";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pencil, Search, Share2, UserPlus, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { shareInvite } from "@/lib/format";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { AddContact } from "./add-contact";
import { Avatar } from "./avatar";
import { ContactEditor } from "./contact-editor";
import { EmptyState, IconButton, ScreenHeader } from "./ui";

export const contactKeys = { all: ["contacts"] as const, list: (q: string) => ["contacts", q] as const };

function useDebounced(value: string, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return v;
}

export function ContactList() {
  const t = useTheme();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const contacts = useInfiniteQuery({
    queryKey: contactKeys.list(q),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/contacts", { params: { query: { q: q || undefined, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const invite = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/invites", { body: {} })),
    onSuccess: (i) => shareInvite(i.code),
  });

  const items = contacts.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader inset={false}>
        <View style={{ flex: 1, gap: 10, paddingHorizontal: 4 }}>
          <Text style={[styles.title, { color: t.text }]}>Contacts</Text>
          <View style={[styles.search, { backgroundColor: t.chip }]}>
            <Search size={16} color={t.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={t.muted}
              accessibilityLabel="Search contacts"
              style={[styles.searchInput, { color: t.text }]}
            />
          </View>
        </View>
      </ScreenHeader>

      <FlatList
        data={items}
        keyExtractor={(c) => c.chatId}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => contacts.hasNextPage && !contacts.isFetchingNextPage && void contacts.fetchNextPage()}
        ListHeaderComponent={
          <>
          <Pressable
            onPress={() => setAdding(true)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.pressed }]}
          >
            <View style={[styles.inviteIcon, { backgroundColor: "rgba(235,138,0,0.15)" }]}>
              <UserPlus size={20} color={brand} />
            </View>
            <Text style={{ color: brand, fontSize: 15, fontWeight: "600" }}>Add contact</Text>
          </Pressable>
          <Pressable
            onPress={() => invite.mutate()}
            disabled={invite.isPending}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.pressed }]}
          >
            <View style={[styles.inviteIcon, { backgroundColor: "rgba(235,138,0,0.15)" }]}>
              <Share2 size={20} color={brand} />
            </View>
            <Text style={{ color: brand, fontSize: 15, fontWeight: "600" }}>Invite a friend</Text>
          </Pressable>
          </>
        }
        ListEmptyComponent={
          contacts.isPending ? (
            <Text style={[styles.note, { color: t.muted }]}>Loading…</Text>
          ) : contacts.isError ? (
            <Text style={[styles.note, { color: t.danger }]}>Couldn't load contacts.</Text>
          ) : (
            <EmptyState Icon={Users}>
              {q ? `No contacts match “${q}”.` : "No contacts yet. Add someone with their contact code, or invite a friend."}
            </EmptyState>
          )
        }
        renderItem={({ item: c }) => (
          <View style={styles.contact}>
            <Pressable
              onPress={() => router.push(`/chats/${c.chatId}`)}
              style={({ pressed }) => [styles.row, { flex: 1 }, pressed && { backgroundColor: t.pressed }]}
            >
              <Avatar user={c.user} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontSize: 15, fontWeight: "500" }}>
                  {c.user.displayName}
                </Text>
              </View>
            </Pressable>
            <IconButton
              Icon={Pencil}
              size={16}
              color={t.faint}
              label={`Edit ${c.user.displayName}`}
              onPress={() => setEditing(c.user.id)}
              style={{ marginRight: 8 }}
            />
          </View>
        )}
      />

      {adding && <AddContact onClose={() => setAdding(false)} />}
      {editing && <ContactEditor userId={editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  contact: { flexDirection: "row", alignItems: "center" },
  inviteIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  note: { padding: 16, fontSize: 14 },
});
