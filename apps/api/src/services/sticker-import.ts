import { createId } from "@paralleldrive/cuid2";
import { AppError, STICKER_LIMITS, STICKER_MAX_BYTES, type StickerImportDTO } from "@six/shared";
import { inflateRawSync } from "node:zlib";
import type { Redis } from "ioredis";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { mediaQueue, redisConnection } from "../lib/queue.js";
import { deleteObjects, objectStream, putObject } from "../lib/storage.js";
import { processUpload } from "../media/process.js";
import { attachSticker, emojiForFileName } from "./stickers.js";

const TYPES: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  tgs: "application/x-tgsticker",
  json: "application/json",
};
const typeOf = (name: string) => TYPES[name.split(".").pop()!.toLowerCase()];

let client: Redis | null = null;
const redis = () => (client ??= redisConnection());
const progressKey = (uploadId: string) => `${env.QUEUE_PREFIX}:sticker-import:${uploadId}`;

type Progress = Omit<StickerImportDTO, "uploadId" | "updatedAt">;
const activeKey = (adminId: string) => `${env.QUEUE_PREFIX}:sticker-import:active:${adminId}`;
const cancelKey = (uploadId: string) => `${env.QUEUE_PREFIX}:sticker-import:cancel:${uploadId}`;
const fresh = (): Progress => ({ done: 0, total: 0, current: null, packs: [], skipped: 0, finished: false, error: null });

class Cancelled extends Error {
  constructor() {
    super("Cancelled");
  }
}

async function save(uploadId: string, progress: Progress) {
  const dto: StickerImportDTO = { ...progress, uploadId, updatedAt: new Date().toISOString() };
  await redis().set(progressKey(uploadId), JSON.stringify(dto), "EX", 24 * 60 * 60);
  return dto;
}

async function read(uploadId: string) {
  const raw = await redis().get(progressKey(uploadId));
  return raw ? (JSON.parse(raw) as StickerImportDTO) : null;
}

/** The admin's latest import, running or done in the last day, so the page can pick it up again after a reload. */
export async function latestStickerImport(adminId: string) {
  const uploadId = await redis().get(activeKey(adminId));
  return { import: uploadId ? await read(uploadId) : null };
}

/**
 * Stops an import: a queued one never starts, a running one stops within a few stickers. Packs made so far stay.
 * It counts as finished straight away, so a worker that died mid-import doesn't block the next one.
 */
export async function cancelStickerImport(adminId: string, uploadId: string) {
  const progress = await stickerImportProgress(adminId, uploadId);
  if (progress.finished) return progress;
  await redis().set(cancelKey(uploadId), "1", "EX", 24 * 60 * 60);
  const job = await mediaQueue().getJob(`import-${uploadId}`);
  if (!job || !(await job.isActive())) {
    await job?.remove();
    await dropZip(uploadId);
  }
  return save(uploadId, { ...progress, finished: true, current: null, error: "Cancelled" });
}

async function dropZip(uploadId: string) {
  const zip = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (zip) await deleteObjects([zip.key]).catch(() => null);
  await prisma.upload.update({ where: { id: uploadId }, data: { status: "removed" } }).catch(() => null);
}

/** Queues the import of an admin's uploaded zip into official sticker packs. */
export async function startStickerImport(adminId: string, uploadId: string) {
  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.ownerId !== adminId || upload.kind !== "sticker_zip") throw new AppError("UPLOAD_NOT_FOUND");
  if (upload.status !== "ready") throw new AppError("UPLOAD_NOT_READY", "Finish uploading the zip first");
  const { import: running } = await latestStickerImport(adminId);
  if (running && !running.finished) {
    throw new AppError("STICKER_IMPORT_RUNNING", "An import is still running; wait for it or cancel it first");
  }
  const progress = await save(uploadId, fresh());
  await redis().set(activeKey(adminId), uploadId, "EX", 24 * 60 * 60);
  await mediaQueue().add("import-stickers", { uploadId }, { jobId: `import-${uploadId}`, attempts: 1 });
  return progress;
}

export async function stickerImportProgress(adminId: string, uploadId: string): Promise<StickerImportDTO> {
  const upload = await prisma.upload.findUnique({ where: { id: uploadId }, select: { ownerId: true } });
  const progress = upload?.ownerId === adminId ? await read(uploadId) : null;
  if (!progress) throw new AppError("UPLOAD_NOT_FOUND");
  return progress;
}

