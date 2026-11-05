import {
  LUDO_HOME,
  LUDO_HOME_COLUMNS,
  LUDO_SAFE,
  LUDO_STARTS,
  LUDO_TRACK,
  type LiveRoomDTO,
  SEAT_COLORS,
  type LudoState,
  ludoForced,
  ludoMovable,
} from "@six/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { type CSSAnimationKeyframes } from "react-native-reanimated";
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { useT } from "@/lib/i18n";
import { playGameSound } from "@/lib/game-sound";
import { brand, useTheme } from "@/lib/theme";
import type { Play } from "./live";
import { Text } from "./text";
import { PrimaryButton } from "./ui";

const YARDS = [
  [0, 0],
  [9, 0],
  [9, 9],
  [0, 9],
];
const SPOTS = [
  [1, 1],
  [4, 1],
  [1, 4],
  [4, 4],
];
const FINISHED = [
  [6.1, 7],
  [7, 6.1],
  [7.9, 7],
  [7, 7.9],
];
const PIPS: [number, number][][] = [
  [[1, 1]],
  [[0, 0], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 0], [2, 0], [0, 2], [2, 2]],
  [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
];

const STEP_MS = 130;
const ROLL_MS = 800;
/** Synthesised by scripts/render-tones.mjs. */
const SOUND: Record<"dice" | "step" | "capture" | "home" | "win", number> = {
  dice: require("../../assets/sounds/dice.wav"),
  step: require("../../assets/sounds/step.wav"),
  capture: require("../../assets/sounds/capture.wav"),
  home: require("../../assets/sounds/home.wav"),
  win: require("../../assets/sounds/win.wav"),
};
/** One point of the throw: where the die is, how far it has spun and tilted, how squashed, and whether it's now falling or rising. */
const thrown = (x: number, y: number, spin: number, tilt: number, sx: number, sy: number, rising: boolean): CSSAnimationKeyframes[string] => ({
  transform: [{ perspective: 300 }, { translateX: x }, { translateY: y }, { rotate: `${spin}deg` }, { rotateX: `${tilt}deg` }, { scaleX: sx }, { scaleY: sy }],
  animationTimingFunction: rising ? "ease-out" : "ease-in",
});
const THROW: CSSAnimationKeyframes = {
  "0%": thrown(30, -44, -240, 40, 0.85, 0.85, false),
  "35%": thrown(12, 0, -70, 10, 1.08, 0.9, true),
  "55%": thrown(5, -14, -20, -10, 1, 1, false),
  "75%": thrown(0, 0, 0, 0, 1.05, 0.95, true),
  "88%": thrown(0, -2, 0, 0, 1, 1, false),
  "100%": thrown(0, 0, 0, 0, 1, 1, false),
};
const SHADOW: CSSAnimationKeyframes = {
  "0%": { transform: [{ translateX: 30 }, { scale: 0.4 }], opacity: 0.06, animationTimingFunction: "ease-in" },
  "35%": { transform: [{ translateX: 12 }, { scale: 1 }], opacity: 0.3, animationTimingFunction: "ease-out" },
  "55%": { transform: [{ translateX: 5 }, { scale: 0.7 }], opacity: 0.15, animationTimingFunction: "ease-in" },
  "75%": { transform: [{ translateX: 0 }, { scale: 1 }], opacity: 0.3 },
  "100%": { transform: [{ translateX: 0 }, { scale: 1 }], opacity: 0.3 },
};
const RING: CSSAnimationKeyframes = {
  from: { opacity: 0.9, transform: [{ scale: 1 }] },
  to: { opacity: 0, transform: [{ scale: 1.35 }] },
};
const HOP: CSSAnimationKeyframes = {
  from: { transform: [{ translateY: 0 }, { scale: 1 }] },
  "50%": { transform: [{ translateY: -6 }, { scale: 1.15 }] },
  to: { transform: [{ translateY: 0 }, { scale: 1 }] },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Move = NonNullable<LudoState["last"]>;

/**
 * Plays out each roll and move as it comes in, with its sound: the die tumbles for a moment, and the
 * moved token walks square by square while any token it takes waits on its target.
 */
function useLudoMotion(state: LudoState, mySeat: number | null) {
  const seen = useRef(state);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [rolling, setRolling] = useState(false);
  const [walk, setWalk] = useState<{ move: Move; pos: number } | null>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useLayoutEffect(() => {
    if (JSON.stringify(seen.current) === JSON.stringify(state)) return;
    seen.current = state;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const later = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms));
    const move = state.last;
    setRolling(!move && state.dice !== null);
    setWalk(move && { move, pos: move.from });
    if (!move) {
      if (state.dice !== null) playGameSound(SOUND.dice);
      later(ROLL_MS, () => setRolling(false));
      return;
    }
    const path = move.from < 0 ? [0] : Array.from({ length: move.to - move.from }, (_, i) => move.from + i + 1);
    const end =
      state.winner !== null && state.winner === mySeat
        ? SOUND.win
        : move.captured.length
          ? SOUND.capture
          : move.to === LUDO_HOME
            ? SOUND.home
            : SOUND.step;
    path.forEach((pos, i) =>
      later((i + 1) * STEP_MS, () => {
        const done = i === path.length - 1;
        playGameSound(done ? end : SOUND.step);
        setWalk(done ? null : { move, pos });
      }),
    );
  }, [state, mySeat]);

  return { rolling, walk };
}

