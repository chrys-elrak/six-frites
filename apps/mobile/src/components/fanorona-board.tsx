import {
  FANORONA,
  type FanoronaOption,
  type FanoronaState,
  type LiveRoomDTO,
  fanoronaOptions,
  fanoronaStep,
  fanoronaStrong,
} from "@six/shared";
import { useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";
import type { Play } from "./live";
import { Text } from "./text";
import { PrimaryButton, TextButton } from "./ui";

const W = FANORONA.width;
const H = FANORONA.height;
const POINTS = W * H;

/** White for the first player, dark for the second. */
export const STONES = ["#fafaf9", "#292524"];
const RIMS = ["#44403c", "#0c0a09"];
const FRONT = "#dc2626";
const BEHIND = "#f97316";

const ROWS = Array.from({ length: H }, (_, r) => ({ x1: 0.5, y1: r + 0.5, x2: W - 0.5, y2: r + 0.5 }));
const COLS = Array.from({ length: W }, (_, c) => ({ x1: c + 0.5, y1: 0.5, x2: c + 0.5, y2: H - 0.5 }));
const DIAGONALS = Array.from({ length: POINTS }, (_, p) => p)
  .filter(fanoronaStrong)
  .flatMap((p) => [4, 6].map((d) => [p, fanoronaStep(p, d)] as const).filter(([, q]) => q >= 0));

/** The board for one move; the room remounts it after every move so a half-made choice never carries over. */
export function FanoronaBoard({
  room,
  state,
  nameOf,
  play,
}: {
  room: LiveRoomDTO;
  state: FanoronaState;
  nameOf: (seat: number) => string;
  play: Play;
}) {
  const t = useTheme();
  const tr = useT();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 520);
  const me = room.mySeat;
  const mine = me !== null && state.turn === me && room.status === "playing" && !state.winners;
  const options = mine ? fanoronaOptions(state, me) : [];
  const froms = [...new Set(options.map((o) => o.from))];
  const [picked, setPicked] = useState<number | null>(null);
  const [choice, setChoice] = useState<FanoronaOption | null>(null);
  const selected = state.chain?.at ?? picked ?? (froms.length === 1 ? froms[0]! : null);
  const targets = options.filter((o) => o.from === selected);
  const capturing = !!options[0] && (options[0].approach.length > 0 || options[0].withdraw.length > 0);

  const flip = me === 1;
  const at = (p: number) => {
    const d = flip ? POINTS - 1 - p : p;
    return { x: (d % W) + 0.5, y: Math.floor(d / W) + 0.5 };
  };

  const send = (o: FanoronaOption, take?: "approach" | "withdraw") => {
    setChoice(null);
    void play(take ? { from: o.from, to: o.to, take } : { from: o.from, to: o.to });
  };
  const tap = (p: number) => {
    if (!mine) return;
    setChoice(null);
    const target = targets.find((o) => o.to === p);
    if (target) return target.approach.length && target.withdraw.length ? setChoice(target) : send(target);
    if (!state.chain && froms.includes(p)) setPicked(p);
  };

  const last = state.last;
  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <View style={[styles.board, { width: size, height: (size * H) / W }]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          {[...ROWS, ...COLS].map((l, i) => (
            <Line key={i} {...l} stroke="#78716c" strokeWidth={0.04} />
          ))}
          {DIAGONALS.map(([p, q], i) => (
            <Line key={`d${i}`} x1={at(p).x} y1={at(p).y} x2={at(q).x} y2={at(q).y} stroke="#78716c" strokeWidth={0.04} />
          ))}
          {last && (
            <Line
              x1={at(last.from).x}
              y1={at(last.from).y}
              x2={at(last.to).x}
              y2={at(last.to).y}
              stroke={brand}
              strokeWidth={0.12}
              strokeLinecap="round"
            />
          )}
          {state.chain?.visited.map((p) => (
            <Circle key={`v${p}`} cx={at(p).x} cy={at(p).y} r={0.16} fill={brand} opacity={0.35} />
          ))}
          {state.board.map((stone, p) =>
            stone === null ? null : (
              <Circle
                key={`s${p}`}
                cx={at(p).x}
                cy={at(p).y}
                r={0.34}
                fill={STONES[stone]}
                stroke={
                  choice?.approach.includes(p)
                    ? FRONT
                    : choice?.withdraw.includes(p)
                      ? BEHIND
                      : p === selected
                        ? brand
                        : mine && froms.includes(p)
                          ? brand
                          : RIMS[stone]
                }
                strokeWidth={choice?.approach.includes(p) || choice?.withdraw.includes(p) || p === selected ? 0.1 : mine && froms.includes(p) ? 0.06 : 0.04}
              />
            ),
          )}
          {targets.map((o) => (
            <Circle key={`t${o.to}`} cx={at(o.to).x} cy={at(o.to).y} r={0.14} fill={brand} />
          ))}
          {mine &&
            Array.from({ length: POINTS }, (_, p) => (
              <Circle key={`h${p}`} cx={at(p).x} cy={at(p).y} r={0.48} fill="#000" fillOpacity={0.01} onPress={() => tap(p)} />
            ))}
        </Svg>
      </View>
      {choice ? (
        <View style={styles.choices}>
          <PrimaryButton title={tr.live.takeFront} onPress={() => send(choice, "approach")} style={{ flex: 1, backgroundColor: FRONT }} />
          <PrimaryButton title={tr.live.takeBehind} onPress={() => send(choice, "withdraw")} style={{ flex: 1, backgroundColor: BEHIND }} />
        </View>
      ) : (
        !state.winners && (
          <Text style={{ color: t.text, fontSize: 16, fontWeight: "700", textAlign: "center" }}>
            {!mine
              ? tr.live.theirTurn(nameOf(state.turn))
              : state.chain
                ? tr.live.keepTaking
                : capturing
                  ? tr.live.mustTake
                  : tr.live.pickStone}
          </Text>
        )
      )}
      {mine && state.chain && !choice && <TextButton title={tr.live.stop} color={brand} onPress={() => void play({ stop: true })} />}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { borderRadius: 12, backgroundColor: "#e7d3b0", overflow: "hidden" },
  choices: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
});
