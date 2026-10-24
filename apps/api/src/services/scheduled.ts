import type { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  type EditScheduledInput,
  type MessageDTO,
  type MessageType,
  SCHEDULE_LIMITS,
  type ScheduleMessageInput,
  type ScheduledMessageDTO,
} from "@six/shared";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { getChat } from "./chats.js";
import { assertMember, createMessage, entitiesOf, storedEntities, toMessageDTO, toReplyPreview } from "./messages.js";
import { queuePush } from "./push.js";
import { claimForMessage, purgeUploads, toAttachmentDTO } from "./uploads.js";

const scheduledInclude = { attachment: true, replyTo: true } satisfies Prisma.ScheduledMessageInclude;
type ScheduledRow = Prisma.ScheduledMessageGetPayload<{ include: typeof scheduledInclude }>;

function toScheduledDTO(s: ScheduledRow): ScheduledMessageDTO {
  const ephemeral = s.maxViews !== null || s.ttlSeconds !== null;
  return {
    id: s.id,
    chatId: s.chatId,
    clientId: s.clientId,
    type: (s.attachment?.kind ?? "text") as MessageType,
    text: s.text,
    entities: entitiesOf(s),
    spoiler: s.spoiler,
    attachment: s.attachment ? toAttachmentDTO(s.attachment) : null,
    ephemeral: ephemeral ? { maxViews: s.maxViews, ttlSeconds: s.ttlSeconds } : null,
    replyTo: s.replyTo ? toReplyPreview(s.replyTo) : null,
    sendAt: s.sendAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
  };
}

function checkSendAt(iso: string) {
  const at = new Date(iso);
  const ahead = at.getTime() - Date.now();
  if (ahead <= 0 || ahead > SCHEDULE_LIMITS.maxAheadSeconds * 1000) {
    throw new AppError("VALIDATION_FAILED", "sendAt must be in the future and at most a year ahead");
  }
  return at;
}

const announce = async (tx: Tx, emit: Emit, userId: string, chatId: string) =>
  emit(userId, "chat.updated", await getChat(userId, chatId, tx));

async function lockOwn(tx: Tx, userId: string, id: string) {
  await tx.$executeRaw`SELECT 1 FROM "ScheduledMessage" WHERE id = ${id} FOR UPDATE`;
  const s = await tx.scheduledMessage.findUnique({ where: { id }, include: scheduledInclude });
  if (!s || s.senderId !== userId) throw new AppError("SCHEDULED_NOT_FOUND");
  return s;
}

export async function listScheduled(userId: string, chatId: string) {
  await assertMember(prisma, chatId, userId);
  const rows = await prisma.scheduledMessage.findMany({
    where: { chatId, senderId: userId },
    include: scheduledInclude,
    orderBy: [{ sendAt: "asc" }, { id: "asc" }],
  });
  return { items: rows.map(toScheduledDTO), nextCursor: null };
}

export async function scheduleMessage(userId: string, chatId: string, input: ScheduleMessageInput) {
  const key = { senderId_clientId: { senderId: userId, clientId: input.clientId } };
  const existing = await prisma.scheduledMessage.findUnique({ where: key, include: scheduledInclude });
  if (existing) {
    if (existing.chatId !== chatId) throw new AppError("CONFLICT", "clientId already used in another chat");
    return toScheduledDTO(existing);
  }
  const sendAt = checkSendAt(input.sendAt);
  if (await prisma.message.findUnique({ where: key, select: { id: true } })) {
    throw new AppError("CONFLICT", "A message with this clientId was already sent");
  }

  return withEvents(async (tx, emit) => {
    await assertMember(tx, chatId, userId);
    if ((await tx.scheduledMessage.count({ where: { chatId, senderId: userId } })) >= SCHEDULE_LIMITS.perChat) {
      throw new AppError("SCHEDULE_LIMIT_REACHED", `At most ${SCHEDULE_LIMITS.perChat} scheduled messages per chat`);
    }
    if (input.replyToId) {
      const original = await tx.message.findFirst({ where: { id: input.replyToId, chatId }, select: { id: true } });
      if (!original) throw new AppError("MESSAGE_NOT_FOUND", "The message you replied to is not in this chat");
    }
    if (input.attachmentId) await claimForMessage(tx, userId, input.attachmentId);

    const s = await tx.scheduledMessage.create({
      data: {
        chatId,
        senderId: userId,
        clientId: input.clientId,
        text: input.text ?? null,
        entities: storedEntities(input.entities),
        spoiler: input.spoiler ?? false,
        maxViews: input.ephemeral?.maxViews ?? null,
        ttlSeconds: input.ephemeral?.ttlSeconds ?? null,
        attachmentId: input.attachmentId ?? null,
        replyToId: input.replyToId ?? null,
        sendAt,
      },
      include: scheduledInclude,
    });
    await announce(tx, emit, userId, chatId);
    return toScheduledDTO(s);
  });
}

