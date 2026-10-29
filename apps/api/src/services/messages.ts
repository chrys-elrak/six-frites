import { type Message, Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  CHECKLIST,
  type Checklist,
  type DeleteChatQuery,
  type DeleteMessagesQuery,
  type EncryptedInput,
  type EncryptionDTO,
  type EditMessageInput,
  type EphemeralInput,
  type GeoPoint,
  type MessageDTO,
  type MessageTimingDTO,
  type MessageEntity,
  type MessageListQuery,
  type MessageType,
  type ReplyPreview,
  type SendMessageInput,
  type ServiceAction,
  type ViewMessageResult,
  ENCRYPT_MAX_BYTES,
  EPHEMERAL_RESEND,
  MAX_REACTIONS_PER_USER,
  maskSpoilers,
} from "@six/shared";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";
import { timersQueue } from "../lib/queue.js";
import { saveGif } from "./gifs.js";
import { assertCanMessage } from "./blocks.js";
import { activeDevices, checkEnvelopes } from "./devices.js";
import { queuePush, queueReactionPush } from "./push.js";
import { toStickerDTO } from "./stickers.js";
import { claimForMessage, purgeUploads, toAttachmentDTO } from "./uploads.js";

export const messageInclude = {
  replyTo: true,
  attachment: true,
  views: true,
  sticker: { include: { upload: true } },
  reactions: { orderBy: { createdAt: "asc" } },
  envelopes: { include: { device: { select: { userId: true } } } },
  backups: true,
  marks: { orderBy: { item: "asc" } },
} satisfies Prisma.MessageInclude;
export type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

const SNIPPET = 200;

export const entitiesOf = (m: { entities: Prisma.JsonValue }) => (m.entities as MessageEntity[] | null) ?? [];
export const storedEntities = (entities: MessageEntity[] | undefined) =>
  entities?.length ? (entities as Prisma.InputJsonValue) : Prisma.DbNull;

const isEphemeral = (m: { maxViews: number | null; ttlSeconds: number | null }) =>
  m.maxViews !== null || m.ttlSeconds !== null;

/** How long download links for opened self-destructing media stay valid. */
export const EPHEMERAL_LINK_SECONDS = 5 * 60;

function groupReactions(reactions: MessageRow["reactions"]) {
  const byEmoji = new Map<string, string[]>();
  for (const r of reactions) byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.userId]);
  return [...byEmoji].map(([emoji, userIds]) => ({ emoji, userIds }));
}

export function toReplyPreview(r: Message): ReplyPreview {
  return {
    id: r.id,
    senderId: r.senderId,
    type: r.type as MessageType,
    text:
      r.deletedAt || r.expiredAt || isEphemeral(r) || r.text === null
        ? null
        : maskSpoilers(r.text, entitiesOf(r)).slice(0, SNIPPET),
    spoiler: r.spoiler,
    ephemeral: isEphemeral(r),
    deleted: r.deletedAt !== null,
    encrypted: r.encrypted,
  };
}

/** The viewer's own envelopes and backup copy of an encrypted message, or nothing while it is hidden. */
function encryptionFor(m: MessageRow, viewerId: string, hidden: boolean): EncryptionDTO | null {
  if (!m.encrypted) return null;
  if (hidden) return { senderDeviceId: m.senderDevice, envelopes: [], backup: null };
  return {
    senderDeviceId: m.senderDevice,
    envelopes: m.envelopes
      .filter((e) => e.device.userId === viewerId)
      .map((e) => ({ deviceId: e.deviceId, envelope: e.envelope as EncryptionDTO["envelopes"][number]["envelope"] })),
    backup: m.backups.find((b) => b.userId === viewerId)?.sealed ?? null,
  };
}

/**
 * Builds a message as `viewerId` may see it. Self-destructing messages are locked for everyone but
 * the sender: no text and no file links, until POST /v1/messages/{id}/view opens them (`reveal`).
 */
