import { randomUUID } from "node:crypto";
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
import { deleteObjects, presignGet, putObject } from "../lib/storage.js";
import { getChat } from "./chats.js";

interface Override {
  displayName: string | null;
  photoKey: string | null;
}

const photoUrl = (o: Override) => (o.photoKey ? presignGet(o.photoKey) : null);

export function applyOverride(user: PublicUser, o: Override | undefined): PublicUser {
  if (!o) return user;
  return { ...user, displayName: o.displayName ?? user.displayName, avatarUrl: photoUrl(o) ?? user.avatarUrl };
}

/** The custom names and photos `ownerId` has given to these users. */
export async function loadOverrides(db: Tx, ownerId: string, userIds: string[]) {
  const rows = userIds.length
    ? await db.contactOverride.findMany({ where: { ownerId, contactId: { in: userIds } } })
    : [];
  return new Map<string, Override>(rows.map((r) => [r.contactId, r]));
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
  photoKey: string | null;
  name: string;
}

function toContactDTO(r: ContactRow): ContactDTO {
  const o = { displayName: r.customName, photoKey: r.photoKey };
  return {
    user: applyOverride({ id: r.id, displayName: r.originalName, avatarUrl: r.avatarUrl }, o),
    chatId: r.chatId,
    originalName: r.originalName,
    customName: r.customName,
    hasCustomPhoto: r.photoKey !== null,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function contactsQuery(userId: string, where: Prisma.Sql, limit: number) {
  return prisma.$queryRaw<ContactRow[]>`
    SELECT * FROM (
      SELECT cm."chatId", u.id, u."displayName" AS "originalName", u."avatarUrl",
             o."displayName" AS "customName", o."photoKey",
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
