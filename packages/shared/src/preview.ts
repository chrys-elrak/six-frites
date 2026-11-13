import { type CommentRule, type MessageDTO, type MessageType, type ServiceAction, maskSpoilers } from "./chats.js";
import { chatTheme, customThemeColor } from "./chat-themes.js";
import { GAME_EMOJI } from "./games.js";
import type { Dict } from "./i18n/index.js";

const DURATIONS = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
] as const;

/** Names an auto-delete timer in the largest whole unit, e.g. 604800 → "1 week". */
export function durationLabel(secs: number, t: Dict) {
  const [unit, size] = DURATIONS.find(([, size]) => secs % size === 0) ?? ["second", 1];
  return t.time.duration(secs / size, unit);
}

/** What an admin chose for a group message's comments, e.g. "Close after 10 comments from others or 2 days". */
export function commentRuleLabel(r: CommentRule, t: Dict) {
  if (r.commentsClosed) return t.groups.commentsClosed;
  const parts = [r.commentsLimit && t.groups.fromOthers(r.commentsLimit), r.commentsCloseIn && durationLabel(r.commentsCloseIn, t)];
  return t.groups.closeAfter(parts.filter(Boolean).join(t.groups.or));
}

/** A chat theme's name in the reader's language. */
export const themeName = (id: string | null | undefined, t: Dict) =>
  customThemeColor(id) ? t.summary.themes.custom : t.summary.themes[chatTheme(id).id as keyof Dict["summary"]["themes"]];

/** How a notification describes someone reacting to your message. */
export function reactionText(emoji: string, m: MessageDTO, t: Dict) {
  const preview = previewText(m, t);
  return preview ? t.summary.reacted(emoji, preview) : t.summary.reactedToYours(emoji);
}

const clock = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

/** "Video call · 2:31" or "Missed voice call". */
export function callText(a: { video: boolean; secs: number | null }, t: Dict) {
  return a.secs === null ? t.summary.missedCall(a.video) : t.summary.call(a.video, clock(a.secs));
}

/** What a group service message says, with `who` as its sender (null when it was you). */
function groupText(a: ServiceAction | null | undefined, who: string | null, t: Dict) {
  if (a?.type === "group_created") return t.groups.created(who, a.title);
  if (a?.type === "joined") return t.groups.joined(a.name);
  if (a?.type === "left") return t.groups.left(a.name);
  if (a?.type === "removed") return t.groups.removed(a.name);
  if (a?.type === "renamed") return t.groups.renamed(who, a.title);
  if (a?.type === "group_photo") return t.groups.photoChanged(who);
  return null;
}

/** What a service message says, without the sender's name. */
export function serviceText(m: Pick<MessageDTO, "action">, t: Dict, mine = false) {
  const a = m.action;
  const group = groupText(a, mine ? null : t.common.someone, t);
  if (group) return group;
  if (a?.type === "theme") return a.theme ? t.summary.background(themeName(a.theme, t)) : t.summary.backgroundReset;
  if (a?.type === "e2ee") return t.summary.encrypted;
  if (a?.type === "vanish") return a.on ? t.summary.vanishOn : t.summary.vanishOff;
  if (a?.type === "pin") return t.summary.pinned;
  if (a?.type === "screenshot") return t.summary.screenshot;
  if (a?.type === "resend_request") return t.summary.resendRequest;
  if (a?.type === "shared_to") return t.summary.sharedTo[a.to];
  if (a?.type === "call") return callText(a, t);
  if (a?.type === "live_invite") return liveText(a, t, mine);
  if (a?.type === "live_result") return resultText(a, t);
  return a?.type === "auto_delete" && a.secs ? t.summary.autoDeleteAfter(durationLabel(a.secs, t)) : t.summary.autoDeleteOff;
}

function liveText(a: Extract<ServiceAction, { type: "live_invite" }>, t: Dict, mine: boolean) {
  const game = t.live.games[a.game];
  if (a.ended) return t.live.inviteEnded(game);
  return mine ? t.live.youInvited(game) : t.live.invites(a.from, game);
}

function resultText(a: Extract<ServiceAction, { type: "live_result" }>, t: Dict) {
  const game = t.live.games[a.game];
  const text = { won: t.live.resultWon, lost: t.live.resultLost, draw: t.live.resultDraw }[a.result](game);
  return a.score ? `${text} · ${a.score[0]}–${a.score[1]}` : text;
}

/** What a service message says as a sentence about its sender; `who` is null when it was you. */
export function serviceSentence(m: Pick<MessageDTO, "action">, who: string | null, t: Dict) {
  const a = m.action;
  const group = groupText(a, who, t);
  if (group) return group;
  if (a?.type === "theme") {
    if (!a.theme) return t.summary.resetBackground(who);
    return customThemeColor(a.theme)
      ? t.summary.customBackground(who)
      : t.summary.changedBackground(who, themeName(a.theme, t));
  }
  if (a?.type === "e2ee") return t.summary.turnedOnEncryption(who);
  if (a?.type === "vanish") return a.on ? t.summary.turnedOnVanish(who) : t.summary.turnedOffVanish(who);
  if (a?.type === "pin") return t.summary.pinnedMessage(who);
  if (a?.type === "screenshot") return t.summary.tookScreenshot(who);
  if (a?.type === "resend_request") return t.summary.askedResend(who);
  if (a?.type === "shared_to") return t.summary.sharedMessage(who, a.to);
  if (a?.type === "call") return t.summary.called(who, callText(a, t));
  if (a?.type === "live_invite") return liveText(a, t, who === null);
  if (a?.type === "live_result") return resultText(a, t);
  return a?.type === "auto_delete" && a.secs
    ? t.summary.setAutoDelete(who, durationLabel(a.secs, t))
    : t.summary.turnedOffAutoDelete(who);
}

/** What a message shows as: GIFs and stickers sent from the keyboard travel as images. */
export function shownType(m: Pick<MessageDTO, "type" | "attachment"> & { file?: { sticker?: boolean } }): MessageType {
  if (m.type !== "image") return m.type;
  if (m.file?.sticker) return "sticker";
  return m.attachment?.mime === "image/gif" ? "gif" : "image";
}

/**
 * A one-line description of a message for chat previews and notifications. Never reveals spoilers
 * or self-destructing content.
 */
export function previewText(m: MessageDTO & { file?: { sticker?: boolean } }, t: Dict) {
  const type = shownType(m);
  if (type === "service") return serviceText(m, t);
  if (m.ephemeral) return t.summary.selfDestructing;
  if (m.deletedAt) return t.summary.messageDeleted;
  if (m.bump) return m.replyTo?.text ? t.summary.bumpedText(m.replyTo.text) : t.summary.bumped;
  if (type === "sticker") return m.sticker ? `${m.sticker.emoji} ${t.summary.kinds.sticker}` : t.summary.kinds.sticker;
  const caption = m.text ? (m.spoiler && m.type === "text" ? t.summary.spoiler : maskSpoilers(m.text, m.entities)) : "";
  if (type === "text") return caption;
  if (type === "checklist" && m.checklist) return t.summary.checklistNamed(m.checklist.title);
  if (type === "game" && m.game) return `${GAME_EMOJI[m.game.game]} ${t.calls[m.game.game]}`;
  const label = type === "file" && m.attachment ? t.summary.fileNamed(m.attachment.name) : t.summary.kinds[type];
  return caption ? `${label} · ${caption}` : label;
}
