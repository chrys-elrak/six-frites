"use client";

import {
  LIVE_EMOJI,
  LIVE_SEATS,
  type LiveRoomDTO,
  SEAT_COLORS,
  dotsScores,
  fanoronaCounts,
  memoryScores,
} from "@six/shared";
import { Bot, ChevronLeft, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useCountdown, useLiveRoom } from "@/lib/live";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { DotsBoard } from "./dots-board";
import { EightsTable } from "./eights-table";
import { FanoronaBoard } from "./fanorona-board";
import { HowToPlay } from "./how-to-play";
import { LudoBoard } from "./ludo-board";
import { MemoryBoard } from "./memory-board";
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
  const turn = view && view.game !== "words" && room.status === "playing" ? view.state.turn : null;
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
                      : null;
        return (
          <div
            key={i}
            className={`flex items-center gap-2 rounded-full py-1 pr-3 pl-1 ring-1 transition ${
              turn === i ? "bg-brand/15 ring-brand" : "bg-white/70 ring-black/5 dark:bg-stone-900/70 dark:ring-white/10"
            } ${s.left ? "opacity-50" : ""}`}
          >
            <span className="relative">
              <Face room={room} seat={i} />
              {(view?.game === "ludo" || view?.game === "dots" || view?.game === "memory") && (
                <span
                  className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-white"
                  style={{ background: SEAT_COLORS[view.game === "ludo" ? view.state.colors[i]! : i] }}
                />
              )}
            </span>
            <span className="text-sm leading-tight">
              <span className="block max-w-28 truncate font-medium">{nameOf(i)}</span>
              <span className="block text-xs text-stone-500">
                {s.left ? tr.live.left : turn === i && seconds !== null ? `${seconds}s` : extra}
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
          : "";
  return (
    <div className="flex flex-col items-center gap-3">
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

type Ask = (
  event: "live:bot" | "live:start" | "live:move",
  extra: { add?: boolean; move?: unknown },
) => Promise<boolean>;

/** A live game room: the lobby, then the game, then who won and a rematch. */
export function LiveRoom({ roomId }: { roomId: string }) {
  const tr = useT();
  const router = useRouter();
  const meId = useSession((s) => s.user!.id);
  const { room, gone, socket } = useLiveRoom(roomId);

  const ask: Ask = async (event, extra) => {
    const timed = socket?.timeout(10_000) as
      { emitWithAck: (e: string, p: object) => Promise<{ ok: boolean }> } | undefined;
    const res = await timed?.emitWithAck(event, { roomId, ...extra }).catch(() => null);
    return !!res?.ok;
  };
  const leave = () => {
    socket?.emit("live:leave", { roomId });
    router.push("/games");
  };
  const nameOf = (seat: number) => {
    const user = room?.seats[seat]?.user;
    if (user) return user.id === meId ? tr.common.you : user.displayName;
    const bots = room?.seats.flatMap((s, i) => (s.user ? [] : [i])) ?? [];
    return bots.length > 1 ? `${tr.calls.bot} ${bots.indexOf(seat) + 1}` : tr.calls.bot;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b border-black/5 bg-stone-50/45 px-2 py-2 backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/40">
        <Link href="/games" aria-label={tr.common.games} className={`${iconButton} md:hidden`}>
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate px-2 font-semibold">
          {room ? `${LIVE_EMOJI[room.game]} ${tr.live.games[room.game]}` : tr.live.title}
        </h1>
        {room && <HowToPlay game={room.game} className="size-10 text-stone-600 opacity-100 dark:text-stone-300" />}
        {room && !gone && (
          <button type="button" onClick={leave} aria-label={tr.live.leave} title={tr.live.leave} className={iconButton}>
            <LogOut className="size-5" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-5 px-4 py-5">
          {gone ? (
            <>
              <p className="pt-10 text-center text-stone-500">{tr.live.closed}</p>
              <Link href="/games" className={`${pill} bg-brand text-brand-ink`}>
                {tr.common.games}
              </Link>
            </>
          ) : !room ? (
            <p className="pt-10 text-sm text-stone-500">{tr.common.loading}</p>
          ) : room.status === "lobby" ? (
            <Lobby room={room} nameOf={nameOf} ask={ask} />
          ) : (
            <>
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
    </div>
  );
}
