import type { Prisma } from "../generated/prisma/client.js";
import { AppError, type FoundUserDTO, USERNAME_PATTERN } from "@six/shared";
import { CODE_ALPHABET } from "../lib/codes.js";
import { withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { ensureDirectChat, getChat } from "./chats.js";
import { applyOverride, findContact, loadOverrides } from "./contacts.js";
import { toPublicUser } from "./users.js";

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{8}$`);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The lookups a search can mean: a contact link (…/add/CODE), an exact email, a contact code
 * (dashes and spaces ignored) or a username. Eight letters can be both a code and a username,
 * so both are tried.
 */
export function searchConditions(raw: string): Prisma.UserWhereInput[] {
  const q = raw.trim();
  const link = q.match(/\/add\/([^/?#\s]+)\/?(?:[?#].*)?$/);
  if (link) return [{ contactCode: link[1]!.replace(/-/g, "").toUpperCase() }];
  if (EMAIL_PATTERN.test(q)) return [{ email: { equals: q, mode: "insensitive" }, findByEmail: true }];

  const conditions: Prisma.UserWhereInput[] = [];
  const code = q.replace(/[\s-]/g, "").toUpperCase();
  if (!q.startsWith("@") && CODE_PATTERN.test(code)) conditions.push({ contactCode: code });
  const username = q.replace(/^@/, "").toLowerCase();
  if (USERNAME_PATTERN.test(username)) conditions.push({ username });
  return conditions;
}

async function resolve(userId: string, q: string) {
  const conditions = searchConditions(q);
  const user = conditions.length ? await prisma.user.findFirst({ where: { OR: conditions, deletedAt: null } }) : null;
  if (!user) throw new AppError("USER_NOT_FOUND", "No one matches that code, username or email");
  if (user.id === userId) throw new AppError("CONTACT_SELF", "That's you");
  return user;
}

export async function findUser(userId: string, q: string): Promise<FoundUserDTO> {
  const user = await resolve(userId, q);
  const [overrides, chat] = await Promise.all([
    loadOverrides(prisma, userId, [user.id]),
    prisma.chat.findUnique({ where: { directKey: [userId, user.id].sort().join(":") }, select: { id: true } }),
  ]);
  return {
    user: applyOverride(toPublicUser(user), overrides.get(user.id)),
    username: user.username,
    chatId: chat?.id ?? null,
  };
}

/**
 * Opens a direct chat with whoever `q` names, or returns the one that already exists, bringing
 * it back if the user had deleted it on their side.
 */
export async function addContact(userId: string, q: string) {
  const user = await resolve(userId, q);
  await withEvents(async (tx, emit) => {
    const chatId = await ensureDirectChat(tx, emit, userId, user.id);
    const unhidden = await tx.chatMember.updateMany({ where: { chatId, userId, hidden: true }, data: { hidden: false } });
    if (unhidden.count) emit(userId, "chat.updated", await getChat(userId, chatId, tx));
  });
  return findContact(userId, user.id);
}
