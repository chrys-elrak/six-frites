import { AppError, type ContactDTO, type ContactListQuery } from "@six/shared";
import { prisma } from "../lib/prisma.js";
import { toPublicUser } from "./users.js";

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

/** People the user shares a direct chat with, alphabetically, whether or not they have talked yet. */
export async function listContacts(userId: string, q: ContactListQuery) {
  const after = q.cursor ? decodeCursor(q.cursor) : null;
  const rows = await prisma.chatMember.findMany({
    where: {
      userId: { not: userId },
      chat: { type: "direct", members: { some: { userId } } },
      ...(q.q && { user: { displayName: { contains: q.q, mode: "insensitive" } } }),
      ...(after && {
        OR: [
          { user: { displayName: { gt: after.name } } },
          { user: { displayName: after.name }, userId: { gt: after.id } },
        ],
      }),
    },
    include: { user: true },
    orderBy: [{ user: { displayName: "asc" } }, { userId: "asc" }],
    take: q.limit + 1,
  });

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map((m): ContactDTO => ({ user: toPublicUser(m.user), chatId: m.chatId })),
    nextCursor: hasMore && last ? encodeCursor(last.user.displayName, last.userId) : null,
  };
}
