import { z } from "zod";
import { IsoDate } from "./common.js";
import { PublicUser } from "./invites.js";
import type { Dict } from "./i18n/index.js";

export const NOTIFICATION_KINDS = ["joined", "added", "story_reaction", "note_reaction", "story_reply", "missed_call", "anon_message", "unblocked", "full_access"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NotificationDTO = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  user: PublicUser.nullable().describe("Who did it; null for anon_message, which never says who sent it"),
  chatId: z.string().nullable().describe("The direct chat with them, to open on tap"),
  emoji: z.string().nullable().describe("For story_reaction and note_reaction"),
  video: z.boolean().describe("For missed_call: whether it was a video call"),
  unread: z.boolean().describe("New since you last looked, or marked unread"),
  createdAt: IsoDate,
});
export type NotificationDTO = z.infer<typeof NotificationDTO>;

export const NotificationsDTO = z.object({
  items: z.array(NotificationDTO),
  unread: z.number().int().describe("How many came since you last looked; the ones marked unread don't count"),
});
export type NotificationsDTO = z.infer<typeof NotificationsDTO>;

export const UpdateNotificationInput = z.object({ unread: z.boolean() });

/** The line a notification shows, in the app's language. */
export function notificationText(t: Dict["notifications"], n: NotificationDTO) {
  const name = n.user?.displayName ?? "";
  switch (n.kind) {
    case "joined":
      return t.joined(name);
    case "added":
      return t.added(name);
    case "story_reaction":
      return t.storyReaction(name, n.emoji ?? "");
    case "note_reaction":
      return t.noteReaction(name, n.emoji ?? "");
    case "story_reply":
      return t.storyReply(name);
    case "missed_call":
      return n.video ? t.missedVideoCall(name) : t.missedCall(name);
    case "anon_message":
      return t.anonMessage;
    case "unblocked":
      return t.unblocked(name);
    case "full_access":
      return t.fullAccess;
  }
}
