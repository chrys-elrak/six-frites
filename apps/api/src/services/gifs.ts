import { createId } from "@paralleldrive/cuid2";
import { AppError, type GifDTO, type GifQuery, MAX_UPLOAD_BYTES } from "@six/shared";
import type { Redis } from "ioredis";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { putObject } from "../lib/storage.js";
import { SHARED_PREFIX } from "./uploads.js";

const GIPHY = "https://api.giphy.com/v1";
const KLIPY = "https://api.klipy.com/api/v1";
/** KLIPY ids carry this prefix; GIPHY ids are plain letters and digits, so the two never clash. */
const KLIPY_ID = "klipy-";
/** Results per page, shared out between the providers that have a key. */
const PAGE = 24;
const MAX_OFFSET = 4999;
/** How long provider answers stay in Redis: trending moves hourly, search results and GIF details barely. */
const CACHE_SECONDS = { trending: 60 * 60, search: 24 * 60 * 60, gif: 24 * 60 * 60 };

interface GiphyImage {
  url?: string;
  mp4?: string;
  webp?: string;
  width?: string;
  height?: string;
}
interface GiphyGif {
  id: string;
  title: string;
  images: Record<string, GiphyImage | undefined>;
}
interface KlipyFile {
  url?: string;
  width?: number;
  height?: number;
}
interface KlipyItem {
  slug: string;
  title: string;
  file?: Record<string, Record<string, KlipyFile | undefined> | undefined>;
}
interface Video {
  url: string;
  width: number | null;
  height: number | null;
  title: string;
}
type Page = { items: GifDTO[]; more: boolean };

let client: Redis | null = null;
const redis = () => (client ??= redisConnection());

/** GETs JSON, caching answers so search-as-you-type stays within the providers' rate limits. */
async function cachedJSON<T>(cacheKey: string, url: string, ttlSeconds: number, failure: (status: number) => AppError) {
  const cached = await redis().get(`${env.QUEUE_PREFIX}:${cacheKey}`);
  if (cached) return JSON.parse(cached) as T;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw failure(res.status);
  const body = await res.text();
  await redis().set(`${env.QUEUE_PREFIX}:${cacheKey}`, body, "EX", ttlSeconds);
  return JSON.parse(body) as T;
}

function giphy<T>(path: string, params: Record<string, string>, ttlSeconds: number) {
  const key = env.GIPHY_API_KEY!;
  const listing = path.endsWith("/search") || path.endsWith("/trending");
  return cachedJSON<T>(
    `giphy:${path}?${new URLSearchParams(params)}`,
    `${GIPHY}${path}?${new URLSearchParams({ ...params, api_key: key })}`,
    ttlSeconds,
    (status) =>
      status === 404 || (status === 400 && !listing)
        ? new AppError("GIF_NOT_FOUND")
        : new AppError("GIFS_UNAVAILABLE", `GIPHY answered ${status}`),
  );
}

function klipy<T>(path: string, params: Record<string, string>, ttlSeconds: number) {
  const query = new URLSearchParams(params);
  return cachedJSON<T>(
    `klipy:${path}?${query}`,
    `${KLIPY}/${env.KLIPY_API_KEY}${path}?${query}`,
    ttlSeconds,
    (status) => new AppError("GIFS_UNAVAILABLE", `KLIPY answered ${status}`),
  );
}

function giphyDTO(g: GiphyGif): GifDTO | null {
  const preview = g.images.fixed_width;
  const url = preview?.webp ?? preview?.url;
  if (!url || !preview?.width || !preview.height) return null;
  return { id: g.id, title: g.title, previewUrl: url, width: Number(preview.width), height: Number(preview.height) };
}

/** Stickers are sent as their preview, so they take the largest size; GIF previews only need the small one. */
function klipyDTO(k: KlipyItem, kind: GifQuery["kind"]): GifDTO | null {
  const preview = (kind === "sticker" ? (k.file?.hd ?? k.file?.md) : (k.file?.sm ?? k.file?.md))?.webp;
  if (!preview?.url || !preview.width || !preview.height) return null;
  return { id: KLIPY_ID + k.slug, title: k.title, previewUrl: preview.url, width: preview.width, height: preview.height };
}

async function giphyPage(q: GifQuery, page: number, size: number): Promise<Page> {
  const offset = page * size;
  const params = { limit: String(size), offset: String(offset), rating: "pg-13" };
  const body = await giphy<{ data: GiphyGif[]; pagination: { total_count: number } }>(
    `/${q.kind}s/${q.q ? "search" : "trending"}`,
    q.q ? { ...params, q: q.q.toLowerCase() } : params,
    q.q ? CACHE_SECONDS.search : CACHE_SECONDS.trending,
  );
  const next = offset + body.data.length;
  return {
    items: body.data.map(giphyDTO).filter((g): g is GifDTO => g !== null),
    more: body.data.length === size && next < Math.min(body.pagination.total_count, MAX_OFFSET),
  };
}

