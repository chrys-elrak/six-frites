"use client";

import type { LiveRoomDTO } from "@six/shared";
import { useEffect, useState } from "react";
import { useRealtime } from "./realtime";

/** The room as the server shows it to me, kept up to date and rejoined after a reconnect; `gone` once it ended. */
export function useLiveRoom(roomId: string) {
  const { realtime } = useRealtime();
  const [room, setRoom] = useState<LiveRoomDTO | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const socket = realtime?.socket;
    if (!socket) return;
    const join = () =>
      void socket
        .timeout(10_000)
        .emitWithAck("live:join", { roomId })
        .then((res) => (res.ok ? setRoom(res.data) : setGone(true)))
        .catch(() => null);
    const onRoom = (r: LiveRoomDTO) => r.id === roomId && setRoom(r);
    const onClosed = (e: { roomId: string }) => e.roomId === roomId && setGone(true);
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
