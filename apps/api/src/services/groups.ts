import { randomUUID } from "node:crypto";
import {
  AppError,
  type CreateGroupInput,
  type GroupLinkPreviewDTO,
  type GroupPreviewDTO,
  type JoinGroupInput,
  type ServiceAction,
  type SetGroupRoleInput,
  type UpdateGroupInput,
  type UpdateGroupMeInput,
} from "@six/shared";
import { generateCode } from "../lib/codes.js";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { deleteObjects, presignGet, putObject } from "../lib/storage.js";
import { getChat } from "./chats.js";
import { parsePhoto } from "./contacts.js";
import { createMessage, scrubMessageEvents } from "./messages.js";
import { purgeUploads } from "./uploads.js";
import { pairAlias } from "./users.js";

async function savePhoto(dataUrl: string) {
  const photo = parsePhoto(dataUrl);
  const key = `g/${randomUUID()}.${photo.ext}`;
  await putObject(key, photo.bytes, photo.mime);
  return key;
}

const dropPhotos = (keys: (string | null | undefined)[]) => {
  const doomed = keys.filter((k): k is string => !!k);
  if (doomed.length) void deleteObjects(doomed).catch(() => null);
};

const announce = (tx: Tx, emit: Emit, userId: string, chatId: string, action: ServiceAction) =>
  createMessage(tx, emit, userId, chatId, { clientId: `group:${randomUUID()}`, action });

async function emitChat(tx: Tx, emit: Emit, chatId: string) {
  const members = await tx.chatMember.findMany({ where: { chatId }, select: { userId: true } });
  for (const m of members) emit(m.userId, "chat.updated", await getChat(m.userId, chatId, tx));
}

/** My membership in a group, refused when the chat isn't a group or I'm not in it. */
async function groupMember(db: Tx, chatId: string, userId: string) {
  const member = await db.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } }, include: { chat: true } });
  if (!member || member.chat.type !== "group") throw new AppError("CHAT_NOT_FOUND");
  return member;
}

async function groupAdmin(db: Tx, chatId: string, userId: string) {
  const member = await groupMember(db, chatId, userId);
  if (member.role === "member") throw new AppError("NOT_GROUP_ADMIN");
  return member;
}

const shownName = (m: { nickname: string | null; userId: string }, viewerId: string) => m.nickname ?? pairAlias(viewerId, m.userId);

async function refuseGuest(db: Tx, userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { guest: true } });
  if (user.guest) throw new AppError("FORBIDDEN", "Guests can't be in groups");
}

/** Makes a group with me as its owner. Nobody else is in it until they open its link. */
export async function createGroup(userId: string, input: CreateGroupInput) {
  await refuseGuest(prisma, userId);
  const [photoKey, nicknameKey] = await Promise.all([
    input.photo ? savePhoto(input.photo) : null,
    input.nicknamePhoto ? savePhoto(input.nicknamePhoto) : null,
  ]);
  try {
    return await withEvents(async (tx, emit) => {
      const chat = await tx.chat.create({
        data: {
          type: "group",
          title: input.title,
          description: input.description || null,
          photoKey,
          maxMembers: input.maxMembers,
          inviteCode: generateCode(),
          members: { create: { userId, role: "owner", nickname: input.nickname, photoKey: nicknameKey } },
        },
      });
      await announce(tx, emit, userId, chat.id, { type: "group_created", title: input.title });
      const dto = await getChat(userId, chat.id, tx);
      emit(userId, "chat.updated", dto);
      return dto;
    });
  } catch (err) {
    dropPhotos([photoKey, nicknameKey]);
    throw err;
  }
}

/** What the group behind a link looks like before joining, and whether I can. */
export async function previewGroup(userId: string, code: string): Promise<GroupPreviewDTO> {
  const chat = await prisma.chat.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: { _count: { select: { members: true } } },
  });
  if (!chat || chat.type !== "group") throw new AppError("GROUP_LINK_INVALID");
  const [mine, ban] = await Promise.all([
    prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: chat.id, userId } } }),
    prisma.chatBan.findUnique({ where: { chatId_userId: { chatId: chat.id, userId } } }),
  ]);
  const maxMembers = chat.maxMembers ?? 0;
  return {
    title: chat.title ?? "",
    photoUrl: chat.photoKey ? presignGet(chat.photoKey) : null,
    description: chat.description,
    memberCount: chat._count.members,
    maxMembers,
    full: chat._count.members >= maxMembers,
    banned: !!ban,
    chatId: mine ? chat.id : null,
  };
}

