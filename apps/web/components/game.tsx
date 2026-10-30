"use client";

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
import { Undo2, X } from "lucide-react";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Dialog } from "./dialog";
import { HowToPlay } from "./how-to-play";

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

/** Statements or choices, one per row; `note` adds a line under one, such as who picked it. */
function ChoiceList({
  items,
  onPick,
  note,
  button,
}: {
  items: string[];
  onPick?: (i: number) => void;
  note?: (i: number) => string;
  button: string;
}) {
  return (
    <div className="mt-2 space-y-1.5 text-left">
      {items.map((text, i) => {
        const body = (
          <>
            <span className="block break-words">{text}</span>
            {note?.(i) && <span className="mt-0.5 block text-xs font-semibold">{note(i)}</span>}
          </>
        );
        return onPick ? (
          <button key={i} type="button" onClick={() => onPick(i)} className={`block w-full rounded-xl px-3 py-2 text-sm ${button}`}>
            {body}
          </button>
        ) : (
          <div key={i} className="rounded-xl bg-black/5 px-3 py-2 text-sm">
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Text boxes for statements or choices, with a button beside each to mark the one that's the lie, or yours. */
function ChoiceWriter({
  count,
  mark,
  markLabel,
  placeholder,
  onSend,
  button,
}: {
  count: number;
  mark: string;
  markLabel: string;
  placeholder: (n: number) => string;
  onSend: (texts: string[], chosen: number) => void;
  button: string;
}) {
  const tr = useT();
  const [texts, setTexts] = useState<string[]>(() => Array(count).fill(""));
  const [chosen, setChosen] = useState<number | null>(null);
  const ready = chosen !== null && texts.every((t) => t.trim());
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSend(texts.map((t) => t.trim()), chosen);
      }}
      className="mt-3 space-y-2"
    >
      {texts.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={t}
            onChange={(e) => setTexts(texts.map((x, j) => (j === i ? e.target.value : x)))}
            maxLength={GAME_TEXT.line}
            placeholder={placeholder(i + 1)}
            aria-label={placeholder(i + 1)}
            autoFocus={i === 0}
            className="min-w-0 flex-1 rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] dark:bg-stone-800 md:text-sm"
          />
          <button
            type="button"
            onClick={() => setChosen(i)}
            aria-label={markLabel}
            aria-pressed={chosen === i}
            className={`grid size-10 shrink-0 place-items-center rounded-full text-xl transition ${
              chosen === i ? "bg-brand/25 ring-2 ring-brand" : "opacity-40 grayscale hover:opacity-70"
            }`}
          >
            {mark}
          </button>
        </div>
      ))}
      <button type="submit" disabled={!ready} className={`rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50 ${button}`}>
        {tr.common.send}
      </button>
    </form>
  );
}

function Sketch({ strokes, className = "", ...props }: { strokes: DrawStroke[] } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={`0 0 ${DRAW.scale} ${DRAW.scale}`} className={`aspect-square w-full rounded-xl bg-white ${className}`} {...props}>
      {strokes.map((s, i) => (
        <path
          key={i}
          d={strokePath(s.points)}
          stroke={EDIT_COLORS[s.color]}
          strokeWidth={DRAW.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </svg>
  );
}

function SketchPad({ strokes, setStrokes }: { strokes: DrawStroke[]; setStrokes: Dispatch<SetStateAction<DrawStroke[]>> }) {
  const tr = useT();
  const [color, setColor] = useState(1);
  const drawing = useRef(false);
  const at = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
  };
  return (
    <>
      <Sketch
        strokes={strokes}
        className="mt-3 cursor-crosshair touch-none ring-1 ring-stone-200 dark:ring-stone-700"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const [x, y] = at(e);
          setStrokes((s) => {
            const next = drawStart(s, color, x, y);
            drawing.current = next !== s;
            return next;
          });
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const [x, y] = at(e);
          setStrokes((s) => drawTo(s, x, y));
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      <div className="mt-2 flex items-center gap-1.5">
        {EDIT_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(i)}
            aria-label={c}
            aria-pressed={color === i}
            style={{ backgroundColor: c }}
            className={`size-7 rounded-full ring-1 ring-black/15 ${color === i ? "outline-2 outline-offset-2 outline-brand" : ""}`}
          />
        ))}
        <button
          type="button"
          onClick={() => setStrokes((s) => s.slice(0, -1))}
          disabled={!strokes.length}
          aria-label={tr.composer.undo}
          className="ml-auto grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
        >
          <Undo2 className="size-4" />
        </button>
      </div>
    </>
  );
}

