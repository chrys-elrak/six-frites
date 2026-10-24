import { Prisma } from "@prisma/client";
import {
  AppError,
  type ContactDTO,
  type ContactListQuery,
  type PublicUser,
  type UpdateContactInput,
} from "@six/shared";
import { type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { getChat } from "./chats.js";

interface Override {
  displayName: string | null;
  photo: Uint8Array | null;
  photoMime: string | null;
}

const photoUrl = (o: Override) =>
  o.photo && o.photoMime ? `data:${o.photoMime};base64,${Buffer.from(o.photo).toString("base64")}` : null;

export function applyOverride(user: PublicUser, o: Override | undefined): PublicUser {
  if (!o) return user;
  return { ...user, displayName: o.displayName ?? user.displayName, avatarUrl: photoUrl(o) ?? user.avatarUrl };
}

/** The custom names and photos `ownerId` has given to these users. */
export async function loadOverrides(db: Tx, ownerId: string, userIds: string[]) {
  const rows = userIds.length
    ? await db.contactOverride.findMany({ where: { ownerId, contactId: { in: userIds } } })
    : [];
  return new Map(rows.map((r) => [r.contactId, r as Override]));
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
  customName: string | null;
  photo: Uint8Array | null;
  photoMime: string | null;
  name: string;
}

function toContactDTO(r: ContactRow): ContactDTO {
  const o = { displayName: r.customName, photo: r.photo, photoMime: r.photoMime };
  return {
    user: applyOverride({ id: r.id, displayName: r.originalName, avatarUrl: r.avatarUrl }, o),
    chatId: r.chatId,
    originalName: r.originalName,
    customName: r.customName,
    hasCustomPhoto: r.photo !== null,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function contactsQuery(userId: string, where: Prisma.Sql, limit: number) {
  return prisma.$queryRaw<ContactRow[]>`
    SELECT * FROM (
      SELECT cm."chatId", u.id, u."displayName" AS "originalName", u."avatarUrl",
             o."displayName" AS "customName", o.photo, o."photoMime",
             COALESCE(o."displayName", u."displayName") AS name
      FROM "ChatMember" cm
      JOIN "Chat" c ON c.id = cm."chatId" AND c.type = 'direct'
      JOIN "ChatMember" me ON me."chatId" = cm."chatId" AND me."userId" = ${userId}
      JOIN "User" u ON u.id = cm."userId"
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
    filters.push(Prisma.sql`(name ILIKE ${like} OR "originalName" ILIKE ${like})`);
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

function parsePhoto(dataUrl: string) {
  const [meta, data] = dataUrl.split(",", 2) as [string, string];
  return { photoMime: meta.slice(5, meta.indexOf(";")), photo: Buffer.from(data, "base64") };
}

/** Sets or clears the name and photo only `ownerId` sees for this contact. */
export async function updateContact(ownerId: string, contactId: string, input: UpdateContactInput) {
  const contact = await getContact(ownerId, contactId);

  await withEvents(async (tx, emit) => {
    const data = {
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.photo !== undefined &&
        (input.photo === null ? { photo: null, photoMime: null } : parsePhoto(input.photo))),
    };
    const saved = await tx.contactOverride.upsert({
      where: { ownerId_contactId: { ownerId, contactId } },
      create: { ownerId, contactId, ...data },
      update: data,
    });
    if (saved.displayName === null && saved.photo === null) {
      await tx.contactOverride.delete({ where: { ownerId_contactId: { ownerId, contactId } } });
    }

    emit(ownerId, "chat.updated", await getChat(ownerId, contact.chatId, tx));
  });

  return toContactDTO(await getContact(ownerId, contactId));
}
