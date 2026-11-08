import { BOT_GAMES, type BotGame, GAME_EMOJI, LIVE_EMOJI, LIVE_GAMES, type LiveGame, type LiveInviteDTO } from "@six/shared";
import { unwrap } from "@six/sdk";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { insertMessage } from "@/lib/chats";
import { getLocale, useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { six } from "@/lib/six";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { HowToPlay } from "./how-to-play";
import { playHref, startLive } from "./live";
import { Text } from "./text";

/** As tall as the emoji panel, where a phone's keyboard would be. */
const HEIGHT = 300;
const PAD = 12;
const GAP = 8;
const MIN_CARD = 100;

function GameCard({
  game,
  emoji,
  title,
  width,
  onPress,
}: {
  game: BotGame | LiveGame;
  emoji: string;
  title: string;
  width: number;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.card, { width, borderColor: t.border }, pressed && { backgroundColor: t.pressed }]}
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

/** Asks Six Frites Game for a new game of `kind` in our chat; it plays its side first. */
export function startBotGame(qc: QueryClient, kind: BotGame) {
  void six.api
    .POST("/v1/bot/games", { body: { kind, locale: getLocale() } })
    .then((res) => insertMessage(qc, unwrap(res)))
    .catch(() => null);
}

/**
 * What the chat with Six Frites Game shows instead of a message box: live games you're in, the games it plays with
 * you right in the chat, and live games against it that open already started.
 */
export function BotGames() {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (MIN_CARD + GAP)));
  const cardWidth = (width - PAD * 2 - GAP * (columns - 1)) / columns;
  const { realtime } = useRealtime();
  const [mine, setMine] = useState<Omit<LiveInviteDTO, "from">[]>([]);

  useEffect(() => {
    void realtime?.socket
      .timeout(10_000)
      .emitWithAck("live:mine", {})
      .then((res) => res.ok && setMine(res.data))
      .catch(() => null);
  }, [realtime]);


  async function play(game: LiveGame) {
    const id = await startLive(realtime?.socket, { game, invite: [], locale: getLocale(), bot: true });
    if (id) router.push(playHref(id));
  }

  const heading = (text: string) => <Text style={[styles.heading, { color: t.muted }]}>{text}</Text>;

  return (
    <View style={{ backgroundColor: t.surface, borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: insets.bottom }}>
      <ScrollView style={{ height: HEIGHT }} contentContainerStyle={styles.grid}>
        {mine.map((r) => (
          <Pressable
            key={r.roomId}
            onPress={() => router.push(playHref(r.roomId))}
            accessibilityRole="button"
            style={[styles.card, styles.resume, { width: cardWidth }]}
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
          <GameCard key={g} game={g} emoji={GAME_EMOJI[g]} title={tr.calls[g]} width={cardWidth} onPress={() => startBotGame(qc, g)} />
        ))}
        {heading(tr.live.title)}
        {LIVE_GAMES.map((g) => (
          <GameCard key={g} game={g} emoji={LIVE_EMOJI[g]} title={tr.live.games[g]} width={cardWidth} onPress={() => void play(g)} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", padding: PAD, gap: GAP },
  card: {
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
  heading: {
    width: "100%",
    paddingTop: 4,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