export function toMessageDTO(m: MessageRow, viewerId: string, opts: { reveal?: boolean } = {}): MessageDTO {
  const r = m.replyTo;
  const ephemeral = isEphemeral(m);
  const isSender = viewerId === m.senderId;
  const expired = m.expiredAt !== null;
  const purged = m.purgedAt !== null;
  const locked = ephemeral && !expired && !isSender && !opts.reveal;
  const hideContent = m.deletedAt !== null || purged || locked || (expired && !isSender);
  const others = m.views.filter((v) => v.userId !== m.senderId);
  const mine = m.views.find((v) => v.userId === viewerId);
  const firstView =
    viewerId === m.senderId ? others.map((v) => v.firstViewedAt).sort((a, b) => +a - +b)[0] : mine?.firstViewedAt;

  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    clientId: m.clientId,
    type: m.type as MessageType,
    text: hideContent ? null : m.text,
    entities: hideContent ? [] : entitiesOf(m),
    spoiler: m.spoiler,
    attachment:
      hideContent || !m.attachment
        ? null
        : toAttachmentDTO(m.attachment, ephemeral && opts.reveal ? EPHEMERAL_LINK_SECONDS : undefined),
    sticker: hideContent || !m.sticker ? null : toStickerDTO(m.sticker),
    ephemeral: ephemeral
      ? {
          maxViews: m.maxViews,
          ttlSeconds: m.ttlSeconds,
          views: viewerId === m.senderId ? others.reduce((n, v) => n + v.count, 0) : (mine?.count ?? 0),
          firstViewedAt: firstView?.toISOString() ?? null,
          locked,
          expired,
          purged,
          resent: m.resendCount > 0,
          resendsLeft: isSender && !purged ? Math.max(0, EPHEMERAL_RESEND.max - m.resendCount) : 0,
          resendUntil:
            isSender && m.expiredAt && !purged
              ? new Date(m.expiredAt.getTime() + EPHEMERAL_RESEND.windowSeconds * 1000).toISOString()
              : null,
        }
      : null,
    groupId: m.groupId,
    replyTo: r ? toReplyPreview(r) : null,
    action: (m.action as ServiceAction | null) ?? null,
    location: hideContent ? null : ((m.location as GeoPoint | null) ?? null),
    checklist: hideContent ? null : ((m.checklist as Checklist | null) ?? null),
    checks: hideContent ? [] : m.marks.map((k) => ({ item: k.item, userId: k.userId, at: k.createdAt.toISOString() })),
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deletedAt: m.deletedAt?.toISOString() ?? null,
    expiresAt: m.expiresAt?.toISOString() ?? null,
    reactions: m.deletedAt || purged ? [] : groupReactions(m.reactions),
    encryption: encryptionFor(m, viewerId, hideContent),
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

const SHARED: Record<NonNullable<MessageListQuery["only"]>, Prisma.MessageWhereInput> = {
  media: { type: { in: ["image", "video"] }, attachment: { status: { not: "removed" } } },
  files: { type: "file", attachment: { status: { not: "removed" } } },
  links: {
    type: "text",
    OR: [
      { encrypted: true },
      { text: { contains: "http", mode: "insensitive" } },
      { text: { contains: "www.", mode: "insensitive" } },
    ],
  },
  text: { type: { in: ["text", "image", "video", "file"] } },
};

const UNTIL_MAX = 2000;

export async function listMessages(userId: string, chatId: string, q: MessageListQuery) {
  const member = await assertMember(prisma, chatId, userId);
  const where: Prisma.MessageWhereInput = {
    chatId,
    ...visibleTo(userId, member.clearedAt),
    ...(q.only && { ...SHARED[q.only], deletedAt: null, maxViews: null, ttlSeconds: null }),
    ...((q.from || q.to) && { createdAt: { gte: q.from, lt: q.to } }),
  };
  const target = q.until ? await prisma.message.findFirst({ where: { id: q.until, chatId } }) : null;
  const upTo = target
    ? await prisma.message.count({ where: { AND: [where, { createdAt: { gte: target.createdAt } }] } })
    : 0;
  const page = { ...q, limit: Math.min(Math.max(q.limit, upTo), UNTIL_MAX) };
  const rows = await prisma.message.findMany({ where, include: messageInclude, ...pageArgs(page) });
  return toPage(rows, page, (m) => toMessageDTO(m, userId));
}

async function findByClientId(senderId: string, chatId: string, clientId: string) {
  const existing = await prisma.message.findUnique({
    where: { senderId_clientId: { senderId, clientId } },
    include: messageInclude,
  });
  if (existing && existing.chatId !== chatId) throw new AppError("CONFLICT", "clientId already used in another chat");
  return existing;
}

/** Files over ENCRYPT_MAX_BYTES are uploaded as they are, but their caption can still be encrypted. */
const fitsEncrypted = (upload: { encrypted: boolean; size: number }) =>
  upload.encrypted || upload.size > ENCRYPT_MAX_BYTES;

/**
 * Checks the message fits the chat's encryption: encrypted content only carries encrypted (or large) files,
 * and once a chat is encrypted, text and files must be encrypted too (GIFs and stickers, which
 * carry nothing personal, may still be sent as they are).
 */
export function checkEncryption(
  chat: { encryptedAt: Date | null },
  content: SendMessageInput,
  upload: { encrypted: boolean; kind: string; size: number } | null,
) {
  if (content.encrypted) {
    if (upload && !fitsEncrypted(upload)) {
      throw new AppError("VALIDATION_FAILED", "Encrypted messages carry encrypted files");
    }
    return;
  }
  if (upload?.encrypted) throw new AppError("VALIDATION_FAILED", "This file is encrypted; send it in encrypted content");
  if (
    chat.encryptedAt &&
    (content.text !== undefined || content.location || content.checklist || (upload && upload.kind !== "gif"))
  ) {
    throw new AppError("ENCRYPTION_REQUIRED", "Messages in this chat are end-to-end encrypted");
  }
}

/** Keeps the envelopes of a scheduled message whose devices are still signed in. */
async function liveEnvelopes(tx: Tx, chatId: string, envelopes: EncryptedInput["envelopes"]) {
  const members = await tx.chatMember.findMany({ where: { chatId }, select: { userId: true } });
  const live = new Set((await activeDevices(tx, members.map((m) => m.userId))).map((d) => d.id));
  return envelopes.filter((e) => live.has(e.deviceId));
}

export interface CreateOptions {
  /** The session sending, whose device must be registered for encrypted content. */
  sessionId?: string;
  /** Sending a scheduled message: envelopes were checked when it was scheduled, from this device. */
  scheduled?: { senderDevice: string | null };
}

/**
 * Stores a new message, bumps the chat and tells every member. Messages get the chat's auto-delete
 * deadline, except service messages, which announce changes to it. The first encrypted message in
 * a chat turns encryption on for good, after a service message marking where it starts. Returns
 * who should get a push.
 */
export async function createMessage(
  tx: Tx,
  emit: Emit,
  userId: string,
  chatId: string,
  input: SendMessageInput | { clientId: string; action: ServiceAction },
  opts: CreateOptions = {},
) {
  await assertMember(tx, chatId, userId);
  await assertCanMessage(tx, chatId, userId);
  const content = "action" in input ? null : input;
  if (content?.replyToId) {
    const original = await tx.message.findFirst({ where: { id: content.replyToId, chatId }, select: { id: true } });
    if (!original) throw new AppError("MESSAGE_NOT_FOUND", "The message you replied to is not in this chat");
  }
  const upload = content?.attachmentId ? await claimForMessage(tx, userId, content.attachmentId) : null;
  if (content?.stickerId && !(await tx.sticker.findFirst({ where: { id: content.stickerId, removedAt: null } }))) {
    throw new AppError("STICKER_NOT_FOUND");
  }
  const chat = await tx.chat.findUniqueOrThrow({ where: { id: chatId } });
  if (content) checkEncryption(chat, content, upload);

  const encrypted = content?.encrypted;
  let envelopes = encrypted?.envelopes ?? [];
  let senderDevice: string | null = null;
  let createdAt = new Date();
  let started = false;
  if (encrypted) {
    if (opts.scheduled) {
      envelopes = await liveEnvelopes(tx, chatId, envelopes);
      senderDevice = opts.scheduled.senderDevice;
    } else {
      if (!opts.sessionId) throw new AppError("DEVICE_NOT_REGISTERED");
      senderDevice = await checkEnvelopes(tx, chatId, opts.sessionId, envelopes);
    }
    if (!chat.encryptedAt) {
      await tx.chat.update({ where: { id: chatId }, data: { encryptedAt: new Date() } });
      const notice = await createMessage(tx, emit, userId, chatId, {
        clientId: `e2ee:${chatId}`,
        action: { type: "e2ee" },
      });
      createdAt = new Date(Math.max(Date.now(), notice.message.createdAt.getTime() + 1));
      started = true;
    }
  }

  const message = await tx.message.create({
    data: {
      chatId,
      senderId: userId,
      clientId: input.clientId,
      type: content ? (content.stickerId ? "sticker" : (upload?.kind ?? kindOf(content))) : "service",
      text: content?.text ?? null,
      entities: storedEntities(content?.entities),
      attachmentId: upload?.id ?? null,
      stickerId: content?.stickerId ?? null,
      spoiler: content?.spoiler ?? false,
      maxViews: content?.ephemeral?.maxViews ?? null,
      ttlSeconds: content?.ephemeral?.ttlSeconds ?? null,
      replyToId: content?.replyToId ?? null,
      groupId: content?.groupId ?? null,
      ...("action" in input && { action: input.action }),
      ...(content?.location && { location: content.location }),
      ...(content?.checklist && { checklist: content.checklist }),
      encrypted: !!encrypted,
      senderDevice,
      ...(envelopes.length && {
        envelopes: { create: envelopes.map((e) => ({ deviceId: e.deviceId, envelope: e.envelope })) },
      }),
      ...(encrypted?.backup && { backups: { create: { userId, sealed: encrypted.backup } } }),
      sentAt: content?.sentAt && !opts.scheduled ? new Date(Math.min(Date.parse(content.sentAt), createdAt.getTime())) : null,
      createdAt,
      expiresAt: content && chat.autoDeleteSecs ? new Date(createdAt.getTime() + chat.autoDeleteSecs * 1000) : null,
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

  const members = await memberIds(tx, chatId);
  for (const id of members) emit(id, "message.new", toMessageDTO(message, id));
  if (started) {
    const { getChat } = await import("./chats.js");
    for (const id of members) emit(id, "chat.updated", await getChat(id, chatId, tx));
  }
  return { message, recipients: members.filter((id) => id !== userId) };
}

const kindOf = (c: SendMessageInput) =>
  c.type ?? (c.location ? "location" : c.checklist ? "checklist" : "text");

/** Swaps a `gifId` for a stored copy of that GIF, checking membership first so only members trigger downloads. */
export async function resolveGif<T extends SendMessageInput>(userId: string, chatId: string, input: T): Promise<T> {
  if (!input.gifId) return input;
  await assertMember(prisma, chatId, userId);
  const upload = await saveGif(userId, input.gifId);
  return { ...input, gifId: undefined, attachmentId: upload.id };
}

export async function sendMessage(
  userId: string,
  chatId: string,
  input: SendMessageInput,
  sessionId?: string,
): Promise<MessageDTO> {
  const existing = await findByClientId(userId, chatId, input.clientId);
  if (existing) return toMessageDTO(existing, userId);

  try {
    const ready = await resolveGif(userId, chatId, input);
    const { message, recipients } = await withEvents((tx, emit) =>
      createMessage(tx, emit, userId, chatId, ready, { sessionId }),
    );
    await queuePush(message.id, recipients).catch((err) => console.error("could not queue push:", err.message));
    return toMessageDTO(message, userId);
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    const raced = await findByClientId(userId, chatId, input.clientId);
    if (!raced) throw err;
    return toMessageDTO(raced, userId);
  }
}

export async function editMessage(userId: string, messageId: string, input: EditMessageInput, sessionId?: string) {
  return withEvents(async (tx, emit) => {
    const message = await tx.message.findUnique({ where: { id: messageId }, include: messageInclude });
    if (!message) throw new AppError("MESSAGE_NOT_FOUND");
    await assertMember(tx, message.chatId, userId).catch(() => {
      throw new AppError("MESSAGE_NOT_FOUND");
    });
    if (message.senderId !== userId) throw new AppError("NOT_MESSAGE_SENDER", "Only the sender can edit a message");
    await assertCanMessage(tx, message.chatId, userId);
    if (
      message.deletedAt ||
      isEphemeral(message) ||
      ["service", "sticker", "location", "checklist"].includes(message.type)
    ) {
      throw new AppError("MESSAGE_NOT_EDITABLE");
    }
    const chat = await tx.chat.findUniqueOrThrow({ where: { id: message.chatId }, select: { encryptedAt: true } });

    let updated: MessageRow;
    if (input.encrypted) {
      if (message.attachment && !fitsEncrypted(message.attachment)) {
        throw new AppError("MESSAGE_NOT_EDITABLE", "A plain file can't get an encrypted caption");
      }
      if (!sessionId) throw new AppError("DEVICE_NOT_REGISTERED");
      const { envelopes, backup } = input.encrypted;
      const senderDevice = await checkEnvelopes(tx, message.chatId, sessionId, envelopes);
      await tx.messageEnvelope.deleteMany({ where: { messageId } });
      await tx.messageBackup.deleteMany({ where: { messageId } });
      updated = await tx.message.update({
        where: { id: messageId },
        data: {
          encrypted: true,
          senderDevice,
          text: null,
          entities: Prisma.DbNull,
          spoiler: false,
          editedAt: new Date(),
          envelopes: { create: envelopes.map((e) => ({ deviceId: e.deviceId, envelope: e.envelope })) },
          ...(backup && { backups: { create: { userId, sealed: backup } } }),
        },
        include: messageInclude,
      });
    } else {
      if (message.encrypted || chat.encryptedAt) {
        throw new AppError("ENCRYPTION_REQUIRED", "Messages in this chat are end-to-end encrypted");
      }
      const entities = input.entities ?? [];
      if (message.text === input.text && JSON.stringify(entitiesOf(message)) === JSON.stringify(entities)) {
        return toMessageDTO(message, userId);
      }
      updated = await tx.message.update({
        where: { id: messageId },
        data: { text: input.text, entities: storedEntities(entities), editedAt: new Date() },
        include: messageInclude,
      });
    }
    for (const id of await memberIds(tx, message.chatId)) emit(id, "message.edited", toMessageDTO(updated, id));
    return toMessageDTO(updated, userId);
  });
}

export async function messageTiming(userId: string, messageId: string): Promise<MessageTimingDTO> {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  const member = message && (await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: message.chatId, userId } } }));
  const visible = member && (await prisma.message.count({ where: { id: messageId, ...visibleTo(userId, member.clearedAt) } }));
  if (!message || !visible) throw new AppError("MESSAGE_NOT_FOUND");
  return {
    sentAt: message.sentAt?.toISOString() ?? null,
    serverAt: message.createdAt.toISOString(),
    arrivedAt: message.arrivedAt?.toISOString() ?? null,
  };
}

