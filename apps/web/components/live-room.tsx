"use client";

import {
  type GifDTO,
  LIVE_EMOJI,
  LIVE_SEATS,
  LIVE_VOICE_MS,
  type LiveChatLineDTO,
  type LiveReplyDTO,
  type LiveRoomDTO,
  SEAT_COLORS,
  WIN_BURST,
  dotsScores,
  fanoronaCounts,
  marketScores,
  memoryScores,
  parseCommand,
  snackScores,
} from "@six/shared";
import { Bot, ChevronLeft, MessageCircle, Mic, MoreVertical, Reply, SendHorizontal, Smile, SmilePlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { clockTime, formatDuration } from "@/lib/format";
import { useCountdown, useLiveRoom, useMyTurn } from "@/lib/live";
import { type Recording, useRecorder } from "@/lib/recorder";
import { setGameSound, useGameMusic, useGameSound } from "@/lib/game-sound";
import { useSession } from "@/lib/session";
import { useSwipe } from "@/lib/swipe";
import { VoicePlayer } from "./attachment";
import { Avatar } from "./avatar";
import { DotsBoard } from "./dots-board";
import { EightsTable } from "./eights-table";
import { Emojis } from "./emoji-picker";
import { FanoronaBoard } from "./fanorona-board";
import { useGifs } from "./gif-picker";
import { HowToPlay } from "./how-to-play";
import { LudoBoard } from "./ludo-board";
import { MarketBoard } from "./market-board";
import { MemoryBoard } from "./memory-board";
import { ReflexBoard } from "./reflex-board";
import { SnackBoard } from "./snack-board";
import { ReactionChips, ReactionPicker, ReactionPopover } from "./reactions";
import { Sheet } from "./sheet";
import { WordHunt } from "./word-hunt";

const iconButton =
  "grid size-10 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800";
const pill = "rounded-full px-5 py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-50";

function Face({ room, seat }: { room: LiveRoomDTO; seat: number }) {
  const user = room.seats[seat]!.user;
  return user ? (
    <Avatar user={user} />
  ) : (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/15 text-lg">🤖</span>
  );
}

/** Everyone at the table: whose turn it is, their colour, cards or points, and how long the current player has left. */
function Players({ room, nameOf }: { room: LiveRoomDTO; nameOf: (seat: number) => string }) {
  const tr = useT();
  const seconds = useCountdown(room.deadline);
  const view = room.view;
  const turn = view && view.game !== "words" && view.game !== "reflex" && room.status === "playing" ? view.state.turn : null;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {room.seats.map((s, i) => {
        const extra =
          view?.game === "ludo"
            ? null
            : view?.game === "eights"
              ? tr.live.cards(view.state.counts[i]!)
              : view?.game === "words"
                ? tr.live.points(view.state.scores[i]!)
                : view?.game === "dots"
                  ? tr.live.boxes(dotsScores(view.state)[i]!)
                  : view?.game === "fanorona"
                    ? tr.live.stones(fanoronaCounts(view.state)[i]!)
                    : view?.game === "memory"
                      ? tr.live.pairs(memoryScores(view.state)[i]!)
                      : view?.game === "reflex"
                        ? tr.live.points(view.state.scores[i]!)
                        : view?.game === "market"
                          ? tr.live.marketFound(marketScores(view.state)[i]!)
                          : view?.game === "snack"
                            ? `🍬 ${snackScores(view.state)[i]!}`
                            : null;
        return (
          <div
            key={i}
            className={`flex items-center gap-2 rounded-full py-1 pr-3 pl-1 ring-1 transition ${
              turn === i ? "bg-brand/15 ring-brand" : "bg-white/70 ring-black/5 dark:bg-stone-900/70 dark:ring-white/10"
            } ${s.left || s.gaveUp ? "opacity-50" : ""}`}
          >
            <span className="relative">
              <Face room={room} seat={i} />
              {(view?.game === "ludo" || view?.game === "dots" || view?.game === "memory" || view?.game === "market" || view?.game === "snack") && (
                <span
                  className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-white"
                  style={{ background: SEAT_COLORS[view.game === "ludo" ? view.state.colors[i]! : i] }}
                />
              )}
            </span>
            <span className="text-sm leading-tight">
              <span className="block max-w-28 truncate font-medium">{nameOf(i)}</span>
              <span className="block text-xs text-stone-500">
                {s.gaveUp ? tr.live.gaveUp : s.left ? tr.live.left : turn === i && seconds !== null ? `${seconds}s` : extra}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Lobby({ room, nameOf, ask }: { room: LiveRoomDTO; nameOf: (seat: number) => string; ask: Ask }) {
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const host = room.hostId === meId;
  const { min, max } = LIVE_SEATS[room.game];
  const hostSeat = room.seats.findIndex((s) => s.user?.id === room.hostId);
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <p className="text-center text-sm text-stone-500">{tr.live.waiting}</p>
      <ul className="divide-y divide-black/5 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 dark:divide-white/10 dark:bg-stone-900 dark:ring-white/10">
        {room.seats.map((s, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5">
            <Face room={room} seat={i} />
            <span className="min-w-0 flex-1 truncate font-medium">{nameOf(i)}</span>
            {s.user?.id === room.hostId && <span className="text-xs text-stone-500">{tr.live.host}</span>}
            {!s.user && host && (
              <button
                type="button"
                onClick={() => void ask("live:bot", { add: false })}
                className="text-sm font-medium text-red-600 dark:text-red-400"
              >
                {tr.live.remove}
              </button>
            )}
          </li>
        ))}
        {room.invited.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
            <Avatar user={u} />
            <span className="min-w-0 flex-1 truncate">{u.displayName}</span>
            <span className="animate-pulse text-xs text-stone-500">{tr.live.invited}</span>
          </li>
        ))}
      </ul>
      {host ? (
        <div className="flex flex-col items-center gap-2">
          {room.seats.length < max && (
            <button
              type="button"
              onClick={() => void ask("live:bot", { add: true })}
              className={`${pill} flex items-center gap-2 bg-black/5 dark:bg-white/10`}
            >
              <Bot className="size-4" /> {tr.live.addBot}
            </button>
          )}
          <button
            type="button"
            disabled={room.seats.length < min}
            onClick={() => void ask("live:start", {})}
            className={`${pill} bg-brand px-8 text-base text-brand-ink`}
          >
            {tr.live.start}
          </button>
          {room.seats.length < min && <p className="text-center text-xs text-stone-500">{tr.live.needPlayers(min)}</p>}
        </div>
      ) : (
        <p className="text-center text-sm font-medium">{tr.live.waitingForHost(nameOf(hostSeat))}</p>
      )}
    </div>
  );
}

/** Food thrown up from the middle of the screen when you win. */
function WinBurst() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 motion-reduce:hidden">
      {WIN_BURST.map((p, i) => (
        <span
          key={i}
          className="absolute top-1/2 left-1/2 animate-[fx-fly_1.6s_ease-out_forwards] text-3xl opacity-0"
          style={
            {
              animationDelay: `${p.delay}ms`,
              "--dx": `${p.dx * 1.6}px`,
              "--dy": `${p.dy * 1.6}px`,
              "--rot": `${p.rot}deg`,
            } as React.CSSProperties
          }
        >
          {p.food}
        </span>
      ))}
    </div>
  );
}

function Result({
  room,
  nameOf,
  ask,
  leave,
}: {
  room: LiveRoomDTO;
  nameOf: (seat: number) => string;
  ask: Ask;
  leave: () => void;
}) {
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const [winner] = room.winners;
  const text =
    room.winners.length > 1
      ? tr.live.tie
      : winner === room.mySeat
        ? tr.live.youWon
        : winner !== undefined
          ? tr.live.won(nameOf(winner))
          : tr.live.noWinner;
  return (
    <div className="flex flex-col items-center gap-3">
      {room.mySeat !== null && room.winners.includes(room.mySeat) && <WinBurst />}
      <p className="reaction-pop text-2xl font-black">{text}</p>
      <div className="flex gap-2">
        {room.hostId === meId && (
          <button
            type="button"
            onClick={() => void ask("live:start", {})}
            className={`${pill} bg-brand text-brand-ink`}
          >
            {tr.live.rematch}
          </button>
        )}
        <button type="button" onClick={leave} className={`${pill} bg-black/5 dark:bg-white/10`}>
          {tr.live.leave}
        </button>
      </div>
    </div>
  );
}

type Line = { text?: string; gifId?: string; voice?: ArrayBuffer; replyTo?: string };

/** What a reply quotes: the line's text, or what kind of line it was. */
function Quote({ reply, meId }: { reply: LiveReplyDTO; meId: string }) {
  const tr = useT();
  return (
    <span className="block truncate border-l-2 border-brand pl-2 text-xs text-stone-500">
      <span className="font-semibold">{reply.user.id === meId ? tr.common.you : reply.user.displayName}</span>{" "}
      {reply.kind === "gif" ? tr.summary.kinds.gif : reply.kind === "voice" ? `🎤 ${tr.summary.kinds.voice}` : reply.text}
    </span>
  );
}

/** One line of the room's chat: drag it right on a touch screen to answer it, or use the buttons that show on hover. */
function ChatLine({
  line: l,
  meId,
  nameOf,
  onReact,
  onPickReaction,
  onReply,
}: {
  line: LiveChatLineDTO;
  meId: string;
  nameOf: (userId: string) => string;
  onReact: (emoji: string) => void;
  onPickReaction: (at: DOMRect) => void;
  onReply: () => void;
}) {
  const tr = useT();
  const swipe = useSwipe(onReply, 1);
  const hover =
    "grid size-6 shrink-0 place-items-center rounded-full text-stone-400 transition group-hover:opacity-100 hover:bg-black/5 hover:text-stone-600 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 dark:hover:bg-white/10 dark:hover:text-stone-200";
  return (
    <div {...swipe.handlers} className="group relative touch-pan-y overflow-x-clip">
      <div ref={swipe.hint} className="pointer-events-none absolute inset-y-0 left-0 flex items-center opacity-0">
        <span className="grid size-7 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm">
          <Reply className="size-4" />
        </span>
      </div>
      <div ref={swipe.moving} className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1 break-words">
          {l.replyTo && (
            <span className="mb-1 block">
              <Quote reply={l.replyTo} meId={meId} />
            </span>
          )}
          <span className="font-semibold">{l.user.id === meId ? tr.common.you : l.user.displayName}</span> {l.text}
          {l.gif && (
            <video
              src={l.gif.url}
              autoPlay
              loop
              muted
              playsInline
              aria-label="GIF"
              className="mt-1 max-h-32 rounded-xl bg-stone-100 dark:bg-stone-800"
            />
          )}
          {l.voice && (
            <div className="mt-1 max-w-72">
              <VoicePlayer url={l.voice.url} durationMs={l.voice.durationMs} waveform={l.voice.waveform} mine={l.user.id === meId} compact />
            </div>
          )}
          {l.reactions.length > 0 && (
            <div className="pt-3">
              <ReactionChips message={l} meId={meId} mine={false} nameOf={nameOf} onReact={onReact} />
            </div>
          )}
        </div>
        <span className="shrink-0 pt-0.5 text-[11px] text-stone-400 tabular-nums">{clockTime(l.at)}</span>
        <button type="button" onClick={onReply} aria-label={tr.messages.reply} title={tr.messages.reply} className={hover}>
          <Reply className="size-4" />
        </button>
        <button
          type="button"
          onClick={(e) => onPickReaction(e.currentTarget.getBoundingClientRect())}
          aria-label={tr.messages.react}
          title={tr.messages.react}
          className={hover}
        >
          <SmilePlus className="size-4" />
        </button>
      </div>
    </div>
  );
}

const POP_MS = 6000;

/** Ids of the chat lines that came in since the room opened, each kept for a few seconds so it pops up over the game. */
function usePopups(chat: LiveChatLineDTO[]) {
  const known = useRef<Set<string> | null>(null);
  const [popped, setPopped] = useState<string[]>([]);
  useEffect(() => {
    const ids = chat.map((l) => l.id);
    if (!known.current) return void (known.current = new Set(ids));
    const seen = known.current;
    const fresh = ids.filter((id) => !seen.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => seen.add(id));
    setPopped((p) => [...p, ...fresh].slice(-3));
    setTimeout(() => setPopped((p) => p.filter((id) => !fresh.includes(id))), POP_MS);
  }, [chat]);
  return popped;
}

/**
 * A box to say something, `/giphy` for a GIF, emoji and voice notes, under the game. New lines pop up over the
 * game for a few seconds; the history button shows them all, with their reactions.
 */
function RoomChat({
  room,
  say,
  react,
}: {
  room: LiveRoomDTO;
  say: (line: Line) => Promise<boolean>;
  react: (lineId: string, emoji: string) => void;
}) {
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState(false);
  const [reacting, setReacting] = useState<{ id: string; at: DOMRect } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [replying, setReplying] = useState<LiveChatLineDTO | null>(null);
  const [history, setHistory] = useState(false);
  const popped = usePopups(room.chat);
  const shown = history ? room.chat : room.chat.filter((l) => popped.includes(l.id));
  const input = useRef<HTMLInputElement>(null);
  const nameOf = (id: string) => room.seats.find((s) => s.user?.id === id)?.user?.displayName ?? "";
  const lines = useRef<HTMLDivElement>(null);
  const newest = room.chat.at(-1)?.at;
  const command = parseCommand(text, ["giphy"]);
  const search = command?.kind === "run" ? command.args : null;
  const [q, setQ] = useState("");
  const gifs = useGifs(q, search !== null);
  const found = gifs.data?.pages[0]?.items ?? [];
  const recorder = useRecorder({ maxMs: LIVE_VOICE_MS, bitsPerSecond: 32_000, raw: true, onLimit: (r) => void sendVoice(r) });

  useEffect(() => {
    lines.current?.scrollTo({ top: lines.current.scrollHeight });
  }, [newest, history]);

  useEffect(() => {
    const t = setTimeout(() => setQ(search ?? ""), 400);
    return () => clearTimeout(t);
  }, [search]);

  async function answer(line: Line) {
    const ok = await say({ ...line, replyTo: replying?.id });
    if (ok) setReplying(null);
    return ok;
  }

  async function sendVoice(r: Recording | null) {
    if (r && r.durationMs >= 500) await answer({ voice: await r.blob.arrayBuffer() });
  }

  function sendGif(gif: GifDTO) {
    setText("");
    void answer({ gifId: gif.id });
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (recorder.recording) return void sendVoice(await recorder.stop());
    if (command?.kind === "names") return setText("/giphy ");
    if (command?.kind === "run") return found[0] && sendGif(found[0]);
    const line = text.trim();
    if (!line) return;
    setText("");
    setEmoji(false);
    if (!(await answer({ text: line }))) setText(line);
  }

  useEffect(() => {
    const keyboard = (navigator as Navigator & { virtualKeyboard?: { overlaysContent: boolean } }).virtualKeyboard;
    if (!keyboard) return;
    keyboard.overlaysContent = true;
    return () => void (keyboard.overlaysContent = false);
  }, []);

  return (
    <div
      className="relative z-10 border-t border-black/5 bg-stone-50/45 backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/40"
      style={{ transform: "translateY(calc(-1 * env(keyboard-inset-height, 0px)))" }}
    >
      {shown.length > 0 && (
        <div
          ref={lines}
          className={`absolute inset-x-0 bottom-full mx-auto w-full max-w-2xl text-sm ${
            history
              ? "max-h-[min(16rem,calc((var(--app-height,100dvh)_-_env(keyboard-inset-height,0px))_*_0.4))] space-y-2.5 overflow-y-auto overscroll-contain rounded-t-2xl bg-stone-50/90 px-4 pt-4 pb-2 shadow-lg dark:bg-stone-900/90"
              : "pointer-events-none space-y-1.5 px-3 pb-2"
          }`}
        >
          {shown.map((l) => (
            <div
              key={l.id}
              className={history ? "" : "reaction-pop pointer-events-auto rounded-2xl bg-stone-50/90 px-3 py-2 shadow-lg dark:bg-stone-900/90"}
            >
              <ChatLine
                line={l}
                meId={meId}
                nameOf={nameOf}
                onReact={(e) => react(l.id, e)}
                onPickReaction={(at) => setReacting({ id: l.id, at })}
                onReply={() => {
                  setReplying(l);
                  input.current?.focus();
                }}
              />
            </div>
          ))}
        </div>
      )}
      {reacting && (
        <ReactionPopover
          anchor={reacting.at}
          alignEnd
          message={room.chat.find((l) => l.id === reacting.id) ?? { reactions: [] }}
          meId={meId}
          onReact={(e) => {
            react(reacting.id, e);
            setReacting(null);
          }}
          onMore={() => {
            setPicking(reacting.id);
            setReacting(null);
          }}
          onClose={() => setReacting(null)}
        />
      )}
      {picking && <ReactionPicker onPick={(e) => react(picking, e)} onClose={() => setPicking(null)} />}
      {command?.kind === "names" && (
        <button
          type="button"
          onClick={() => setText("/giphy ")}
          className="mx-auto flex w-full max-w-2xl items-baseline gap-2 px-4 pt-3 text-left text-sm"
        >
          <span className="font-semibold">/giphy</span>
          <span className="text-stone-500">{tr.composer.commandHints.giphy}</span>
        </button>
      )}
      {search !== null && (
        <div className="mx-auto w-full max-w-2xl px-3 pt-3">
          {found.length ? (
            <div className="flex gap-1.5 overflow-x-auto overscroll-contain">
              {found.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => sendGif(g)}
                  title={g.title}
                  className="h-24 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800"
                  style={{ aspectRatio: `${g.width} / ${g.height}` }}
                >
                  <img src={g.previewUrl} alt={g.title} draggable={false} className="size-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-stone-400">
              {gifs.isError ? tr.composer.couldNotLoadGifs : gifs.data ? tr.composer.noGifs : tr.common.loading}
            </p>
          )}
          <p className="pt-1 text-[11px] text-stone-400">{tr.composer.poweredByGiphy}</p>
        </div>
      )}
      {emoji && (
        <div className="mx-auto flex h-72 w-full max-w-2xl flex-col pt-2">
          <Emojis onPick={(e) => setText((t) => t + e)} />
        </div>
      )}
      {replying && (
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pt-3 text-sm">
          <span className="min-w-0 flex-1">
            <Quote
              reply={{ ...replying, kind: replying.gif ? "gif" : replying.voice ? "voice" : "text" }}
              meId={meId}
            />
          </span>
          <button
            type="button"
            onClick={() => setReplying(null)}
            aria-label={tr.common.cancel}
            className="grid size-7 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {recorder.error && <p className="mx-auto w-full max-w-2xl px-4 pt-2 text-xs text-red-600">{recorder.error}</p>}
      <form
        onSubmit={(e) => void send(e)}
        className="mx-auto flex w-full max-w-2xl items-center gap-2 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {recorder.recording ? (
          <>
            <button
              type="button"
              onClick={recorder.cancel}
              aria-label={tr.common.cancel}
              className="grid size-10 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="size-5" />
            </button>
            <p className="flex min-w-0 flex-1 items-center gap-2 px-2 text-sm tabular-nums">
              <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
              {formatDuration(recorder.elapsed)} / {formatDuration(LIVE_VOICE_MS)}
            </p>
          </>
        ) : (
          <>
            {room.chat.length > 0 && (
              <button
                type="button"
                onClick={() => setHistory((on) => !on)}
                aria-label={tr.live.messages}
                title={tr.live.messages}
                aria-pressed={history}
                className={`grid size-10 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 ${history ? "text-brand" : "text-stone-500"}`}
              >
                <MessageCircle className="size-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setEmoji((on) => !on)}
              aria-label={tr.composer.commandHints.emoji}
              aria-pressed={emoji}
              className={`grid size-10 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 ${emoji ? "text-brand" : "text-stone-500"}`}
            >
              <Smile className="size-5" />
            </button>
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              placeholder={tr.live.saySomething}
              aria-label={tr.live.saySomething}
              className="min-w-0 flex-1 rounded-full bg-black/5 px-4 py-2 text-[16px] outline-none focus:ring-2 focus:ring-brand md:text-sm dark:bg-white/10"
            />
          </>
        )}
        {text.trim() || recorder.recording ? (
          <button
            type="submit"
            aria-label={recorder.recording ? tr.composer.sendVoice : tr.common.send}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-ink"
          >
            <SendHorizontal className="size-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void recorder.start()}
            aria-label={tr.composer.recordVoice}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-ink"
          >
            <Mic className="size-5" />
          </button>
        )}
      </form>
    </div>
  );
}

type Ask = (
  event: "live:bot" | "live:start" | "live:move" | "live:say" | "live:react" | "live:giveup",
  extra: { add?: boolean; move?: unknown; lineId?: string; emoji?: string } & Line,
) => Promise<boolean>;

/** A live game room: the lobby, then the game, then who won and a rematch. */
export function LiveRoom({ roomId }: { roomId: string }) {
  const tr = useT();
  const router = useRouter();
  const meId = useSession((s) => s.user!.id);
  const { room, gone, socket } = useLiveRoom(roomId);
  const [menu, setMenu] = useState(false);
  const [ending, setEnding] = useState(false);
  const [givingUp, setGivingUp] = useState(false);
  const sound = useGameSound();
  useGameMusic(!!room && !gone);
  const turn = useMyTurn(room);
  const urgent = turn.seconds !== null && turn.seconds <= 10;

  const ask: Ask = async (event, extra) => {
    const timed = socket?.timeout(10_000) as
      { emitWithAck: (e: string, p: object) => Promise<{ ok: boolean }> } | undefined;
    const res = await timed?.emitWithAck(event, { roomId, ...extra }).catch(() => null);
    return !!res?.ok;
  };
  const exit = (event: "live:leave" | "live:end") => {
    socket?.emit(event, { roomId });
    router.push("/");
  };
  const leave = () => exit("live:leave");
  const nameOf = (seat: number) => {
    const user = room?.seats[seat]?.user;
    if (user) return user.id === meId ? tr.common.you : user.displayName;
    const bots = room?.seats.flatMap((s, i) => (s.user ? [] : [i])) ?? [];
    return bots.length > 1 ? `${tr.calls.bot} ${bots.indexOf(seat) + 1}` : tr.calls.bot;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b border-black/5 bg-stone-50/45 px-2 py-2 backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/40">
        <Link href="/" aria-label={tr.common.backToChats} className={`${iconButton} md:hidden`}>
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate px-2 font-semibold">
          {room ? `${LIVE_EMOJI[room.game]} ${tr.live.games[room.game]}` : tr.live.title}
        </h1>
        {room && <HowToPlay game={room.game} className="size-10 text-stone-600 opacity-100 dark:text-stone-300" />}
        {room && !gone && (
          <button type="button" onClick={() => setMenu(true)} aria-label={tr.live.options} title={tr.live.options} className={iconButton}>
            <MoreVertical className="size-5" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-5 px-4 py-5">
          {gone ? (
            <>
              <p className="pt-10 text-center text-stone-500">
                {gone === "GAME_STARTED" ? tr.live.started : gone === "ROOM_FULL" ? tr.live.full : tr.live.closed}
              </p>
              <Link href="/" className={`${pill} bg-brand text-brand-ink`}>
                {tr.common.backToChats}
              </Link>
            </>
          ) : !room ? (
            <p className="pt-10 text-sm text-stone-500">{tr.common.loading}</p>
          ) : room.status === "lobby" ? (
            <Lobby room={room} nameOf={nameOf} ask={ask} />
          ) : (
            <>
              {room.status === "playing" && room.view?.game !== "words" && (
                <div className="flex h-9 items-center">
                  {turn.mine && (
                    <p
                      key={room.deadline}
                      role="status"
                      className={`reaction-pop rounded-full px-5 py-2 text-sm font-bold shadow-lg ${
                        urgent ? "animate-pulse bg-red-500 text-white" : "bg-brand text-brand-ink"
                      }`}
                    >
                      {tr.live.yourTurn}
                      {turn.seconds !== null && ` · ${turn.seconds}s`}
                    </p>
                  )}
                </div>
              )}
              <Players room={room} nameOf={nameOf} />
              {room.status === "over" && <Result room={room} nameOf={nameOf} ask={ask} leave={leave} />}
              {room.view?.game === "ludo" ? (
                <LudoBoard
                  state={room.view.state}
                  mySeat={room.mySeat}
                  nameOf={nameOf}
                  play={(move) => void ask("live:move", { move })}
                />
              ) : room.view?.game === "eights" ? (
                <EightsTable
                  state={room.view.state}
                  mySeat={room.mySeat}
                  nameOf={nameOf}
                  play={(move) => void ask("live:move", { move })}
                />
              ) : room.view?.game === "fanorona" ? (
                <FanoronaBoard
                  state={room.view.state}
                  mySeat={room.mySeat}
                  nameOf={nameOf}
                  play={(move) => void ask("live:move", { move })}
                />
              ) : room.view?.game === "dots" ? (
                <DotsBoard
                  state={room.view.state}
                  mySeat={room.mySeat}
                  nameOf={nameOf}
                  play={(move) => void ask("live:move", { move })}
                />
              ) : room.view?.game === "memory" ? (
                <MemoryBoard
                  state={room.view.state}
                  mySeat={room.mySeat}
                  nameOf={nameOf}
                  play={(move) => void ask("live:move", { move })}
                />
              ) : room.view?.game === "market" ? (
                <MarketBoard
                  state={room.view.state}
                  mySeat={room.mySeat}
                  nameOf={nameOf}
                  play={(move) => void ask("live:move", { move })}
                />
              ) : room.view?.game === "snack" ? (
                <SnackBoard
                  state={room.view.state}
                  mySeat={room.mySeat}
                  nameOf={nameOf}
                  play={(move) => void ask("live:move", { move })}
                />
              ) : room.view?.game === "reflex" ? (
                <ReflexBoard
                  state={room.view.state}
                  mySeat={room.mySeat}
                  nameOf={nameOf}
                  play={(move) => void ask("live:move", { move })}
                />
              ) : room.view?.game === "words" ? (
                <WordHunt
                  state={room.view.state}
                  deadline={room.deadline}
                  mySeat={room.mySeat}
                  nameOf={nameOf}
                  play={(move) => ask("live:move", { move })}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
      {room && !gone && (room.invited.length > 0 || room.seats.some((s) => s.user && s.user.id !== meId)) && (
        <RoomChat
          room={room}
          say={(line) => ask("live:say", line)}
          react={(lineId, emoji) => void ask("live:react", { lineId, emoji })}
        />
      )}
      {menu && room && (
        <Sheet
          actions={[
            {
              label: `${tr.live.effects} · ${sound.effects ? tr.common.on : tr.common.off}`,
              keepOpen: true,
              onSelect: () => setGameSound({ effects: !sound.effects }),
            },
            {
              label: `${tr.live.music} · ${sound.music ? tr.common.on : tr.common.off}`,
              keepOpen: true,
              onSelect: () => setGameSound({ music: !sound.music }),
            },
            ...(room.status === "playing" && room.mySeat !== null
              ? [
                  { label: tr.live.giveUp, onSelect: () => setGivingUp(true) },
                  { label: tr.live.end, destructive: true, onSelect: () => setEnding(true) },
                ]
              : []),
          ]}
          onClose={() => setMenu(false)}
        />
      )}
      {ending && (
        <Sheet
          title={tr.live.endHint}
          actions={[{ label: tr.live.end, destructive: true, onSelect: () => exit("live:end") }]}
          onClose={() => setEnding(false)}
        />
      )}
      {givingUp && (
        <Sheet
          title={tr.live.giveUpConfirm}
          actions={[{ label: tr.live.giveUp, destructive: true, onSelect: () => void ask("live:giveup", {}) }]}
          onClose={() => setGivingUp(false)}
        />
      )}
    </div>
  );
}
