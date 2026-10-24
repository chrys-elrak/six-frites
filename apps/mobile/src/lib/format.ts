import { Share } from "react-native";
import { WEB_URL } from "./six";

export function timeAgo(iso: string) {
  const secs = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function listTime(iso: string) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 864e5);
  if (days === 0) return clockTime(iso);
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 864e5);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

export const sameDay = (a: string, b: string) => startOfDay(new Date(a)) === startOfDay(new Date(b));

export function inviteUrl(code: string) {
  return `${WEB_URL}/invite/${code}`;
}

export async function shareInvite(code: string) {
  await Share.share({ message: `Join me on Six Frites: ${inviteUrl(code)}` }).catch(() => null);
}

export function contactUrl(code: string) {
  return `${WEB_URL}/add/${code}`;
}

export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export async function shareContact(code: string) {
  await Share.share({ message: `Add me on Six Frites: ${contactUrl(code)}` }).catch(() => null);
}

export function formatDuration(ms: number | null | undefined) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function sendAtLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);
  const day =
    days === 0
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return `${day} at ${clockTime(iso)}`;
}