async function reactableMessage(tx: Tx, userId: string, messageId: string) {
  const message = await tx.message.findUnique({ where: { id: messageId }, include: messageInclude });
  const member = message && (await tx.chatMember.findUnique({ where: { chatId_userId: { chatId: message.chatId, userId } } }));
  const visible = member && (await tx.message.count({ where: { id: messageId, ...visibleTo(userId, member.clearedAt) } }));
  if (!message || !visible) throw new AppError("MESSAGE_NOT_FOUND");
  if (message.deletedAt || message.purgedAt || message.type === "service") throw new AppError("REACTION_NOT_ALLOWED");
  await assertCanMessage(tx, message.chatId, userId);
  return message;
}

/** Adds (`on`) or removes one of the user's reactions, and tells both people if anything changed. */
export async function setReaction(userId: string, messageId: string, emoji: string, on: boolean) {
  const result = await withEvents(async (tx, emit) => {
    const message = await reactableMessage(tx, userId, messageId);
    const mine = message.reactions.filter((r) => r.userId === userId).map((r) => r.emoji);
    if (mine.includes(emoji) === on) return { dto: toMessageDTO(message, userId), authorId: null };
    if (on && mine.length >= MAX_REACTIONS_PER_USER) throw new AppError("REACTION_LIMIT_REACHED");

    const key = { messageId_userId_emoji: { messageId, userId, emoji } };
    if (on) await tx.messageReaction.create({ data: key.messageId_userId_emoji });
    else await tx.messageReaction.delete({ where: key });

    const updated = await tx.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
    for (const id of await memberIds(tx, message.chatId)) emit(id, "message.edited", toMessageDTO(updated, id));
    if (on && message.senderId !== userId) {
      emit(message.senderId, "message.reacted", { chatId: message.chatId, messageId, userId, emoji });
    }
    return { dto: toMessageDTO(updated, userId), authorId: on ? message.senderId : null };
  });
  if (result.authorId) await queueReactionPush(messageId, result.authorId, userId, emoji).catch(() => null);
  return result.dto;
}

