import { DOTS, type DotsState, type LiveRoomDTO, SEAT_COLORS, dotsAcross, dotsDown } from "@six/shared";
import { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";
import type { Play } from "./live";
import { Text } from "./text";

const W = DOTS.width;
const H = DOTS.height;

/** Every line with its two dots, in board units with dots half a unit in from the edge. */
const LINES = [
  ...Array.from({ length: (H + 1) * W }, (_, i) => {
    const row = Math.floor(i / W);
    const col = i % W;
    return { id: dotsAcross(row, col), x1: col + 0.5, y1: row + 0.5, x2: col + 1.5, y2: row + 0.5 };
  }),
  ...Array.from({ length: H * (W + 1) }, (_, i) => {
    const row = Math.floor(i / (W + 1));
    const col = i % (W + 1);
    return { id: dotsDown(row, col), x1: col + 0.5, y1: row + 0.5, x2: col + 0.5, y2: row + 1.5 };
  }),
];

export function DotsBoard({
  room,
  state,
  nameOf,
  play,
}: {
  room: LiveRoomDTO;
  state: DotsState;
  nameOf: (seat: number) => string;
  play: Play;
}) {
  const t = useTheme();
  const tr = useT();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 400);
  const [pending, setPending] = useState<number | null>(null);
  const mine = room.mySeat !== null && state.turn === room.mySeat && room.status === "playing" && !state.winners;

  const draw = (line: number) => {
    if (pending !== null) return;
    setPending(line);
    void play({ line }).finally(() => setPending(null));
  };

  return (
    <View style={{ alignItems: "center", gap: 14 }}>
      <Svg width={size} height={(size * (H + 1)) / (W + 1)} viewBox={`0 0 ${W + 1} ${H + 1}`}>
        {state.boxes.map((owner, b) =>
          owner === null ? null : (
            <Rect
              key={b}
              x={(b % W) + 0.5}
              y={Math.floor(b / W) + 0.5}
              width={1}
              height={1}
              fill={SEAT_COLORS[owner]}
              opacity={0.35}
            />
          ),
        )}
        {LINES.map(({ id, ...at }) => {
          const owner = state.lines[id];
          const color = owner !== null && owner !== undefined ? SEAT_COLORS[owner] : id === pending ? brand : t.border;
          const drawn = owner !== null || id === pending;
          return (
            <Line
              key={id}
              {...at}
              stroke={color}
              strokeWidth={drawn ? (id === state.last ? 0.16 : 0.11) : 0.035}
              strokeLinecap="round"
            />
          );
        })}
        {mine &&
          LINES.map(({ id, ...at }) =>
            state.lines[id] === null ? (
              <Line key={`hit-${id}`} {...at} stroke="#000" strokeOpacity={0.01} strokeWidth={0.34} onPress={() => draw(id)} />
            ) : null,
          )}
        {Array.from({ length: (W + 1) * (H + 1) }, (_, i) => (
          <Circle key={i} cx={(i % (W + 1)) + 0.5} cy={Math.floor(i / (W + 1)) + 0.5} r={0.08} fill={t.text} />
        ))}
      </Svg>
      {!state.winners && (
        <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>
          {mine ? tr.live.yourTurn : tr.live.theirTurn(nameOf(state.turn))}
        </Text>
      )}
    </View>
  );
}