/** What anyone holding a group's link may know without signing in: its name and picture, for the link's preview. */
export async function groupLinkPreview(code: string): Promise<GroupLinkPreviewDTO> {
  const chat = await prisma.chat.findUnique({
    where: { inviteCode: code.toUpperCase() },
    select: { type: true, title: true, photoKey: true },
  });
  if (!chat || chat.type !== "group") throw new AppError("GROUP_LINK_INVALID");
  return { title: chat.title ?? "", photoUrl: chat.photoKey ? presignGet(chat.photoKey) : null };
}

/**
 * Joins the group behind a link, the only way into a group. The chat row is locked first, so two people
 * can't both take the last place. History from before joining stays hidden: it was sealed for the
 * members back then, so it couldn't be read anyway.
 */
export async function joinGroup(userId: string, code: string, input: JoinGroupInput) {
  const photoKey = input.photo ? await savePhoto(input.photo) : null;
  try {
    return await withEvents(async (tx, emit) => {
      const [row] = await tx.$queryRaw<{ id: string; maxMembers: number | null }[]>`
        SELECT id, "maxMembers" FROM "Chat" WHERE "inviteCode" = ${code.toUpperCase()} AND type = 'group' FOR UPDATE`;
      if (!row) throw new AppError("GROUP_LINK_INVALID");
      const chatId = row.id;
      if (await tx.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } })) {
        dropPhotos([photoKey]);
        return getChat(userId, chatId, tx);
      }
      await refuseGuest(tx, userId);
      if (await tx.chatBan.findUnique({ where: { chatId_userId: { chatId, userId } } })) throw new AppError("GROUP_BANNED");
      if ((await tx.chatMember.count({ where: { chatId } })) >= (row.maxMembers ?? 0)) throw new AppError("GROUP_FULL");

      await tx.chatMember.create({
        data: { chatId, userId, nickname: input.nickname, photoKey, clearedAt: new Date(Date.now() - 1) },
      });
      await announce(tx, emit, userId, chatId, { type: "joined", name: input.nickname });
      await emitChat(tx, emit, chatId);
      return getChat(userId, chatId, tx);
    });
  } catch (err) {
    dropPhotos([photoKey]);
    throw err;
  }
}

/** Renames the group, changes its photo, its number of places or what members may do; admins only. */
export async function updateGroup(userId: string, chatId: string, input: UpdateGroupInput) {
  const member = await groupAdmin(prisma, chatId, userId);
  const photoKey = input.photo ? await savePhoto(input.photo) : input.photo;
  const previous = member.chat.photoKey;
  try {
    const dto = await withEvents(async (tx, emit) => {
      if (input.maxMembers !== undefined && input.maxMembers < (await tx.chatMember.count({ where: { chatId } }))) {
        throw new AppError("VALIDATION_FAILED", "There are already more members than that");
      }
      await tx.chat.update({
        where: { id: chatId },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description || null }),
          ...(photoKey !== undefined && { photoKey }),
          ...(input.maxMembers !== undefined && { maxMembers: input.maxMembers }),
          ...(input.membersCanWrite !== undefined && { membersCanWrite: input.membersCanWrite }),
          ...(input.membersCanInvite !== undefined && { membersCanInvite: input.membersCanInvite }),
          ...(input.closeForSecs !== undefined && {
            closedUntil: input.closeForSecs === null ? null : new Date(Date.now() + input.closeForSecs * 1000),
          }),
        },
      });
      if (input.title !== undefined && input.title !== member.chat.title) {
        await announce(tx, emit, userId, chatId, { type: "renamed", title: input.title });
      }
      if (photoKey !== undefined) await announce(tx, emit, userId, chatId, { type: "group_photo" });
      await emitChat(tx, emit, chatId);
      return getChat(userId, chatId, tx);
    });
    if (photoKey !== undefined) dropPhotos([previous]);
    return dto;
  } catch (err) {
    if (photoKey) dropPhotos([photoKey]);
    throw err;
  }
}

/** Gives the group a new link; the old one stops working. Admins only. */
export async function resetGroupLink(userId: string, chatId: string) {
  await groupAdmin(prisma, chatId, userId);
  return withEvents(async (tx, emit) => {
    await tx.chat.update({ where: { id: chatId }, data: { inviteCode: generateCode() } });
    await emitChat(tx, emit, chatId);
    return getChat(userId, chatId, tx);
  });
}

/** Changes the name or photo I show in a group. */
export async function updateGroupMe(userId: string, chatId: string, input: UpdateGroupMeInput) {
  const member = await groupMember(prisma, chatId, userId);
  const photoKey = input.photo ? await savePhoto(input.photo) : input.photo;
  const dto = await withEvents(async (tx, emit) => {
    await tx.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: {
        ...(input.nickname !== undefined && { nickname: input.nickname }),
        ...(photoKey !== undefined && { photoKey }),
      },
    });
    await emitChat(tx, emit, chatId);
    return getChat(userId, chatId, tx);
  });
  if (photoKey !== undefined) dropPhotos([member.photoKey]);
  return dto;
}

