import { CHAT_GAMES, type ChatDTO, GAME_EMOJI, type GameKind } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./text";
import { isFrozen, useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { NewGame } from "./game";
import { IconButton, ScreenHeader } from "./ui";

/** The Games tab: pick a game, then a friend, then your move; it's sent to your chat with them. */
export function GamesPanel() {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { realtime } = useRealtime();
  const meId = useSession((s) => s.user!.id);
  const chats = useChats();
  const [game, setGame] = useState<GameKind | null>(null);
  const [chat, setChat] = useState<ChatDTO | null>(null);
  const playable = (chats.data ?? []).filter((c) => !isFrozen(c) && c.members.some((m) => m.user.id !== meId));

  return (
    <View style={{ flex: 1, backgroundColor: t.glass }}>
      <ScreenHeader inset={false}>
        <Text style={[styles.title, { color: t.text }]}>{tr.common.games}</Text>
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.content}>
        {CHAT_GAMES.map((g) => (
          <Pressable
            key={g}
            onPress={() => setGame(g)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: t.surface, borderColor: t.border },
              pressed && { transform: [{ scale: 0.98 }], opacity: 0.85 },
            ]}
          >
            <View style={styles.icon}>
              <Text style={{ fontSize: 30 }}>{GAME_EMOJI[g]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>{tr.calls[g]}</Text>
              <Text style={{ color: t.muted, fontSize: 14 }}>{tr.calls.about[g]}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {game && !chat && (
        <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setGame(null)}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={() => setGame(null)} />
          <View style={styles.wrap} pointerEvents="box-none">
            <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
              <View style={styles.head}>
                <Text style={[styles.sheetTitle, { color: t.text }]}>
                  {GAME_EMOJI[game]} {tr.calls.playWith}
                </Text>
                <IconButton Icon={X} label={tr.common.close} onPress={() => setGame(null)} />
              </View>
              {playable.length ? (
                <FlatList
                  data={playable}
                  keyExtractor={(c) => c.id}
                  style={{ maxHeight: 420 }}
                  renderItem={({ item: c }) => (
                    <Pressable
                      onPress={() => setChat(c)}
                      style={({ pressed }) => [styles.friend, pressed && { backgroundColor: t.pressed }]}
                    >
                      <Avatar user={c.members.find((m) => m.user.id !== meId)!.user} />
                      <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "500" }}>
                        {c.title}
                      </Text>
                    </Pressable>
                  )}
                />
              ) : (
                <Text style={{ color: t.muted, fontSize: 14, textAlign: "center", paddingVertical: 24 }}>
                  {tr.calls.noOneToPlay}
                </Text>
              )}
            </View>
          </View>
        </Modal>
      )}
      {game && chat && (
        <NewGame
          initial={game}
          onClose={() => {
            setGame(null);
            setChat(null);
          }}
          onSend={(g) => {
            if (!realtime) return;
            queueMessage(qc, realtime, chat.id, { text: "", game: g });
            router.push(`/chats/${chat.id}`);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, fontSize: 22, fontWeight: "700", letterSpacing: -0.3, paddingHorizontal: 4 },
  content: { padding: 16, gap: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: 20, borderWidth: 1 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(235,138,0,0.15)",
  },
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  friend: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12 },
});
