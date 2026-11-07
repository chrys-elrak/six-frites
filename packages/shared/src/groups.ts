import { z } from "zod";
import { Id } from "./common.js";
import { ContactPhoto } from "./contacts.js";
import { type ChatDTO, GROUP_MAX_PLACES, GROUP_MIN_PLACES, type ServiceAction } from "./chats.js";
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

export const GroupLinkDTO = z.object({ inviteCode: z.string() });

/** What stands for a chat in lists and headers: the group itself, or the other person. */
export function chatFace(chat: ChatDTO, meId: string): PublicUser {
  if (chat.group) return { id: chat.id, displayName: chat.title, avatarUrl: chat.group.photoUrl };
  return chat.members.find((m) => m.user.id !== meId)?.user ?? chat.members[0]!.user;
}

/** A group where only admins write, seen by a member: they read and react, with no composer. */
export const readOnlyGroup = (chat: Pick<ChatDTO, "group">) =>
  !!chat.group && !chat.group.membersCanWrite && chat.group.myRole === "member";

/** How a chat shows whoever sent something, or "Former member" for someone who left a group. */
export const senderName = (chat: Pick<ChatDTO, "members">, userId: string, t: Dict) =>
  chat.members.find((m) => m.user.id === userId)?.user.displayName ?? t.groups.formerMember;

const GROUP_ACTIONS = new Set(["group_created", "joined", "left", "removed", "renamed", "group_photo"]);

/** Whether a service message tells what happened to a group or its members. */
export const isGroupAction = (a: ServiceAction | null | undefined) => !!a && GROUP_ACTIONS.has(a.type);