const wanted = (path: string) => {
  const name = path.split("/").pop()!;
  return !path.endsWith("/") && !path.includes("__MACOSX") && !name.startsWith(".") && !!typeOf(name);
};

interface ZipEntry {
  path: string;
  method: number;
  packed: number;
  size: number;
  offset: number;
}

async function readRange(key: string, start: number, end: number) {
  const chunks: Buffer[] = [];
  for await (const chunk of await objectStream(key, { start, end })) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Reads the extra field's zip64 values that stand in for sizes and offsets too big for 32 bits. */
function zip64(extra: Buffer, fields: { size: boolean; packed: boolean; offset: boolean }) {
  for (let i = 0; i + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(i);
    const len = extra.readUInt16LE(i + 2);
    if (id === 0x0001) {
      let at = i + 4;
      const next = () => {
        const v = Number(extra.readBigUInt64LE(at));
        at += 8;
        return v;
      };
      return { size: fields.size ? next() : undefined, packed: fields.packed ? next() : undefined, offset: fields.offset ? next() : undefined };
    }
    i += 4 + len;
  }
  return {};
}

/**
 * The zip's table of contents, from the central directory at its end: every entry's path, exact compressed size
 * and where it starts. Knowing the sizes up front is what makes reading safe; guessing where an entry ends from
 * the data can stop early in a big zip of already-compressed images.
 */
async function readZipIndex(key: string, size: number): Promise<ZipEntry[]> {
  const tailStart = Math.max(0, size - 65_557);
  const tail = await readRange(key, tailStart, size - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("That isn't a zip file");
  let dirSize = tail.readUInt32LE(eocd + 12);
  let dirStart = tail.readUInt32LE(eocd + 16);
  if (dirSize === 0xffffffff || dirStart === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) throw new Error("That zip is damaged");
    const recordAt = Number(tail.readBigUInt64LE(locator + 8));
    const record = await readRange(key, recordAt, recordAt + 55);
    dirSize = Number(record.readBigUInt64LE(40));
    dirStart = Number(record.readBigUInt64LE(48));
  }
  const dir = await readRange(key, dirStart, dirStart + dirSize - 1);
  const entries: ZipEntry[] = [];
  for (let i = 0; i + 46 <= dir.length && dir.readUInt32LE(i) === 0x02014b50; ) {
    const nameLen = dir.readUInt16LE(i + 28);
    const extraLen = dir.readUInt16LE(i + 30);
    const commentLen = dir.readUInt16LE(i + 32);
    let packed = dir.readUInt32LE(i + 20);
    let unpacked = dir.readUInt32LE(i + 24);
    let offset = dir.readUInt32LE(i + 42);
    const big = zip64(dir.subarray(i + 46 + nameLen, i + 46 + nameLen + extraLen), {
      size: unpacked === 0xffffffff,
      packed: packed === 0xffffffff,
      offset: offset === 0xffffffff,
    });
    unpacked = big.size ?? unpacked;
    packed = big.packed ?? packed;
    offset = big.offset ?? offset;
    entries.push({
      path: dir.subarray(i + 46, i + 46 + nameLen).toString("utf8"),
      method: dir.readUInt16LE(i + 10),
      packed,
      size: unpacked,
      offset,
    });
    i += 46 + nameLen + extraLen + commentLen;
  }
  return entries.sort((a, b) => a.offset - b.offset);
}

/** Reads a stream a given number of bytes at a time, keeping only what hasn't been taken yet. */
class ByteReader {
  private chunks: Buffer[] = [];
  private have = 0;
  position = 0;

  constructor(private source: AsyncIterator<Buffer>) {}

  private async fill(n: number) {
    while (this.have < n) {
      const { value, done } = await this.source.next();
      if (done) throw new Error("The zip ends early");
      this.chunks.push(value);
      this.have += value.length;
    }
  }

  async read(n: number) {
    await this.fill(n);
    const all = this.chunks.length === 1 ? this.chunks[0]! : Buffer.concat(this.chunks);
    this.chunks = all.length > n ? [all.subarray(n)] : [];
    this.have = all.length - n;
    this.position += n;
    return all.subarray(0, n);
  }

  async skip(n: number) {
    while (n > 0) {
      await this.fill(1);
      const first = this.chunks[0]!;
      const k = Math.min(n, first.length);
      this.chunks[0] = first.subarray(k);
      if (!this.chunks[0].length) this.chunks.shift();
      this.have -= k;
      this.position += k;
      n -= k;
    }
  }
}

/**
 * Unpacks the entries `want` keeps in one pass over the zip in storage, so even a few gigabytes never sit in memory,
 * using the sizes from its table of contents. Each comes out unpacked to `handle`; `null` bytes mean too big or
 * unreadable.
 */
async function streamZip(key: string, entries: ZipEntry[], want: (path: string) => boolean, handle: (path: string, bytes: Uint8Array | null) => Promise<void>) {
  const reader = new ByteReader((await objectStream(key))[Symbol.asyncIterator]());
  for (const entry of entries) {
    if (!want(entry.path)) continue;
    await reader.skip(entry.offset - reader.position);
    const header = await reader.read(30);
    if (header.readUInt32LE(0) !== 0x04034b50) throw new Error("That zip is damaged");
    await reader.skip(header.readUInt16LE(26) + header.readUInt16LE(28));
    if (entry.size > STICKER_MAX_BYTES || (entry.method !== 0 && entry.method !== 8)) {
      await handle(entry.path, null);
      continue;
    }
    const packed = await reader.read(entry.packed);
    let bytes: Uint8Array | null;
    try {
      bytes = entry.method === 0 ? Buffer.from(packed) : inflateRawSync(packed);
    } catch {
      bytes = null;
    }
    await handle(entry.path, bytes);
  }
}

/** The pack a file goes in: its folder, or the zip's name for loose files. */
const folderOf = (path: string, loose: string) => path.split("/").slice(0, -1).pop() ?? loose;

/**
 * Reads the zip's table of contents to count the stickers in each folder, then unpacks it in one streaming pass,
 * making a pack per folder (several when a folder holds more than a pack can) and adding each sticker as it comes.
 */
export async function runStickerImport(uploadId: string) {
  const zip = await prisma.upload.findUniqueOrThrow({ where: { id: uploadId } });
  const adminId = zip.ownerId;
  const loose = zip.name.replace(/\.zip$/i, "") || "Stickers";
  const progress = fresh();
  try {
    if (await redis().exists(cancelKey(uploadId))) throw new Cancelled();
    const entries = await readZipIndex(zip.key, zip.size);
    const counts = new Map<string, number>();
    for (const { path } of entries) {
      if (wanted(path)) counts.set(folderOf(path, loose), (counts.get(folderOf(path, loose)) ?? 0) + 1);
    }
    progress.total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (!progress.total) throw new Error("No PNG, WebP, TGS or JSON files in that zip");
    await save(uploadId, progress);

    const packs = new Map<string, { id: string; added: number; part: number }>();
    await streamZip(zip.key, entries, wanted, async (path, bytes) => {
      if (progress.done % 5 === 0 && (await redis().exists(cancelKey(uploadId)))) throw new Cancelled();
      const folder = folderOf(path, loose);
      let pack = packs.get(folder);
      if (!pack || pack.added >= STICKER_LIMITS.perPack) {
        const part = (pack?.part ?? 0) + 1;
        const title = ((counts.get(folder) ?? 0) > STICKER_LIMITS.perPack ? `${folder} ${part}` : folder).slice(0, 64);
        const row = await prisma.stickerPack.create({ data: { title, builtin: true, ownerId: adminId } });
        pack = { id: row.id, added: 0, part };
        packs.set(folder, pack);
        progress.packs.push(title);
        progress.current = title;
      }
      try {
        if (!bytes) throw new Error("Too big or unreadable");
        const name = path.split("/").pop()!;
        const id = createId();
        const key = `u/${adminId}/${id}/original`;
        const mime = typeOf(name)!;
        await putObject(key, Buffer.from(bytes), mime);
        await prisma.upload.create({
          data: { id, ownerId: adminId, kind: "sticker", status: "processing", name, mime, size: bytes.length, key },
        });
        await processUpload(id);
        await attachSticker(adminId, pack.id, { uploadId: id, emoji: emojiForFileName(name) });
        pack.added++;
      } catch {
        progress.skipped++;
      }
      progress.done++;
      if (progress.done % 5 === 0) await save(uploadId, progress);
    });
  } catch (err) {
    progress.error = err instanceof Error ? err.message : "The import failed";
  } finally {
    progress.finished = true;
    progress.current = null;
    await save(uploadId, progress);
    await dropZip(uploadId);
  }
}
