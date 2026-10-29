import {
  CHAT_GAMES,
  type ChatGame,
  type DicePick,
  GAME_EMOJI,
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
  diceOutcome,
  diceRoll,
  gameAnswer,
  gameOver,
  guessRange,
  guessTries,
  hangman,
  hangmanWord,
  penaltyGoals,
  penaltyOutcome,
  rpsOutcome,
} from "@six/shared";
import { X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "./text";
import { alpha, useBubbleColors } from "@/lib/bubble-colors";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { IconButton, PrimaryButton } from "./ui";

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
  const over = gameOver(game, senderId, moves);
  return (
    <View style={styles.view}>
      <Text style={{ color: c.fg, fontSize: 15, fontWeight: "700" }}>
        {GAME_EMOJI[game.game]} {tr.calls[game.game]}
      </Text>
      {game.game === "guess" ? (
        <GuessPlay secret={game.secret} {...props} />
      ) : game.game === "hangman" ? (
        <HangmanPlay word={game.word} {...props} />
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
  const c = { fg: t.text, button: t.field };
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
          <View style={styles.row} accessibilityRole="tablist">
            {CHAT_GAMES.map((g) => (
              <Pressable
                key={g}
                onPress={() => setGame(g)}
                accessibilityRole="tab"
                accessibilityState={{ selected: g === game }}
                style={[styles.choice, g === game && { backgroundColor: t.surfaceAlt }]}
              >
                <Text style={styles.tabIcon}>{GAME_EMOJI[g]}</Text>
                <Text style={{ color: t.text, fontSize: 11, fontWeight: "500", textAlign: "center" }}>{tr.calls[g]}</Text>
              </Pressable>
            ))}
          </View>
          {game !== "penalty" && (
            <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>
              {game === "rps"
                ? tr.calls.pickHand
                : game === "dice"
                  ? tr.calls.pickDice
                  : game === "hangman"
                    ? tr.calls.pickWord
                    : tr.calls.pickSecret}
            </Text>
          )}
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