/**
 * Ticks (`done`) or unticks one checklist item for both people. Encrypted checklists keep their
 * items in the envelopes, so the server only bounds the index by the largest checklist.
 */
export async function checkItem(userId: string, messageId: string, item: number, done: boolean) {
  return withEvents(async (tx, emit) => {
    const message = await reactableMessage(tx, userId, messageId);
    const items = (message.checklist as Checklist | null)?.items.length ?? CHECKLIST.items;
    if (message.type !== "checklist" || item >= items) throw new AppError("NOT_FOUND", "No such checklist item");

    const key = { messageId_item: { messageId, item } };
    if (done) await tx.checklistMark.upsert({ where: key, create: { messageId, item, userId }, update: {} });
    else await tx.checklistMark.deleteMany({ where: { messageId, item } });

    const updated = await tx.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
    for (const id of await memberIds(tx, message.chatId)) emit(id, "message.edited", toMessageDTO(updated, id));
    return toMessageDTO(updated, userId);
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

/** Deletes every copy of encrypted content: the envelopes for each device and everyone's backups. */
async function dropEncryptedContent(tx: Tx, messageIds: string[]) {
  if (!messageIds.length) return;
  await tx.messageEnvelope.deleteMany({ where: { messageId: { in: messageIds } } });
  await tx.messageBackup.deleteMany({ where: { messageId: { in: messageIds } } });
}

export async function deleteMessages(userId: string, { ids, scope }: DeleteMessagesQuery) {
  const detached = await withEvents(async (tx, emit): Promise<string[]> => {
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
        data: { deletedAt: new Date(), text: null, entities: Prisma.DbNull, attachmentId: null },
      });
      await dropEncryptedContent(tx, live.map((m) => m.id));
      await scrubMessageEvents(
        tx,
        live.map((m) => m.id),
      );

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
      return live.map((m) => m.attachmentId).filter((a): a is string => !!a);
    }

    await tx.messageHidden.createMany({ data: ids.map((messageId) => ({ userId, messageId })), skipDuplicates: true });
    for (const chatId of chatIds) {
      const data = { chatId, messageIds: messages.filter((m) => m.chatId === chatId).map((m) => m.id), scope };
      emit(userId, "message.deleted", data);
    }
    return [];
  });
  await purgeUploads(detached);
}

