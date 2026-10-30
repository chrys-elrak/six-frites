import { type LiveRoomDTO, type MemoryView, SEAT_COLORS } from "@six/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";
import type { Play } from "./live";
import { Text } from "./text";

const COLUMNS = 4;
const GAP = 8;
const PEEK_MS = 1500;

export function MemoryBoard({
  room,
  state,
  nameOf,
  play,
}: {
  room: LiveRoomDTO;
  state: MemoryView;
  nameOf: (seat: number) => string;
  play: Play;
}) {
  const t = useTheme();
  const tr = useT();
  const { width } = useWindowDimensions();
  const card = (Math.min(width - 32, 400) - GAP * (COLUMNS - 1)) / COLUMNS;
  const missed = state.open.length === 2 ? state.open.join() : null;
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    if (!missed) {
      setHidden(null);
      return;
    }
    const timer = setTimeout(() => setHidden(missed), PEEK_MS);
    return () => clearTimeout(timer);
  }, [missed]);
  const mine = room.mySeat !== null && state.turn === room.mySeat && room.status === "playing" && !state.winners;

  return (
    <View style={{ alignItems: "center", gap: 14 }}>
      <View style={[styles.grid, { width: card * COLUMNS + GAP * (COLUMNS - 1) }]}>
        {state.faces.map((face, i) => {
          const owner = state.taken[i] ?? null;
          const up = face !== null && (owner !== null || !missed || hidden !== missed);
          const can = mine && owner === null && !(state.open.length === 1 && state.open[0] === i);
          return (
            <Pressable
              key={i}
              disabled={!can}
              onPress={() => void play({ card: i })}
              style={({ pressed }) => [
                styles.card,
                { width: card, height: card },
                up ? [styles.face, { borderColor: owner === null ? brand : SEAT_COLORS[owner] }] : styles.back,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={{ fontSize: card * 0.48, opacity: up ? 1 : 0.4 }}>{up ? face : "🍟"}</Text>
            </Pressable>
          );
        })}
      </View>
      {!state.winners && (
        <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>
          {mine ? tr.live.yourTurn : tr.live.theirTurn(nameOf(state.turn))}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  card: {
    borderRadius: 12,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  back: { backgroundColor: "#b45309", borderColor: "#fff" },
  face: { backgroundColor: "#fff" },
});
