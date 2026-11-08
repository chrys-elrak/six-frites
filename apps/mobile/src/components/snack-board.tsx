import { type LiveRoomDTO, SEAT_COLORS, SNACK_COLUMNS, SNACK_STEPS, type SnackState } from "@six/shared";
import { useEffect } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { BounceIn, FlipInYLeft } from "react-native-reanimated";
import { playGameSound } from "@/lib/game-sound";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";
import type { Play } from "./live";
import { Text } from "./text";
import { PrimaryButton } from "./ui";

const GAP = 6;
const STEPS = Array.from({ length: SNACK_STEPS }, (_, k) => k);
const SOUND = {
  step: require("../../assets/sounds/step.wav"),
  food: require("../../assets/sounds/home.wav"),
  stop: require("../../assets/sounds/capture.wav"),
};

/** Changes on every draw, so the card flips in and the sound plays once per draw. */
const drawKey = (s: SnackState) => (s.last ? `${s.last.seat}:${s.last.card}:${s.steps.flat().join("")}` : null);

/**
 * Snack Race: the treats sit across the middle, the other player's steps come down from the top and mine go up
 * from the bottom, an X per step in the player's colour. The deck and the last card drawn sit below.
 */
export function SnackBoard({
  room,
  state,
  nameOf,
  play,
}: {
  room: LiveRoomDTO;
  state: SnackState;
  nameOf: (seat: number) => string;
  play: Play;
}) {
  const t = useTheme();
  const tr = useT();
  const { width } = useWindowDimensions();
  const cell = (Math.min(width - 32, 380) - 16 - GAP * (SNACK_COLUMNS - 1)) / SNACK_COLUMNS;
  const me = room.mySeat ?? 0;
  const them = 1 - me;
  const mine = room.mySeat !== null && state.turn === room.mySeat && room.status === "playing" && !state.winners;
  const drawn = drawKey(state);
  const col = state.last?.card ? state.last.card - 1 : null;

  useEffect(() => {
    if (drawn) playGameSound(state.last?.food ? SOUND.food : state.last?.card ? SOUND.step : SOUND.stop);
  }, [drawn, state.last]);

  const who = (seat: number) => (seat === room.mySeat ? tr.common.you : nameOf(seat));
  const said = !state.last
    ? ""
    : state.last.food
      ? tr.live.snackGot(who(state.last.seat), state.last.food)
      : state.last.card
        ? tr.live.snackDrew(who(state.last.seat), state.last.card)
        : tr.live.snackStop(who(state.last.seat));

  const numbers = (
    <View style={styles.row}>
      {state.foods.map((_, c) => (
        <Text key={c} style={{ width: cell, textAlign: "center", fontSize: 18, fontWeight: "900", color: c === col ? brand : t.text }}>
          {c + 1}
        </Text>
      ))}
    </View>
  );
  const cells = (seat: number, ks: number[]) =>
    ks.map((k) => (
      <View key={`${seat}:${k}`} style={styles.row}>
        {state.foods.map((_, c) => (
          <View key={c} style={[styles.cell, { width: cell, height: cell }, c === col && { borderColor: brand, borderWidth: 2 }]}>
            {state.steps[seat]![c]! > k && (
              <Animated.Text entering={BounceIn.duration(300)} style={{ color: SEAT_COLORS[seat], fontSize: cell * 0.5, fontWeight: "900" }}>
                ✕
              </Animated.Text>
            )}
          </View>
        ))}
      </View>
    ));

  return (
    <View style={{ alignItems: "center", gap: 14 }}>
      <View style={[styles.board, { backgroundColor: t.surface }]}>
        {numbers}
        {cells(them, STEPS)}
        <View style={styles.row}>
          {state.foods.map((food, c) => {
            const owner = state.owner[c] ?? null;
            return (
              <View
                key={c}
                style={[
                  styles.food,
                  { width: cell, height: cell },
                  owner !== null && { borderColor: SEAT_COLORS[owner], borderWidth: 3, opacity: 0.6 },
                ]}
              >
                <Text style={{ fontSize: cell * 0.55 }}>{food}</Text>
              </View>
            );
          })}
        </View>
        {cells(me, [...STEPS].reverse())}
        {numbers}
      </View>
      <Text style={{ color: t.text, fontSize: 15, fontWeight: "700", minHeight: 20 }}>{said}</Text>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <Pressable
          disabled={!mine}
          onPress={() => void play({ draw: true })}
          accessibilityLabel={tr.live.snackDraw}
          style={({ pressed }) => [styles.card, { backgroundColor: "#1c1917" }, !mine && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <Text style={{ fontSize: 30 }}>🍟</Text>
        </Pressable>
        {state.last && (
          <Animated.View key={drawn} entering={FlipInYLeft.duration(300)} style={[styles.card, { backgroundColor: SEAT_COLORS[state.last.seat] }]}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: state.last.card ? 44 : 14 }}>{state.last.card ?? "STOP"}</Text>
          </Animated.View>
        )}
      </View>
      {mine ? (
        <PrimaryButton title={tr.live.snackDraw} onPress={() => void play({ draw: true })} />
      ) : (
        <Text style={{ color: t.text, opacity: 0.6, fontSize: 14, minHeight: 40 }}>{state.winners ? "" : tr.live.theirTurn(nameOf(state.turn))}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { borderRadius: 16, padding: 8, gap: GAP },
  row: { flexDirection: "row", gap: GAP },
  cell: { borderRadius: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", alignItems: "center", justifyContent: "center" },
  food: { borderRadius: 999, alignItems: "center", justifyContent: "center" },
  card: {
    width: 80,
    height: 112,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
