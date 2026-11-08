import { type LiveRoomDTO, type MarketView, SEAT_COLORS, marketScores } from "@six/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { BounceIn, type CSSAnimationKeyframes } from "react-native-reanimated";
import { playGameSound } from "@/lib/game-sound";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";
import type { Play } from "./live";
import { Text } from "./text";
import { PrimaryButton } from "./ui";

const COLUMNS = 6;
const GAP = 6;
const PEEK_MS = 1500;
const SOUND = {
  dice: require("../../assets/sounds/dice.wav"),
  hit: require("../../assets/sounds/home.wav"),
};
const FLIP: CSSAnimationKeyframes = {
  from: { transform: [{ perspective: 400 }, { rotateY: "90deg" }] },
  to: { transform: [{ perspective: 400 }, { rotateY: "0deg" }] },
};
const TUMBLE: CSSAnimationKeyframes = {
  "0%": { transform: [{ rotate: "-25deg" }, { scale: 0.6 }] },
  "50%": { transform: [{ rotate: "15deg" }, { scale: 1.1 }] },
  "100%": { transform: [{ rotate: "0deg" }, { scale: 1 }] },
};

/** What was just thrown, so the die tumbles and rattles once per throw, also for a throw that passed the turn. */
function throwKey(s: MarketView) {
  if (s.roll) return `${s.turn}:${s.roll}:${marketScores(s)[s.turn]}`;
  return s.last?.card === null ? `${s.last.seat}:${s.last.face}:passed` : null;
}

/**
 * Market Memory: the food die in the middle, and a row of six cards per player. Found cards stay up in the
 * player's colour; a missed one shows for a moment, then turns back.
 */
export function MarketBoard({
  room,
  state,
  nameOf,
  play,
}: {
  room: LiveRoomDTO;
  state: MarketView;
  nameOf: (seat: number) => string;
  play: Play;
}) {
  const t = useTheme();
  const tr = useT();
  const { width } = useWindowDimensions();
  const rowWidth = Math.min(width - 32, 420) - 16;
  const card = (rowWidth - GAP * (COLUMNS - 1)) / COLUMNS;
  const me = room.mySeat;
  const mine = me !== null && state.turn === me && room.status === "playing" && !state.winners;
  const thrown = throwKey(state);
  const missed = state.last && !state.last.hit && state.last.card !== null ? `${state.last.seat}:${state.last.card}` : null;
  const [peek, setPeek] = useState({ missed, over: false });
  if (peek.missed !== missed) setPeek({ missed, over: false });
  const die = state.roll ?? state.last?.face ?? null;

  useEffect(() => {
    if (thrown) playGameSound(SOUND.dice);
  }, [thrown]);
  useEffect(() => {
    if (state.last?.hit) playGameSound(SOUND.hit);
  }, [state.last]);
  useEffect(() => {
    if (!missed) return;
    const timer = setTimeout(() => setPeek({ missed, over: true }), PEEK_MS);
    return () => clearTimeout(timer);
  }, [missed]);

  const status = state.winners
    ? null
    : state.last?.card === null && !state.roll
      ? tr.live.marketHad(nameOf(state.last.seat), state.last.face)
      : mine
        ? state.roll
          ? tr.live.marketFind(state.roll)
          : tr.live.yourTurn
        : state.last && !state.last.hit && !state.roll
          ? tr.live.marketMissed(nameOf(state.last.seat))
          : tr.live.theirTurn(nameOf(state.turn));

  return (
    <View style={{ alignItems: "center", gap: 14 }}>
      <Pressable
        disabled={!mine || !!state.roll}
        onPress={() => void play({ roll: true })}
        accessibilityLabel={tr.live.roll}
        style={({ pressed }) => [styles.die, pressed && { transform: [{ scale: 0.95 }] }]}
      >
        <Animated.View
          key={thrown ?? "idle"}
          style={thrown ? { animationName: TUMBLE, animationDuration: 450, animationTimingFunction: "ease-out" } : undefined}
        >
          <Text style={{ fontSize: 56, opacity: state.roll ? 1 : 0.5 }}>{die ?? "🎲"}</Text>
        </Animated.View>
      </Pressable>
      {mine && !state.roll ? (
        <PrimaryButton title={`🎲 ${tr.live.roll}`} onPress={() => void play({ roll: true })} />
      ) : (
        <Text style={{ color: t.text, fontSize: 15, fontWeight: "700", minHeight: 40, textAlign: "center" }}>{status}</Text>
      )}
      <View style={{ gap: 10 }}>
        {state.faces.map((row, p) => {
          const active = state.turn === p && !state.winners;
          return (
            <View
              key={p}
              style={[
                styles.row,
                { width: rowWidth + 16, borderColor: active ? SEAT_COLORS[p] : "transparent", backgroundColor: active ? t.surface : undefined },
                !active && { opacity: 0.7 },
              ]}
            >
              <View style={styles.label}>
                <View style={[styles.dot, { backgroundColor: SEAT_COLORS[p] }]} />
                <Text style={{ color: t.text, fontSize: 12, fontWeight: "700" }}>{p === me ? tr.common.you : nameOf(p)}</Text>
              </View>
              <View style={styles.cards}>
                {row.map((face, i) => {
                  const found = state.found[p]![i]!;
                  const up = found || (face !== null && missed === `${p}:${i}` && !peek.over);
                  const can = mine && p === me && !!state.roll && !found;
                  return (
                    <Pressable
                      key={i}
                      disabled={!can}
                      onPress={() => void play({ card: i })}
                      style={({ pressed }) => [{ width: card, height: card * 1.3 }, pressed && { opacity: 0.7 }]}
                    >
                      <Animated.View
                        key={found ? "found" : up ? "up" : "down"}
                        entering={found ? BounceIn.duration(320) : undefined}
                        style={[
                          styles.card,
                          up
                            ? [styles.face, { borderColor: found ? SEAT_COLORS[p] : "#ef4444" }]
                            : { backgroundColor: SEAT_COLORS[p], borderColor: "#fff" },
                          !found && { animationName: FLIP, animationDuration: 180, animationTimingFunction: "ease-out" },
                        ]}
                      >
                        <Text style={{ fontSize: card * 0.55, opacity: up ? 1 : 0.4 }}>{up ? face : "🍟"}</Text>
                      </Animated.View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  die: {
    width: 96,
    height: 96,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: brand,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  row: { borderWidth: 2, borderRadius: 16, padding: 6, gap: 6 },
  label: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cards: { flexDirection: "row", gap: GAP },
  card: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  face: { backgroundColor: "#fff" },
});
