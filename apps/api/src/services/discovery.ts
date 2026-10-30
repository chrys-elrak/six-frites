import type { ContactLink } from "../generated/prisma/client.js";
import { AppError, type ContactLinkDTO, type FoundUserDTO, MAX_CONTACT_LINKS } from "@six/shared";
import { CODE_ALPHABET, generateCode } from "../lib/codes.js";
import { withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { ensureDirectChat, getChat } from "./chats.js";
import { findContact, profilesFor } from "./contacts.js";
import { toUserDTO } from "./users.js";

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{8}$`);

/** The contact code in `q`, typed (dashes and spaces ignored) or inside a contact link (…/add/CODE). */
function contactCodeOf(q: string) {
  const typed = q.trim();
  const code = (typed.match(/\/add\/([^/?#\s]+)\/?(?:[?#].*)?$/)?.[1] ?? typed).replace(/[\s-]/g, "").toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

const unexpired = () => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });

/** Whoever `q` names, by their contact code or one of their contact links that hasn't expired. */
async function resolve(userId: string, q: string) {
  const code = contactCodeOf(q);
  const user = code
    ? await prisma.user.findFirst({
        where: {
          deletedAt: null,
          queuedAt: null,
          guest: false,
          OR: [{ contactCode: code }, { contactLinks: { some: { code, ...unexpired() } } }],
        },
      })
    : null;
  if (!user) throw new AppError("USER_NOT_FOUND", "No one has that contact code");
  if (user.id === userId) throw new AppError("CONTACT_SELF", "That's you");
  return { user, code: code! };
}

export async function findUser(userId: string, q: string): Promise<FoundUserDTO> {
  const { user } = await resolve(userId, q);
  const [shown, chat] = await Promise.all([
    profilesFor(prisma, userId, [user.id]),
    prisma.chat.findUnique({ where: { directKey: [userId, user.id].sort().join(":") }, select: { id: true } }),
  ]);
  return {
    user: shown(user),
    chatId: chat?.id ?? null,
  };
}

/**
 * Opens a direct chat with whoever `q` names, or returns the one that already exists, bringing
 * it back if the user had deleted it on their side. A contact code works once: using it gives its
 * owner a new one, so whoever added them can't pass it on. Contact links keep working.
 */
export async function addContact(userId: string, q: string) {
  const { user, code } = await resolve(userId, q);
  await withEvents(async (tx, emit) => {
    if (code === user.contactCode) {
      const used = await tx.user.updateMany({ where: { id: user.id, contactCode: code }, data: { contactCode: generateCode() } });
      if (!used.count) throw new AppError("USER_NOT_FOUND", "That contact code was just used");
      emit(user.id, "me.updated", toUserDTO(await tx.user.findUniqueOrThrow({ where: { id: user.id } })));
    }
    const chatId = await ensureDirectChat(tx, emit, userId, user.id);
    const unhidden = await tx.chatMember.updateMany({ where: { chatId, userId, hidden: true }, data: { hidden: false } });
    if (unhidden.count) emit(userId, "chat.updated", await getChat(userId, chatId, tx));
  });
  return findContact(userId, user.id);
}

function toContactLinkDTO(l: ContactLink): ContactLinkDTO {
  return { code: l.code, expiresAt: l.expiresAt?.toISOString() ?? null, createdAt: l.createdAt.toISOString() };
}

export async function listContactLinks(userId: string) {
  const links = await prisma.contactLink.findMany({ where: { userId, ...unexpired() }, orderBy: { createdAt: "desc" } });
  return { items: links.map(toContactLinkDTO) };
}

export async function createContactLink(userId: string, expiresAt: string | null) {
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new AppError("VALIDATION_FAILED", "expiresAt is in the past");
  if ((await prisma.contactLink.count({ where: { userId, ...unexpired() } })) >= MAX_CONTACT_LINKS) {
    throw new AppError("CONTACT_LINK_LIMIT_REACHED", `You can have ${MAX_CONTACT_LINKS} contact links`);
  }
  return toContactLinkDTO(await prisma.contactLink.create({ data: { userId, expiresAt } }));
}

export async function deleteContactLink(userId: string, code: string) {
  await prisma.contactLink.deleteMany({ where: { userId, code: code.toUpperCase() } });
}
