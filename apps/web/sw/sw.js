import { MEDIA_CHUNK, decryptMediaChunk, fromB64, sealedChunkStart } from "@six/crypto";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : null;
  if (!data) return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icon-192.png",
      badge: "/icon.svg",
      tag: data.chatId,
      renotify: true,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => "focus" in w);
      if (open) {
        await open.focus();
        open.postMessage({ type: "open", url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

const WINDOW = 16;
const prefixes = new Map();

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/stream/")) return;
  event.respondWith(stream(event.clientId, decodeURIComponent(url.pathname.slice(8)), event.request.headers.get("range")));
});

/** Asks the page that opened the video for its download link and key, which never leave the browser. */
async function streamInfo(clientId, id) {
  const first = clientId ? await self.clients.get(clientId) : null;
  const others = await self.clients.matchAll({ type: "window" });
  for (const client of [first, ...others.filter((c) => c.id !== clientId)]) {
    if (!client) continue;
    const info = await new Promise((resolve) => {
      const channel = new MessageChannel();
      const done = (info) => {
        channel.port1.close();
        resolve(info);
      };
      channel.port1.onmessage = (e) => done(e.data);
      client.postMessage({ type: "stream", id }, [channel.port2]);
      setTimeout(() => done(null), 2000);
    });
    if (info) return info;
  }
  return null;
}

async function download(url, from, to) {
  const res = await fetch(url, { headers: { range: `bytes=${from}-${to}` } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return res.status === 206 ? bytes : bytes.subarray(from, to + 1);
}

/**
 * Answers the player's byte ranges of an encrypted video by downloading and decrypting only the 64 KB chunks
 * they cover, a few at a time as it reads, so playback starts without waiting for the whole file.
 */
async function stream(clientId, id, range) {
  const info = await streamInfo(clientId, id);
  if (!info) return new Response(null, { status: 404 });
  const { url, size, mime } = info;
  const key = fromB64(info.key);
  const asked = /^bytes=(\d+)-(\d*)$/.exec(range ?? "");
  const start = asked ? Number(asked[1]) : 0;
  const end = asked && asked[2] ? Math.min(Number(asked[2]), size - 1) : size - 1;
  if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });

  const chunks = Math.max(1, Math.ceil(size / MEDIA_CHUNK));
  const last = Math.floor(end / MEDIA_CHUNK);
  let next = Math.floor(start / MEDIA_CHUNK);
  let skip = start - next * MEDIA_CHUNK;
  let left = end - start + 1;
  const body = new ReadableStream({
    async pull(controller) {
      if (next > last) return controller.close();
      const upto = Math.min(last, next + WINDOW - 1);
      let prefix = prefixes.get(id);
      if (!prefix && next > 0) prefix = await download(url, 0, 15);
      let data = await download(url, prefix ? sealedChunkStart(next) : 0, sealedChunkStart(upto + 1) - 1);
      if (!prefix) {
        prefix = data.slice(0, 16);
        data = data.subarray(16);
      }
      prefixes.set(id, prefix);
      for (let i = next; i <= upto; i++) {
        const at = sealedChunkStart(i) - sealedChunkStart(next);
        let plain = decryptMediaChunk(key, prefix, i, i === chunks - 1, data.subarray(at, at + sealedChunkStart(i + 1) - sealedChunkStart(i)));
        plain = plain.subarray(skip, skip + left);
        skip = 0;
        left -= plain.length;
        controller.enqueue(plain);
      }
      next = upto + 1;
    },
  });
  const headers = { "content-type": mime, "content-length": String(end - start + 1), "accept-ranges": "bytes" };
  if (!asked) return new Response(body, { status: 200, headers });
  return new Response(body, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}` } });
}