/** Deletes the messages of one chat sent between `from` and `to` (either may be open), like deleteMessages. */
export async function deleteMessagesBetween(userId: string, chatId: string, { scope, from, to }: DeleteChatQuery) {
  await assertMember(prisma, chatId, userId);
  const inRange = await prisma.message.findMany({
    where: { chatId, createdAt: { gte: from && new Date(from), lte: to && new Date(to) } },
    select: { id: true },
  });
  if (inRange.length) await deleteMessages(userId, { ids: inRange.map((m) => m.id), scope });
}

/** Permanently deletes, for everyone, messages whose chat auto-delete deadline has passed. */
export async function deleteExpiredMessages(batch = 500) {
  const doomed = await withEvents(async (tx, emit) => {
    const rows = await tx.message.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true, chatId: true, attachmentId: true },
      take: batch,
    });
    const ids = rows.map((m) => m.id);
    await scrubMessageEvents(tx, ids);
    await tx.message.deleteMany({ where: { id: { in: ids } } });
    for (const chatId of new Set(rows.map((m) => m.chatId))) {
      const messageIds = rows.filter((m) => m.chatId === chatId).map((m) => m.id);
      for (const id of await memberIds(tx, chatId)) emit(id, "message.deleted", { chatId, messageIds, scope: "me" });
    }
    return rows;
  });
  await purgeUploads(doomed.map((m) => m.attachmentId).filter((a): a is string => !!a));
  return doomed.length;
}