export async function editScheduled(userId: string, id: string, input: EditScheduledInput) {
  const sendAt = input.sendAt ? checkSendAt(input.sendAt) : undefined;
  return withEvents(async (tx, emit) => {
    const s = await lockOwn(tx, userId, id);
    const updated = await tx.scheduledMessage.update({
      where: { id },
      data: { sendAt, ...(input.text !== undefined && { text: input.text, entities: storedEntities(input.entities) }) },
      include: scheduledInclude,
    });
    await announce(tx, emit, userId, s.chatId);
    return toScheduledDTO(updated);
  });
}

export async function cancelScheduled(userId: string, id: string) {
  const attachmentId = await withEvents(async (tx, emit) => {
    const s = await lockOwn(tx, userId, id);
    await tx.scheduledMessage.delete({ where: { id } });
    await announce(tx, emit, userId, s.chatId);
    return s.attachmentId;
  });
  if (attachmentId) await purgeUploads([attachmentId]);
}

/**
 * Sends a scheduled message as a normal one and takes it off the schedule in the same transaction,
 * so the worker's sweep and "send now" can never both send it.
 */
async function deliverScheduled(id: string, ownerId?: string) {
  const sent = await withEvents(async (tx, emit) => {
    await tx.$executeRaw`SELECT 1 FROM "ScheduledMessage" WHERE id = ${id} FOR UPDATE`;
    const s = await tx.scheduledMessage.findUnique({ where: { id } });
    if (!s || (ownerId && s.senderId !== ownerId)) throw new AppError("SCHEDULED_NOT_FOUND");
    await tx.scheduledMessage.delete({ where: { id } });
    const ephemeral = s.maxViews !== null || s.ttlSeconds !== null;
    const out = await createMessage(tx, emit, s.senderId, s.chatId, {
      clientId: s.clientId,
      text: s.text ?? undefined,
      entities: entitiesOf(s),
      attachmentId: s.attachmentId ?? undefined,
      replyToId: s.replyToId ?? undefined,
      spoiler: s.spoiler,
      ephemeral: ephemeral ? { maxViews: s.maxViews ?? undefined, ttlSeconds: s.ttlSeconds ?? undefined } : undefined,
    });
    await announce(tx, emit, s.senderId, s.chatId);
    return out;
  });
  await queuePush(sent.message.id, sent.recipients).catch((err) => console.error("could not queue push:", err.message));
  return sent.message;
}

export async function sendScheduledNow(userId: string, id: string): Promise<MessageDTO> {
  return toMessageDTO(await deliverScheduled(id, userId), userId);
}

/**
 * Sends every scheduled message that is due. One that can no longer be sent (say its file failed
 * processing) is dropped rather than retried forever.
 */
export async function sendDueScheduled(batch = 100) {
  const due = await prisma.scheduledMessage.findMany({
    where: { sendAt: { lte: new Date() } },
    select: { id: true, senderId: true },
    orderBy: { sendAt: "asc" },
    take: batch,
  });
  for (const s of due) {
    try {
      await deliverScheduled(s.id);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      if (err.code === "SCHEDULED_NOT_FOUND") continue;
      console.error(`dropping scheduled message ${s.id}:`, err.message);
      await cancelScheduled(s.senderId, s.id).catch(() => null);
    }
  }
  return due.length;
}
