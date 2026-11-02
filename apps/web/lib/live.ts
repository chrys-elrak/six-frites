"use client";

import type { LiveRoomDTO } from "@six/shared";
import { useEffect, useState } from "react";
import { playSound } from "./notify";
import { useRealtime } from "./realtime";

/** The room as the server shows it to me, kept up to date and rejoined after a reconnect; `gone` holds why I can't be in it. */
export function useLiveRoom(roomId: string) {
  const { realtime } = useRealtime();
  const [room, setRoom] = useState<LiveRoomDTO | null>(null);
  const [gone, setGone] = useState<string | null>(null);

  useEffect(() => {
    const socket = realtime?.socket;
    if (!socket) return;
    const join = () =>
      void socket
        .timeout(10_000)
        .emitWithAck("live:join", { roomId })
        .then((res) => (res.ok ? setRoom(res.data) : setGone(res.error.code)))
        .catch(() => null);
    const onRoom = (r: LiveRoomDTO) => r.id === roomId && setRoom(r);
    const onClosed = (e: { roomId: string }) => e.roomId === roomId && setGone("ROOM_NOT_FOUND");
    socket.on("live:room", onRoom);
    socket.on("live:closed", onClosed);
    socket.on("connect", join);
    if (socket.connected) join();
    return () => {
      socket.off("live:room", onRoom);
      socket.off("live:closed", onClosed);
      socket.off("connect", join);
    };
  }, [realtime, roomId]);

  return { room, gone, socket: realtime?.socket ?? null };
}

const secondsTo = (deadline: string | null) =>
  deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000)) : null;

/** Whole seconds until `deadline`, ticking, or null without one. */
export function useCountdown(deadline: string | null) {
  const [seconds, setSeconds] = useState(() => secondsTo(deadline));
  useEffect(() => {
    setSeconds(secondsTo(deadline));
    if (!deadline) return;
    const timer = setInterval(() => setSeconds(secondsTo(deadline)), 250);
    return () => clearInterval(timer);
  }, [deadline]);
  return seconds;
}

/**
 * Whether the game waits on me, for my turn or a word hunt round I'm in, and the seconds I have left. Chimes
 * when my turn comes and ticks through its last 10 seconds.
 */
export function useMyTurn(room: LiveRoomDTO | null) {
  const view = room?.status === "playing" ? room.view : null;
  const mine = !!view && room!.mySeat !== null && (view.game === "words" || view.state.turn === room!.mySeat);
  const seconds = useCountdown(mine ? room!.deadline : null);
  useEffect(() => {
    if (mine) playSound("/sounds/turn.wav");
  }, [mine]);
  useEffect(() => {
    if (seconds !== null && seconds > 0 && seconds <= 10) playSound("/sounds/tick.wav");
  }, [seconds]);
  return { mine, seconds };
}