/** The 5 by 5 sea: misses splash, hits burn once their boat is sunk. Unshot boats show when `show` is set. */
function Sea({
  boats,
  shots,
  show,
  onShoot,
  button,
}: {
  boats: number[][];
  shots: { cell: number; hit: boolean }[];
  show: boolean;
  onShoot?: (cell: number) => void;
  button: string;
}) {
  const sunk = new Set(boats.filter((b) => b.every((c) => shots.some((s) => s.cell === c))).flat());
  return (
    <div className="mx-auto mt-2 grid w-full max-w-60 grid-cols-5 gap-1">
      {Array.from({ length: SHIPS.size ** 2 }, (_, i) => {
        const shot = shots.find((s) => s.cell === i);
        const boat = boats.some((b) => b.includes(i));
        if (onShoot && !shot) {
          return (
            <button key={i} type="button" onClick={() => onShoot(i)} aria-label={String(i + 1)} className={`aspect-square rounded-md ${button}`} />
          );
        }
        return (
          <span
            key={i}
            className={`grid aspect-square place-items-center rounded-md text-lg ${boat && (show || shot) ? "bg-sky-500/30" : "bg-black/5"}`}
          >
            {shot ? (sunk.has(i) ? "🔥" : shot.hit ? "💥" : "💦") : boat && show ? "🚢" : ""}
          </span>
        );
      })}
    </div>
  );
}

function Board({
  kind,
  board,
  win,
  onMove,
  button,
}: {
  kind: "ttt" | "four";
  board: (0 | 1 | null)[];
  win?: number[];
  onMove?: (move: { cell: number } | { col: number }) => void;
  button: string;
}) {
  const { width } = BOARDS[kind];
  return (
    <div className={`mx-auto mt-2 grid w-full gap-1 ${kind === "ttt" ? "max-w-48 grid-cols-3" : "max-w-64 grid-cols-7"}`}>
      {board.map((p, i) => {
        const col = i % width;
        const open = kind === "ttt" ? p === null : board[col] === null;
        const mark = p === null ? "" : kind === "ttt" ? (p ? "⭕" : "❌") : p ? "🟡" : "🔴";
        const cell = `grid aspect-square place-items-center ${kind === "ttt" ? "rounded-lg text-2xl" : "rounded-full text-base"}`;
        const lit = win?.includes(i) ? "bg-green-600/40" : "";
        return onMove && open ? (
          <button
            key={i}
            type="button"
            onClick={() => onMove(kind === "ttt" ? { cell: i } : { col })}
            aria-label={String((kind === "ttt" ? i : col) + 1)}
            className={`${cell} ${button}`}
          >
            {mark}
          </button>
        ) : (
          <span key={i} className={`${cell} ${lit || "bg-black/5"}`}>
            {mark}
          </span>
        );
      })}
    </div>
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
  if (answer && game.game === "lie" && "choice" in answer.move) {
    const { choice } = answer.move;
    const note = (i: number) =>
      [i === game.lie && `🤥 ${tr.calls.theLie}`, i === choice && `👆 ${nameOf(answer.userId)}`].filter(Boolean).join(" · ");
    return (
      <>
        <ChoiceList items={game.statements} note={note} button={button} />
        <Verdict outcome={choice === game.lie ? -1 : 1} senderId={senderId} answerId={answer.userId} meId={meId} nameOf={nameOf} />
      </>
    );
  }
  if (answer && game.game === "rather" && "choice" in answer.move) {
    const { choice } = answer.move;
    const note = (i: number) => [i === game.choice && nameOf(senderId), i === choice && nameOf(answer.userId)].filter(Boolean).join(" · ");
    return (
      <>
        <p className="mt-1 text-sm opacity-80">{tr.calls.ratherPrompt}</p>
        <ChoiceList items={game.options} note={note} button={button} />
        <p className="reaction-pop mt-2 text-lg font-bold">{choice === game.choice ? tr.calls.sameBrain : tr.calls.notSameBrain}</p>
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
          <p className="mt-1 text-sm opacity-80">
            {game.game === "rather" ? tr.calls.ratherPrompt : tr.calls.spotLie(nameOf(senderId))}
          </p>
        )}
        <ChoiceList
          items={items}
          onPick={play ? (choice) => play({ choice }) : undefined}
          note={senderId === meId ? (i) => (i === chosen ? (game.game === "lie" ? "🤥" : "✓") : "") : undefined}
          button={button}
        />
        {!play && <p className="mt-2 animate-pulse text-sm opacity-80">{tr.messages.waitingForReply}</p>}
      </>
    );
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

function TypedPlay({
  game,
  senderId,
  moves,
  meId,
  nameOf,
  onPlay,
  button,
}: PlayProps & { game: Extract<ChatGame, { game: "riddle" | "sketch" }> }) {
  const tr = useT();
  const [text, setText] = useState("");
  const guesses = typedGuesses(game.answer, senderId, moves, (sealed) => openGuess(game.key, sealed));
  const last = guesses.at(-1);
  const chooser = senderId === meId;
  return (
    <>
      {game.game === "riddle" ? (
        <p className="mt-2 text-4xl leading-tight break-words">{game.emojis}</p>
      ) : (
        <Sketch strokes={game.strokes} className="mt-2" />
      )}
      <p className="mt-1 text-sm opacity-80">
        {chooser || last?.right
          ? tr.calls.theAnswer(game.answer)
          : game.game === "riddle"
            ? tr.calls.riddlePrompt(nameOf(senderId))
            : tr.calls.drawPrompt(nameOf(senderId))}
      </p>
      {guesses.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {guesses.map((g, i) => (
            <span
              key={i}
              className={`max-w-full truncate rounded-full px-2 py-0.5 text-sm ${g.right ? "bg-green-600 text-white" : "bg-black/10 line-through"}`}
            >
              {g.text}
            </span>
          ))}
        </div>
      )}
      {last?.right ? (
        <>
          <p className="reaction-pop mt-2 text-lg font-bold">{tr.calls.hints.right}</p>
          <p className="text-sm opacity-80">{tr.calls.foundIn(guesses.length)}</p>
        </>
      ) : chooser || !onPlay ? (
        <p className="mt-2 animate-pulse text-sm opacity-80">
          {last ? tr.calls.theyAreGuessing(nameOf(last.userId)) : tr.messages.waitingForReply}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const guess = text.trim();
            if (!guess) return;
            onPlay({ sealed: sealGuess(game.key, guess) });
            setText("");
          }}
          className="mt-2 flex gap-1.5"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={GAME_TEXT.answer}
            placeholder={tr.calls.yourGuess}
            aria-label={tr.calls.yourGuess}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-full bg-black/10 px-3 py-1.5 text-[16px] placeholder:text-current placeholder:opacity-60 md:text-sm"
          />
          <button type="submit" disabled={!text.trim()} className={`rounded-full px-3 text-sm font-semibold disabled:opacity-50 ${button}`}>
            {tr.common.send}
          </button>
        </form>
      )}
    </>
  );
}

