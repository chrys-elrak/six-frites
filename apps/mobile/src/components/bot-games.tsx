import { BOT_GAMES, type BotGame, GAME_EMOJI, LIVE_EMOJI, LIVE_GAMES, type LiveGame, type LiveInviteDTO } from "@six/shared";
import { unwrap } from "@six/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { MoreVertical, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { insertMessage } from "@/lib/chats";
import { getLocale, useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { HowToPlay } from "./how-to-play";
import { LiveInviteSheet, playHref } from "./live";
import { Sheet } from "./sheet";
import { Text } from "./text";
import { IconButton, PrimaryButton, SectionTitle } from "./ui";

function GameRow({ game, emoji, title, about, onPress }: {
  game: BotGame | LiveGame;
  emoji: string;
  title: string;
  about: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { borderColor: t.border }, pressed && { backgroundColor: t.pressed }]}
    >
      <View style={styles.icon}>
        <Text style={{ fontSize: 24 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>{title}</Text>
        <Text numberOfLines={2} style={{ color: t.muted, fontSize: 13 }}>
          {about}
        </Text>
      </View>
      <HowToPlay game={game} />
    </Pressable>
  );
}

/**
 * What Game opens in your chat with Frite Bot: live games you're in, the games it starts in the chat, and live games
 * with friends where it takes the empty seats.
 */
export function BotGames({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { realtime } = useRealtime();
  const [live, setLive] = useState<LiveGame | null>(null);
  const [mine, setMine] = useState<Omit<LiveInviteDTO, "from">[]>([]);
  const [ending, setEnding] = useState<Omit<LiveInviteDTO, "from"> | null>(null);

  useEffect(() => {
    void realtime?.socket
      .timeout(10_000)
      .emitWithAck("live:mine", {})
      .then((res) => res.ok && setMine(res.data))
      .catch(() => null);
  }, [realtime]);

  function start(kind: BotGame) {
    onClose();
    void six.api
      .POST("/v1/bot/games", { body: { kind, locale: getLocale() } })
      .then((res) => insertMessage(qc, unwrap(res)))
      .catch(() => null);
  }

  if (live) return <LiveInviteSheet game={live} onClose={onClose} />;

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.text }]}>🤖 {tr.calls.bot}</Text>
            <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {mine.length > 0 && <SectionTitle>{tr.live.inProgress}</SectionTitle>}
            {mine.map((r) => (
              <View key={r.roomId} style={[styles.row, styles.resume]}>
                <Text style={{ fontSize: 24 }}>{LIVE_EMOJI[r.game]}</Text>
                <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: "700" }}>
                  {tr.live.games[r.game]}
                </Text>
                <PrimaryButton
                  title={tr.live.resume}
                  onPress={() => {
                    onClose();
                    router.push(playHref(r.roomId));
                  }}
                />
                <IconButton Icon={MoreVertical} label={tr.live.end} onPress={() => setEnding(r)} />
              </View>
            ))}
            <SectionTitle>{tr.common.games}</SectionTitle>
            {BOT_GAMES.map((g) => (
              <GameRow key={g} game={g} emoji={GAME_EMOJI[g]} title={tr.calls[g]} about={tr.calls.about[g]} onPress={() => start(g)} />
            ))}
            <SectionTitle>{tr.live.title}</SectionTitle>
            {LIVE_GAMES.map((g) => (
              <GameRow key={g} game={g} emoji={LIVE_EMOJI[g]} title={tr.live.games[g]} about={tr.live.about[g]} onPress={() => setLive(g)} />
            ))}
          </ScrollView>
        </View>
      </View>
      {ending && (
        <Sheet
          title={tr.live.endHint}
          actions={[
            {
              label: tr.live.end,
              destructive: true,
              onSelect: () => {
                realtime?.socket.emit("live:end", { roomId: ending.roomId });
                setMine((m) => m.filter((r) => r.roomId !== ending.roomId));
              },
            },
          ]}
          onClose={() => setEnding(null)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, gap: 8, maxHeight: "85%" },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  resume: { borderColor: brand, backgroundColor: "rgba(235,138,0,0.15)" },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(235,138,0,0.15)",
  },
});
