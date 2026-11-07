import { createRequire } from "node:module";
import {
  type AddStickerInput,
  AppError,
  type CreateStickerPackInput,
  type EmojiEntry,
  STICKER_LIMITS,
  emojiForFileName as emojiForName,
  suggestEmoji,
  type StickerDTO,
  type StickerPackDTO,
} from "@six/shared";
import type { Prisma, Sticker, Upload } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../env.js";
import { presignGet } from "../lib/storage.js";

const NOTO = /^https:\/\/fonts\.gstatic\.com\/s\/e\/notoemoji\/latest\/([0-9a-f_]+)\/lottie\.json$/;

/** A built-in sticker's animation through our own server, so showing it never reaches Google. */
const ourLottie = (url: string) => {
  const key = NOTO.exec(url)?.[1];
  return key ? `${env.PUBLIC_URL}/v1/emoji/${key}/lottie.json` : url;
};

const LOTTIE_MIME = "application/json";

export function toStickerDTO(s: Sticker & { upload: Upload | null }): StickerDTO {
  const u = s.upload;
  return {
    id: s.id,
    packId: s.packId,
    emoji: s.emoji,
    format: s.lottieUrl || u?.mainMime === LOTTIE_MIME ? "lottie" : "image",
    url: s.bannedAt ? null : s.lottieUrl ? ourLottie(s.lottieUrl) : u?.status === "ready" ? presignGet(u.mainKey ?? u.key) : null,
    width: u?.width ?? null,
    height: u?.height ?? null,
  };
}

