"use client";

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
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { Dialog } from "./dialog";

const dieFace = "grid place-items-center rounded-xl bg-white font-bold text-stone-900 shadow tabular-nums";
const randomSeed = () => Math.floor(Math.random() * 6);
const randomSide = () => PENALTY_SIDES[Math.floor(Math.random() * PENALTY_SIDES.length)]!;

/** Shakes for a beat before showing an answer that just came in; older ones show straight away. */
function useReveal(at: string) {
  const [revealed, setRevealed] = useState(() => Date.now() - Date.parse(at) > 3000);
  useEffect(() => {
    if (revealed) return;
    const t = setTimeout(() => setRevealed(true), 900);
    return () => clearTimeout(t);
  }, [revealed]);
  return revealed;
}

function Hands({ onPick, button }: { onPick: (hand: RpsHand) => void; button: string }) {
  const tr = useT();
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {RPS_HANDS.map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => onPick(h)}
          className={`flex flex-col items-center gap-0.5 rounded-xl py-2 ${button}`}
        >
          <span className="text-3xl">{RPS_EMOJI[h]}</span>
          <span className="text-xs opacity-75">{tr.calls.hands[h]}</span>
        </button>
      ))}
    </div>
  );
}

function Faces({ onPick, button }: { onPick: (n: number) => void; button: string }) {
  return (
    <div className="mt-2 grid grid-cols-6 gap-1.5">
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          className={`aspect-square rounded-lg font-bold tabular-nums ${button}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function NumberGrid({
  onPick,
  allowed,
  button,
}: {
  onPick: (n: number) => void;
  allowed: (n: number) => boolean;
  button: string;
}) {
  return (
    <div className="mt-2 grid grid-cols-10 gap-0.5">
      {Array.from({ length: GUESS_MAX }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          disabled={!allowed(n)}
          className={`aspect-square rounded text-[11px] font-semibold tabular-nums disabled:bg-transparent disabled:opacity-25 ${button}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** Your five shots and five dives, kick by kick, one tap each. */
function Kicks({ onDone, button }: { onDone: (kicks: PenaltyKicks) => void; button: string }) {
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
      <p className="mt-2 text-sm font-medium">{picks.length % 2 ? tr.calls.dive(kick) : tr.calls.shoot(kick)}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PENALTY_SIDES.map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => add([side])}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-2 ${button}`}
          >
            <span className="text-2xl">{PENALTY_ARROWS[side]}</span>
            <span className="text-xs opacity-75">{tr.calls.sides[side]}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => add(Array.from({ length: PENALTY_KICKS * 2 - picks.length }, randomSide))}
        className={`mt-3 rounded-full px-4 py-1.5 text-sm font-medium ${button}`}
      >
        {tr.calls.random}
      </button>
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
}: {
  outcome: number;
  senderId: string;
  answerId: string;
  meId: string;
  nameOf: (userId: string) => string;
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
  return <p className="reaction-pop mt-2 text-lg font-bold">{text}</p>;
}

function RpsResult({
  hand,
  answer,
  senderId,
  meId,
  nameOf,
}: {
  hand: RpsHand;
  answer: { userId: string; hand: RpsHand; at: string };
  senderId: string;
  meId: string;
  nameOf: (userId: string) => string;
}) {
  const revealed = useReveal(answer.at);
  return (
    <>
      <div className="mt-2 flex justify-center gap-10">
        {[
          { id: senderId, hand },
          { id: answer.userId, hand: answer.hand },
        ].map(({ id, hand }) => (
          <span key={id} className="flex min-w-0 flex-col items-center gap-1">
            <span className={`text-5xl ${revealed ? "reaction-pop" : "rps-shake"}`}>
              {revealed ? RPS_EMOJI[hand] : RPS_EMOJI.rock}
            </span>
            <span className="max-w-24 truncate text-xs opacity-70">{nameOf(id)}</span>
          </span>
        ))}
      </div>
      {revealed && (
        <Verdict
          outcome={rpsOutcome(hand, answer.hand)}
          senderId={senderId}
          answerId={answer.userId}
          meId={meId}
          nameOf={nameOf}
        />
      )}
    </>
  );
}

function DiceResult({
  pick,
  answer,
  senderId,
  meId,
  nameOf,
}: {
  pick: DicePick;
  answer: { userId: string; pick: DicePick; at: string };
  senderId: string;
  meId: string;
  nameOf: (userId: string) => string;
}) {
  const tr = useT();
  const revealed = useReveal(answer.at);
  const [face, setFace] = useState(1);
  useEffect(() => {
    if (revealed) return;
    const t = setInterval(() => setFace((f) => (f % 6) + 1), 90);
    return () => clearInterval(t);
  }, [revealed]);
  const roll = diceRoll(pick, answer.pick);
  return (
    <>
      <div className={`${dieFace} mx-auto mt-2 size-14 text-3xl ${revealed ? "reaction-pop" : "rps-shake"}`}>
        {revealed ? roll : face}
      </div>
      {revealed && (
        <>
          <p className="mt-2 text-sm opacity-80">{tr.calls.rolled(roll)}</p>
          <p className="truncate text-sm tabular-nums">
            {nameOf(senderId)} {pick.pick} · {answer.pick.pick} {nameOf(answer.userId)}
          </p>
          <Verdict
            outcome={diceOutcome(pick, answer.pick)}
            senderId={senderId}
            answerId={answer.userId}
            meId={meId}
            nameOf={nameOf}
          />
        </>
      )}
    </>
  );
}

function PenaltyResult({
  kicks,
  answer,
  senderId,
  meId,
  nameOf,
}: {
  kicks: PenaltyKicks;
  answer: { userId: string; kicks: PenaltyKicks; at: string };
  senderId: string;
  meId: string;
  nameOf: (userId: string) => string;
}) {
  const revealed = useReveal(answer.at);
  if (!revealed) return <div className="rps-shake mt-2 text-5xl">⚽</div>;
  const rows = [
    { id: senderId, goals: penaltyGoals(kicks.shots, answer.kicks.dives) },
    { id: answer.userId, goals: penaltyGoals(answer.kicks.shots, kicks.dives) },
  ];
  return (
    <>
      <div className="reaction-pop mt-2 space-y-1">
        {rows.map(({ id, goals }) => (
          <div key={id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-left text-sm">{nameOf(id)}</span>
            <span className="text-lg tracking-tight">{goals.map((g) => (g ? "⚽" : "🧤")).join("")}</span>
            <span className="w-4 text-right font-bold tabular-nums">{goals.filter(Boolean).length}</span>
          </div>
        ))}
      </div>
      <Verdict
        outcome={penaltyOutcome(kicks, answer.kicks)}
        senderId={senderId}
        answerId={answer.userId}
        meId={meId}
        nameOf={nameOf}
      />
    </>
  );
}

interface PlayProps {
  senderId: string;
  moves: GameMoveDTO[];
  meId: string;
  nameOf: (userId: string) => string;
  onPlay?: (move: GameMove) => void;
  button: string;
}

function DuelPlay({ game, senderId, moves, meId, nameOf, onPlay, button }: PlayProps & { game: ChatGame }) {
  const tr = useT();
  const answer = gameAnswer(game, senderId, moves);
  if (answer && game.game === "rps" && "hand" in answer.move) {
    const reply = { userId: answer.userId, hand: answer.move.hand, at: answer.at };
    return <RpsResult hand={game.hand} answer={reply} senderId={senderId} meId={meId} nameOf={nameOf} />;
  }
  if (answer && game.game === "dice" && "pick" in answer.move) {
    const reply = { userId: answer.userId, pick: answer.move, at: answer.at };
    return <DiceResult pick={game} answer={reply} senderId={senderId} meId={meId} nameOf={nameOf} />;
  }
  if (answer && game.game === "penalty" && "shots" in answer.move) {
    const reply = { userId: answer.userId, kicks: answer.move, at: answer.at };
    return <PenaltyResult kicks={game} answer={reply} senderId={senderId} meId={meId} nameOf={nameOf} />;
  }
  if (senderId === meId || !onPlay) {
    return (
      <>
        {senderId === meId && (
          <div className="reaction-pop mt-2">
            {game.game === "rps" ? (
              <span className="text-5xl">{RPS_EMOJI[game.hand]}</span>
            ) : (
              game.game === "dice" && <span className={`${dieFace} mx-auto size-12 text-2xl`}>{game.pick}</span>
            )}
          </div>
        )}
        <p className="mt-2 animate-pulse text-sm opacity-80">{tr.messages.waitingForReply}</p>
      </>
    );
  }
  return (
    <>
      <p className="mt-1 text-sm opacity-80">{tr.calls.theyPicked(nameOf(senderId))}</p>
      {game.game === "rps" ? (
        <Hands onPick={(hand) => onPlay({ hand })} button={button} />
      ) : game.game === "penalty" ? (
        <Kicks onDone={onPlay} button={button} />
      ) : (
        <>
          <p className="text-xs opacity-70">{tr.calls.pickDice}</p>
          <Faces onPick={(pick) => onPlay({ pick, seed: randomSeed() })} button={button} />
        </>
      )}
    </>
  );
}

function GuessPlay({ secret, senderId, moves, meId, nameOf, onPlay, button }: PlayProps & { secret: number }) {
  const tr = useT();
  const tries = guessTries(secret, senderId, moves);
  const last = tries.at(-1);
  const solved = last?.hint === "right";
  const { lo, hi } = guessRange({ ...NEW_GUESS, tries });
  const chooser = senderId === meId;
  return (
    <>
      <p className="mt-1 text-sm opacity-80">
        {chooser ? tr.calls.yourNumber(secret) : tr.calls.guessPrompt(nameOf(senderId))}
      </p>
      {tries.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {tries.map((t) => (
            <span
              key={t.n}
              className={`rounded-full px-2 py-0.5 text-sm tabular-nums ${
                t.hint === "right" ? "bg-green-600 text-white" : "bg-black/10"
              }`}
            >
              {t.n} {t.hint === "higher" ? "↑" : t.hint === "lower" ? "↓" : "✓"}
            </span>
          ))}
        </div>
      )}
      {solved ? (
        <>
          <p className="reaction-pop mt-2 text-lg font-bold">{tr.calls.hints.right}</p>
          <p className="text-sm opacity-80">{tr.calls.foundIn(tries.length)}</p>
        </>
      ) : chooser || !onPlay ? (
        <p className="mt-2 animate-pulse text-sm opacity-80">
          {last ? tr.calls.theyAreGuessing(nameOf(last.userId)) : tr.messages.waitingForReply}
        </p>
      ) : (
        <>
          {last && <p className="reaction-pop mt-2 font-semibold">{tr.calls.hints[last.hint]}</p>}
          <NumberGrid
            onPick={(n) => onPlay({ n })}
            allowed={(n) => n >= lo && n <= hi && !tries.some((t) => t.n === n)}
            button={button}
          />
        </>
      )}
    </>
  );
}

function HangmanPlay({ word, senderId, moves, meId, nameOf, onPlay, button }: PlayProps & { word: string }) {
  const tr = useT();
  const { tried, misses, solved, lost } = hangman(word, senderId, moves);
  const last = tried.at(-1);
  const chooser = senderId === meId;
  const missed = tried.filter((t) => !t.hit).map((t) => t.letter);
  return (
    <>
      <p className="mt-1 text-sm opacity-80">{chooser ? tr.calls.yourWord : tr.calls.wordPrompt(nameOf(senderId))}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-0.5 font-mono text-lg font-bold">
        {[...word].map((c, i) => {
          const found = tried.some((t) => t.letter === c);
          return (
            <span key={i} className={`w-4 border-b-2 border-current ${found ? "" : "opacity-40"}`}>
              {found || chooser || lost ? c : "\u00a0"}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-xl" aria-label={tr.calls.friesLeft(HANGMAN_LIVES - misses)}>
        {Array.from({ length: HANGMAN_LIVES }, (_, i) => (
          <span key={i} className={i < misses ? "opacity-20 grayscale" : ""}>
            🍟
          </span>
        ))}
      </p>
      {missed.length > 0 && <p className="text-sm tracking-widest line-through opacity-70">{missed.join("")}</p>}
      {(solved || lost) && last ? (
        <Verdict outcome={solved ? -1 : 1} senderId={senderId} answerId={last.userId} meId={meId} nameOf={nameOf} />
      ) : chooser || !onPlay ? (
        <p className="mt-2 animate-pulse text-sm opacity-80">
          {last ? tr.calls.theyAreGuessing(nameOf(last.userId)) : tr.messages.waitingForReply}
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-7 gap-1">
          {HANGMAN_LETTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              onClick={() => onPlay({ letter })}
              disabled={tried.some((t) => t.letter === letter)}
              className={`aspect-square rounded-md text-sm font-semibold disabled:bg-transparent disabled:opacity-25 ${button}`}
            >
              {letter}
            </button>
          ))}
        </div>
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
  const tr = useT();
  const [again, setAgain] = useState(false);
  const button = `transition active:scale-95 ${mine ? "bg-black/10 hover:bg-black/15" : "bg-brand/15 hover:bg-brand/25"}`;
  const props = { senderId, moves, meId, nameOf, onPlay, button };
  const over = gameOver(game, senderId, moves);
  return (
    <div className="w-72 max-w-full py-1 text-center">
      <p className="font-semibold">
        {GAME_EMOJI[game.game]} {tr.calls[game.game]}
      </p>
      {game.game === "guess" ? (
        <GuessPlay secret={game.secret} {...props} />
      ) : game.game === "hangman" ? (
        <HangmanPlay word={game.word} {...props} />
      ) : (
        <DuelPlay game={game} {...props} />
      )}
      {over && onSend && (
        <button
          type="button"
          onClick={() => setAgain(true)}
          className={`mt-3 rounded-full px-4 py-1.5 text-sm font-semibold ${button}`}
        >
          {tr.calls.playAgain}
        </button>
      )}
      {again && onSend && <GameDialog initial={game.game} onClose={() => setAgain(false)} onSend={onSend} />}
    </div>
  );
}

/** Picks a game and your move in it, then sends it as a message. */
export function GameDialog({
  initial = "rps",
  onClose,
  onSend,
}: {
  initial?: GameKind;
  onClose: () => void;
  onSend: (game: ChatGame) => void;
}) {
  const tr = useT();
  const [game, setGame] = useState(initial);
  const [word, setWord] = useState("");
  const button = "transition active:scale-95 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700";
  const send = (g: ChatGame) => {
    onSend(g);
    onClose();
  };
  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">{tr.composer.newGame}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="p-4 text-center">
        <div role="tablist" aria-label={tr.calls.games} className="flex gap-2">
          {CHAT_GAMES.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={g === game}
              onClick={() => setGame(g)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[11px] leading-tight font-medium transition ${
                g === game ? "bg-stone-200 dark:bg-stone-700" : "hover:bg-stone-100 dark:hover:bg-stone-800"
              }`}
            >
              <span className="text-2xl">{GAME_EMOJI[g]}</span>
              {tr.calls[g]}
            </button>
          ))}
        </div>
        {game === "rps" ? (
          <>
            <p className="mt-4 text-sm text-stone-500">{tr.calls.pickHand}</p>
            <Hands onPick={(hand) => send({ game: "rps", hand })} button={button} />
          </>
        ) : game === "dice" ? (
          <>
            <p className="mt-4 text-sm text-stone-500">{tr.calls.pickDice}</p>
            <Faces onPick={(pick) => send({ game: "dice", pick, seed: randomSeed() })} button={button} />
          </>
        ) : game === "penalty" ? (
          <div className="mt-2">
            <Kicks onDone={(kicks) => send({ game: "penalty", ...kicks })} button={button} />
          </div>
        ) : game === "hangman" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (word.length >= HANGMAN_WORD.min) send({ game: "hangman", word });
            }}
          >
            <p className="mt-4 text-sm text-stone-500">{tr.calls.pickWord}</p>
            <input
              value={word}
              onChange={(e) => setWord(hangmanWord(e.target.value))}
              maxLength={HANGMAN_WORD.max}
              aria-label={tr.calls.pickWord}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="mt-2 block w-full rounded-xl bg-stone-100 px-3 py-2.5 text-center font-mono text-[16px] font-bold tracking-widest dark:bg-stone-800"
            />
            <button
              type="submit"
              disabled={word.length < HANGMAN_WORD.min}
              className={`mt-3 rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50 ${button}`}
            >
              {tr.common.send}
            </button>
          </form>
        ) : (
          <>
            <p className="mt-4 text-sm text-stone-500">{tr.calls.pickSecret}</p>
            <NumberGrid onPick={(secret) => send({ game: "guess", secret })} allowed={() => true} button={button} />
            <button
              type="button"
              onClick={() => send({ game: "guess", secret: 1 + Math.floor(Math.random() * GUESS_MAX) })}
              className={`mt-3 rounded-full px-4 py-1.5 text-sm font-medium ${button}`}
            >
              {tr.calls.random}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