async function klipyPage(q: GifQuery, page: number, size: number): Promise<Page> {
  const params = { page: String(page + 1), per_page: String(size), content_filter: "medium" };
  const body = await klipy<{ data: { data: KlipyItem[]; has_next: boolean } }>(
    `/${q.kind}s/${q.q ? "search" : "trending"}`,
    q.q ? { ...params, q: q.q.toLowerCase() } : params,
    q.q ? CACHE_SECONDS.search : CACHE_SECONDS.trending,
  );
  return {
    items: body.data.data.map((k) => klipyDTO(k, q.kind)).filter((g): g is GifDTO => g !== null),
    more: body.data.has_next,
  };
}

/**
 * GIFs or stickers from GIPHY and KLIPY, whichever have a key, taking turns in one list. When one
 * provider fails the other's results still come back; only when both fail does the search fail.
 */
export async function listGifs(q: GifQuery) {
  const page = Number(q.cursor ?? 0);
  const providers = [env.GIPHY_API_KEY && giphyPage, env.KLIPY_API_KEY && klipyPage].filter(
    (p): p is typeof giphyPage => !!p,
  );
  if (!providers.length) throw new AppError("GIFS_UNAVAILABLE", "GIF search is not set up on this server");

  const settled = await Promise.allSettled(providers.map((p) => p(q, page, PAGE / providers.length)));
  const pages = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  if (!pages.length) throw (settled[0] as PromiseRejectedResult).reason;
  const longest = Math.max(...pages.map((p) => p.items.length));
  return {
    items: Array.from({ length: longest }, (_, i) => pages.flatMap((p) => p.items[i] ?? [])).flat(),
    nextCursor: pages.some((p) => p.more) ? String(page + 1) : null,
  };
}

async function giphyVideo(gifId: string): Promise<Video> {
  if (!env.GIPHY_API_KEY) throw new AppError("GIFS_UNAVAILABLE", "GIF search is not set up on this server");
  const { data } = await giphy<{ data: GiphyGif }>(`/gifs/${gifId}`, {}, CACHE_SECONDS.gif);
  const video = data.images.original_mp4?.mp4 ? data.images.original_mp4 : data.images.fixed_width;
  if (!video?.mp4 || !new URL(video.mp4).hostname.endsWith(".giphy.com")) throw new AppError("GIF_NOT_FOUND");
  return { url: video.mp4, width: Number(video.width) || null, height: Number(video.height) || null, title: data.title };
}

async function klipyVideo(slug: string): Promise<Video> {
  if (!env.KLIPY_API_KEY) throw new AppError("GIFS_UNAVAILABLE", "GIF search is not set up on this server");
  const body = await klipy<{ data: { data: KlipyItem[] } }>("/gifs/items", { slugs: slug }, CACHE_SECONDS.gif);
  const item = body.data.data[0];
  const video = item?.file?.hd?.mp4 ?? item?.file?.md?.mp4;
  if (!item || !video?.url || !new URL(video.url).hostname.endsWith(".klipy.com")) throw new AppError("GIF_NOT_FOUND");
  return { url: video.url, width: video.width ?? null, height: video.height ?? null, title: item.title };
}

/** Downloads a GIF (as MP4) from whichever provider it came from into shared storage under `key`. */
async function storeGif(gifId: string, key: string) {
  const video = gifId.startsWith(KLIPY_ID) ? await klipyVideo(gifId.slice(KLIPY_ID.length)) : await giphyVideo(gifId);

  const res = await fetch(video.url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new AppError("GIFS_UNAVAILABLE", "Could not download the GIF");
  if (Number(res.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) {
    throw new AppError("GIFS_UNAVAILABLE", "This GIF is too large");
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError("GIFS_UNAVAILABLE", "This GIF is too large");

  await putObject(key, bytes, "video/mp4");
  return {
    name: `${(video.title || "GIF").slice(0, 190)}.mp4`,
    size: bytes.length,
    width: video.width,
    height: video.height,
  };
}

// ponytail: shared GIF files are never deleted; garbage-collect gifs/ objects no upload points to if storage matters
/**
 * Makes an upload for a GIPHY or KLIPY GIF, so the chat never depends on them to show it. Each GIF
 * is downloaded once and shared by every message that sends it; later sends cost no call to them.
 */
export async function saveGif(ownerId: string, gifId: string) {
  const mainKey = `${SHARED_PREFIX}${gifId}.mp4`;
  const meta =
    (await prisma.upload.findFirst({
      where: { kind: "gif", mainKey },
      select: { name: true, size: true, width: true, height: true },
    })) ?? (await storeGif(gifId, mainKey));

  const id = createId();
  return prisma.upload.create({
    data: {
      id,
      ownerId,
      kind: "gif",
      status: "ready",
      mime: "video/mp4",
      key: `u/${ownerId}/${id}/gif`,
      mainKey,
      mainMime: "video/mp4",
      ...meta,
    },
  });
}