async function notifyMembers(tx: Tx, emit: Emit, messageId: string) {
  const m = await tx.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
  for (const id of await memberIds(tx, m.chatId)) emit(id, "message.edited", toMessageDTO(m, id));
}

/**
 * Permanently deletes a self-destructing message's content: its text, its place in the sync log,
 * and (after `filesAfterMs`, so a link just handed out can still load) its file.
 */
async function wipeContent(tx: Tx, emit: Emit, m: MessageRow, filesAfterMs: number) {
  await tx.message.update({
    where: { id: m.id },
    data: { purgedAt: new Date(), text: null, entities: Prisma.DbNull, attachmentId: null },
  });
  await dropEncryptedContent(tx, [m.id]);
  await scrubMessageEvents(tx, [m.id]);
  await notifyMembers(tx, emit, m.id);
  if (m.attachmentId) {
    await timersQueue().add("purge-uploads", { uploadIds: [m.attachmentId] }, { delay: filesAfterMs });
  }
}

/**
 * Closes a self-destructing message to its recipient. The sender keeps it for
 * EPHEMERAL_RESEND.windowSeconds so they can resend it; once that window passes, or straight away
 * when no resends are left, its content is wiped for good.
 */
async function markExpired(tx: Tx, emit: Emit, m: MessageRow, filesAfterMs: number) {
  await tx.message.update({ where: { id: m.id }, data: { expiredAt: new Date() } });
  await scrubMessageEvents(tx, [m.id]);
  if (m.resendCount >= EPHEMERAL_RESEND.max) {
    await wipeContent(tx, emit, m, filesAfterMs);
    return;
  }
  await notifyMembers(tx, emit, m.id);
  await timersQueue().add(
    "purge-message",
    { purgeMessageId: m.id, cycle: m.resendCount },
    { delay: EPHEMERAL_RESEND.windowSeconds * 1000, jobId: `purge-${m.id}-${m.resendCount}` },
  );
}

