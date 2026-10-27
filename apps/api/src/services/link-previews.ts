import { lookup } from "node:dns";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, type LookupFunction, isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { LinkPreviewDTO } from "@six/shared";
import type { Redis } from "ioredis";
import { env } from "../env.js";
import { redisConnection } from "../lib/queue.js";
import { THUMB, ffmpeg } from "../media/ffmpeg.js";

const PAGE_BYTES = 512 * 1024;
const IMAGE_BYTES = 5 * 1024 * 1024;
const CACHE_SECONDS = { found: 24 * 60 * 60, missing: 60 * 60 };
const USER_AGENT = "Mozilla/5.0 (compatible; SixFritesBot/1.0; link preview)";

const internal = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  internal.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  internal.addSubnet(net, prefix, "ipv6");
}

const isInternal = (address: string) => internal.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");

/** dns.lookup that refuses hosts resolving to the server's own network, checked on the address actually dialled. */
const publicLookup: LookupFunction = (hostname, options, callback) =>
  lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    if (addresses.some((a) => isInternal(a.address))) return callback(new Error(`${hostname} is not a public host`), "");
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  });

interface Fetched {
  url: URL;
  type: string;
  body: Buffer;
  cut: boolean;
}

/** GETs a public web page by hand so every redirect hop goes through publicLookup; reads at most maxBytes. */
async function get(url: URL, accept: string, maxBytes: number, hops = 3): Promise<Fetched> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Not a web link: ${url.protocol}`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isInternal(host)) throw new Error(`${host} is not a public host`);

  const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
    (url.protocol === "https:" ? https : http)
      .get(
        url,
        {
          headers: { "user-agent": USER_AGENT, accept, "accept-encoding": "gzip, deflate, br" },
          lookup: publicLookup,
          signal: AbortSignal.timeout(8000),
        },
        resolve,
      )
      .on("error", reject);
  });
  const status = res.statusCode ?? 0;
  if (status >= 300 && status < 400 && res.headers.location && hops > 0) {
    res.resume();
    return get(new URL(res.headers.location, url), accept, maxBytes, hops - 1);
  }
  if (status !== 200) {
    res.resume();
    throw new Error(`${url.host} answered ${status}`);
  }

  const encoding = res.headers["content-encoding"];
  const stream: Readable =
    encoding === "gzip"
      ? res.pipe(createGunzip())
      : encoding === "br"
        ? res.pipe(createBrotliDecompress())
        : encoding === "deflate"
          ? res.pipe(createInflate())
          : res;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
    size += (chunk as Buffer).length;
    if (size >= maxBytes) break;
  }
  res.destroy();
  return { url, type: res.headers["content-type"] ?? "", body: Buffer.concat(chunks), cut: size >= maxBytes };
}

function decodeHtml({ type, body }: Fetched) {
  const charset =
    /charset=["']?([\w-]+)/i.exec(type)?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(body.toString("latin1", 0, 4096))?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return body.toString("utf8");
  }
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const clean = (s: string) =>
  s
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, e: string) => {
      if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? all;
      const code = Number(e[1] === "x" || e[1] === "X" ? `0${e.slice(1)}` : e.slice(1));
      return code <= 0x10ffff ? String.fromCodePoint(code) : all;
    })
    .replace(/\s+/g, " ")
    .trim();

/** Reads a page's Open Graph and Twitter card tags, falling back to <title> and the description meta. */
export function readPreview(html: string, url: URL) {
  const meta = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = (name: string) =>
      new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i")
        .exec(tag)
        ?.slice(1)
        .find((v) => v !== undefined);
    const key = (attr("property") ?? attr("name"))?.toLowerCase();
    const content = attr("content");
    if (key && content && !meta.has(key)) meta.set(key, clean(content));
  }
  const pick = (...keys: string[]) => keys.map((k) => meta.get(k)).find(Boolean) ?? null;

  const title = pick("og:title", "twitter:title") ?? clean(/<title[^>]*>([^<]*)/i.exec(html)?.[1] ?? "");
  if (!title) return null;
  const image = pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src");
  return {
    siteName: pick("og:site_name") ?? url.hostname.replace(/^www\./, ""),
    title: title.slice(0, 200),
    description: pick("og:description", "twitter:description", "description")?.slice(0, 300) ?? null,
    image: image && URL.canParse(image, url) ? new URL(image, url) : null,
  };
}

/** ffmpeg's demuxer for the picture's real format, named up front so it never probes into playlists that fetch other URLs. */
function demuxer(b: Buffer) {
  if (b.subarray(0, 3).toString("hex") === "ffd8ff") return "jpeg_pipe";
  if (b.subarray(0, 4).toString("hex") === "89504e47") return "png_pipe";
  if (b.subarray(0, 3).toString("latin1") === "GIF") return "gif";
  if (b.subarray(8, 12).toString("latin1") === "WEBP") return "webp_pipe";
  return null;
}

async function thumbnail(url: URL) {
  const { body, cut } = await get(url, "image/*", IMAGE_BYTES);
  const format = demuxer(body);
  if (cut || !format) return null;
  const dir = await mkdtemp(join(tmpdir(), "link-preview-"));
  try {
    await writeFile(join(dir, "in"), body);
    await ffmpeg(["-f", format, "-i", join(dir, "in"), ...THUMB, join(dir, "out.webp")]);
    return `data:image/webp;base64,${(await readFile(join(dir, "out.webp"))).toString("base64")}`;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function build(url: URL): Promise<LinkPreviewDTO | null> {
  const page = await get(url, "text/html,application/xhtml+xml", PAGE_BYTES);
  if (!/html/i.test(page.type)) return null;
  const found = readPreview(decodeHtml(page), page.url);
  if (!found) return null;
  return { ...found, image: found.image && (await thumbnail(found.image).catch(() => null)) };
}

let client: Redis | null = null;
const redis = () => (client ??= redisConnection());

/** A link's preview card, or null when the page has none or can't be reached. */
export async function linkPreview(link: string): Promise<LinkPreviewDTO | null> {
  const key = `${env.QUEUE_PREFIX}:link-preview:${link}`;
  const cached = await redis().get(key);
  if (cached) return JSON.parse(cached) as LinkPreviewDTO | null;
  const preview = await build(new URL(link)).catch(() => null);
  await redis().set(key, JSON.stringify(preview), "EX", preview ? CACHE_SECONDS.found : CACHE_SECONDS.missing);
  return preview;
}
