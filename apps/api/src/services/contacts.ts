import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  type ContactDTO,
  type ContactListQuery,
  type PublicUser,
  type UpdateContactInput,
} from "@six/shared";
import { type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { deleteObjects, presignGet, putObject } from "../lib/storage.js";
import { getChat } from "./chats.js";
import { scrubMessageEvents } from "./messages.js";
import { purgeUploads } from "./uploads.js";
import { avatarOf, toPublicUser } from "./users.js";

interface Override {
  displayName: string | null;
  photoKey: string | null;
}

const photoUrl = (o: Override) => (o.photoKey ? presignGet(o.photoKey) : null);

function applyOverride(user: PublicUser, o: Override | undefined): PublicUser {
  if (!o) return user;
  return { ...user, displayName: o.displayName ?? user.displayName, avatarUrl: photoUrl(o) ?? user.avatarUrl };
}

/**
 * How `viewerId` sees these users: their alias and no photo unless they share their profile with
 * the viewer, and the name and photo the viewer gave them on top of that.
 */
export async function profilesFor(db: Tx, viewerId: string, userIds: string[]) {
  const others = userIds.filter((id) => id !== viewerId);
  const overrides = others.length
    ? await db.contactOverride.findMany({ where: { ownerId: viewerId, contactId: { in: others } } })
    : [];
  const sharing = others.length
    ? await db.chatMember.findMany({
        where: { userId: { in: others }, showProfile: true, chat: { members: { some: { userId: viewerId } } } },
        select: { userId: true },
      })
    : [];
  const byId = new Map<string, Override>(overrides.map((o) => [o.contactId, o]));
  const shared = new Set(sharing.map((m) => m.userId));
  return (u: Parameters<typeof toPublicUser>[0]) =>
    applyOverride(toPublicUser(u, u.id === viewerId || shared.has(u.id)), byId.get(u.id));
}

function encodeCursor(name: string, id: string) {
  return Buffer.from(JSON.stringify([name, id])).toString("base64url");
}

function decodeCursor(cursor: string) {
  try {
    const [name, id] = JSON.parse(Buffer.from(cursor, "base64url").toString()) as [string, string];
    if (typeof name === "string" && typeof id === "string") return { name, id };
  } catch {}
  throw new AppError("VALIDATION_FAILED", "Invalid cursor");
}

interface ContactRow {
  chatId: string;
  id: string;
  originalName: string;
  avatarUrl: string | null;
  avatarKey: string | null;
  customName: string | null;
  photoKey: string | null;
  sharingProfile: boolean;
  name: string;
}

function toContactDTO(r: ContactRow): ContactDTO {
  const o = { displayName: r.customName, photoKey: r.photoKey };
  return {
    user: applyOverride({ id: r.id, displayName: r.originalName, avatarUrl: avatarOf(r) }, o),
    chatId: r.chatId,
    originalName: r.originalName,
    customName: r.customName,
    hasCustomPhoto: r.photoKey !== null,
    sharingProfile: r.sharingProfile,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function contactsQuery(userId: string, where: Prisma.Sql, limit: number) {
  return prisma.$queryRaw<ContactRow[]>`
    SELECT * FROM (
      SELECT cm."chatId", u.id,
             CASE WHEN cm."showProfile" THEN u."displayName" ELSE u.alias END AS "originalName",
             CASE WHEN cm."showProfile" THEN u."avatarUrl" END AS "avatarUrl",
             CASE WHEN cm."showProfile" THEN u."avatarKey" END AS "avatarKey",
             o."displayName" AS "customName", o."photoKey", me."showProfile" AS "sharingProfile",
             COALESCE(o."displayName", CASE WHEN cm."showProfile" THEN u."displayName" ELSE u.alias END) AS name
      FROM "ChatMember" cm
      JOIN "Chat" c ON c.id = cm."chatId" AND c.type = 'direct'
      JOIN "ChatMember" me ON me."chatId" = cm."chatId" AND me."userId" = ${userId}
      JOIN "User" u ON u.id = cm."userId" AND u."deletedAt" IS NULL
      LEFT JOIN "ContactOverride" o ON o."ownerId" = ${userId} AND o."contactId" = u.id
      WHERE cm."userId" <> ${userId}
    ) contacts
    WHERE ${where}
    ORDER BY name, id
    LIMIT ${limit}`;
}

/**
 * People the user shares a direct chat with, A to Z by the name the user sees (their custom name
 * if they set one), whether or not they have talked yet.
 */
export async function listContacts(userId: string, q: ContactListQuery) {
  const after = q.cursor ? decodeCursor(q.cursor) : null;
  const filters: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (q.q) {
    const like = `%${escapeLike(q.q)}%`;
    filters.push(Prisma.sql`name ILIKE ${like}`);
  }
  if (after) filters.push(Prisma.sql`(name, id) > (${after.name}, ${after.id})`);

  const rows = await contactsQuery(userId, Prisma.join(filters, " AND "), q.limit + 1);
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(toContactDTO),
    nextCursor: hasMore && last ? encodeCursor(last.name, last.id) : null,
  };
}

export async function findContact(userId: string, contactId: string) {
  return toContactDTO(await getContact(userId, contactId));
}

async function getContact(userId: string, contactId: string) {
  const [row] = await contactsQuery(userId, Prisma.sql`id = ${contactId}`, 1);
  if (!row) throw new AppError("CONTACT_NOT_FOUND");
  return row;
}

export function parsePhoto(dataUrl: string) {
  const [meta, data] = dataUrl.split(",", 2) as [string, string];
  const mime = meta.slice(5, meta.indexOf(";"));
  return { mime, bytes: Buffer.from(data, "base64"), ext: mime.split("/")[1] === "jpeg" ? "jpg" : mime.split("/")[1]! };
}

/** Sets or clears the name and photo only `ownerId` sees for this contact. */
export async function updateContact(ownerId: string, contactId: string, input: UpdateContactInput) {
  const contact = await getContact(ownerId, contactId);
  const previousKey = contact.photoKey;

  let photoKey: string | null | undefined;
  if (input.photo === null) photoKey = null;
  else if (input.photo !== undefined) {
    const photo = parsePhoto(input.photo);
    photoKey = `c/${ownerId}/${contactId}/${randomUUID()}.${photo.ext}`;
    await putObject(photoKey, photo.bytes, photo.mime);
  }

  await withEvents(async (tx, emit) => {
    const data = {
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(photoKey !== undefined && { photoKey }),
    };
    const saved = await tx.contactOverride.upsert({
      where: { ownerId_contactId: { ownerId, contactId } },
      create: { ownerId, contactId, ...data },
      update: data,
    });
    if (saved.displayName === null && saved.photoKey === null) {
      await tx.contactOverride.delete({ where: { ownerId_contactId: { ownerId, contactId } } });
    }
    emit(ownerId, "chat.updated", await getChat(ownerId, contact.chatId, tx));
  });

  if (photoKey !== undefined && previousKey && previousKey !== photoKey) {
    await deleteObjects([previousKey]).catch(() => null);
  }
  return toContactDTO(await getContact(ownerId, contactId));
}

/** Shows or hides the user's real name and photo to a contact, who otherwise sees their alias. */
export async function shareProfile(userId: string, contactId: string, shared: boolean) {
  const { chatId } = await getContact(userId, contactId);
  await withEvents(async (tx, emit) => {
    await tx.chatMember.update({ where: { chatId_userId: { chatId, userId } }, data: { showProfile: shared } });
    for (const id of [userId, contactId]) emit(id, "chat.updated", await getChat(id, chatId, tx));
  });
  return toContactDTO(await getContact(userId, contactId));
}

/**
 * Removes a contact for both people: their direct chat goes, with its messages and files, and so
 * do the names and photos they gave each other. Either one can add the other again later.
 */
export async function removeContact(userId: string, contactId: string) {
  const { chatId } = await getContact(userId, contactId);
  const pair = { OR: [{ ownerId: userId, contactId }, { ownerId: contactId, contactId: userId }] };
  const { uploads, photos } = await withEvents(async (tx, emit) => {
    const doomed = await tx.message.findMany({ where: { chatId }, select: { id: true, attachmentId: true } });
    await scrubMessageEvents(tx, doomed.map((m) => m.id));
    const overrides = await tx.contactOverride.findMany({ where: pair });
    await tx.contactOverride.deleteMany({ where: pair });
    await tx.chat.delete({ where: { id: chatId } });
    for (const id of [userId, contactId]) emit(id, "chat.deleted", { chatId, scope: "me" });
    return {
      uploads: doomed.map((m) => m.attachmentId).filter((a): a is string => !!a),
      photos: overrides.map((o) => o.photoKey).filter((k): k is string => !!k),
    };
  });
  await purgeUploads(uploads);
  if (photos.length) await deleteObjects(photos).catch(() => null);
}
