import { createId } from "@paralleldrive/cuid2";
import { AppError, type GifDTO, type GifQuery, MAX_UPLOAD_BYTES } from "@six/shared";
import type { Redis } from "ioredis";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { putObject } from "../lib/storage.js";

const GIPHY = "https://api.giphy.com/v1/gifs";
const PAGE = 24;
const MAX_OFFSET = 4999;
const CACHE_SECONDS = 10 * 60;

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

let client: Redis | null = null;
const redis = () => (client ??= redisConnection());

/** Calls GIPHY with the server's key, caching answers so search-as-you-type stays within its rate limit. */
async function giphy<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!env.GIPHY_API_KEY) throw new AppError("GIFS_UNAVAILABLE", "GIF search is not set up on this server");
  const query = new URLSearchParams(params).toString();
  const cacheKey = `${env.QUEUE_PREFIX}:giphy:${path}?${query}`;
  const cached = await redis().get(cacheKey);
  if (cached) return JSON.parse(cached) as T;

  const url = `${GIPHY}${path}?${new URLSearchParams({ ...params, api_key: env.GIPHY_API_KEY })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw res.status === 404 || (res.status === 400 && path !== "/search" && path !== "/trending")
      ? new AppError("GIF_NOT_FOUND")
      : new AppError("GIFS_UNAVAILABLE", `GIPHY answered ${res.status}`);
  }
  const body = await res.text();
  await redis().set(cacheKey, body, "EX", CACHE_SECONDS);
  return JSON.parse(body) as T;
}

function toGifDTO(g: GiphyGif): GifDTO | null {
  const preview = g.images.fixed_width;
  const url = preview?.webp ?? preview?.url;
  if (!url || !preview?.width || !preview.height) return null;
  return { id: g.id, title: g.title, previewUrl: url, width: Number(preview.width), height: Number(preview.height) };
}

export async function listGifs(q: GifQuery) {
  const offset = Number(q.cursor ?? 0);
  const params = { limit: String(PAGE), offset: String(offset), rating: "pg-13" };
  const body = await giphy<{ data: GiphyGif[]; pagination: { total_count: number } }>(
    q.q ? "/search" : "/trending",
    q.q ? { ...params, q: q.q.toLowerCase() } : params,
  );
  const next = offset + body.data.length;
  const more = body.data.length === PAGE && next < Math.min(body.pagination.total_count, MAX_OFFSET);
  return {
    items: body.data.map(toGifDTO).filter((g): g is GifDTO => g !== null),
    nextCursor: more ? String(next) : null,
  };
}

/** Downloads a GIF from GIPHY (as MP4) into storage, so the chat never depends on GIPHY to show it. */
export async function saveGif(ownerId: string, gifId: string) {
  const { data } = await giphy<{ data: GiphyGif }>(`/${gifId}`);
  const video = data.images.original_mp4?.mp4 ? data.images.original_mp4 : data.images.fixed_width;
  if (!video?.mp4 || !new URL(video.mp4).hostname.endsWith(".giphy.com")) throw new AppError("GIF_NOT_FOUND");

  const res = await fetch(video.mp4, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new AppError("GIFS_UNAVAILABLE", "Could not download the GIF");
  if (Number(res.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) {
    throw new AppError("GIFS_UNAVAILABLE", "This GIF is too large");
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError("GIFS_UNAVAILABLE", "This GIF is too large");

  const id = createId();
  const key = `u/${ownerId}/${id}/original`;
  await putObject(key, bytes, "video/mp4");
  return prisma.upload.create({
    data: {
      id,
      ownerId,
      kind: "gif",
      status: "ready",
      name: `${(data.title || "GIF").slice(0, 190)}.mp4`,
      mime: "video/mp4",
      size: bytes.length,
      key,
      width: Number(video.width) || null,
      height: Number(video.height) || null,
    },
  });
}
