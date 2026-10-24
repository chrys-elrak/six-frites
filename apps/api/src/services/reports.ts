import {
  type AdminReportQuery,
  type AdminUserRef,
  AppError,
  type CreateReportInput,
  type MessageEntity,
  type MessageType,
  type ReportDTO,
  type ReportReason,
  type ReportStatus,
  type ResolveReportInput,
} from "@six/shared";
import type { Message, Prisma, User } from "../generated/prisma/client.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";
import { banUser } from "./admin.js";
import { EPHEMERAL_LINK_SECONDS, deleteMessages, visibleTo } from "./messages.js";
import { toStickerDTO } from "./stickers.js";
import { toAttachmentDTO } from "./uploads.js";

/** How many messages before and after a reported one are copied for context. */
const CONTEXT = 3;

interface SnapshotMessage {
  id: string;
  senderId: string;
  type: string;
  text: string | null;
  entities: MessageEntity[];
  uploadId: string | null;
  stickerId: string | null;
  createdAt: string;
  reported: boolean;
}

const snapshotOf = (m: Message, reported: boolean): SnapshotMessage => ({
  id: m.id,
  senderId: m.senderId,
  type: m.type,
  text: m.text,
  entities: (m.entities as MessageEntity[] | null) ?? [],
  uploadId: m.attachmentId,
  stickerId: m.stickerId,
  createdAt: m.createdAt.toISOString(),
  reported,
});

export const toUserRef = (u: User): AdminUserRef => ({
  id: u.id,
  displayName: u.displayName,
  email: u.email,
  avatarUrl: u.avatarUrl,
  bannedAt: u.bannedAt?.toISOString() ?? null,
});

/**
 * Files a report about a message (copying it and a few around it, as the reporter sees them, so
 * later edits or deletes can't hide it from moderators) or about someone the reporter shares a chat with.
 */
export async function createReport(reporterId: string, input: CreateReportInput) {
  let targetId: string;
  let messageId: string | null = null;
  let snapshot: SnapshotMessage[] = [];

  if (input.messageId) {
    const m = await prisma.message.findUnique({ where: { id: input.messageId } });
    const member =
      m && (await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: m.chatId, userId: reporterId } } }));
    if (!m || !member) throw new AppError("MESSAGE_NOT_FOUND");
    if (m.senderId === reporterId) throw new AppError("VALIDATION_FAILED", "You can't report your own message");

    const visible = { chatId: m.chatId, ...visibleTo(reporterId, member.clearedAt) };
    const [before, after] = await Promise.all([
      prisma.message.findMany({
        where: { ...visible, createdAt: { lt: m.createdAt } },
        orderBy: { createdAt: "desc" },
        take: CONTEXT,
      }),
      prisma.message.findMany({
        where: { ...visible, createdAt: { gt: m.createdAt } },
        orderBy: { createdAt: "asc" },
        take: CONTEXT,
      }),
    ]);
    snapshot = [...before.reverse(), m, ...after].map((x) => snapshotOf(x, x.id === m.id));
    targetId = m.senderId;
    messageId = m.id;
  } else {
    targetId = input.userId!;
    const shared = await prisma.chat.findFirst({
      where: { AND: [{ members: { some: { userId: reporterId } } }, { members: { some: { userId: targetId } } }] },
      select: { id: true },
    });
    if (targetId === reporterId || !shared) throw new AppError("USER_NOT_FOUND");
  }

  const duplicate = await prisma.report.findFirst({ where: { reporterId, targetId, messageId, status: "open" } });
  if (duplicate) return;
  await prisma.report.create({
    data: {
      reporterId,
      targetId,
      messageId,
      reason: input.reason,
      note: input.note || null,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
}

const reportInclude = { reporter: true, target: true } satisfies Prisma.ReportInclude;
type ReportRow = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

/** Builds report DTOs, loading the files and stickers their copied messages point to in one go. */
async function toReportDTOs(rows: ReportRow[]): Promise<ReportDTO[]> {
  const snaps = rows.flatMap((r) => r.snapshot as unknown as SnapshotMessage[]);
  const uploadIds = snaps.map((s) => s.uploadId).filter((id): id is string => !!id);
  const stickerIds = snaps.map((s) => s.stickerId).filter((id): id is string => !!id);
  const [uploads, stickers] = await Promise.all([
    prisma.upload.findMany({ where: { id: { in: uploadIds } } }),
    prisma.sticker.findMany({ where: { id: { in: stickerIds } }, include: { upload: true } }),
  ]);
  const uploadById = new Map(uploads.map((u) => [u.id, u]));
  const stickerById = new Map(stickers.map((s) => [s.id, s]));

  return rows.map((r) => ({
    id: r.id,
    reason: r.reason as ReportReason,
    note: r.note,
    status: r.status as ReportStatus,
    reporter: toUserRef(r.reporter),
    target: toUserRef(r.target),
    messages: (r.snapshot as unknown as SnapshotMessage[]).map((s) => {
      const upload = s.uploadId ? uploadById.get(s.uploadId) : undefined;
      const sticker = s.stickerId ? stickerById.get(s.stickerId) : undefined;
      return {
        id: s.id,
        senderId: s.senderId,
        type: s.type as MessageType,
        text: s.text,
        entities: s.entities,
        attachment: upload ? toAttachmentDTO(upload, EPHEMERAL_LINK_SECONDS) : null,
        sticker: sticker ? toStickerDTO(sticker) : null,
        createdAt: s.createdAt,
        reported: s.reported,
      };
    }),
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolution: r.resolution,
  }));
}

export async function listReports(q: AdminReportQuery) {
  const rows = await prisma.report.findMany({
    where: { status: q.status === "open" ? "open" : { not: "open" } },
    include: reportInclude,
    ...pageArgs(q),
  });
  const page = toPage(rows, q, (r) => r);
  return { items: await toReportDTOs(page.items), nextCursor: page.nextCursor };
}

export async function resolveReport(adminId: string, reportId: string, input: ResolveReportInput) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new AppError("REPORT_NOT_FOUND");
  if (report.status !== "open") throw new AppError("CONFLICT", "This report was already handled");

  const done: string[] = [];
  if (input.deleteMessage && report.messageId) {
    const m = await prisma.message.findUnique({ where: { id: report.messageId } });
    if (m && !m.deletedAt) {
      await deleteMessages(m.senderId, { ids: [m.id], scope: "all" });
      done.push("Message deleted");
    }
  }
  if (input.banUser) {
    await banUser(adminId, report.targetId, input.note || `Reported for ${report.reason}`);
    done.push("User banned");
  }

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: {
      status: done.length ? "actioned" : "dismissed",
      resolution: [done.join(", "), input.note].filter(Boolean).join(" · ") || null,
      resolvedById: adminId,
      resolvedAt: new Date(),
    },
    include: reportInclude,
  });
  return (await toReportDTOs([updated]))[0]!;
}
