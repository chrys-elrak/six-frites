import { BOT_GAMES, type BotGame, GAME_EMOJI, LIVE_EMOJI, LIVE_GAMES, type LiveGame, type LiveInviteDTO } from "@six/shared";
import { unwrap } from "@six/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { insertMessage } from "@/lib/chats";
import { getLocale, useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { six } from "@/lib/six";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { HowToPlay } from "./how-to-play";
import { LiveInviteSheet, playHref } from "./live";
import { Text } from "./text";

function GameCard({ game, emoji, title, onPress }: { game: BotGame | LiveGame; emoji: string; title: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.card, { borderColor: t.border }, pressed && { backgroundColor: t.pressed }]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <Text numberOfLines={2} style={[styles.title, { color: t.text }]}>
        {title}
      </Text>
      <View style={styles.help}>
        <HowToPlay game={game} size={16} color={t.muted} />
      </View>
    </Pressable>
  );
}

/**
 * What the chat with Six Frites Game shows instead of a message box: live games you're in, the games it plays with
 * you right in the chat, and live games with friends where it takes the empty seats.
 */
export function BotGames() {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { realtime } = useRealtime();
  const [live, setLive] = useState<LiveGame | null>(null);
  const [mine, setMine] = useState<Omit<LiveInviteDTO, "from">[]>([]);

  useEffect(() => {
    void realtime?.socket
      .timeout(10_000)
      .emitWithAck("live:mine", {})
      .then((res) => res.ok && setMine(res.data))
      .catch(() => null);
  }, [realtime]);

  function start(kind: BotGame) {
    void six.api
      .POST("/v1/bot/games", { body: { kind, locale: getLocale() } })
      .then((res) => insertMessage(qc, unwrap(res)))
      .catch(() => null);
  }

  const heading = (text: string) => (
    <View style={styles.heading}>
      <Text style={[styles.headingText, { color: t.muted }]}>{text}</Text>
    </View>
  );

  return (
    <View style={{ backgroundColor: t.surface, borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: insets.bottom }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {mine.map((r) => (
          <Pressable
            key={r.roomId}
            onPress={() => router.push(playHref(r.roomId))}
            accessibilityRole="button"
            style={[styles.card, styles.resume]}
          >
            <Text style={styles.emoji}>{LIVE_EMOJI[r.game]}</Text>
            <Text numberOfLines={1} style={[styles.title, { color: t.text }]}>
              {tr.live.games[r.game]}
            </Text>
            <Text style={styles.resumeLabel}>{tr.live.resume}</Text>
          </Pressable>
        ))}
        {heading(tr.common.games)}
        {BOT_GAMES.map((g) => (
          <GameCard key={g} game={g} emoji={GAME_EMOJI[g]} title={tr.calls[g]} onPress={() => start(g)} />
        ))}
        {heading(tr.live.title)}
        {LIVE_GAMES.map((g) => (
          <GameCard key={g} game={g} emoji={LIVE_EMOJI[g]} title={tr.live.games[g]} onPress={() => setLive(g)} />
        ))}
      </ScrollView>
      {live && <LiveInviteSheet game={live} onClose={() => setLive(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { padding: 12, gap: 8, alignItems: "stretch" },
  card: {
    width: 104,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resume: { borderColor: brand, backgroundColor: "rgba(235,138,0,0.15)" },
  resumeLabel: {
    color: brandInk,
    backgroundColor: brand,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  emoji: { fontSize: 30 },
  title: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  help: { position: "absolute", top: -4, right: -4 },
  heading: { justifyContent: "center", width: 18 },
  headingText: {
    width: 120,
    marginLeft: -51,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "center",
    transform: [{ rotate: "-90deg" }],
  },
});