/** Makes a member an admin, or an admin a member again. Only the owner can. */
export async function setGroupRole(userId: string, chatId: string, targetId: string, { role }: SetGroupRoleInput) {
  const me = await groupMember(prisma, chatId, userId);
  if (me.role !== "owner") throw new AppError("NOT_GROUP_ADMIN", "Only the owner can choose the admins");
  return withEvents(async (tx, emit) => {
    const target = await tx.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: targetId } } });
    if (!target || target.role === "owner") throw new AppError("USER_NOT_FOUND");
    await tx.chatMember.update({ where: { chatId_userId: { chatId, userId: targetId } }, data: { role } });
    await emitChat(tx, emit, chatId);
    return getChat(userId, chatId, tx);
  });
}

/** Takes someone out of the group for the rest; they can't come back through the link. */
export async function removeGroupMember(userId: string, chatId: string, targetId: string) {
  const me = await groupAdmin(prisma, chatId, userId);
  if (targetId === userId) throw new AppError("VALIDATION_FAILED", "Leave the group instead");
  const photoKey = await withEvents(async (tx, emit) => {
    const target = await tx.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: targetId } } });
    if (!target) throw new AppError("USER_NOT_FOUND");
    if (target.role === "owner" || (target.role === "admin" && me.role !== "owner")) throw new AppError("NOT_GROUP_ADMIN");
    await announce(tx, emit, userId, chatId, { type: "removed", name: shownName(target, userId) });
    await tx.chatBan.upsert({
      where: { chatId_userId: { chatId, userId: targetId } },
      create: { chatId, userId: targetId },
      update: {},
    });
    await dropMember(tx, emit, chatId, targetId);
    await emitChat(tx, emit, chatId);
    return target.photoKey;
  });
  dropPhotos([photoKey]);
}

async function dropMember(tx: Tx, emit: Emit, chatId: string, userId: string) {
  await tx.scheduledMessage.deleteMany({ where: { chatId, senderId: userId } });
  await tx.chatMember.delete({ where: { chatId_userId: { chatId, userId } } });
  emit(userId, "chat.deleted", { chatId, scope: "me" });
}

/**
 * Takes me out of a group. An owner who leaves hands the group to the longest-serving admin, or else
 * to whoever has been in it longest; the last one out deletes the group with everything in it.
 */
async function leave(tx: Tx, emit: Emit, chatId: string, userId: string) {
  const member = await groupMember(tx, chatId, userId);
  const rest = await tx.chatMember.findMany({ where: { chatId, userId: { not: userId } }, orderBy: { joinedAt: "asc" } });
  if (!rest.length) {
    const doomed = await tx.message.findMany({ where: { chatId }, select: { id: true, attachmentId: true } });
    await scrubMessageEvents(tx, doomed.map((m) => m.id));
    await tx.chat.delete({ where: { id: chatId } });
    emit(userId, "chat.deleted", { chatId, scope: "me" });
    return {
      attachments: doomed.map((m) => m.attachmentId).filter((a): a is string => !!a),
      photos: [member.photoKey, member.chat.photoKey],
    };
  }
  await announce(tx, emit, userId, chatId, { type: "left", name: shownName(member, userId) });
  if (member.role === "owner") {
    const heir = rest.find((m) => m.role === "admin") ?? rest[0]!;
    await tx.chatMember.update({ where: { chatId_userId: { chatId, userId: heir.userId } }, data: { role: "owner" } });
  }
  await dropMember(tx, emit, chatId, userId);
  await emitChat(tx, emit, chatId);
  return { attachments: [], photos: [member.photoKey] };
}

export async function leaveGroup(userId: string, chatId: string) {
  const left = await withEvents((tx, emit) => leave(tx, emit, chatId, userId));
  dropPhotos(left.photos);
  await purgeUploads(left.attachments);
}

/** Takes someone out of every group they're in, when their account is deleted. Returns the photos to delete. */
export async function leaveAllGroups(tx: Tx, emit: Emit, userId: string) {
  const groups = await tx.chatMember.findMany({ where: { userId, chat: { type: "group" } }, select: { chatId: true } });
  const photos: (string | null)[] = [];
  const attachments: string[] = [];
  for (const { chatId } of groups) {
    const left = await leave(tx, emit, chatId, userId);
    photos.push(...left.photos);
    attachments.push(...left.attachments);
  }
  return { photos: photos.filter((k): k is string => !!k), attachments };
}
