import {
  CHAT_GAMES,
  type ChatDTO,
  GAME_EMOJI,
  type GameKind,
  LIVE_EMOJI,
  LIVE_GAMES,
  type LiveGame,
  type LiveInviteDTO,
  isBotGame,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { ArrowLeft, MoreVertical } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { brand, useTheme } from "@/lib/theme";
import { BotGameSheet } from "./bot-game";
import { ChatPicker } from "./chat-picker";
import { HowToPlay } from "./how-to-play";
import { LiveInviteSheet, playHref } from "./live";
import { NewGame } from "./game";
import { Sheet } from "./sheet";
import { IconButton, PrimaryButton, ScreenHeader, SectionTitle } from "./ui";

function GameCard({
  game,
  emoji,
  title,
  about,
  onPress,
}: {
  game: GameKind | LiveGame;
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
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: t.surface, borderColor: t.border },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.85 },
      ]}
    >
      <View style={styles.icon}>
        <Text style={{ fontSize: 30 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>{title}</Text>
        <Text style={{ color: t.muted, fontSize: 14 }}>{about}</Text>
      </View>
      <HowToPlay game={game} />
    </Pressable>
  );
}

/**
 * Frite Bot's chat, pinned at the top of the chat list: it greets you, lists live games played together in a room,
 * then the chat games, which it plays itself when it can and otherwise sends to the friend you pick.
 */
export function GamesPanel() {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const [game, setGame] = useState<GameKind | null>(null);
  const [chat, setChat] = useState<ChatDTO | null>(null);
  const [live, setLive] = useState<LiveGame | null>(null);
  const [mine, setMine] = useState<Omit<LiveInviteDTO, "from">[]>([]);
  const [ending, setEnding] = useState<Omit<LiveInviteDTO, "from"> | null>(null);

  useFocusEffect(
    useCallback(() => {
      void realtime?.socket
        .timeout(10_000)
        .emitWithAck("live:mine", {})
        .then((res) => res.ok && setMine(res.data))
        .catch(() => null);
    }, [realtime]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.glass }}>
      <ScreenHeader>
        <IconButton Icon={ArrowLeft} label={tr.common.back} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <View style={styles.botAvatar}>
          <Text style={{ fontSize: 22 }}>🤖</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontSize: 17, fontWeight: "700" }}>
            {tr.calls.bot}
          </Text>
          <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
            {tr.calls.botHint}
          </Text>
        </View>
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.bubble, { backgroundColor: t.bubbleIn, borderColor: t.border }]}>
          <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>{tr.calls.botIntro}</Text>
        </View>
        {mine.length > 0 && <SectionTitle>{tr.live.inProgress}</SectionTitle>}
        {mine.map((r) => (
          <Pressable
            key={r.roomId}
            onPress={() => router.push(playHref(r.roomId))}
            accessibilityRole="button"
            style={({ pressed }) => [styles.card, styles.resume, pressed && { opacity: 0.85 }]}
          >
            <Text style={{ fontSize: 26 }}>{LIVE_EMOJI[r.game]}</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "700" }}>
              {tr.live.games[r.game]}
            </Text>
            <PrimaryButton title={tr.live.resume} onPress={() => router.push(playHref(r.roomId))} />
            <IconButton Icon={MoreVertical} label={tr.live.end} onPress={() => setEnding(r)} />
          </Pressable>
        ))}
        <View>
          <SectionTitle>{tr.live.title}</SectionTitle>
          <Text style={{ color: t.muted, fontSize: 13, paddingHorizontal: 4 }}>{tr.live.hint}</Text>
        </View>
        {LIVE_GAMES.map((g) => (
          <GameCard key={g} game={g} emoji={LIVE_EMOJI[g]} title={tr.live.games[g]} about={tr.live.about[g]} onPress={() => setLive(g)} />
        ))}
        <View style={{ marginTop: 12 }}>
          <SectionTitle>{tr.common.games}</SectionTitle>
        </View>
        {CHAT_GAMES.map((g) => (
          <GameCard key={g} game={g} emoji={GAME_EMOJI[g]} title={tr.calls[g]} about={tr.calls.about[g]} onPress={() => setGame(g)} />
        ))}
      </ScrollView>
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
      {live && <LiveInviteSheet game={live} onClose={() => setLive(null)} />}
      {game && !chat && !isBotGame(game) && (
        <ChatPicker
          title={`${GAME_EMOJI[game]} ${tr.calls.playWith}`}
          empty={tr.calls.noOneToPlay}
          onPick={setChat}
          onClose={() => setGame(null)}
          noSupport
        />
      )}
      {game && isBotGame(game) && <BotGameSheet kind={game} onClose={() => setGame(null)} />}
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
  botAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(235,138,0,0.15)",
  },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    borderRadius: 18,
    borderTopLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  content: { padding: 16, gap: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: 20, borderWidth: 1 },
  resume: { paddingVertical: 10, borderColor: brand, backgroundColor: "rgba(235,138,0,0.15)" },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(235,138,0,0.15)",
  },
});
