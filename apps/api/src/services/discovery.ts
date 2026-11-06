import type { ContactLink } from "../generated/prisma/client.js";
import {
  AppError,
  CONTACT_LINK_DAYS,
  type ContactLinkDTO,
  type CreateContactLinkInput,
  type FoundUserDTO,
  MAX_CONTACT_LINKS,
} from "@six/shared";
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

const unexpired = () => ({ expiresAt: { gt: new Date() } });

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
 * owner a new one, so whoever added them can't pass it on. Contact links keep working, for as many
 * new contacts as their owner allowed, then expire.
 */
export async function addContact(userId: string, q: string) {
  const { user, code } = await resolve(userId, q);
  await withEvents(async (tx, emit) => {
    if (code === user.contactCode) {
      const used = await tx.user.updateMany({ where: { id: user.id, contactCode: code }, data: { contactCode: generateCode() } });
      if (!used.count) throw new AppError("USER_NOT_FOUND", "That contact code was just used");
      emit(user.id, "me.updated", toUserDTO(await tx.user.findUniqueOrThrow({ where: { id: user.id } })));
    } else if (!(await tx.chat.findUnique({ where: { directKey: [userId, user.id].sort().join(":") } }))) {
      const claimed = await tx.$executeRaw`
        UPDATE "ContactLink" SET uses = uses + 1,
          "expiresAt" = CASE WHEN uses + 1 >= "maxUses" THEN now() ELSE "expiresAt" END
        WHERE code = ${code} AND "expiresAt" > now() AND ("maxUses" IS NULL OR uses < "maxUses")`;
      if (!claimed) throw new AppError("USER_NOT_FOUND", "That contact link was just used up");
    }
    const chatId = await ensureDirectChat(tx, emit, userId, user.id, { to: user.id, kind: "added" });
    const unhidden = await tx.chatMember.updateMany({ where: { chatId, userId, hidden: true }, data: { hidden: false } });
    if (unhidden.count) emit(userId, "chat.updated", await getChat(userId, chatId, tx));
  });
  return findContact(userId, user.id);
}

function toContactLinkDTO(l: ContactLink): ContactLinkDTO {
  return {
    code: l.code,
    expiresAt: l.expiresAt.toISOString(),
    maxUses: l.maxUses,
    uses: l.uses,
    createdAt: l.createdAt.toISOString(),
  };
}

export async function listContactLinks(userId: string) {
  const links = await prisma.contactLink.findMany({ where: { userId, ...unexpired() }, orderBy: { createdAt: "desc" } });
  return { items: links.map(toContactLinkDTO) };
}

/** A link that works for a week at most, or until `expiresAt` if that comes sooner, or until `maxUses` people used it. */
export async function createContactLink(userId: string, { expiresAt, maxUses }: CreateContactLinkInput) {
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new AppError("VALIDATION_FAILED", "expiresAt is in the past");
  if ((await prisma.contactLink.count({ where: { userId, ...unexpired() } })) >= MAX_CONTACT_LINKS) {
    throw new AppError("CONTACT_LINK_LIMIT_REACHED", "You already have a reusable contact link");
  }
  const latest = Date.now() + CONTACT_LINK_DAYS * 864e5;
  const until = new Date(Math.min(expiresAt ? Date.parse(expiresAt) : latest, latest));
  return toContactLinkDTO(await prisma.contactLink.create({ data: { userId, expiresAt: until, maxUses: maxUses ?? null } }));
}

export async function deleteContactLink(userId: string, code: string) {
  await prisma.contactLink.deleteMany({ where: { userId, code: code.toUpperCase() } });
}
