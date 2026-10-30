import { BOT_ID, type BotGame, GAME_EMOJI, type GameMove, type GameMoveDTO, botBoardMove, botGame, gameOver } from "@six/shared";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { GameView } from "./game";
import { Text } from "./text";
import { IconButton } from "./ui";

/** The bot row at the top of the "Play with…" list. */
export function BotRow({ onPick }: { onPick: () => void }) {
  const t = useTheme();
  const tr = useT();
  return (
    <Pressable
      onPress={onPick}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { borderBottomColor: t.border }, pressed && { backgroundColor: t.pressed }]}
    >
      <View style={styles.avatar}>
        <Text style={{ fontSize: 20 }}>🤖</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontSize: 16, fontWeight: "500" }}>
          {tr.calls.bot}
        </Text>
        <Text numberOfLines={1} style={{ color: t.muted, fontSize: 13 }}>
          {tr.calls.botHint}
        </Text>
      </View>
    </Pressable>
  );
}

/** A game against the bot, played on this phone only: the bot opens, you answer, and on the board it takes its turns. */
export function BotGameSheet({ kind, onClose }: { kind: BotGame; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const locale = useLocale((s) => s.locale);
  const me = useSession((s) => s.user!);
  const insets = useSafeAreaInsets();
  const deal = () => ({ id: Math.random(), game: botGame(kind, locale), moves: [] as GameMoveDTO[] });
  const [round, setRound] = useState(deal);
  const { game, moves } = round;
  const over = gameOver(game, BOT_ID, moves, () => null);
  const play = (userId: string, move: GameMove) =>
    setRound((r) => ({ ...r, moves: [...r.moves, { userId, move, at: new Date().toISOString() }] }));

  useEffect(() => {
    if (game.game !== "ttt" && game.game !== "four") return;
    const move = botBoardMove(game, moves);
    if (!move) return;
    const timer = setTimeout(() => play(BOT_ID, move), 700);
    return () => clearTimeout(timer);
  }, [game, moves]);

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.text }]}>
              {GAME_EMOJI[kind]} {tr.calls.bot}
            </Text>
            <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ alignItems: "center", gap: 12, paddingBottom: 8 }}>
            <GameView
              key={round.id}
              game={game}
              senderId={BOT_ID}
              moves={moves}
              meId={me.id}
              mine={false}
              nameOf={(id) => (id === BOT_ID ? tr.calls.bot : me.displayName)}
              onPlay={over ? undefined : (move) => play(me.id, move)}
            />
            {over && (
              <Pressable onPress={() => setRound(deal())} style={styles.again} accessibilityRole="button">
                <Text style={{ color: brandInk, fontWeight: "700" }}>{tr.calls.playAgain}</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(235,138,0,0.15)" },
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 8, maxHeight: "90%" },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  again: { backgroundColor: brand, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
});
