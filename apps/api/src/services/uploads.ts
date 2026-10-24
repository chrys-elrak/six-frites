import { createId } from "@paralleldrive/cuid2";
import type { Prisma, Upload } from "../generated/prisma/client.js";
import { type AttachmentDTO, AppError, MAX_UPLOAD_BYTES, type PresignUploadInput, type UploadKind } from "@six/shared";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { mediaQueue } from "../lib/queue.js";
import { deleteObjects, headObject, presignGet, presignPut } from "../lib/storage.js";

/** `linkSeconds` makes the download links short-lived instead of the cacheable daily ones. */
export function toAttachmentDTO(u: Upload, linkSeconds?: number): AttachmentDTO {
  const ready = u.status === "ready";
  const mainKey = u.mainKey ?? u.key;
  return {
    id: u.id,
    kind: u.kind as UploadKind,
    status: u.status as AttachmentDTO["status"],
    name: u.name,
    mime: u.mainMime ?? u.mime,
    size: u.size,
    url: ready ? presignGet(mainKey, u.kind === "file" ? u.name : undefined, linkSeconds) : null,
    thumbUrl: ready && u.thumbKey ? presignGet(u.thumbKey, undefined, linkSeconds) : null,
    width: u.width,
    height: u.height,
    durationMs: u.durationMs,
    waveform: (u.waveform as number[] | null) ?? null,
  };
}

export const uploadKeys = (u: Pick<Upload, "key" | "mainKey" | "thumbKey">) =>
  [u.key, u.mainKey, u.thumbKey].filter((k): k is string => !!k && k !== u.key).concat(u.key);

export async function presignUpload(ownerId: string, input: PresignUploadInput) {
  const id = createId();
  const key = `u/${ownerId}/${id}/original`;
  const upload = await prisma.upload.create({
    data: { id, ownerId, kind: input.kind, name: input.name, mime: input.mime, size: input.size, key },
  });
  return {
    upload: toAttachmentDTO(upload),
    url: await presignPut(key, input.mime, input.size),
    headers: { "Content-Type": input.mime },
  };
}

async function ownUpload(ownerId: string, id: string) {
  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload || upload.ownerId !== ownerId) throw new AppError("UPLOAD_NOT_FOUND");
  return upload;
}

export async function getUpload(ownerId: string, id: string) {
  return toAttachmentDTO(await ownUpload(ownerId, id));
}

/** Confirms the file reached storage and queues it for processing (plain files are ready as-is). */
export async function completeUpload(ownerId: string, id: string) {
  const upload = await ownUpload(ownerId, id);
  if (upload.status !== "pending") return toAttachmentDTO(upload);

  const stored = await headObject(upload.key);
  if (!stored) throw new AppError("UPLOAD_MISSING", "The file has not been uploaded yet");
  if (stored.size !== upload.size || stored.size > MAX_UPLOAD_BYTES) {
    await deleteObjects([upload.key]);
    throw new AppError("UPLOAD_MISSING", "The uploaded file does not match what was announced");
  }

  if (upload.kind === "file") {
    return toAttachmentDTO(await prisma.upload.update({ where: { id }, data: { status: "ready" } }));
  }
  const updated = await prisma.upload.update({ where: { id }, data: { status: "processing" } });
  await mediaQueue().add("process", { uploadId: id }, { jobId: id });
  return toAttachmentDTO(updated);
}

/** Checks an upload can be attached to a new message by this sender. */
export async function claimForMessage(tx: Tx, senderId: string, uploadId: string) {
  const upload = await tx.upload.findUnique({ where: { id: uploadId }, include: { messages: { select: { id: true } } } });
  if (!upload || upload.ownerId !== senderId) throw new AppError("UPLOAD_NOT_FOUND");
  if (upload.status === "pending") throw new AppError("UPLOAD_NOT_READY", "Complete the upload before sending it");
  if (upload.status === "failed") throw new AppError("UPLOAD_NOT_READY", "This file could not be processed");
  if (upload.messages.length) throw new AppError("UPLOAD_IN_USE");
  return upload;
}

/** Tells every chat that shows this upload that its attachment changed (finished or failed processing). */
export async function announceUpload(tx: Tx, emit: Emit, uploadId: string) {
  const { toMessageDTO, messageInclude } = await import("./messages.js");
  const messages = await tx.message.findMany({ where: { attachmentId: uploadId }, include: messageInclude });
  for (const m of messages) {
    const members = await tx.chatMember.findMany({ where: { chatId: m.chatId }, select: { userId: true } });
    for (const { userId } of members) emit(userId, "message.edited", toMessageDTO(m, userId));
  }
}

export async function finishUpload(uploadId: string, data: Prisma.UploadUpdateInput) {
  await withEvents(async (tx, emit) => {
    await tx.upload.update({ where: { id: uploadId }, data });
    await announceUpload(tx, emit, uploadId);
  });
}

/** Removes uploads and their files; used when the messages holding them are deleted for everyone. */
export async function purgeUploads(ids: string[]) {
  if (!ids.length) return;
  const uploads = await prisma.upload.findMany({ where: { id: { in: ids } } });
  await deleteObjects(uploads.flatMap(uploadKeys)).catch(() => null);
  await prisma.upload.deleteMany({ where: { id: { in: uploads.map((u) => u.id) } } });
}

/** Deletes uploads that were never attached to a message within a day. */
export async function purgeAbandonedUploads(olderThanMs = 24 * 60 * 60 * 1000) {
  const stale = await prisma.upload.findMany({
    where: { createdAt: { lt: new Date(Date.now() - olderThanMs) }, messages: { none: {} } },
    select: { id: true },
  });
  await purgeUploads(stale.map((u) => u.id));
  return stale.length;
}
