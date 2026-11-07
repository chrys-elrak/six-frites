import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  type ContactDTO,
  type ContactLabelInput,
  type ContactListQuery,
  type PublicUser,
  type UpdateContactInput,
  aliasAvatar,
} from "@six/shared";
import { type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { deleteObjects, presignGet, putObject } from "../lib/storage.js";
import { getChat } from "./chats.js";
import { scrubMessageEvents } from "./messages.js";
import { purgeUploads } from "./uploads.js";
import { avatarOf, pairAlias, requireAppLock, toPublicUser } from "./users.js";

interface Override {
  displayName: string | null;
  photoKey: string | null;
}

const photoUrl = (o: Override) => (o.photoKey ? presignGet(o.photoKey) : null);

function applyOverride(user: PublicUser, o: Override | undefined): PublicUser {
  if (!o) return user;
  return {
    ...user,
    displayName: o.displayName ?? user.displayName,
    avatarUrl: photoUrl(o) ?? user.avatarUrl,
    ...(o.displayName && aliasAvatar(user.displayName) && { alias: user.displayName }),
  };
}

/** The name and photo someone shows in a group. */
export interface GroupFace {
  nickname: string | null;
  photoKey: string | null;
}

/**
 * How `viewerId` sees these users: their alias and no photo unless they share their profile with
 * the viewer, or in a group the face they show there (`faces`), and the name and photo the viewer
 * gave them on top of that.
 */
export async function profilesFor(db: Tx, viewerId: string, userIds: string[], faces?: Map<string, GroupFace>) {
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
  return (u: Parameters<typeof toPublicUser>[0]) => {
    const face = faces?.get(u.id);
    const base = face
      ? {
          id: u.id,
          displayName: face.nickname ?? pairAlias(viewerId, u.id),
          avatarUrl: face.photoKey ? presignGet(face.photoKey) : null,
        }
      : toPublicUser(u, viewerId, u.id === viewerId || shared.has(u.id));
    return applyOverride(base, byId.get(u.id));
  };
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
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function contactsQuery(userId: string, where: Prisma.Sql, limit: number) {
  return prisma.$queryRaw<ContactRow[]>`
    SELECT * FROM (
      SELECT cm."chatId", u.id,
             CASE WHEN cm."showProfile" THEN u."displayName" ELSE pair_alias(${userId}, u.id) END AS "originalName",
             CASE WHEN cm."showProfile" THEN u."avatarUrl" END AS "avatarUrl",
             CASE WHEN cm."showProfile" THEN u."avatarKey" END AS "avatarKey",
             o."displayName" AS "customName", o."photoKey", me.archived,
             COALESCE(o."displayName", CASE WHEN cm."showProfile" THEN u."displayName" ELSE pair_alias(${userId}, u.id) END) AS name
      FROM "ChatMember" cm
      JOIN "Chat" c ON c.id = cm."chatId" AND c.type = 'direct' AND c."supportUserId" IS NULL
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
 * if they set one), whether or not they have talked yet. Chats they archived stay behind the archive.
 */
export async function listContacts(userId: string, q: ContactListQuery) {
  const after = q.cursor ? decodeCursor(q.cursor) : null;
  const filters: Prisma.Sql[] = [Prisma.sql`NOT archived`];
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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const looksLike: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(PNG),
  "image/webp": (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
};

/** Decodes a photo data URL, refusing one whose bytes aren't the image type it claims to be. */
export function parsePhoto(dataUrl: string) {
  const [meta, data] = dataUrl.split(",", 2) as [string, string];
  const mime = meta.slice(5, meta.indexOf(";"));
  const bytes = Buffer.from(data, "base64");
  if (!looksLike[mime]?.(bytes)) throw new AppError("VALIDATION_FAILED", "That file isn't a JPEG, PNG or WebP image");
  return { mime, bytes, ext: mime.split("/")[1] === "jpeg" ? "jpg" : mime.split("/")[1]! };
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
    if (saved.displayName === null && saved.photoKey === null && saved.label === null) {
      await tx.contactOverride.delete({ where: { ownerId_contactId: { ownerId, contactId } } });
    }
    emit(ownerId, "chat.updated", await getChat(ownerId, contact.chatId, tx));
  });

  if (photoKey !== undefined && previousKey && previousKey !== photoKey) {
    await deleteObjects([previousKey]).catch(() => null);
  }
  return toContactDTO(await getContact(ownerId, contactId));
}

/** The private note `ownerId` keeps about a contact. Never part of any other response; only their app lock code opens it. */
export async function readLabel(ownerId: string, contactId: string, code: string) {
  await requireAppLock(ownerId, code);
  await getContact(ownerId, contactId);
  const o = await prisma.contactOverride.findUnique({
    where: { ownerId_contactId: { ownerId, contactId } },
    select: { label: true },
  });
  return { label: o?.label ?? null };
}

export async function setLabel(ownerId: string, contactId: string, input: ContactLabelInput) {
  await requireAppLock(ownerId, input.code);
  await getContact(ownerId, contactId);
  const key = { ownerId_contactId: { ownerId, contactId } };
  const label = input.label || null;
  const saved = await prisma.contactOverride.upsert({ where: key, create: { ownerId, contactId, label }, update: { label } });
  if (saved.displayName === null && saved.photoKey === null && saved.label === null) {
    await prisma.contactOverride.delete({ where: key });
  }
  return { label: saved.label };
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