/** Where a token stands, in board cells: its yard spot, the track, its home column or the middle. */
function cellOf(color: number, pos: number, token: number) {
  if (pos < 0) return [YARDS[color]![0]! + SPOTS[token]![0]!, YARDS[color]![1]! + SPOTS[token]![1]!];
  if (pos === LUDO_HOME) return FINISHED[color]!;
  if (pos > 50) return LUDO_HOME_COLUMNS[color]![pos - 51]!;
  return LUDO_TRACK[(LUDO_STARTS[color]! + pos) % LUDO_TRACK.length]!;
}

/** The die: thrown in while rolling, its faces flicking by slower and slower, then a ring when it lands. */
function Die({ value, size, rolling }: { value: number | null; size: number; rolling: boolean }) {
  const [face, setFace] = useState(1);
  const [landed, setLanded] = useState(0);
  useEffect(() => {
    if (!rolling) return;
    let wait = 40;
    let timer: ReturnType<typeof setTimeout>;
    const flick = () => {
      setFace((f) => ((f + Math.floor(Math.random() * 5)) % 6) + 1);
      timer = setTimeout(flick, (wait *= 1.3));
    };
    flick();
    return () => {
      clearTimeout(timer);
      setLanded((n) => n + 1);
    };
  }, [rolling]);
  const shown = rolling ? face : value;
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[styles.dieShadow, { left: size * 0.1, width: size * 0.8 }, rolling && { animationName: SHADOW, animationDuration: ROLL_MS }]}
      />
      <Animated.View style={rolling && { animationName: THROW, animationDuration: ROLL_MS }}>
        <Svg width={size} height={size} viewBox="0 0 3 3">
          <Rect width={3} height={3} rx={0.5} fill="#fff" stroke="#d6d3d1" strokeWidth={0.06} />
          {shown !== null && PIPS[shown - 1]!.map(([x, y], i) => <Circle key={i} cx={0.7 + x * 0.8} cy={0.7 + y * 0.8} r={0.28} fill="#1c1917" />)}
        </Svg>
      </Animated.View>
      {landed > 0 && !rolling && (
        <Animated.View
          key={landed}
          style={[styles.ring, { borderRadius: size / 6, animationName: RING, animationDuration: 500, animationTimingFunction: "ease-out" }]}
        />
      )}
    </View>
  );
}

function Board() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 15 15">
      <Rect width={15} height={15} rx={0.3} fill="#fafaf9" />
      {YARDS.map(([x, y], c) => (
        <G key={c}>
          <Rect x={x} y={y} width={6} height={6} fill={SEAT_COLORS[c]} />
          <Rect x={x! + 1} y={y! + 1} width={4} height={4} rx={0.4} fill="#fff" />
          {SPOTS.map(([sx, sy], i) => (
            <Circle key={i} cx={x! + sx! + 0.5} cy={y! + sy! + 0.5} r={0.38} fill={SEAT_COLORS[c]} opacity={0.3} />
          ))}
        </G>
      ))}
      {LUDO_TRACK.map(([x, y], i) => {
        const start = LUDO_STARTS.indexOf(i);
        return (
          <G key={i}>
            <Rect x={x} y={y} width={1} height={1} fill={start >= 0 ? SEAT_COLORS[start] : "#fff"} stroke="#d6d3d1" strokeWidth={0.04} />
            {LUDO_SAFE.has(i) && start < 0 && (
              <SvgText x={x + 0.5} y={y + 0.74} fontSize={0.65} textAnchor="middle" fill="#a8a29e">
                ★
              </SvgText>
            )}
          </G>
        );
      })}
      {LUDO_HOME_COLUMNS.map((column, c) =>
        column.map(([x, y], i) => (
          <Rect key={`${c}-${i}`} x={x} y={y} width={1} height={1} fill={SEAT_COLORS[c]} stroke="#fff" strokeWidth={0.04} />
        )),
      )}
      <Polygon points="6,6 7.5,7.5 6,9" fill={SEAT_COLORS[0]} />
      <Polygon points="6,6 9,6 7.5,7.5" fill={SEAT_COLORS[1]} />
      <Polygon points="9,6 9,9 7.5,7.5" fill={SEAT_COLORS[2]} />
      <Polygon points="6,9 9,9 7.5,7.5" fill={SEAT_COLORS[3]} />
    </Svg>
  );
}

