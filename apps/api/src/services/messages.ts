import { Prisma } from "@prisma/client";
import {
  AppError,
  type DeleteMessagesQuery,
  type EditMessageInput,
  type MessageDTO,
  type MessageType,
  type PageQuery,
  type SendMessageInput,
} from "@six/shared";
import { type Tx, withEvents } from "../lib/events.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";

export const messageInclude = { replyTo: true } satisfies Prisma.MessageInclude;
export type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

const SNIPPET = 200;

export function toMessageDTO(m: MessageRow): MessageDTO {
  const r = m.replyTo;
  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    clientId: m.clientId,
    type: m.type as MessageType,
    text: m.deletedAt ? null : m.text,
    spoiler: m.spoiler,
    replyTo: r
      ? {
          id: r.id,
          senderId: r.senderId,
          type: r.type as MessageType,
          text: r.deletedAt ? null : (r.text?.slice(0, SNIPPET) ?? null),
          spoiler: r.spoiler,
          deleted: r.deletedAt !== null,
        }
      : null,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deletedAt: m.deletedAt?.toISOString() ?? null,
  };
}

export async function assertMember(db: Tx, chatId: string, userId: string) {
  const member = await db.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
  if (!member) throw new AppError("CHAT_NOT_FOUND");
  return member;
}

export function visibleTo(userId: string, clearedAt: Date | null): Prisma.MessageWhereInput {
  return { hidden: { none: { userId } }, ...(clearedAt && { createdAt: { gt: clearedAt } }) };
}

async function memberIds(tx: Tx, chatId: string) {
  const members = await tx.chatMember.findMany({ where: { chatId }, select: { userId: true } });
  return members.map((m) => m.userId);
}

export async function listMessages(userId: string, chatId: string, q: PageQuery) {
  const member = await assertMember(prisma, chatId, userId);
  const rows = await prisma.message.findMany({
    where: { chatId, ...visibleTo(userId, member.clearedAt) },
    include: messageInclude,
    ...pageArgs(q),
  });
  return toPage(rows, q, toMessageDTO);
}

async function findByClientId(senderId: string, chatId: string, clientId: string) {
  const existing = await prisma.message.findUnique({
    where: { senderId_clientId: { senderId, clientId } },
    include: messageInclude,
  });
  if (existing && existing.chatId !== chatId) throw new AppError("CONFLICT", "clientId already used in another chat");
  return existing;
}

export async function sendMessage(userId: string, chatId: string, input: SendMessageInput): Promise<MessageDTO> {
  const existing = await findByClientId(userId, chatId, input.clientId);
  if (existing) return toMessageDTO(existing);

  try {
    return await withEvents(async (tx, emit) => {
      await assertMember(tx, chatId, userId);
      if (input.replyToId) {
        const original = await tx.message.findFirst({ where: { id: input.replyToId, chatId }, select: { id: true } });
        if (!original) throw new AppError("MESSAGE_NOT_FOUND", "The message you replied to is not in this chat");
      }

      const message = await tx.message.create({
        data: {
          chatId,
          senderId: userId,
          clientId: input.clientId,
          type: "text",
          text: input.text,
          spoiler: input.spoiler ?? false,
          replyToId: input.replyToId ?? null,
        },
        include: messageInclude,
      });
      await tx.chat.update({ where: { id: chatId }, data: { lastMessageAt: message.createdAt } });
      await tx.chatMember.updateMany({ where: { chatId, hidden: true }, data: { hidden: false } });
      await tx.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: {
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt,
          lastDeliveredMessageId: message.id,
          lastDeliveredAt: message.createdAt,
        },
      });

      const dto = toMessageDTO(message);
      for (const id of await memberIds(tx, chatId)) emit(id, "message.new", dto);
      return dto;
    });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    const raced = await findByClientId(userId, chatId, input.clientId);
    if (!raced) throw err;
    return toMessageDTO(raced);
  }
}

