import type { Message } from "@prisma/client";
import { AppError, type MessageDTO, type MessageType, type PageQuery, type SendMessageInput } from "@six/shared";
import { type Tx, withEvents } from "../lib/events.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";

export function toMessageDTO(m: Message): MessageDTO {
  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    clientId: m.clientId,
    type: m.type as MessageType,
    text: m.text,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
  };
}

export async function assertMember(db: Tx, chatId: string, userId: string) {
  const member = await db.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
  if (!member) throw new AppError("CHAT_NOT_FOUND");
  return member;
}

export async function listMessages(userId: string, chatId: string, q: PageQuery) {
  await assertMember(prisma, chatId, userId);
  const rows = await prisma.message.findMany({ where: { chatId }, ...pageArgs(q) });
  return toPage(rows, q, toMessageDTO);
}

async function findByClientId(senderId: string, chatId: string, clientId: string) {
  const existing = await prisma.message.findUnique({ where: { senderId_clientId: { senderId, clientId } } });
  if (existing && existing.chatId !== chatId) throw new AppError("CONFLICT", "clientId already used in another chat");
  return existing;
}

export async function sendMessage(userId: string, chatId: string, input: SendMessageInput): Promise<MessageDTO> {
  const existing = await findByClientId(userId, chatId, input.clientId);
  if (existing) return toMessageDTO(existing);

  try {
    return await withEvents(async (tx, emit) => {
      await assertMember(tx, chatId, userId);
      const message = await tx.message.create({
        data: { chatId, senderId: userId, clientId: input.clientId, type: "text", text: input.text },
      });
      await tx.chat.update({ where: { id: chatId }, data: { lastMessageAt: message.createdAt } });
      await tx.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: { lastReadMessageId: message.id, lastReadAt: message.createdAt },
      });

      const dto = toMessageDTO(message);
      const members = await tx.chatMember.findMany({ where: { chatId }, select: { userId: true } });
      for (const m of members) emit(m.userId, "message.new", dto);
      return dto;
    });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    const raced = await findByClientId(userId, chatId, input.clientId);
    if (!raced) throw err;
    return toMessageDTO(raced);
  }
}
