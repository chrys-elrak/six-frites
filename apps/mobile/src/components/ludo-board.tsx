import {
  LUDO_HOME,
  LUDO_HOME_COLUMNS,
  LUDO_SAFE,
  LUDO_STARTS,
  LUDO_TRACK,
  type LiveRoomDTO,
  SEAT_COLORS,
  type LudoState,
  ludoMovable,
} from "@six/shared";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
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

/** Where a token stands, in board cells: its yard spot, the track, its home column or the middle. */
function cellOf(color: number, pos: number, token: number) {
  if (pos < 0) return [YARDS[color]![0]! + SPOTS[token]![0]!, YARDS[color]![1]! + SPOTS[token]![1]!];
  if (pos === LUDO_HOME) return FINISHED[color]!;
  if (pos > 50) return LUDO_HOME_COLUMNS[color]![pos - 51]!;
  return LUDO_TRACK[(LUDO_STARTS[color]! + pos) % LUDO_TRACK.length]!;
}

function Die({ value, size }: { value: number | null; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 3 3">
      <Rect width={3} height={3} rx={0.5} fill="#fff" stroke="#d6d3d1" strokeWidth={0.06} />
      {value !== null && PIPS[value - 1]!.map(([x, y], i) => <Circle key={i} cx={0.7 + x * 0.8} cy={0.7 + y * 0.8} r={0.28} fill="#1c1917" />)}
    </Svg>
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
  const mine = me !== null && state.turn === me && room.status === "playing";
  const movable = mine && state.moving && state.dice !== null ? ludoMovable(state, me, state.dice) : [];

  const tokens = state.tokens.flatMap((seatTokens, seat) =>
    seatTokens.map((pos, token) => {
      const color = state.colors[seat]!;
      const [x, y] = cellOf(color, pos, token);
      return { seat, token, color, x: x!, y: y!, key: `${x},${y}` };
    }),
  );
  const stacked = (key: string) => tokens.filter((tk) => tk.key === key);

  return (
    <View style={{ alignItems: "center", gap: 14 }}>
      <View style={{ width: size, height: size }}>
        <Board />
        {tokens.map(({ seat, token, color, x, y, key }) => {
          const here = stacked(key);
          const k = here.findIndex((tk) => tk.seat === seat && tk.token === token);
          const small = here.length > 1;
          const d = cell * (small ? 0.58 : 0.8);
          const left = small ? x * cell + (k % 2) * cell * 0.42 : (x + 0.1) * cell;
          const top = small ? y * cell + (Math.floor(k / 2) % 2) * cell * 0.42 : (y + 0.1) * cell;
          const can = seat === me && movable.includes(token);
          return (
            <Pressable
              key={`${seat}-${token}`}
              disabled={!can}
              onPress={() => void play({ token })}
              hitSlop={can ? 8 : 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: !can }}
              style={[
                styles.token,
                { left, top, width: d, height: d, borderRadius: d / 2, backgroundColor: SEAT_COLORS[color] },
                can && styles.movable,
              ]}
            />
          );
        })}
      </View>
      <View style={styles.controls}>
        <Die value={state.dice} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>
            {mine ? (state.moving ? tr.live.pickToken : tr.live.yourTurn) : tr.live.theirTurn(nameOf(state.turn))}
          </Text>
          {state.rolledBy !== null && state.dice !== null && (
            <Text style={{ color: t.muted, fontSize: 13 }}>{tr.live.rolled(nameOf(state.rolledBy), state.dice)}</Text>
          )}
        </View>
        {mine && !state.moving && <PrimaryButton title={`🎲 ${tr.live.roll}`} onPress={() => void play({ roll: true })} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  token: {
    position: "absolute",
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
});
