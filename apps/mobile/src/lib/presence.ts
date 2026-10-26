import { unwrap } from "@six/sdk";
import type { PresenceDTO } from "@six/shared";
import { useEffect } from "react";
import { create } from "zustand";
import { clockTime } from "./format";
import { getLocale, getT } from "./i18n";
import { six } from "./six";

interface PresenceState {
  byUser: Record<string, PresenceDTO>;
  set: (items: PresenceDTO[]) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  byUser: {},
  set: (items) =>
    set((s) => ({ byUser: { ...s.byUser, ...Object.fromEntries(items.map((p) => [p.userId, p])) } })),
}));

export async function refreshPresence(userIds: string[]) {
  const ids = [...new Set(userIds)].slice(0, 100);
  if (!ids.length) return;
  const res = unwrap(await six.api.GET("/v1/presence", { params: { query: { ids: ids.join(",") } } }));
  usePresenceStore.getState().set(res.items);
}

const REFRESH_MS = 60_000;

/**
 * Keeps presence fresh for these people while mounted. Live changes come over the socket, but a
 * device that crashes never announces it went offline, so this also re-checks every minute.
 */
export function useWatchPresence(userIds: string[]) {
  const key = [...new Set(userIds)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    void refreshPresence(ids).catch(() => null);
    const timer = setInterval(() => void refreshPresence(ids).catch(() => null), REFRESH_MS);
    return () => clearInterval(timer);
  }, [key]);
}

export const usePresence = (userId: string | undefined) =>
  usePresenceStore((s) => (userId ? s.byUser[userId] : undefined));

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "online", "last seen just now", "last seen 5 min ago", "last seen today at 14:03", … */
export function presenceLabel(p: PresenceDTO | undefined) {
  if (!p) return null;
  const t = getT().time;
  if (p.online) return t.online;
  if (!p.lastSeenAt) return t.lastSeenLongAgo;
  const at = new Date(p.lastSeenAt);
  const mins = Math.round((Date.now() - at.getTime()) / 60_000);
  if (mins < 1) return t.lastSeenJustNow;
  if (mins < 60) return t.lastSeenMinAgo(mins);
  const days = Math.round((startOfDay(new Date()) - startOfDay(at)) / 864e5);
  const time = clockTime(p.lastSeenAt);
  if (days === 0) return t.lastSeenTodayAt(time);
  if (days === 1) return t.lastSeenYesterdayAt(time);
  if (days < 7) return t.lastSeenDayAt(at.toLocaleDateString(getLocale(), { weekday: "long" }), time);
  return t.lastSeenOn(at.toLocaleDateString(getLocale(), { day: "numeric", month: "short", year: "numeric" }));
}
