import { z } from "zod";
import { Id } from "./common.js";
import { ContactPhoto } from "./contacts.js";
import { type ChatDTO, GROUP_MAX_PLACES, GROUP_MIN_PLACES, MENTION, type ServiceAction } from "./chats.js";
import type { Dict } from "./i18n/index.js";
import type { PublicUser } from "./invites.js";

const Title = z.string().trim().min(1).max(64);
const Nickname = z
  .string()
  .regex(/^#[0-9A-F]{6}$/, "Use a random name like #3FA2C1")
  .describe("The name you show in this group: always a random colour code like #3FA2C1, also the colour around your picture");
const Places = z.number().int().min(GROUP_MIN_PLACES).max(GROUP_MAX_PLACES).describe("How many members it can have, you included");
const Description = z.string().trim().max(500).describe("What the group is about, shown in its info and on its link");

export const CreateGroupInput = z.object({
  title: Title,
  photo: ContactPhoto.optional(),
  description: Description.optional(),
  maxMembers: Places.default(GROUP_MAX_PLACES),
  nickname: Nickname,
  nicknamePhoto: ContactPhoto.optional().describe("The photo you show in this group"),
});
export type CreateGroupInput = z.infer<typeof CreateGroupInput>;

export const UpdateGroupInput = z
  .object({
    title: Title.optional(),
    description: Description.optional(),
    photo: ContactPhoto.nullable().optional(),
    maxMembers: Places.optional(),
    membersCanWrite: z.boolean().optional().describe("Off: only the owner and admins send messages; members read and react"),
    membersCanInvite: z.boolean().optional().describe("Off: only the owner and admins see the group's link"),
    closeForSecs: z
      .number()
      .int()
      .min(60)
      .max(365 * 86_400)
      .nullable()
      .optional()
      .describe("Only the owner and admins send messages for this long, then members can again; null reopens it now"),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Provide at least one change");
export type UpdateGroupInput = z.infer<typeof UpdateGroupInput>;

export const JoinGroupInput = z.object({ nickname: Nickname, photo: ContactPhoto.optional() });
export type JoinGroupInput = z.infer<typeof JoinGroupInput>;

export const UpdateGroupMeInput = z
  .object({ nickname: Nickname.optional(), photo: ContactPhoto.nullable().optional() })
  .refine((v) => v.nickname !== undefined || v.photo !== undefined, "Provide nickname and/or photo");
export type UpdateGroupMeInput = z.infer<typeof UpdateGroupMeInput>;

export const SetGroupRoleInput = z.object({ role: z.enum(["admin", "member"]) });
export type SetGroupRoleInput = z.infer<typeof SetGroupRoleInput>;

export const GroupPreviewDTO = z.object({
  title: z.string(),
  photoUrl: z.string().nullable(),
  description: z.string().nullable(),
  memberCount: z.number().int(),
  maxMembers: z.number().int(),
  full: z.boolean(),
  banned: z.boolean().describe("You were removed from it, so you can't join again"),
  chatId: Id.nullable().describe("Set when you're already in it"),
});
export type GroupPreviewDTO = z.infer<typeof GroupPreviewDTO>;

export const GroupLinkPreviewDTO = GroupPreviewDTO.pick({ title: true, photoUrl: true });
export type GroupLinkPreviewDTO = z.infer<typeof GroupLinkPreviewDTO>;

export const GroupLinkDTO = z.object({ inviteCode: z.string() });

/** What stands for a chat in lists and headers: the group itself, or the other person. */
export function chatFace(chat: ChatDTO, meId: string): PublicUser {
  if (chat.group) return { id: chat.id, displayName: chat.title, avatarUrl: chat.group.photoUrl };
  return chat.members.find((m) => m.user.id !== meId)?.user ?? chat.members[0]!.user;
}

/** Whether a group is closed for a while, so that only admins write until `closedUntil`. */
export const groupClosed = (group: Pick<NonNullable<ChatDTO["group"]>, "closedUntil"> | null) =>
  !!group?.closedUntil && Date.parse(group.closedUntil) > Date.now();

/** A group where only admins write, for good or for a while, seen by a member: they read and react, with no composer. */
export const readOnlyGroup = (chat: Pick<ChatDTO, "group">) =>
  !!chat.group && (!chat.group.membersCanWrite || groupClosed(chat.group)) && chat.group.myRole === "member";

/** The nickname a group member goes by there and is mentioned by, even when you gave them a name of your own. */
export const nicknameOf = (u: Pick<PublicUser, "displayName" | "alias">) => u.alias ?? u.displayName;

type Member = Pick<ChatDTO["members"][number], "user" | "role">;

const isAdmin = (m: Pick<Member, "role"> | undefined) => m?.role === "owner" || m?.role === "admin";

/**
 * The other members of a group that `text` mentions: one by @ and their nickname, the owner and admins by @admin, and
 * everyone by @everyone, which only an admin can write.
 */
export function mentionsIn(text: string, members: Member[], meId: string) {
  const written = new Set(text.match(MENTION) ?? []);
  const everyone = written.has("@everyone") && isAdmin(members.find((m) => m.user.id === meId));
  const admins = written.has("@admin");
  return members
    .filter((m) => m.user.id !== meId && (everyone || (admins && isAdmin(m)) || written.has(`@${nicknameOf(m.user)}`)))
    .map((m) => m.user.id);
}

/** How a message can mention me in a group: my nickname, which shows as "@You", @everyone, and @admin if I am one. */
export function myMentions(chat: Pick<ChatDTO, "group" | "members">, meId: string) {
  const me = chat.group && chat.members.find((m) => m.user.id === meId);
  if (!me) return null;
  const nickname = `@${nicknameOf(me.user)}`;
  return { nickname, all: new Set([nickname, "@everyone", ...(isAdmin(me) ? ["@admin"] : [])]) };
}

/** `text` with my own mentions in a group, like @#3FA2C1, written as "@You" instead. */
export function mentionAsYou(text: string, chat: Pick<ChatDTO, "group" | "members">, meId: string, you: string) {
  const mine = myMentions(chat, meId);
  return mine ? text.replaceAll(mine.nickname, `@${you}`) : text;
}

/** The @ being typed right before the caret, and what follows it so far, to suggest mentions from. */
export function mentionQuery(text: string, caret: number) {
  const typed = /(?:^|\s)@(#?[0-9A-Za-z]{0,8})$/.exec(text.slice(0, caret));
  return typed ? { start: caret - typed[1]!.length - 1, query: typed[1]! } : null;
}

export type MentionOption = { insert: string; member: ChatDTO["members"][number] | null; group: "everyone" | "admin" | null };

/** What to suggest for the @ being typed: @everyone (for admins) and @admin first, then members by nickname. */
export function mentionOptions(chat: Pick<ChatDTO, "members">, meId: string, query: string): MentionOption[] {
  const typed = query.replace("#", "").toUpperCase();
  const groups = (["everyone", "admin"] as const).filter(
    (g) => !query.startsWith("#") && g.startsWith(query.toLowerCase()) && (g === "admin" || isAdmin(chat.members.find((m) => m.user.id === meId))),
  );
  const members = chat.members.filter((m) => m.user.id !== meId && nicknameOf(m.user).slice(1).startsWith(typed)).slice(0, 8);
  return [
    ...groups.map((group) => ({ insert: `@${group}`, member: null, group })),
    ...members.map((member) => ({ insert: `@${nicknameOf(member.user)}`, member, group: null })),
  ];
}

/** How a chat shows whoever sent something, or "Former member" for someone who left a group. */
export const senderName = (chat: Pick<ChatDTO, "members">, userId: string, t: Dict) =>
  chat.members.find((m) => m.user.id === userId)?.user.displayName ?? t.groups.formerMember;

const GROUP_ACTIONS = new Set(["group_created", "joined", "left", "removed", "renamed", "group_photo"]);

/** Whether a service message tells what happened to a group or its members. */
export const isGroupAction = (a: ServiceAction | null | undefined) => !!a && GROUP_ACTIONS.has(a.type);
