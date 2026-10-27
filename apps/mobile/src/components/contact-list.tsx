import { unwrap } from "@six/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pencil, Search, Share2, UserPlus, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { AddContact } from "./add-contact";
import { Avatar } from "./avatar";
import { ContactEditor } from "./contact-editor";
import { NewInvite } from "./invites";
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
  const tr = useT();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);

  const contacts = useInfiniteQuery({
    queryKey: contactKeys.list(q),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/contacts", { params: { query: { q: q || undefined, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = contacts.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader inset={false}>
        <View style={{ flex: 1, gap: 10, paddingHorizontal: 4 }}>
          <Text style={[styles.title, { color: t.text }]}>{tr.common.contacts}</Text>
          <View style={[styles.search, { backgroundColor: t.chip }]}>
            <Search size={16} color={t.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={tr.contacts.search}
              placeholderTextColor={t.muted}
              accessibilityLabel={tr.contacts.searchContacts}
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
            <Text style={{ color: brand, fontSize: 15, fontWeight: "600" }}>{tr.contacts.addContact}</Text>
          </Pressable>
          <Pressable
            onPress={() => setInviting(true)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.pressed }]}
          >
            <View style={[styles.inviteIcon, { backgroundColor: "rgba(235,138,0,0.15)" }]}>
              <Share2 size={20} color={brand} />
            </View>
            <Text style={{ color: brand, fontSize: 15, fontWeight: "600" }}>{tr.contacts.inviteFriend}</Text>
          </Pressable>
          </>
        }
        ListEmptyComponent={
          contacts.isPending ? (
            <Text style={[styles.note, { color: t.muted }]}>{tr.common.loading}</Text>
          ) : contacts.isError ? (
            <Text style={[styles.note, { color: t.danger }]}>{tr.contacts.loadFailed}</Text>
          ) : (
            <EmptyState Icon={Users}>
              {q ? tr.contacts.noMatch(q) : tr.contacts.empty}
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
              label={tr.contacts.editName(c.user.displayName)}
              onPress={() => setEditing(c.user.id)}
              style={{ marginRight: 8 }}
            />
          </View>
        )}
      />

      {adding && <AddContact onClose={() => setAdding(false)} />}
      {inviting && <NewInvite onClose={() => setInviting(false)} />}
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
