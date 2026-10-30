import { type LiveRoomDTO, WORDS_MIN, type WordsView, neighbours, wordPoints } from "@six/shared";
import { Check, X } from "lucide-react-native";
import { type ComponentRef, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View, useWindowDimensions } from "react-native";
import { useT } from "@/lib/i18n";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { type Play, useSecondsLeft } from "./live";
import { Text } from "./text";
import { Card, IconButton } from "./ui";

const GAP = 8;

function Words({ words, title }: { words: string[]; title: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>{title}</Text>
      <View style={styles.chips}>
        {words.map((w) => (
          <Text key={w} style={[styles.chip, { color: t.text, backgroundColor: t.chip }]}>
            {w} <Text style={{ color: t.muted, fontSize: 11 }}>{wordPoints(w)}</Text>
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * The letter grid: tap touching letters one by one, or slide across them and let go to send. The pan
 * handler is made once, so it reads the path and grid through a ref.
 */
export function WordHunt({
  room,
  state,
  nameOf,
  play,
}: {
  room: LiveRoomDTO;
  state: WordsView;
  nameOf: (seat: number) => string;
  play: Play;
}) {
  const t = useTheme();
  const tr = useT();
  const { width, height } = useWindowDimensions();
  const size = Math.min(width - 32, 360, Math.max(220, height - 420));
  const tile = (size - GAP * 3) / 4;
  const me = room.mySeat;
  const mine = me !== null ? (state.found[me] ?? []) : [];
  const playing = room.status === "playing" && !state.over && me !== null;
  const secs = useSecondsLeft(playing ? room.deadline : null);
  const [path, setPath] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const grid = useRef<ComponentRef<typeof View>>(null);

  const live = useRef({ path: [] as number[], origin: { x: 0, y: 0 }, dragged: false, playing, tile, submit: (_: number[]) => {} });

  const { pan, set } = useMemo(() => {
    const set = (next: number[]) => {
      live.current.path = next;
      setPath(next);
    };
    const tap = (i: number) => {
      const p = live.current.path;
      const last = p.at(-1);
      if (last === i) return set(p.slice(0, -1));
      if (p.includes(i)) return;
      set(last !== undefined && neighbours(last, i) ? [...p, i] : [i]);
    };
    const hit = (pageX: number, pageY: number) => {
      const { origin, tile: side } = live.current;
      const step = side + GAP;
      const x = pageX - origin.x;
      const y = pageY - origin.y;
      const col = Math.floor(x / step);
      const row = Math.floor(y / step);
      if (col < 0 || row < 0 || col > 3 || row > 3) return null;
      const near = Math.abs(x - col * step - side / 2) < side * 0.42 && Math.abs(y - row * step - side / 2) < side * 0.42;
      return near ? row * 4 + col : null;
    };
    const pan = PanResponder.create({
      onStartShouldSetPanResponder: () => live.current.playing,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { pageX, pageY } = e.nativeEvent;
        live.current.dragged = false;
        grid.current?.measure((_x, _y, _w, _h, left, top) => {
          live.current.origin = { x: left, y: top };
          const i = hit(pageX, pageY);
          if (i !== null) tap(i);
        });
      },
      onPanResponderMove: (_, g) => {
        const i = hit(g.moveX, g.moveY);
        const p = live.current.path;
        if (i === null || i === p.at(-1)) return;
        live.current.dragged = true;
        if (i === p.at(-2)) return set(p.slice(0, -1));
        if (!p.includes(i) && (!p.length || neighbours(p.at(-1)!, i))) set([...p, i]);
      },
      onPanResponderRelease: () => {
        if (live.current.dragged) void live.current.submit(live.current.path);
      },
    });
    return { pan, set };
  }, []);

  const submit = async (cells: number[]) => {
    const word = cells.map((i) => state.grid[i]).join("");
    if (word.length < WORDS_MIN) return;
    set([]);
    const error = await play({ word });
    setFlash(error ? { text: mine.includes(word) ? tr.live.alreadyFound : tr.live.notAWord, ok: false } : { text: `+${wordPoints(word)} ${word}`, ok: true });
    setTimeout(() => setFlash(null), 1500);
  };
  useEffect(() => {
    Object.assign(live.current, { playing, tile, submit });
  });

  const word = path.map((i) => state.grid[i]).join("");
  const clock = secs === null ? null : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <View style={{ alignItems: "center", gap: 14 }}>
      {playing ? (
        <View style={styles.top}>
          <Text style={{ color: secs !== null && secs <= 10 ? t.danger : t.text, fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
            {clock}
          </Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>
            {tr.live.wordCount(mine.length)} · {tr.live.points(mine.reduce((n, w) => n + wordPoints(w), 0))}
          </Text>
        </View>
      ) : (
        <Text style={{ color: t.text, fontSize: 18, fontWeight: "800" }}>{tr.live.timeUp}</Text>
      )}
      {playing && (
        <View style={[styles.word, { backgroundColor: t.surface, borderColor: flash ? (flash.ok ? "#16a34a" : t.danger) : t.border }]}>
          <Text numberOfLines={1} style={{ flex: 1, color: flash ? (flash.ok ? "#16a34a" : t.danger) : t.text, fontSize: 20, fontWeight: "800", letterSpacing: 2 }}>
            {flash?.text ?? (word || " ")}
          </Text>
          {word.length > 0 && <IconButton Icon={X} label={tr.common.close} onPress={() => set([])} />}
          {word.length >= WORDS_MIN && (
            <IconButton Icon={Check} label={tr.common.send} color={brand} onPress={() => void submit(path)} />
          )}
        </View>
      )}
      <View ref={grid} collapsable={false} {...pan.panHandlers} style={[styles.grid, { width: size, height: size }]}>
        {state.grid.map((letter, i) => {
          const on = path.includes(i);
          return (
            <View
              key={i}
              style={[styles.tile, { width: tile, height: tile, backgroundColor: on ? brand : t.surface, borderColor: on ? brand : t.border }]}
            >
              <Text style={{ color: on ? brandInk : t.text, fontSize: tile * 0.45, fontWeight: "800" }}>{letter}</Text>
            </View>
          );
        })}
      </View>
      {playing && <Text style={{ color: t.muted, fontSize: 13, textAlign: "center" }}>{tr.live.findWords}</Text>}
      {playing && mine.length > 0 && <Words words={[...mine].reverse()} title={tr.live.wordCount(mine.length)} />}
      {!playing && (
        <Card style={{ padding: 16, gap: 14, alignSelf: "stretch" }}>
          {state.found.map((words, i) =>
            words ? <Words key={i} words={words} title={`${nameOf(i)} · ${tr.live.points(state.scores[i] ?? 0)}`} /> : null,
          )}
          {state.missed.length > 0 && <Words words={state.missed} title={tr.live.missed} />}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center", gap: 2 },
  word: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", minHeight: 52, paddingLeft: 16, borderRadius: 16, borderWidth: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tile: { alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { fontSize: 14, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
});
