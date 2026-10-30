import { CHAT_GAMES, type ChatDTO, GAME_EMOJI, type GameKind, isBotGame } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { useTheme } from "@/lib/theme";
import { BotGameSheet, BotRow } from "./bot-game";
import { ChatPicker } from "./chat-picker";
import { NewGame } from "./game";
import { ScreenHeader } from "./ui";

/** The Games tab: pick a game, then a friend and your move, sent to your chat with them, or the bot. */
export function GamesPanel() {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const [game, setGame] = useState<GameKind | null>(null);
  const [chat, setChat] = useState<ChatDTO | null>(null);
  const [bot, setBot] = useState(false);

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
      {game && !chat && !bot && (
        <ChatPicker
          title={`${GAME_EMOJI[game]} ${tr.calls.playWith}`}
          empty={tr.calls.noOneToPlay}
          onPick={setChat}
          onClose={() => setGame(null)}
          top={isBotGame(game) && <BotRow onPick={() => setBot(true)} />}
        />
      )}
      {game && bot && isBotGame(game) && (
        <BotGameSheet
          kind={game}
          onClose={() => {
            setGame(null);
            setBot(false);
          }}
        />
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
});