export async function expireMessage(messageId: string, cycle: number) {
  await withEvents(async (tx, emit) => {
    const m = await tx.message.findUnique({ where: { id: messageId }, include: messageInclude });
    if (!m || m.expiredAt || m.deletedAt || !isEphemeral(m) || m.resendCount !== cycle) return;
    await markExpired(tx, emit, m, 0);
  });
}

/** Wipes an expired message whose resend window has passed, unless it was resent since. */
export async function purgeMessage(messageId: string, cycle: number) {
  await withEvents(async (tx, emit) => {
    const m = await tx.message.findUnique({ where: { id: messageId }, include: messageInclude });
    if (!m || !m.expiredAt || m.purgedAt || m.resendCount !== cycle) return;
    await wipeContent(tx, emit, m, 0);
  });
}

/**
 * Turns a message the sender already sent into a self-destructing one: it locks for the recipient
 * until they open it, then goes like any other. Their backup copy and the sync log's copies go, so
 * the old content can't come back from there.
 */
export async function makeEphemeral(userId: string, messageId: string, rule: EphemeralInput): Promise<MessageDTO> {
  return withEvents(async (tx, emit) => {
    await tx.$executeRaw`SELECT 1 FROM "Message" WHERE id = ${messageId} FOR UPDATE`;
    const m = await tx.message.findUnique({ where: { id: messageId }, include: messageInclude });
    if (!m || m.deletedAt) throw new AppError("MESSAGE_NOT_FOUND");
    await assertMember(tx, m.chatId, userId).catch(() => {
      throw new AppError("MESSAGE_NOT_FOUND");
    });
    if (m.senderId !== userId) throw new AppError("NOT_MESSAGE_SENDER", "Only the sender can make it self-destruct");
    if (isEphemeral(m) || ["service", "sticker", "location", "checklist"].includes(m.type)) {
      throw new AppError("MESSAGE_NOT_EDITABLE", "This message can't be made to self-destruct");
    }

    await tx.message.update({
      where: { id: messageId },
      data: { maxViews: rule.maxViews ?? null, ttlSeconds: rule.ttlSeconds ?? null },
    });
    await tx.messageBackup.deleteMany({ where: { messageId, userId: { not: userId } } });
    await scrubMessageEvents(tx, [messageId]);
    await notifyMembers(tx, emit, messageId);
    const updated = await tx.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
    return toMessageDTO(updated, userId);
  });
}