const packInclude = {
  stickers: {
    where: { removedAt: null, OR: [{ lottieUrl: { not: null } }, { upload: { status: { not: "failed" } } }] },
    include: { upload: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.StickerPackInclude;
type PackRow = Prisma.StickerPackGetPayload<{ include: typeof packInclude }>;

const toPackDTO = (p: PackRow, viewerId: string, saved: boolean): StickerPackDTO => ({
  id: p.id,
  title: p.title,
  builtin: p.builtin,
  mine: p.ownerId === viewerId,
  saved: p.builtin || saved,
  stickers: p.stickers.map(toStickerDTO),
});

const BUILTIN = [
  {
    id: "noto-faces",
    title: "Faces",
    emoji: "😂 🤣 😍 🥰 😘 😊 😉 😎 🤩 🥳 🤔 🙄 😴 😭 😱 🤯 😡 🥺 😬 🤗 🫠 😇 🤪 😜 🙃 😅 😳 🤤 🤮 🥶 🥵 💀",
  },
  {
    id: "noto-fun",
    title: "Love & fun",
    emoji: "❤️ 💔 💯 🔥 🎉 👍 👎 👏 🙏 💪 👋 ✌️ 🤝 🫶 👀 👻 💩 🤖 👽 🙈 🦊 🐼 🦄 🐢 🐙 🦋 🌈 ⭐ 🍕 🎂 ☕ 🍿 🚀 🎁 🏆",
  },
];

const emojis = (createRequire(import.meta.url)("@six/shared/emojis.json") as { data: EmojiEntry[] }[]).flatMap((c) => c.data);
const emojiName = new Map(emojis.map((e) => [e.e, e.n]));
const emojiByName = new Map(emojis.map((e) => [e.n.toLowerCase(), e.e]));
/** The emoji a sticker file stands for, from its name. */
export const emojiForFileName = (name: string) => emojiForName(name, (n) => emojiByName.get(n));

const notoKey = (emoji: string) => [...emoji].map((c) => c.codePointAt(0)!.toString(16)).join("_");

/** The Noto packs come from code and are re-created on every start, so nobody edits them. */
export const SEEDED_PREFIX = "noto-";
export const isSeededPack = (packId: string) => packId.startsWith(SEEDED_PREFIX);

/** Packs to offer: not taken down, and not the Noto ones, which only stay so messages that used them still show. */
const shownPacks = { bannedAt: null, NOT: { id: { startsWith: SEEDED_PREFIX } } } satisfies Prisma.StickerPackWhereInput;

/** Creates or refreshes the built-in packs, made of Google's Noto animated emoji (Lottie). */
export async function ensureBuiltinStickers() {
  for (const pack of BUILTIN) {
    await prisma.stickerPack.upsert({
      where: { id: pack.id },
      create: { id: pack.id, title: pack.title, builtin: true },
      update: { title: pack.title },
    });
    await prisma.$transaction(
      pack.emoji.split(" ").map((emoji, position) => {
        const key = notoKey(emoji);
        const data = {
          packId: pack.id,
          emoji,
          name: emojiName.get(emoji) ?? null,
          position,
          lottieUrl: `https://fonts.gstatic.com/s/e/notoemoji/latest/${key}/lottie.json`,
          removedAt: null,
        };
        return prisma.sticker.upsert({
          where: { id: `noto-${key}` },
          create: { id: `noto-${key}`, ...data },
          update: data,
        });
      }),
    );
  }
}

export async function listPacks(userId: string) {
  const packs = await prisma.stickerPack.findMany({
    where: { ...shownPacks, OR: [{ builtin: true }, { savedBy: { some: { userId } } }] },
    include: packInclude,
    orderBy: [{ builtin: "desc" }, { createdAt: "asc" }],
  });
  return { items: packs.map((p) => toPackDTO(p, userId, true)), nextCursor: null };
}

/**
 * Stickers from the packs `userId` has (built-in, official and saved) whose name has `q` in it, or that stand for
 * an emoji `q` names or is ("cry" finds 😢 and 😭 stickers).
 */
export async function searchStickers(userId: string, q: string) {
  const query = q.trim().toLowerCase();
  if (!query) return { items: [] };
  const hits = [query, ...suggestEmoji(emojis, query, 12).map((e) => e.e)];
  const rows = await prisma.sticker.findMany({
    where: {
      removedAt: null,
      bannedAt: null,
      pack: { ...shownPacks, OR: [{ builtin: true }, { savedBy: { some: { userId } } }] },
      AND: [
        { OR: [{ name: { contains: query, mode: "insensitive" } }, { emoji: { in: hits } }] },
        { OR: [{ lottieUrl: { not: null } }, { upload: { status: "ready" } }] },
      ],
    },
    include: { upload: true },
    orderBy: [{ pack: { builtin: "asc" } }, { createdAt: "desc" }],
    take: 30,
  });
  return { items: rows.map(toStickerDTO) };
}

export async function getPack(userId: string, packId: string) {
  const pack = await prisma.stickerPack.findUnique({
    where: { id: packId },
    include: { ...packInclude, savedBy: { where: { userId } } },
  });
  if (!pack || pack.bannedAt) throw new AppError("STICKER_PACK_NOT_FOUND");
  return toPackDTO(pack, userId, pack.savedBy.length > 0);
}

export async function createPack(userId: string, input: CreateStickerPackInput) {
  if ((await prisma.stickerPack.count({ where: { ownerId: userId } })) >= STICKER_LIMITS.packsPerUser) {
    throw new AppError("STICKER_LIMIT_REACHED", `You can make at most ${STICKER_LIMITS.packsPerUser} packs`);
  }
  const pack = await prisma.stickerPack.create({
    data: { ownerId: userId, title: input.title, savedBy: { create: { userId } } },
    include: packInclude,
  });
  return toPackDTO(pack, userId, true);
}

async function ownPack(userId: string, packId: string) {
  const pack = await prisma.stickerPack.findUnique({ where: { id: packId } });
  if (!pack || pack.bannedAt) throw new AppError("STICKER_PACK_NOT_FOUND");
  if (pack.ownerId !== userId) throw new AppError("FORBIDDEN", "Only the pack's creator can change it");
  return pack;
}

/** Adds a sticker to any pack but the Noto ones: only admins get this far, and they may fill anyone's pack. */
export async function addSticker(userId: string, packId: string, input: AddStickerInput) {
  const pack = await prisma.stickerPack.findUnique({ where: { id: packId } });
  if (!pack || pack.bannedAt || isSeededPack(pack.id)) throw new AppError("STICKER_PACK_NOT_FOUND");
  return attachSticker(userId, packId, input);
}

/** Adds one of `userId`'s sticker uploads to a pack they may change. */
export async function attachSticker(userId: string, packId: string, input: AddStickerInput) {
  const count = await prisma.sticker.count({ where: { packId, removedAt: null } });
  if (count >= STICKER_LIMITS.perPack) {
    throw new AppError("STICKER_LIMIT_REACHED", `A pack holds at most ${STICKER_LIMITS.perPack} stickers`);
  }
  const upload = await prisma.upload.findUnique({ where: { id: input.uploadId }, include: { sticker: true } });
  if (!upload || upload.ownerId !== userId || upload.kind !== "sticker") throw new AppError("UPLOAD_NOT_FOUND");
  if (upload.status === "pending") throw new AppError("UPLOAD_NOT_READY", "Complete the upload first");
  if (upload.status === "failed") throw new AppError("UPLOAD_NOT_READY", "This file is not a valid sticker");
  if (upload.sticker) throw new AppError("UPLOAD_IN_USE");

  const sticker = await prisma.sticker.create({
    data: { packId, uploadId: upload.id, emoji: input.emoji, name: upload.name.replace(/\.[^.]+$/, ""), position: count },
    include: { upload: true },
  });
  return toStickerDTO(sticker);
}

/** Takes a sticker out of its pack. Messages that already show it keep it. */
export async function removeSticker(userId: string, packId: string, stickerId: string) {
  await ownPack(userId, packId);
  const { count } = await prisma.sticker.updateMany({
    where: { id: stickerId, packId, removedAt: null },
    data: { removedAt: new Date() },
  });
  if (!count) throw new AppError("STICKER_NOT_FOUND");
}

export async function setPackSaved(userId: string, packId: string, saved: boolean) {
  const pack = await prisma.stickerPack.findUnique({ where: { id: packId } });
  if (!pack || pack.bannedAt) throw new AppError("STICKER_PACK_NOT_FOUND");
  if (pack.builtin) return;
  if (saved) {
    await prisma.savedStickerPack.upsert({
      where: { userId_packId: { userId, packId } },
      create: { userId, packId },
      update: {},
    });
  } else {
    await prisma.savedStickerPack.deleteMany({ where: { userId, packId } });
  }
}
