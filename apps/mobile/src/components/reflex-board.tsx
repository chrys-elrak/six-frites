import { type LiveRoomDTO, REFLEX_GOAL, type ReflexState } from "@six/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { BounceIn } from "react-native-reanimated";
import { playGameSound } from "@/lib/game-sound";
import { useT } from "@/lib/i18n";
import { brand, stone, useTheme } from "@/lib/theme";
import type { Play } from "./live";
import { Text } from "./text";

const COLUMNS = 3;
const GAP = 12;
const SOUND = {
  item: require("../../assets/sounds/step.wav"),
  point: require("../../assets/sounds/home.wav"),
  miss: require("../../assets/sounds/capture.wav"),
};

/**
 * Reflex: the item to find pops up in the middle, and my inventory sits below. Between rounds the middle says who
 * found it first; a wrong tap rings red and greys my inventory until the next item.
 */
export function ReflexBoard({
  room,
  state,
  nameOf,
  play,
}: {
  room: LiveRoomDTO;
  state: ReflexState;
  nameOf: (seat: number) => string;
  play: Play;
}) {
  const t = useTheme();
  const tr = useT();
  const { width } = useWindowDimensions();
  const size = (Math.min(width - 32, 360) - GAP * (COLUMNS - 1)) / COLUMNS;
  const me = room.mySeat;
  const [tap, setTap] = useState<{ round: number; item: string } | null>(null);
  const tapped = tap?.round === state.round ? tap.item : null;
  const out = me !== null && state.out.includes(me);
  const hand = me === null ? [] : (state.hands[me] ?? []);
  const scored = me !== null && state.last?.seat === me;

  useEffect(() => {
    if (state.target) playGameSound(SOUND.item);
  }, [state.round, state.target]);
  useEffect(() => {
    if (!state.target && scored) playGameSound(SOUND.point);
  }, [state.target, scored]);
  useEffect(() => {
    if (out) playGameSound(SOUND.miss);
  }, [out]);

  return (
    <View style={{ alignItems: "center", gap: 16 }}>
      <Text style={{ color: t.muted, fontSize: 14, fontWeight: "500" }}>{tr.live.reflexGoal(REFLEX_GOAL)}</Text>
      <View style={styles.middle}>
        {state.target ? (
          <Animated.View key={state.round} entering={BounceIn.duration(320)}>
            <Text style={{ fontSize: 88 }}>{state.target}</Text>
          </Animated.View>
        ) : state.last ? (
          <View style={{ alignItems: "center", gap: 6, paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 48, opacity: 0.6 }}>{state.last.item}</Text>
            <Text numberOfLines={2} style={{ color: stone[900], fontSize: 14, fontWeight: "700", textAlign: "center" }}>
              {state.last.seat === null ? tr.live.reflexNobody : `${nameOf(state.last.seat)} +1`}
            </Text>
          </View>
        ) : null}
      </View>
      {me !== null && (
        <>
          <Text style={{ color: out ? "#ef4444" : t.text, fontSize: 15, fontWeight: "700", minHeight: 20 }}>
            {out ? tr.live.reflexOut : state.target ? tr.live.reflexFind : ""}
          </Text>
          <View style={[styles.grid, { width: size * COLUMNS + GAP * (COLUMNS - 1) }]}>
            {hand.map((item) => {
              const ring = tapped !== item ? "rgba(0,0,0,0.06)" : item === state.last?.item && scored ? "#22c55e" : out ? "#ef4444" : brand;
              return (
                <Pressable
                  key={`${state.round}:${item}`}
                  disabled={!state.target || out}
                  onPress={() => {
                    setTap({ round: state.round, item });
                    void play({ round: state.round, item });
                  }}
                  accessibilityLabel={item}
                  style={({ pressed }) => [{ width: size, height: size, transform: [{ scale: pressed ? 0.9 : 1 }] }]}
                >
                  <Animated.View
                    entering={BounceIn.duration(280)}
                    style={[styles.item, { borderColor: ring, opacity: !state.target || out ? 0.5 : 1 }]}
                  >
                    <Text style={{ fontSize: size * 0.5 }}>{item}</Text>
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  middle: {
    width: 160,
    height: 160,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: brand,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  item: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 4,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
});