/** Re-arms an opened self-destructing message so its recipient can open it again. */
export async function resendMessage(userId: string, messageId: string): Promise<MessageDTO> {
  const { dto, recipients, round } = await withEvents(async (tx, emit) => {
    await tx.$executeRaw`SELECT 1 FROM "Message" WHERE id = ${messageId} FOR UPDATE`;
    const m = await tx.message.findUnique({ where: { id: messageId }, include: messageInclude });
    if (!m || m.deletedAt) throw new AppError("MESSAGE_NOT_FOUND");
    await assertMember(tx, m.chatId, userId).catch(() => {
      throw new AppError("MESSAGE_NOT_FOUND");
    });
    if (m.senderId !== userId) throw new AppError("NOT_MESSAGE_SENDER", "Only the sender can resend it");
    if (!isEphemeral(m)) throw new AppError("RESEND_NOT_ALLOWED", "Only self-destructing messages can be resent");
    if (!m.expiredAt) throw new AppError("RESEND_NOT_ALLOWED", "It has not been opened yet");
    if (m.purgedAt) throw new AppError("MESSAGE_EXPIRED", "It was destroyed for good");
    if (m.resendCount >= EPHEMERAL_RESEND.max) {
      throw new AppError("RESEND_NOT_ALLOWED", `It can only be resent ${EPHEMERAL_RESEND.max} times`);
    }
    if (Date.now() > m.expiredAt.getTime() + EPHEMERAL_RESEND.windowSeconds * 1000) {
      throw new AppError("RESEND_NOT_ALLOWED", "It is too late to resend it");
    }

    await tx.messageView.deleteMany({ where: { messageId } });
    await tx.message.update({ where: { id: messageId }, data: { expiredAt: null, resendCount: { increment: 1 } } });
    await tx.chat.update({ where: { id: m.chatId }, data: { lastMessageAt: new Date() } });
    await notifyMembers(tx, emit, messageId);
    const fresh = await tx.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
    const recipients = (await memberIds(tx, m.chatId)).filter((id) => id !== userId);
    return { dto: toMessageDTO(fresh, userId), recipients, round: fresh.resendCount };
  });
  await queuePush(messageId, recipients, `r${round}`).catch((err) =>
    console.error("could not queue push:", err.message),
  );
  return dto;
}

/** Opens a message for its recipient, counting the view and starting any self-destruct timer. */
export async function viewMessage(userId: string, messageId: string): Promise<ViewMessageResult> {
  return withEvents(async (tx, emit) => {
    await tx.$executeRaw`SELECT 1 FROM "Message" WHERE id = ${messageId} FOR UPDATE`;
    const m = await tx.message.findUnique({ where: { id: messageId }, include: messageInclude });
    if (!m || m.deletedAt) throw new AppError("MESSAGE_NOT_FOUND");
    await assertMember(tx, m.chatId, userId).catch(() => {
      throw new AppError("MESSAGE_NOT_FOUND");
    });
    if (m.expiredAt) throw new AppError("MESSAGE_EXPIRED");
    if (!isEphemeral(m) || m.senderId === userId) {
      return { message: toMessageDTO(m, userId, { reveal: true }), expiresAt: null };
    }

    const view = await tx.messageView.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, count: 1 },
      update: { count: { increment: 1 } },
    });
    const opened = await tx.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
    const message = toMessageDTO(opened, userId, { reveal: true });
    const expiresAt = m.ttlSeconds ? new Date(view.firstViewedAt.getTime() + m.ttlSeconds * 1000) : null;

    if (m.maxViews !== null && view.count >= m.maxViews) {
      await markExpired(tx, emit, opened, EPHEMERAL_LINK_SECONDS * 1000);
    } else {
      await notifyMembers(tx, emit, messageId);
      if (expiresAt && view.count === 1) {
        await timersQueue().add(
          "expire-message",
          { messageId, cycle: m.resendCount },
          {
            delay: Math.max(0, expiresAt.getTime() - Date.now()) + 2000,
            jobId: `expire-${messageId}-${m.resendCount}`,
          },
        );
      }
    }
    return { message, expiresAt: expiresAt?.toISOString() ?? null };
  });
}
