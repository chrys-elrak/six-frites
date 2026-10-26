import { getLocale, getT } from "./i18n";

export function timeAgo(iso: string) {
  const t = getT().time;
  const secs = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (secs < 60) return t.justNow;
  const mins = Math.round(secs / 60);
  if (mins < 60) return t.minAgo(mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return t.hoursAgo(hours);
  return new Date(iso).toLocaleDateString(getLocale());
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" });
}

export function listTime(iso: string) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 864e5);
  if (days === 0) return clockTime(iso);
  if (days === 1) return getT().time.yesterday;
  if (days < 7) return d.toLocaleDateString(getLocale(), { weekday: "short" });
  return d.toLocaleDateString(getLocale(), { day: "numeric", month: "short" });
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 864e5);
  if (days === 0) return getT().time.today;
  if (days === 1) return getT().time.yesterday;
  if (days < 7) return d.toLocaleDateString(getLocale(), { weekday: "long" });
  return d.toLocaleDateString(getLocale(), { day: "numeric", month: "long", year: "numeric" });
}

export const sameDay = (a: string, b: string) => startOfDay(new Date(a)) === startOfDay(new Date(b));

export function sendAtLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);
  const t = getT().time;
  const day =
    days === 0
      ? t.today
      : days === 1
        ? t.tomorrow
        : d.toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", month: "short" });
  return t.dayAt(day, clockTime(iso));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Formats a date for `<input type="datetime-local">`, which works in local time. */
export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function inviteUrl(code: string) {
  return `${window.location.origin}/invite/${code}`;
}

export function contactUrl(code: string) {
  return `${window.location.origin}/add/${code}`;
}

export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export const shareInvite = (code: string) => shareLink(getT().common.joinMe, inviteUrl(code));

export const shareContact = (code: string) => shareLink(getT().common.addMe, contactUrl(code));

async function shareLink(title: string, url: string): Promise<"shared" | "copied"> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return "shared";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}

export function formatDuration(ms: number | null | undefined) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatBytes(bytes: number) {
  const [b, kb, mb, gb] = getT().time.bytes;
  const n = (x: number, digits: number) => x.toLocaleString(getLocale(), { maximumFractionDigits: digits });
  if (bytes < 1024) return `${bytes} ${b}`;
  if (bytes < 1024 * 1024) return `${n(bytes / 1024, 0)} ${kb}`;
  if (bytes < 1024 * 1024 * 1024) return `${n(bytes / 1024 / 1024, 1)} ${mb}`;
  return `${n(bytes / 1024 / 1024 / 1024, 2)} ${gb}`;
}