function ShipsPlay({ boats, senderId, moves, meId, nameOf, onPlay, button }: PlayProps & { boats: number[][] }) {
  const tr = useT();
  const { shots, sunk, over } = battleship(boats, senderId, moves);
  const chooser = senderId === meId;
  const last = shots.at(-1);
  return (
    <>
      {!chooser && <p className="mt-1 text-sm opacity-80">{tr.calls.sinkBoats(nameOf(senderId))}</p>}
      <Sea
        boats={boats}
        shots={shots}
        show={chooser || over}
        onShoot={!chooser && onPlay && !over ? (shot) => onPlay({ shot }) : undefined}
        button={button}
      />
      {over ? (
        <p className="reaction-pop mt-2 text-lg font-bold">{tr.calls.sunkIn(shots.length)}</p>
      ) : (
        <>
          <p className="mt-2 text-sm opacity-80">{tr.calls.boatsSunk(sunk.length, boats.length)}</p>
          {(chooser || !onPlay) && (
            <p className="animate-pulse text-sm opacity-80">
              {last ? tr.calls.theyAreGuessing(nameOf(last.userId)) : tr.messages.waitingForReply}
            </p>
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
  button,
}: PlayProps & { game: Extract<ChatGame, { game: "ttt" | "four" }> }) {
  const tr = useT();
  const g = boardGame(game, senderId, moves);
  const mine = !!onPlay && myTurn(g, senderId, meId);
  const next = g.turn === 0 ? senderId : g.opponent;
  return (
    <>
      <Board kind={game.game} board={g.board} win={g.win?.cells} onMove={mine ? onPlay : undefined} button={button} />
      {g.over ? (
        g.opponent && (
          <Verdict
            outcome={g.win ? (g.win.player === 0 ? 1 : -1) : 0}
            senderId={senderId}
            answerId={g.opponent}
            meId={meId}
            nameOf={nameOf}
          />
        )
      ) : (
        <p className={`mt-2 text-sm ${mine ? "font-semibold" : "animate-pulse opacity-80"}`}>
          {mine ? tr.calls.yourTurn : next ? tr.calls.theirTurn(nameOf(next)) : tr.messages.waitingForReply}
        </p>
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
  const over = gameOver(game, senderId, moves, (sealed) => ("key" in game ? openGuess(game.key, sealed) : null));
  return (
    <div className="w-72 max-w-full py-1 text-center">
      <p className="flex items-center justify-center gap-1 font-semibold">
        {GAME_EMOJI[game.game]} {tr.calls[game.game]}
        <HowToPlay game={game.game} className="-my-1 size-7" />
      </p>
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

/** The answer box under a riddle or drawing, matched loosely when they guess. */
function AnswerForm({
  ready,
  onSend,
  button,
  children,
}: {
  ready: boolean;
  onSend: (answer: string) => void;
  button: string;
  children: React.ReactNode;
}) {
  const tr = useT();
  const [answer, setAnswer] = useState("");
  const ok = ready && looseAnswer(answer) !== "";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSend(answer.trim());
      }}
    >
      {children}
      <input
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        maxLength={GAME_TEXT.answer}
        placeholder={tr.calls.answer}
        aria-label={tr.calls.answer}
        autoComplete="off"
        className="mt-3 block w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] dark:bg-stone-800 md:text-sm"
      />
      <p className="mt-1 text-xs text-stone-500">{tr.calls.looseAnswer}</p>
      <button type="submit" disabled={!ok} className={`mt-3 rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50 ${button}`}>
        {tr.common.send}
      </button>
    </form>
  );
}

function RiddleForm({ send, button }: { send: (g: ChatGame) => void; button: string }) {
  const tr = useT();
  const [emojis, setEmojis] = useState("");
  return (
    <AnswerForm
      ready={!!emojis.trim()}
      onSend={(answer) => send({ game: "riddle", emojis: emojis.trim(), answer, key: newGameKey() })}
      button={button}
    >
      <input
        value={emojis}
        onChange={(e) => setEmojis(e.target.value)}
        maxLength={GAME_TEXT.emojis}
        placeholder="🦁👑"
        aria-label={tr.calls.riddleEmojis}
        autoFocus
        autoComplete="off"
        className="mt-4 block w-full rounded-xl bg-stone-100 px-3 py-2.5 text-center text-2xl dark:bg-stone-800"
      />
    </AnswerForm>
  );
}

function SketchForm({ send, button }: { send: (g: ChatGame) => void; button: string }) {
  const tr = useT();
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  return (
    <AnswerForm
      ready={strokes.length > 0}
      onSend={(answer) => send({ game: "sketch", strokes, answer, key: newGameKey() })}
      button={button}
    >
      <p className="mt-4 text-sm text-stone-500">{tr.calls.drawSomething}</p>
      <SketchPad strokes={strokes} setStrokes={setStrokes} />
    </AnswerForm>
  );
}

function ShipsForm({ send, button }: { send: (g: ChatGame) => void; button: string }) {
  const tr = useT();
  const [boats, setBoats] = useState(randomFleet);
  return (
    <>
      <p className="mt-4 text-sm text-stone-500">{tr.calls.hideBoats}</p>
      <Sea boats={boats} shots={[]} show button={button} />
      <div className="mt-3 flex justify-center gap-2">
        <button type="button" onClick={() => setBoats(randomFleet())} className={`rounded-full px-4 py-1.5 text-sm font-medium ${button}`}>
          {tr.contacts.shuffle}
        </button>
        <button
          type="button"
          onClick={() => send({ game: "ships", boats })}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${button}`}
        >
          {tr.common.send}
        </button>
      </div>
    </>
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
  const tabs = useCallback(
    (el: HTMLDivElement | null) => el?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest", inline: "center" }),
    [],
  );
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
        <div ref={tabs} role="tablist" aria-label={tr.calls.games} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
          {CHAT_GAMES.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={g === game}
              onClick={() => setGame(g)}
              className={`flex w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[11px] leading-tight font-medium transition ${
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
        ) : game === "lie" || game === "rather" ? (
          <>
            <p className="mt-4 text-sm text-stone-500">{game === "lie" ? tr.calls.writeLie : tr.calls.writeRather}</p>
            <ChoiceWriter
              key={game}
              count={game === "lie" ? 3 : 2}
              mark={game === "lie" ? "🤥" : "🙋"}
              markLabel={game === "lie" ? tr.calls.theLie : tr.calls.mine}
              placeholder={game === "lie" ? tr.calls.statement : tr.calls.option}
              onSend={(texts, chosen) =>
                send(game === "lie" ? { game, statements: texts, lie: chosen } : { game, options: texts, choice: chosen })
              }
              button={button}
            />
          </>
        ) : game === "riddle" ? (
          <RiddleForm send={send} button={button} />
        ) : game === "sketch" ? (
          <SketchForm send={send} button={button} />
        ) : game === "ships" ? (
          <ShipsForm send={send} button={button} />
        ) : game === "ttt" || game === "four" ? (
          <>
            <p className="mt-4 text-sm text-stone-500">{tr.calls.firstMove}</p>
            <Board
              key={game}
              kind={game}
              board={Array(BOARDS[game].width * BOARDS[game].height).fill(null)}
              onMove={(m) => send("cell" in m ? { game: "ttt", cell: m.cell } : { game: "four", col: m.col })}
              button={button}
            />
          </>
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