export function LudoBoard({
  room,
  state,
  nameOf,
  play,
}: {
  room: LiveRoomDTO;
  state: LudoState;
  nameOf: (seat: number) => string;
  play: Play;
}) {
  const t = useTheme();
  const tr = useT();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 440);
  const cell = size / 15;
  const me = room.mySeat;
  const { rolling, walk } = useLudoMotion(state, me);
  const mine = me !== null && state.turn === me && room.status === "playing";
  const canRoll = mine && !rolling && !state.moving;
  const movable = mine && !rolling && state.moving && state.dice !== null ? ludoMovable(state, me, state.dice) : [];

  const tokens = state.tokens.flatMap((seatTokens, seat) =>
    seatTokens.map((pos, token) => {
      const color = state.colors[seat]!;
      const hop = walk && walk.move.seat === seat && walk.move.token === token ? walk.pos : null;
      const [x, y] =
        walk && walk.move.captured.some((c) => c.seat === seat && c.token === token)
          ? cellOf(state.colors[walk.move.seat]!, walk.move.to, walk.move.token)
          : cellOf(color, hop ?? pos, token);
      return { seat, token, color, hop, x: x!, y: y!, key: `${x},${y}` };
    }),
  );
  const stacked = (key: string) => tokens.filter((tk) => tk.key === key);

  return (
    <View style={{ alignItems: "center", gap: 14 }}>
      <View style={{ width: size, height: size }}>
        <Board />
        {tokens.map(({ seat, token, color, hop, x, y, key }) => {
          const here = stacked(key);
          const k = here.findIndex((tk) => tk.seat === seat && tk.token === token);
          const small = here.length > 1;
          const d = cell * (small ? 0.58 : 0.8);
          const left = small ? x * cell + (k % 2) * cell * 0.42 : (x + 0.1) * cell;
          const top = small ? y * cell + (Math.floor(k / 2) % 2) * cell * 0.42 : (y + 0.1) * cell;
          const can = seat === me && movable.includes(token);
          return (
            <AnimatedPressable
              key={`${seat}-${token}`}
              disabled={!can}
              onPress={() => void play({ token })}
              hitSlop={can ? 8 : 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: !can }}
              style={{ position: "absolute", left, top, width: d, height: d, transitionProperty: ["left", "top"], transitionDuration: 150 }}
            >
              <Animated.View
                key={hop ?? "still"}
                style={[
                  styles.token,
                  { borderRadius: d / 2, backgroundColor: SEAT_COLORS[color] },
                  can && styles.movable,
                  hop !== null && { animationName: HOP, animationDuration: 150 },
                ]}
              />
            </AnimatedPressable>
          );
        })}
      </View>
      <View style={styles.controls}>
        <Pressable
          disabled={!canRoll}
          onPress={() => void play({ roll: true })}
          accessibilityRole="button"
          accessibilityLabel={tr.live.roll}
          style={({ pressed }) => pressed && { transform: [{ scale: 0.92 }] }}
        >
          <Die value={state.dice} size={52} rolling={rolling} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>
            {mine ? (state.moving && !ludoForced(state) ? tr.live.pickToken : tr.live.yourTurn) : tr.live.theirTurn(nameOf(state.turn))}
          </Text>
          {!rolling && state.rolledBy !== null && state.dice !== null && (
            <Text style={{ color: t.muted, fontSize: 13 }}>{tr.live.rolled(nameOf(state.rolledBy), state.dice)}</Text>
          )}
        </View>
        {canRoll && <PrimaryButton title={`🎲 ${tr.live.roll}`} onPress={() => void play({ roll: true })} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  token: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#fff",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  movable: { borderWidth: 3, borderColor: "#1c1917", transform: [{ scale: 1.15 }] },
  controls: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch" },
  dieShadow: { position: "absolute", bottom: -6, height: 8, borderRadius: 4, backgroundColor: "#000", opacity: 0.3 },
  ring: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderWidth: 4, borderColor: brand, opacity: 0 },
});
