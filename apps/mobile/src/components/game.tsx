import {
  BOARDS,
  CHAT_GAMES,
  type ChatGame,
  DRAW,
  type DicePick,
  type DrawStroke,
  EDIT_COLORS,
  GAME_EMOJI,
  GAME_TEXT,
  GUESS_MAX,
  type GameKind,
  type GameMove,
  type GameMoveDTO,
  HANGMAN_LETTERS,
  HANGMAN_LIVES,
  HANGMAN_WORD,
  NEW_GUESS,
  PENALTY_ARROWS,
  PENALTY_KICKS,
  PENALTY_SIDES,
  type PenaltyKicks,
  type PenaltySide,
  RPS_EMOJI,
  RPS_HANDS,
  type RpsHand,
  SHIPS,
  battleship,
  boardGame,
  diceOutcome,
  diceRoll,
  drawStart,
  drawTo,
  gameAnswer,
  gameOver,
  guessRange,
  guessTries,
  hangman,
  hangmanWord,
  looseAnswer,
  myTurn,
  penaltyGoals,
  penaltyOutcome,
  randomFleet,
  rpsOutcome,
  strokePath,
  typedGuesses,
} from "@six/shared";
import { newGameKey, openGuess, sealGuess } from "@six/sdk";
import { Undo2, X } from "lucide-react-native";
import { type ComponentRef, type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "./text";
import { alpha, useBubbleColors } from "@/lib/bubble-colors";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { IconButton, PrimaryButton } from "./ui";
import { HowToPlay } from "./how-to-play";

const randomSeed = () => Math.floor(Math.random() * 6);
const randomSide = () => PENALTY_SIDES[Math.floor(Math.random() * PENALTY_SIDES.length)]!;

interface Colors {
  fg: string;
  button: string;
}

/** Shakes for a beat before showing an answer that just came in; older ones show straight away. */
function useReveal(at: string) {
  const [revealed, setRevealed] = useState(() => Date.now() - Date.parse(at) > 3000);
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (revealed) return;
    const step = (toValue: number) => Animated.timing(bounce, { toValue, duration: 150, useNativeDriver: true });
    const shake = Animated.loop(Animated.sequence([step(1), step(0)]), { iterations: 3 });
    shake.start(({ finished }) => finished && setRevealed(true));
    return () => shake.stop();
  }, [bounce, revealed]);
  const style = {
    transform: [
      { translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
      { rotate: bounce.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-14deg"] }) },
    ],
  };
  return { revealed, style };
}

function Hands({ onPick, c }: { onPick: (hand: RpsHand) => void; c: Colors }) {
  const tr = useT();
  return (
    <View style={styles.row}>
      {RPS_HANDS.map((h) => (
        <Pressable
          key={h}
          onPress={() => onPick(h)}
          accessibilityRole="button"
          accessibilityLabel={tr.calls.hands[h]}
          style={({ pressed }) => [styles.choice, { backgroundColor: c.button }, pressed && styles.pressed]}
        >
          <Text style={styles.choiceHand}>{RPS_EMOJI[h]}</Text>
          <Text style={{ color: c.fg, fontSize: 12, opacity: 0.75 }}>{tr.calls.hands[h]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Faces({ onPick, c }: { onPick: (n: number) => void; c: Colors }) {
  return (
    <View style={[styles.row, { gap: 6 }]}>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <Pressable
          key={n}
          onPress={() => onPick(n)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.face, { backgroundColor: c.button }, pressed && styles.pressed]}
        >
          <Text style={[styles.faceText, { color: c.fg }]}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function NumberGrid({ onPick, allowed, c }: { onPick: (n: number) => void; allowed: (n: number) => boolean; c: Colors }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: GUESS_MAX }, (_, i) => i + 1).map((n) => {
        const ok = allowed(n);
        return (
          <Pressable
            key={n}
            onPress={() => onPick(n)}
            disabled={!ok}
            accessibilityRole="button"
            accessibilityLabel={String(n)}
            style={({ pressed }) => [styles.cell, ok && { backgroundColor: c.button }, pressed && styles.pressed]}
          >
            <Text style={[styles.cellText, { color: c.fg }, !ok && { opacity: 0.25 }]}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Your five shots and five dives, kick by kick, one tap each. */
function Kicks({ onDone, c }: { onDone: (kicks: PenaltyKicks) => void; c: Colors }) {
  const tr = useT();
  const [picks, setPicks] = useState<PenaltySide[]>([]);
  const add = (more: PenaltySide[]) => {
    const all = [...picks, ...more];
    if (all.length < PENALTY_KICKS * 2) return setPicks(all);
    onDone({ shots: all.filter((_, i) => i % 2 === 0), dives: all.filter((_, i) => i % 2 === 1) });
  };
  const kick = Math.floor(picks.length / 2) + 1;
  return (
    <>
      <Text style={[styles.hint, { color: c.fg, fontSize: 14, fontWeight: "600" }]}>
        {picks.length % 2 ? tr.calls.dive(kick) : tr.calls.shoot(kick)}
      </Text>
      <View style={styles.row}>
        {PENALTY_SIDES.map((side) => (
          <Pressable
            key={side}
            onPress={() => add([side])}
            accessibilityRole="button"
            accessibilityLabel={tr.calls.sides[side]}
            style={({ pressed }) => [styles.choice, { backgroundColor: c.button }, pressed && styles.pressed]}
          >
            <Text style={styles.arrow}>{PENALTY_ARROWS[side]}</Text>
            <Text style={{ color: c.fg, fontSize: 12, opacity: 0.75 }}>{tr.calls.sides[side]}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={() => add(Array.from({ length: PENALTY_KICKS * 2 - picks.length }, randomSide))}
        accessibilityRole="button"
        style={({ pressed }) => [styles.pill, { backgroundColor: c.button }, pressed && styles.pressed]}
      >
        <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{tr.calls.random}</Text>
      </Pressable>
    </>
  );
}

/** Statements or choices, one per row; `note` adds a line under one, such as who picked it. */
function ChoiceList({
  items,
  onPick,
  note,
  c,
}: {
  items: string[];
  onPick?: (i: number) => void;
  note?: (i: number) => string;
  c: Colors;
}) {
  return (
    <View style={styles.choices}>
      {items.map((text, i) => (
        <Pressable
          key={i}
          onPress={onPick && (() => onPick(i))}
          disabled={!onPick}
          accessibilityRole={onPick ? "button" : undefined}
          style={({ pressed }) => [styles.choiceRow, { backgroundColor: onPick ? c.button : "rgba(0,0,0,0.05)" }, pressed && styles.pressed]}
        >
          <Text style={{ color: c.fg, fontSize: 14 }}>{text}</Text>
          {!!note?.(i) && <Text style={{ color: c.fg, fontSize: 12, fontWeight: "700", marginTop: 2 }}>{note(i)}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

/** Text boxes for statements or choices, with a button beside each to mark the one that's the lie, or yours. */
function ChoiceWriter({
  count,
  mark,
  markLabel,
  placeholder,
  onSend,
}: {
  count: number;
  mark: string;
  markLabel: string;
  placeholder: (n: number) => string;
  onSend: (texts: string[], chosen: number) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const [texts, setTexts] = useState<string[]>(() => Array(count).fill(""));
  const [chosen, setChosen] = useState<number | null>(null);
  const ready = chosen !== null && texts.every((x) => x.trim());
  return (
    <>
      {texts.map((text, i) => (
        <View key={i} style={styles.writerRow}>
          <TextInput
            value={text}
            onChangeText={(v) => setTexts(texts.map((x, j) => (j === i ? v : x)))}
            maxLength={GAME_TEXT.line}
            placeholder={placeholder(i + 1)}
            placeholderTextColor={t.muted}
            accessibilityLabel={placeholder(i + 1)}
            autoFocus={i === 0}
            style={[styles.input, { flex: 1, backgroundColor: t.field, color: t.text }]}
          />
          <Pressable
            onPress={() => setChosen(i)}
            accessibilityRole="button"
            accessibilityLabel={markLabel}
            accessibilityState={{ selected: chosen === i }}
            style={[styles.mark, chosen === i ? { backgroundColor: t.surfaceAlt } : { opacity: 0.35 }]}
          >
            <Text style={{ fontSize: 22 }}>{mark}</Text>
          </Pressable>
        </View>
      ))}
      <PrimaryButton title={tr.common.send} disabled={!ready} onPress={() => ready && onSend(texts.map((x) => x.trim()), chosen)} />
    </>
  );
}

function Sketch({ strokes }: { strokes: DrawStroke[] }) {
  return (
    <Svg viewBox={`0 0 ${DRAW.scale} ${DRAW.scale}`} width="100%" height="100%" pointerEvents="none">
      {strokes.map((s, i) => (
        <Path
          key={i}
          d={strokePath(s.points)}
          stroke={EDIT_COLORS[s.color]}
          strokeWidth={DRAW.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

/** The pad owns the strokes while a finger is down, so moves that land before a render still join up. */
function SketchPad({ strokes, setStrokes }: { strokes: DrawStroke[]; setStrokes: Dispatch<SetStateAction<DrawStroke[]>> }) {
  const t = useTheme();
  const tr = useT();
  const [color, setColor] = useState(1);
  const live = useRef({ strokes, color: 1, size: 1 });
  const pan = useMemo(() => {
    let start = { x: 0, y: 0 };
    let drawing = false;
    const update = (next: DrawStroke[]) => {
      if (next === live.current.strokes) return false;
      live.current.strokes = next;
      setStrokes(next);
      return true;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { strokes: s, color: c, size } = live.current;
        start = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        drawing = update(drawStart(s, c, start.x / size, start.y / size));
      },
      onPanResponderMove: (_, g) => {
        const { strokes: s, size } = live.current;
        if (drawing) update(drawTo(s, (start.x + g.dx) / size, (start.y + g.dy) / size));
      },
      onPanResponderRelease: () => (drawing = false),
    });
  }, [setStrokes]);
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <View
        {...pan.panHandlers}
        onLayout={(e) => (live.current.size = e.nativeEvent.layout.width)}
        style={[styles.pad, { borderColor: t.border }]}
      >
        <Sketch strokes={strokes} />
      </View>
      <View style={styles.swatches}>
        {EDIT_COLORS.map((hex, i) => (
          <Pressable
            key={hex}
            onPress={() => {
              live.current.color = i;
              setColor(i);
            }}
            accessibilityRole="button"
            accessibilityLabel={hex}
            accessibilityState={{ selected: color === i }}
            style={[styles.swatch, { backgroundColor: hex }, color === i && { borderColor: "#eb8a00", borderWidth: 3 }]}
          />
        ))}
        <IconButton
          Icon={Undo2}
          size={18}
          label={tr.composer.undo}
          onPress={() => {
            live.current.strokes = live.current.strokes.slice(0, -1);
            setStrokes(live.current.strokes);
          }}
        />
      </View>
    </View>
  );
}

/** The 5 by 5 sea: misses splash, hits burn once their boat is sunk. Unshot boats show when `show` is set. */
function Sea({
  boats,
  shots,
  show,
  onShoot,
  c,
}: {
  boats: number[][];
  shots: { cell: number; hit: boolean }[];
  show: boolean;
  onShoot?: (cell: number) => void;
  c: Colors;
}) {
  const sunk = new Set(boats.filter((b) => b.every((x) => shots.some((s) => s.cell === x))).flat());
  return (
    <View style={[styles.board, { width: 220 }]}>
      {Array.from({ length: SHIPS.size ** 2 }, (_, i) => {
        const shot = shots.find((s) => s.cell === i);
        const boat = boats.some((b) => b.includes(i));
        const open = !!onShoot && !shot;
        return (
          <Pressable
            key={i}
            onPress={open ? () => onShoot(i) : undefined}
            disabled={!open}
            accessibilityRole={open ? "button" : undefined}
            accessibilityLabel={String(i + 1)}
            style={({ pressed }) => [
              styles.seaCell,
              { backgroundColor: open ? c.button : boat && (show || shot) ? "rgba(14,165,233,0.3)" : "rgba(0,0,0,0.05)" },
              pressed && styles.pressed,
            ]}
          >
            <Text style={{ fontSize: 18 }}>{shot ? (sunk.has(i) ? "🔥" : shot.hit ? "💥" : "💦") : boat && show ? "🚢" : ""}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Board({
  kind,
  board,
  win,
  onMove,
  c,
}: {
  kind: "ttt" | "four";
  board: (0 | 1 | null)[];
  win?: number[];
  onMove?: (move: { cell: number } | { col: number }) => void;
  c: Colors;
}) {
  const { width } = BOARDS[kind];
  return (
    <View style={[styles.board, { width: kind === "ttt" ? 180 : 238 }]}>
      {board.map((p, i) => {
        const col = i % width;
        const open = !!onMove && (kind === "ttt" ? p === null : board[col] === null);
        const mark = p === null ? "" : kind === "ttt" ? (p ? "⭕" : "❌") : p ? "🟡" : "🔴";
        return (
          <Pressable
            key={i}
            onPress={open ? () => onMove(kind === "ttt" ? { cell: i } : { col }) : undefined}
            disabled={!open}
            accessibilityRole={open ? "button" : undefined}
            accessibilityLabel={String((kind === "ttt" ? i : col) + 1)}
            style={({ pressed }) => [
              kind === "ttt" ? styles.tttCell : styles.fourCell,
              { backgroundColor: win?.includes(i) ? "rgba(22,163,74,0.4)" : open ? c.button : "rgba(0,0,0,0.05)" },
              pressed && styles.pressed,
            ]}
          >
            <Text style={{ fontSize: kind === "ttt" ? 28 : 16 }}>{mark}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Who won, said from where the viewer stands: their own result if they played, else the winner's name. */
function Verdict({
  outcome,
  senderId,
  answerId,
  meId,
  nameOf,
  fg,
}: {
  outcome: number;
  senderId: string;
  answerId: string;
  meId: string;
  nameOf: (userId: string) => string;
  fg: string;
}) {
  const tr = useT();
  const mine = meId === senderId ? outcome : meId === answerId ? -outcome : null;
  const text =
    mine === null
      ? outcome === 0
        ? tr.calls.draw
        : tr.messages.wins(nameOf(outcome === 1 ? senderId : answerId))
      : mine === 1
        ? tr.calls.youWin
        : mine === -1
          ? tr.calls.youLose
          : tr.calls.draw;
  return <Text style={[styles.verdict, { color: fg }]}>{text}</Text>;
}

interface ResultProps {
  senderId: string;
  meId: string;
  nameOf: (userId: string) => string;
  fg: string;
}

function RpsResult({
  hand,
  answer,
  ...props
}: ResultProps & { hand: RpsHand; answer: { userId: string; hand: RpsHand; at: string } }) {
  const { revealed, style } = useReveal(answer.at);
  return (
    <>
      <View style={styles.hands}>
        {[
          { id: props.senderId, hand },
          { id: answer.userId, hand: answer.hand },
        ].map(({ id, hand }) => (
          <View key={id} style={styles.handBox}>
            <Animated.Text style={[styles.bigHand, !revealed && style]}>
              {revealed ? RPS_EMOJI[hand] : RPS_EMOJI.rock}
            </Animated.Text>
            <Text style={{ color: props.fg, fontSize: 12, opacity: 0.7 }} numberOfLines={1}>
              {props.nameOf(id)}
            </Text>
          </View>
        ))}
      </View>
      {revealed && <Verdict outcome={rpsOutcome(hand, answer.hand)} answerId={answer.userId} {...props} />}
    </>
  );
}

function DiceResult({
  pick,
  answer,
  ...props
}: ResultProps & { pick: DicePick; answer: { userId: string; pick: DicePick; at: string } }) {
  const tr = useT();
  const { revealed, style } = useReveal(answer.at);
  const [face, setFace] = useState(1);
  useEffect(() => {
    if (revealed) return;
    const t = setInterval(() => setFace((f) => (f % 6) + 1), 90);
    return () => clearInterval(t);
  }, [revealed]);
  const roll = diceRoll(pick, answer.pick);
  return (
    <>
      <Animated.View style={[styles.die, { width: 56, height: 56 }, !revealed && style]}>
        <Text style={[styles.dieText, { fontSize: 28 }]}>{revealed ? roll : face}</Text>
      </Animated.View>
      {revealed && (
        <>
          <Text style={[styles.note, { color: props.fg }]}>{tr.calls.rolled(roll)}</Text>
          <Text style={{ color: props.fg, fontSize: 14, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
            {props.nameOf(props.senderId)} {pick.pick} · {answer.pick.pick} {props.nameOf(answer.userId)}
          </Text>
          <Verdict outcome={diceOutcome(pick, answer.pick)} answerId={answer.userId} {...props} />
        </>
      )}
    </>
  );
}

function PenaltyResult({
  kicks,
  answer,
  ...props
}: ResultProps & { kicks: PenaltyKicks; answer: { userId: string; kicks: PenaltyKicks; at: string } }) {
  const { revealed, style } = useReveal(answer.at);
  if (!revealed) return <Animated.Text style={[styles.bigHand, style]}>⚽</Animated.Text>;
  const rows = [
    { id: props.senderId, goals: penaltyGoals(kicks.shots, answer.kicks.dives) },
    { id: answer.userId, goals: penaltyGoals(answer.kicks.shots, kicks.dives) },
  ];
  return (
    <>
      <View style={styles.scores}>
        {rows.map(({ id, goals }) => (
          <View key={id} style={styles.scoreRow}>
            <Text style={{ flex: 1, color: props.fg, fontSize: 14 }} numberOfLines={1}>
              {props.nameOf(id)}
            </Text>
            <Text style={{ fontSize: 16 }}>{goals.map((g) => (g ? "⚽" : "🧤")).join("")}</Text>
            <Text style={[styles.score, { color: props.fg }]}>{goals.filter(Boolean).length}</Text>
          </View>
        ))}
      </View>
      <Verdict outcome={penaltyOutcome(kicks, answer.kicks)} answerId={answer.userId} {...props} />
    </>
  );
}

interface PlayProps {
  senderId: string;
  moves: GameMoveDTO[];
  meId: string;
  nameOf: (userId: string) => string;
  onPlay?: (move: GameMove) => void;
  c: Colors;
}

function DuelPlay({ game, senderId, moves, meId, nameOf, onPlay, c }: PlayProps & { game: ChatGame }) {
  const tr = useT();
  const answer = gameAnswer(game, senderId, moves);
  const result = { senderId, meId, nameOf, fg: c.fg };
  if (answer && game.game === "rps" && "hand" in answer.move) {
    return <RpsResult hand={game.hand} answer={{ userId: answer.userId, hand: answer.move.hand, at: answer.at }} {...result} />;
  }
  if (answer && game.game === "dice" && "pick" in answer.move) {
    return <DiceResult pick={game} answer={{ userId: answer.userId, pick: answer.move, at: answer.at }} {...result} />;
  }
  if (answer && game.game === "penalty" && "shots" in answer.move) {
    return <PenaltyResult kicks={game} answer={{ userId: answer.userId, kicks: answer.move, at: answer.at }} {...result} />;
  }
  if (answer && game.game === "lie" && "choice" in answer.move) {
    const { choice } = answer.move;
    const note = (i: number) =>
      [i === game.lie && `🤥 ${tr.calls.theLie}`, i === choice && `👆 ${nameOf(answer.userId)}`].filter(Boolean).join(" · ");
    return (
      <>
        <ChoiceList items={game.statements} note={note} c={c} />
        <Verdict outcome={choice === game.lie ? -1 : 1} answerId={answer.userId} {...result} />
      </>
    );
  }
  if (answer && game.game === "rather" && "choice" in answer.move) {
    const { choice } = answer.move;
    const note = (i: number) => [i === game.choice && nameOf(senderId), i === choice && nameOf(answer.userId)].filter(Boolean).join(" · ");
    return (
      <>
        <Text style={[styles.note, { color: c.fg }]}>{tr.calls.ratherPrompt}</Text>
        <ChoiceList items={game.options} note={note} c={c} />
        <Text style={[styles.verdict, { color: c.fg }]}>{choice === game.choice ? tr.calls.sameBrain : tr.calls.notSameBrain}</Text>
      </>
    );
  }
  if (game.game === "lie" || game.game === "rather") {
    const items = game.game === "lie" ? game.statements : game.options;
    const chosen = game.game === "lie" ? game.lie : game.choice;
    const play = senderId !== meId && onPlay;
    return (
      <>
        {(game.game === "rather" || play) && (
          <Text style={[styles.note, { color: c.fg }]}>
            {game.game === "rather" ? tr.calls.ratherPrompt : tr.calls.spotLie(nameOf(senderId))}
          </Text>
        )}
        <ChoiceList
          items={items}
          onPick={play ? (choice) => play({ choice }) : undefined}
          note={senderId === meId ? (i) => (i === chosen ? (game.game === "lie" ? "🤥" : "✓") : "") : undefined}
          c={c}
        />
        {!play && <Text style={[styles.note, { color: c.fg }]}>{tr.messages.waitingForReply}</Text>}
      </>
    );
  }
  if (senderId === meId || !onPlay) {
    return (
      <>
        {senderId === meId &&
          (game.game === "rps" ? (
            <Text style={styles.bigHand}>{RPS_EMOJI[game.hand]}</Text>
          ) : (
            game.game === "dice" && (
              <View style={[styles.die, { width: 48, height: 48 }]}>
                <Text style={[styles.dieText, { fontSize: 24 }]}>{game.pick}</Text>
              </View>
            )
          ))}
        <Text style={[styles.note, { color: c.fg }]}>{tr.messages.waitingForReply}</Text>
      </>
    );
  }
  return (
    <>
      <Text style={[styles.note, { color: c.fg }]}>{tr.calls.theyPicked(nameOf(senderId))}</Text>
      {game.game === "rps" ? (
        <Hands onPick={(hand) => onPlay({ hand })} c={c} />
      ) : game.game === "penalty" ? (
        <Kicks onDone={onPlay} c={c} />
      ) : (
        <>
          <Text style={{ color: c.fg, fontSize: 12, opacity: 0.7, textAlign: "center" }}>{tr.calls.pickDice}</Text>
          <Faces onPick={(pick) => onPlay({ pick, seed: randomSeed() })} c={c} />
        </>
      )}
    </>
  );
}

function GuessPlay({ secret, senderId, moves, meId, nameOf, onPlay, c }: PlayProps & { secret: number }) {
  const tr = useT();
  const tries = guessTries(secret, senderId, moves);
  const last = tries.at(-1);
  const solved = last?.hint === "right";
  const { lo, hi } = guessRange({ ...NEW_GUESS, tries });
  const chooser = senderId === meId;
  return (
    <>
      <Text style={[styles.note, { color: c.fg }]}>
        {chooser ? tr.calls.yourNumber(secret) : tr.calls.guessPrompt(nameOf(senderId))}
      </Text>
      {tries.length > 0 && (
        <View style={styles.tries}>
          {tries.map((t) => (
            <View key={t.n} style={[styles.chip, { backgroundColor: t.hint === "right" ? "#16a34a" : c.button }]}>
              <Text style={[styles.chipText, { color: t.hint === "right" ? "#fff" : c.fg }]}>
                {t.n} {t.hint === "higher" ? "↑" : t.hint === "lower" ? "↓" : "✓"}
              </Text>
            </View>
          ))}
        </View>
      )}
      {solved ? (
        <>
          <Text style={[styles.verdict, { color: c.fg }]}>{tr.calls.hints.right}</Text>
          <Text style={{ color: c.fg, fontSize: 14, opacity: 0.8 }}>{tr.calls.foundIn(tries.length)}</Text>
        </>
      ) : chooser || !onPlay ? (
        <Text style={[styles.note, { color: c.fg }]}>
          {last ? tr.calls.theyAreGuessing(nameOf(last.userId)) : tr.messages.waitingForReply}
        </Text>
      ) : (
        <>
          {last && <Text style={[styles.hint, { color: c.fg }]}>{tr.calls.hints[last.hint]}</Text>}
          <NumberGrid
            onPick={(n) => onPlay({ n })}
            allowed={(n) => n >= lo && n <= hi && !tries.some((t) => t.n === n)}
            c={c}
          />
        </>
      )}
    </>
  );
}

function HangmanPlay({ word, senderId, moves, meId, nameOf, onPlay, c }: PlayProps & { word: string }) {
  const tr = useT();
  const { tried, misses, solved, lost } = hangman(word, senderId, moves);
  const last = tried.at(-1);
  const chooser = senderId === meId;
  const missed = tried.filter((t) => !t.hit).map((t) => t.letter);
  return (
    <>
      <Text style={[styles.note, { color: c.fg }]}>{chooser ? tr.calls.yourWord : tr.calls.wordPrompt(nameOf(senderId))}</Text>
      <View style={styles.word}>
        {[...word].map((ch, i) => {
          const found = tried.some((t) => t.letter === ch);
          return (
            <View key={i} style={[styles.slot, { borderColor: c.fg }, !found && { opacity: 0.4 }]}>
              <Text style={[styles.slotText, { color: c.fg }]}>{found || chooser || lost ? ch : " "}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.fries} accessible accessibilityLabel={tr.calls.friesLeft(HANGMAN_LIVES - misses)}>
        {Array.from({ length: HANGMAN_LIVES }, (_, i) => (
          <Text key={i} style={[{ fontSize: 20 }, i < misses && { opacity: 0.2 }]}>
            🍟
          </Text>
        ))}
      </View>
      {missed.length > 0 && (
        <Text style={{ color: c.fg, fontSize: 14, opacity: 0.7, letterSpacing: 3, textDecorationLine: "line-through" }}>
          {missed.join("")}
        </Text>
      )}
      {(solved || lost) && last ? (
        <Verdict outcome={solved ? -1 : 1} senderId={senderId} answerId={last.userId} meId={meId} nameOf={nameOf} fg={c.fg} />
      ) : chooser || !onPlay ? (
        <Text style={[styles.note, { color: c.fg }]}>
          {last ? tr.calls.theyAreGuessing(nameOf(last.userId)) : tr.messages.waitingForReply}
        </Text>
      ) : (
        <View style={styles.grid}>
          {HANGMAN_LETTERS.map((letter) => {
            const used = tried.some((t) => t.letter === letter);
            return (
              <Pressable
                key={letter}
                onPress={() => onPlay({ letter })}
                disabled={used}
                accessibilityRole="button"
                accessibilityLabel={letter}
                style={({ pressed }) => [styles.key, !used && { backgroundColor: c.button }, pressed && styles.pressed]}
              >
                <Text style={[styles.keyText, { color: c.fg }, used && { opacity: 0.25 }]}>{letter}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );
}

function TypedPlay({
  game,
  senderId,
  moves,
  meId,
  nameOf,
  onPlay,
  c,
}: PlayProps & { game: Extract<ChatGame, { game: "riddle" | "sketch" }> }) {
  const tr = useT();
  const [text, setText] = useState("");
  const guesses = typedGuesses(game.answer, senderId, moves, (sealed) => openGuess(game.key, sealed));
  const last = guesses.at(-1);
  const chooser = senderId === meId;
  const submit = () => {
    const guess = text.trim();
    if (!guess || !onPlay) return;
    onPlay({ sealed: sealGuess(game.key, guess) });
    setText("");
  };
  return (
    <>
      {game.game === "riddle" ? (
        <Text style={{ fontSize: 40, marginTop: 6, textAlign: "center" }}>{game.emojis}</Text>
      ) : (
        <View style={[styles.pad, { width: "100%", marginTop: 8, borderWidth: 0 }]}>
          <Sketch strokes={game.strokes} />
        </View>
      )}
      <Text style={[styles.note, { color: c.fg }]}>
        {chooser || last?.right
          ? tr.calls.theAnswer(game.answer)
          : game.game === "riddle"
            ? tr.calls.riddlePrompt(nameOf(senderId))
            : tr.calls.drawPrompt(nameOf(senderId))}
      </Text>
      {guesses.length > 0 && (
        <View style={styles.tries}>
          {guesses.map((g, i) => (
            <View key={i} style={[styles.chip, { backgroundColor: g.right ? "#16a34a" : c.button }]}>
              <Text
                numberOfLines={1}
                style={[styles.chipText, { color: g.right ? "#fff" : c.fg }, !g.right && { textDecorationLine: "line-through" }]}
              >
                {g.text}
              </Text>
            </View>
          ))}
        </View>
      )}
      {last?.right ? (
        <>
          <Text style={[styles.verdict, { color: c.fg }]}>{tr.calls.hints.right}</Text>
          <Text style={{ color: c.fg, fontSize: 14, opacity: 0.8 }}>{tr.calls.foundIn(guesses.length)}</Text>
        </>
      ) : chooser || !onPlay ? (
        <Text style={[styles.note, { color: c.fg }]}>
          {last ? tr.calls.theyAreGuessing(nameOf(last.userId)) : tr.messages.waitingForReply}
        </Text>
      ) : (
        <View style={[styles.writerRow, { marginTop: 8, alignSelf: "stretch" }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            maxLength={GAME_TEXT.answer}
            placeholder={tr.calls.yourGuess}
            placeholderTextColor={c.fg}
            accessibilityLabel={tr.calls.yourGuess}
            returnKeyType="send"
            onSubmitEditing={submit}
            style={[styles.guessInput, { color: c.fg, backgroundColor: c.button }]}
          />
          <Pressable
            onPress={submit}
            disabled={!text.trim()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.sendPill, { backgroundColor: c.button }, !text.trim() && { opacity: 0.5 }, pressed && styles.pressed]}
          >
            <Text style={{ color: c.fg, fontSize: 14, fontWeight: "600" }}>{tr.common.send}</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

function ShipsPlay({ boats, senderId, moves, meId, nameOf, onPlay, c }: PlayProps & { boats: number[][] }) {
  const tr = useT();
  const { shots, sunk, over } = battleship(boats, senderId, moves);
  const chooser = senderId === meId;
  const last = shots.at(-1);
  return (
    <>
      {!chooser && <Text style={[styles.note, { color: c.fg }]}>{tr.calls.sinkBoats(nameOf(senderId))}</Text>}
      <Sea
        boats={boats}
        shots={shots}
        show={chooser || over}
        onShoot={!chooser && onPlay && !over ? (shot) => onPlay({ shot }) : undefined}
        c={c}
      />
      {over ? (
        <Text style={[styles.verdict, { color: c.fg }]}>{tr.calls.sunkIn(shots.length)}</Text>
      ) : (
        <>
          <Text style={[styles.note, { color: c.fg }]}>{tr.calls.boatsSunk(sunk.length, boats.length)}</Text>
          {(chooser || !onPlay) && (
            <Text style={[styles.note, { color: c.fg, marginTop: 0 }]}>
              {last ? tr.calls.theyAreGuessing(nameOf(last.userId)) : tr.messages.waitingForReply}
            </Text>
          )}
        </>
      )}
    </>
  );
}

function BoardPlay({
  game,
  senderId,
  moves,
  meId,
  nameOf,
  onPlay,
  c,
}: PlayProps & { game: Extract<ChatGame, { game: "ttt" | "four" }> }) {
  const tr = useT();
  const g = boardGame(game, senderId, moves);
  const mine = !!onPlay && myTurn(g, senderId, meId);
  const next = g.turn === 0 ? senderId : g.opponent;
  return (
    <>
      <Board kind={game.game} board={g.board} win={g.win?.cells} onMove={mine ? onPlay : undefined} c={c} />
      {g.over ? (
        g.opponent && (
          <Verdict
            outcome={g.win ? (g.win.player === 0 ? 1 : -1) : 0}
            senderId={senderId}
            answerId={g.opponent}
            meId={meId}
            nameOf={nameOf}
            fg={c.fg}
          />
        )
      ) : (
        <Text style={[styles.note, { color: c.fg }, mine && { fontWeight: "700", opacity: 1 }]}>
          {mine ? tr.calls.yourTurn : next ? tr.calls.theirTurn(nameOf(next)) : tr.messages.waitingForReply}
        </Text>
      )}
    </>
  );
}

/** A game message: the sender's move waits in it until someone answers, then both see who won. */
export function GameView({
  game,
  senderId,
  moves,
  meId,
  mine,
  nameOf,
  onPlay,
  onSend,
}: {
  game: ChatGame;
  senderId: string;
  moves: GameMoveDTO[];
  meId: string;
  mine: boolean;
  nameOf: (userId: string) => string;
  onPlay?: (move: GameMove) => void;
  onSend?: (game: ChatGame) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const bubble = useBubbleColors();
  const [again, setAgain] = useState(false);
  const c = {
    fg: mine ? bubble.ink : (bubble.theirInk ?? t.text),
    button: mine ? alpha(bubble.ink, 0.12) : "rgba(235,138,0,0.15)",
  };
  const props = { senderId, moves, meId, nameOf, onPlay, c };
  const over = gameOver(game, senderId, moves, (sealed) => ("key" in game ? openGuess(game.key, sealed) : null));
  return (
    <View style={styles.view}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        <Text style={{ color: c.fg, fontSize: 15, fontWeight: "700" }}>
          {GAME_EMOJI[game.game]} {tr.calls[game.game]}
        </Text>
        <HowToPlay game={game.game} color={c.fg} size={18} />
      </View>
      {game.game === "guess" ? (
        <GuessPlay secret={game.secret} {...props} />
      ) : game.game === "hangman" ? (
        <HangmanPlay word={game.word} {...props} />
      ) : game.game === "riddle" || game.game === "sketch" ? (
        <TypedPlay game={game} {...props} />
      ) : game.game === "ships" ? (
        <ShipsPlay boats={game.boats} {...props} />
      ) : game.game === "ttt" || game.game === "four" ? (
        <BoardPlay game={game} {...props} />
      ) : (
        <DuelPlay game={game} {...props} />
      )}
      {over && onSend && (
        <Pressable
          onPress={() => setAgain(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.pill, { backgroundColor: c.button }, pressed && styles.pressed]}
        >
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "600" }}>{tr.calls.playAgain}</Text>
        </Pressable>
      )}
      {again && onSend && <NewGame initial={game.game} onClose={() => setAgain(false)} onSend={onSend} />}
    </View>
  );
}

/** The answer box under a riddle or drawing, matched loosely when they guess. */
function AnswerForm({ ready, onSend, children }: { ready: boolean; onSend: (answer: string) => void; children: React.ReactNode }) {
  const t = useTheme();
  const tr = useT();
  const [answer, setAnswer] = useState("");
  const ok = ready && looseAnswer(answer) !== "";
  return (
    <>
      {children}
      <TextInput
        value={answer}
        onChangeText={setAnswer}
        maxLength={GAME_TEXT.answer}
        placeholder={tr.calls.answer}
        placeholderTextColor={t.muted}
        accessibilityLabel={tr.calls.answer}
        returnKeyType="send"
        onSubmitEditing={() => ok && onSend(answer.trim())}
        style={[styles.input, { backgroundColor: t.field, color: t.text }]}
      />
      <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>{tr.calls.looseAnswer}</Text>
      <PrimaryButton title={tr.common.send} disabled={!ok} onPress={() => ok && onSend(answer.trim())} />
    </>
  );
}

function RiddleForm({ send }: { send: (g: ChatGame) => void }) {
  const t = useTheme();
  const tr = useT();
  const [emojis, setEmojis] = useState("");
  return (
    <AnswerForm ready={!!emojis.trim()} onSend={(answer) => send({ game: "riddle", emojis: emojis.trim(), answer, key: newGameKey() })}>
      <TextInput
        value={emojis}
        onChangeText={setEmojis}
        maxLength={GAME_TEXT.emojis}
        placeholder="🦁👑"
        placeholderTextColor={t.muted}
        accessibilityLabel={tr.calls.riddleEmojis}
        autoFocus
        style={[styles.input, { backgroundColor: t.field, color: t.text, fontSize: 26, textAlign: "center" }]}
      />
    </AnswerForm>
  );
}

function SketchForm({ send }: { send: (g: ChatGame) => void }) {
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  return (
    <AnswerForm ready={strokes.length > 0} onSend={(answer) => send({ game: "sketch", strokes, answer, key: newGameKey() })}>
      <SketchPad strokes={strokes} setStrokes={setStrokes} />
    </AnswerForm>
  );
}

function ShipsForm({ send, c }: { send: (g: ChatGame) => void; c: Colors }) {
  const tr = useT();
  const [boats, setBoats] = useState(randomFleet);
  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <Sea boats={boats} shots={[]} show c={c} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => setBoats(randomFleet())}
          accessibilityRole="button"
          style={({ pressed }) => [styles.sendPill, { backgroundColor: c.button }, pressed && styles.pressed]}
        >
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{tr.contacts.shuffle}</Text>
        </Pressable>
        <Pressable
          onPress={() => send({ game: "ships", boats })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.sendPill, { backgroundColor: c.button }, pressed && styles.pressed]}
        >
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "700" }}>{tr.common.send}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Picks a game and your move in it, then sends it as a message. */
export function NewGame({
  initial = "rps",
  onClose,
  onSend,
}: {
  initial?: GameKind;
  onClose: () => void;
  onSend: (game: ChatGame) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [game, setGame] = useState(initial);
  const [word, setWord] = useState("");
  const tabs = useRef<ComponentRef<typeof ScrollView>>(null);
  const c = { fg: t.text, button: t.field };
  const hint: Partial<Record<GameKind, string>> = {
    rps: tr.calls.pickHand,
    dice: tr.calls.pickDice,
    guess: tr.calls.pickSecret,
    hangman: tr.calls.pickWord,
    lie: tr.calls.writeLie,
    rather: tr.calls.writeRather,
    ships: tr.calls.hideBoats,
    ttt: tr.calls.firstMove,
    four: tr.calls.firstMove,
    sketch: tr.calls.drawSomething,
  };
  const send = (g: ChatGame) => {
    onSend(g);
    onClose();
  };
  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.text }]}>{tr.composer.newGame}</Text>
            <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          </View>
          <ScrollView
            ref={tabs}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -20, flexGrow: 0 }}
            contentContainerStyle={{ gap: 4, paddingHorizontal: 20 }}
            accessibilityRole="tablist"
          >
            {CHAT_GAMES.map((g) => (
              <Pressable
                key={g}
                onPress={() => setGame(g)}
                onLayout={g === initial ? (e) => tabs.current?.scrollTo({ x: e.nativeEvent.layout.x - 120, animated: false }) : undefined}
                accessibilityRole="tab"
                accessibilityState={{ selected: g === game }}
                style={[styles.tab, g === game && { backgroundColor: t.surfaceAlt }]}
              >
                <Text style={styles.tabIcon}>{GAME_EMOJI[g]}</Text>
                <Text style={{ color: t.text, fontSize: 11, fontWeight: "500", textAlign: "center" }}>{tr.calls[g]}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {hint[game] && <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>{hint[game]}</Text>}
          {game === "rps" ? (
            <Hands onPick={(hand) => send({ game: "rps", hand })} c={c} />
          ) : game === "dice" ? (
            <Faces onPick={(pick) => send({ game: "dice", pick, seed: randomSeed() })} c={c} />
          ) : game === "penalty" ? (
            <View style={{ alignItems: "center" }}>
              <Kicks onDone={(kicks) => send({ game: "penalty", ...kicks })} c={c} />
            </View>
          ) : game === "hangman" ? (
            <>
              <TextInput
                value={word}
                onChangeText={(v) => setWord(hangmanWord(v))}
                maxLength={HANGMAN_WORD.max}
                placeholderTextColor={t.muted}
                accessibilityLabel={tr.calls.pickWord}
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                returnKeyType="send"
                onSubmitEditing={() => word.length >= HANGMAN_WORD.min && send({ game: "hangman", word })}
                style={[styles.field, { backgroundColor: t.field, color: t.text }]}
              />
              <PrimaryButton
                title={tr.common.send}
                disabled={word.length < HANGMAN_WORD.min}
                onPress={() => send({ game: "hangman", word })}
              />
            </>
          ) : game === "lie" || game === "rather" ? (
            <ChoiceWriter
              key={game}
              count={game === "lie" ? 3 : 2}
              mark={game === "lie" ? "🤥" : "🙋"}
              markLabel={game === "lie" ? tr.calls.theLie : tr.calls.mine}
              placeholder={game === "lie" ? tr.calls.statement : tr.calls.option}
              onSend={(texts, chosen) =>
                send(game === "lie" ? { game, statements: texts, lie: chosen } : { game, options: texts, choice: chosen })
              }
            />
          ) : game === "riddle" ? (
            <RiddleForm send={send} />
          ) : game === "sketch" ? (
            <SketchForm send={send} />
          ) : game === "ships" ? (
            <ShipsForm send={send} c={c} />
          ) : game === "ttt" || game === "four" ? (
            <Board
              key={game}
              kind={game}
              board={Array(BOARDS[game].width * BOARDS[game].height).fill(null)}
              onMove={(m) => send("cell" in m ? { game: "ttt", cell: m.cell } : { game: "four", col: m.col })}
              c={c}
            />
          ) : (
            <View style={{ alignItems: "center" }}>
              <NumberGrid onPick={(secret) => send({ game: "guess", secret })} allowed={() => true} c={c} />
              <Pressable
                onPress={() => send({ game: "guess", secret: 1 + Math.floor(Math.random() * GUESS_MAX) })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.pill, { backgroundColor: t.field }, pressed && styles.pressed]}
              >
                <Text style={{ color: t.text, fontSize: 14, fontWeight: "500" }}>{tr.calls.random}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  view: { width: 256, maxWidth: "100%", paddingVertical: 4, alignItems: "center" },
  row: { flexDirection: "row", gap: 8, marginTop: 8, alignSelf: "stretch" },
  choice: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 8, borderRadius: 14 },
  choiceHand: { fontSize: 30 },
  pressed: { opacity: 0.6, transform: [{ scale: 0.95 }] },
  face: { flex: 1, aspectRatio: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  faceText: { fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 2, marginTop: 8, alignSelf: "stretch" },
  cell: { width: "9.2%", aspectRatio: 1, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  cellText: { fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"] },
  die: { alignSelf: "center", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#fff", elevation: 4, marginTop: 8 },
  dieText: { color: "#111", fontWeight: "700", fontVariant: ["tabular-nums"] },
  hands: { flexDirection: "row", justifyContent: "center", gap: 40, marginTop: 8 },
  handBox: { alignItems: "center", gap: 4, maxWidth: 100 },
  bigHand: { fontSize: 48, marginTop: 4 },
  note: { fontSize: 14, opacity: 0.8, marginTop: 6, textAlign: "center" },
  hint: { fontSize: 15, fontWeight: "700", marginTop: 8 },
  verdict: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  tries: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4, marginTop: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 14, fontVariant: ["tabular-nums"] },
  pill: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999 },
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  tabIcon: { fontSize: 26 },
  arrow: { fontSize: 26 },
  tab: { width: 76, alignItems: "center", gap: 2, paddingVertical: 8, borderRadius: 14 },
  choices: { alignSelf: "stretch", gap: 6, marginTop: 8 },
  choiceRow: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  writerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  mark: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  pad: { width: 260, aspectRatio: 1, borderRadius: 12, borderWidth: 1, backgroundColor: "#fff", overflow: "hidden" },
  swatches: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: "rgba(0,0,0,0.15)" },
  board: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8, alignSelf: "center" },
  seaCell: { width: 40, height: 40, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  tttCell: { width: 57, height: 57, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  fourCell: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  guessInput: { flex: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, fontSize: 15 },
  sendPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  scores: { alignSelf: "stretch", gap: 4, marginTop: 8 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  score: { width: 16, textAlign: "right", fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  word: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 2, marginTop: 8 },
  slot: { width: 16, borderBottomWidth: 2, alignItems: "center" },
  slotText: { fontSize: 18, fontWeight: "700" },
  fries: { flexDirection: "row", gap: 2, marginTop: 8 },
  key: { width: "13%", aspectRatio: 1, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 14, fontWeight: "600" },
  field: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, fontWeight: "700", letterSpacing: 4, textAlign: "center" },
});