export async function editMessage(userId: string, messageId: string, input: EditMessageInput) {
  return withEvents(async (tx, emit) => {
    const message = await tx.message.findUnique({ where: { id: messageId }, include: messageInclude });
    if (!message) throw new AppError("MESSAGE_NOT_FOUND");
    await assertMember(tx, message.chatId, userId).catch(() => {
      throw new AppError("MESSAGE_NOT_FOUND");
    });
    if (message.senderId !== userId) throw new AppError("NOT_MESSAGE_SENDER", "Only the sender can edit a message");
    if (message.deletedAt || message.type !== "text") throw new AppError("MESSAGE_NOT_EDITABLE");
    if (message.text === input.text) return toMessageDTO(message);

    const updated = await tx.message.update({
      where: { id: messageId },
      data: { text: input.text, editedAt: new Date() },
      include: messageInclude,
    });
    const dto = toMessageDTO(updated);
    for (const id of await memberIds(tx, message.chatId)) emit(id, "message.edited", dto);
    return dto;
  });
}

/**
 * Removes the stored copies of these messages from the sync log, and blanks the reply previews
 * that quote them, so deleted text cannot be replayed through /v1/sync.
 */
export async function scrubMessageEvents(tx: Tx, messageIds: string[]) {
  if (!messageIds.length) return;
  await tx.$executeRaw`
    DELETE FROM "ChangeEvent"
    WHERE type IN ('message.new', 'message.edited') AND payload->>'id' = ANY(${messageIds}::text[])`;
  await tx.$executeRaw`
    UPDATE "ChangeEvent"
    SET payload = jsonb_set(jsonb_set(payload, '{replyTo,text}', 'null'), '{replyTo,deleted}', 'true')
    WHERE type IN ('message.new', 'message.edited') AND payload->'replyTo'->>'id' = ANY(${messageIds}::text[])`;
}

export async function deleteMessages(userId: string, { ids, scope }: DeleteMessagesQuery) {
  await withEvents(async (tx, emit) => {
    const messages = await tx.message.findMany({ where: { id: { in: ids } } });
    const chatIds = [...new Set(messages.map((m) => m.chatId))];
    const memberships = await tx.chatMember.count({ where: { userId, chatId: { in: chatIds } } });
    if (messages.length !== ids.length || memberships !== chatIds.length) throw new AppError("MESSAGE_NOT_FOUND");

    if (scope === "all") {
      const direct = new Set(
        (await tx.chat.findMany({ where: { id: { in: chatIds }, type: "direct" }, select: { id: true } })).map(
          (c) => c.id,
        ),
      );
      if (messages.some((m) => m.senderId !== userId && !direct.has(m.chatId))) {
        throw new AppError("NOT_MESSAGE_SENDER", "Only the sender can delete this message for everyone");
      }
      const live = messages.filter((m) => !m.deletedAt);
      const tombstones = messages.filter((m) => m.deletedAt);
      await tx.message.updateMany({
        where: { id: { in: live.map((m) => m.id) } },
        data: { deletedAt: new Date(), text: null },
      });
      await scrubMessageEvents(tx, live.map((m) => m.id));

      for (const chatId of chatIds) {
        const members = await memberIds(tx, chatId);
        const deleted = live.filter((m) => m.chatId === chatId).map((m) => m.id);
        const removed = tombstones.filter((m) => m.chatId === chatId).map((m) => m.id);
        if (removed.length) {
          await tx.messageHidden.createMany({
            data: members.flatMap((memberId) => removed.map((messageId) => ({ userId: memberId, messageId }))),
            skipDuplicates: true,
          });
        }
        for (const id of members) {
          if (deleted.length) emit(id, "message.deleted", { chatId, messageIds: deleted, scope: "all" });
          if (removed.length) emit(id, "message.deleted", { chatId, messageIds: removed, scope: "me" });
        }
      }
      return;
    }

    await tx.messageHidden.createMany({ data: ids.map((messageId) => ({ userId, messageId })), skipDuplicates: true });
    for (const chatId of chatIds) {
      const data = { chatId, messageIds: messages.filter((m) => m.chatId === chatId).map((m) => m.id), scope };
      emit(userId, "message.deleted", data);
    }
  });
}
