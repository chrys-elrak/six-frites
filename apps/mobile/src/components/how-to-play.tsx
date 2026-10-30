import { GAME_EMOJI, type GameKind, LIVE_EMOJI, LIVE_GAMES, type LiveGame } from "@six/shared";
import { CircleHelp, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";
import { Text } from "./text";
import { IconButton } from "./ui";

const isLive = (g: GameKind | LiveGame): g is LiveGame => (LIVE_GAMES as readonly string[]).includes(g);

/** A "?" button that opens the rules of a game, step by step. */
export function HowToPlay({ game, color, size = 20 }: { game: GameKind | LiveGame; color?: string; size?: number }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const name = isLive(game) ? tr.live.games[game] : tr.calls[game];
  const emoji = isLive(game) ? LIVE_EMOJI[game] : GAME_EMOJI[game];

  return (
    <>
      <IconButton Icon={CircleHelp} size={size} color={color} label={`${tr.howTo.title}: ${name}`} onPress={() => setOpen(true)} />
      {open && (
        <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={() => setOpen(false)} />
          <View style={styles.wrap} pointerEvents="box-none">
            <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>{tr.howTo.title}</Text>
                  <Text numberOfLines={1} style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>
                    {emoji} {name}
                  </Text>
                </View>
                <IconButton Icon={X} label={tr.common.close} onPress={() => setOpen(false)} />
              </View>
              <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
                {tr.howTo.steps[game].map((step, i) => (
                  <View key={i} style={styles.step}>
                    <View style={styles.number}>
                      <Text style={{ color: brand, fontSize: 12, fontWeight: "800" }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, color: t.text, fontSize: 15, lineHeight: 21 }}>{step}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  step: { flexDirection: "row", gap: 12 },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(235,138,0,0.15)",
  },
});
