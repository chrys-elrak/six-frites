import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { redisConnection } from "../src/lib/queue.js";
import { processUpload } from "../src/media/process.js";
import { ensureBuiltinStickers } from "../src/services/stickers.js";
import { env } from "../src/env.js";
import { type Auth, chatHelpers, loginAs, makeAdmin, prisma, uniqueSub, useApp } from "./helpers.js";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const ctx = useApp();
const { get, call, send, makeFriends } = chatHelpers(ctx);

const lottie = (extra: object = {}) =>
  Buffer.from(JSON.stringify({ v: "5.7.4", fr: 30, ip: 0, op: 30, w: 512, h: 512, layers: [], ...extra }));

async function uploadSticker(who: Auth, body: Buffer, mime = "application/x-tgsticker", name = "party.tgs") {
  const presign = await call(who, "POST", "/v1/uploads/presign", { kind: "sticker", mime, size: body.length, name });
  expect(presign.statusCode, presign.body).toBe(201);
  const { url, headers, upload } = presign.json();
  expect((await fetch(url, { method: "PUT", body: new Uint8Array(body), headers })).status).toBe(200);
  await call(who, "POST", `/v1/uploads/${upload.id}/complete`);
  return upload.id as string;
}

describe("sticker packs", () => {
  it.skipIf(!hasFfmpeg)("keeps an animated PNG moving, as an animated WebP", async () => {
    const { host } = await makeFriends();
    const file = join(tmpdir(), `apng-${Date.now()}.png`);
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x320:rate=5", "-t", "1", "-plays", "0", "-f", "apng", file]);
    const uploadId = await uploadSticker(host, readFileSync(file), "image/png", "wave.png");
    rmSync(file);
    await processUpload(uploadId);
    makeAdmin(host);
    const pack = (await call(host, "POST", "/v1/sticker-packs", { title: "Moving" })).json();
    const sticker = (await call(host, "POST", `/v1/sticker-packs/${pack.id}/stickers`, { uploadId, emoji: "👋" })).json();
    expect(sticker).toMatchObject({ format: "image", width: 256, height: 256 });
    expect(Buffer.from(await (await fetch(sticker.url)).arrayBuffer()).includes("ANIM")).toBe(true);
  });

  it("are made from uploaded Lottie stickers that others can receive and save", async () => {
    const { host, guest, chatId } = await makeFriends();
    makeAdmin(host);
    const pack = (await call(host, "POST", "/v1/sticker-packs", { title: "Party" })).json();
    expect(pack).toMatchObject({ title: "Party", mine: true, saved: true, builtin: false, stickers: [] });

    const tracked = { assets: [{ id: "img", p: "https://tracker.example/pixel.png" }] };
    const uploadId = await uploadSticker(host, gzipSync(lottie(tracked)));
    await processUpload(uploadId);
    const stored = await prisma.upload.findUniqueOrThrow({ where: { id: uploadId } });
    expect(stored.storedBytes).toBeGreaterThan(stored.size);
    const added = await call(host, "POST", `/v1/sticker-packs/${pack.id}/stickers`, { uploadId, emoji: "🎉" });
    expect(added.statusCode, added.body).toBe(201);
    const sticker = added.json();
    expect(sticker).toMatchObject({ emoji: "🎉", format: "lottie", width: 512, height: 512 });
    const json = await (await fetch(sticker.url)).json();
    expect(json.layers).toEqual([]);
    expect(JSON.stringify(json)).not.toContain("tracker.example");

    const sent = (await send(host, chatId, "", { text: undefined, stickerId: sticker.id })).json();
    expect(sent).toMatchObject({ type: "sticker", text: null, sticker: { id: sticker.id, emoji: "🎉" } });
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items[0].sticker.url).toBeTruthy();
    expect((await send(host, chatId, "", { text: undefined, attachmentId: uploadId })).json().error.code).toBe(
      "VALIDATION_FAILED",
    );

    expect((await get(guest, `/v1/sticker-packs/${pack.id}`)).saved).toBe(false);
    expect((await call(guest, "PUT", `/v1/sticker-packs/${pack.id}/saved`)).statusCode).toBe(204);
    expect((await get(guest, "/v1/sticker-packs")).items.map((p: { id: string }) => p.id)).toContain(pack.id);
    await call(guest, "DELETE", `/v1/sticker-packs/${pack.id}/saved`);
    expect((await get(guest, "/v1/sticker-packs")).items.map((p: { id: string }) => p.id)).not.toContain(pack.id);
    expect(
      (await call(guest, "POST", `/v1/sticker-packs/${pack.id}/stickers`, { uploadId, emoji: "x" })).json().error.code,
    ).toBe("FORBIDDEN");

    expect((await call(host, "DELETE", `/v1/sticker-packs/${pack.id}/stickers/${sticker.id}`)).statusCode).toBe(204);
    expect((await get(host, `/v1/sticker-packs/${pack.id}`)).stickers).toEqual([]);
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items[0].sticker.id).toBe(sticker.id);
    expect((await send(host, chatId, "", { text: undefined, stickerId: sticker.id })).json().error.code).toBe(
      "STICKER_NOT_FOUND",
    );
  });

  it("lets only admins make packs and add stickers", async () => {
    const { host } = await makeFriends();
    expect((await call(host, "POST", "/v1/sticker-packs", { title: "Nope" })).json().error.code).toBe("FORBIDDEN");
    makeAdmin(host);
    const pack = (await call(host, "POST", "/v1/sticker-packs", { title: "Fine" })).json();
    const { guest } = await makeFriends();
    expect((await call(guest, "POST", `/v1/sticker-packs/${pack.id}/stickers`, { uploadId: "x", emoji: "🙂" })).json().error.code).toBe(
      "FORBIDDEN",
    );
    makeAdmin(guest);
    const uploadId = await uploadSticker(guest, gzipSync(lottie()));
    await processUpload(uploadId);
    expect((await call(guest, "POST", `/v1/sticker-packs/${pack.id}/stickers`, { uploadId, emoji: "🙂" })).statusCode).toBe(201);
  });

  it("turns down files that are not stickers", async () => {
    const { host } = await makeFriends();
    const big = await call(host, "POST", "/v1/uploads/presign", {
      kind: "sticker",
      mime: "application/json",
      size: 7 * 1024 * 1024,
      name: "big.json",
    });
    expect(big.json().error.code).toBe("VALIDATION_FAILED");

    const uploadId = await uploadSticker(host, Buffer.from('{"hello":"world"}'), "application/json", "nope.json");
    await expect(processUpload(uploadId)).rejects.toThrow(/Lottie/);
  });

  it("finds stickers by name or emoji, the ones you have first", async () => {
    await ensureBuiltinStickers();
    const { host, guest } = await makeFriends();
    makeAdmin(host);
    const pack = (await call(host, "POST", "/v1/sticker-packs", { title: "Mine" })).json();
    const uploadId = await uploadSticker(host, gzipSync(lottie()), "application/x-tgsticker", "Beach Wave.tgs");
    await processUpload(uploadId);
    await call(host, "POST", `/v1/sticker-packs/${pack.id}/stickers`, { uploadId, emoji: "😂" });

    const byName = (await get(host, "/v1/stickers/search?q=beach")).items;
    expect(byName[0]).toMatchObject({ packId: pack.id, emoji: "😂" });
    const byEmoji = (await get(host, "/v1/stickers/search?q=joy")).items.map((s: { id: string }) => s.id);
    expect(byEmoji[0]).not.toBe("noto-1f602");
    expect(byEmoji).not.toContain("noto-1f602");
    expect((await get(guest, "/v1/stickers/search?q=beach")).items.some((s: { packId: string }) => s.packId === pack.id)).toBe(false);
  });

  it("no longer offers the Noto packs, but messages that used them still show the sticker", async () => {
    await ensureBuiltinStickers();
    const { host, chatId } = await makeFriends();
    expect((await get(host, "/v1/sticker-packs")).items.some((p: { id: string }) => p.id === "noto-faces")).toBe(false);
    const faces = await get(host, "/v1/sticker-packs/noto-faces");
    expect(faces.stickers[0]).toMatchObject({
      id: "noto-1f602",
      emoji: "😂",
      format: "lottie",
      url: expect.stringMatching(/\/v1\/emoji\/1f602\/lottie\.json$/),
    });
    const sent = (await send(host, chatId, "", { text: undefined, stickerId: "noto-1f602" })).json();
    expect(sent).toMatchObject({ type: "sticker", sticker: { emoji: "😂" } });
  });
});

describe("GIFs", () => {
  const gif = (id: string, mp4: string) => ({
    id,
    title: "Cat typing",
    images: {
      fixed_width: {
        url: `https://media.giphy.com/${id}/200w.gif`,
        webp: `https://media.giphy.com/${id}/200w.webp`,
        width: "200",
        height: "150",
      },
      original_mp4: { mp4, width: "480", height: "360" },
    },
  });
  const klipyItem = (slug: string) => ({
    id: 1,
    slug,
    title: "Cat dance",
    file: {
      hd: {
        mp4: { url: `https://static.klipy.com/${slug}/hd.mp4`, width: 498, height: 280 },
        webp: { url: `https://static.klipy.com/${slug}/hd.webp`, width: 498, height: 280 },
      },
      md: { webp: { url: `https://static.klipy.com/${slug}/md.webp`, width: 300, height: 300 } },
      sm: { webp: { url: `https://static.klipy.com/${slug}/sm.webp`, width: 220, height: 124 } },
    },
  });
  const clip = Buffer.from("fake mp4 bytes");
  const redis = redisConnection();
  const unpause = () => redis.del("six-test:giphy:paused", "six-test:klipy:paused");
  beforeEach(unpause);
  afterAll(async () => {
    await unpause();
    redis.disconnect();
  });

  function mockGiphy() {
    const realFetch = globalThis.fetch;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const { hostname, pathname, searchParams } = new URL(url);
      if (hostname === "api.giphy.com" && (pathname.endsWith("/search") || pathname.endsWith("/trending"))) {
        const kind = pathname.includes("/stickers/") ? "sticker1" : "cat1";
        return Response.json({
          data: [gif(kind, `https://media.giphy.com/${kind}/giphy.mp4`)],
          pagination: { total_count: 1 },
        });
      }
      if (hostname === "api.klipy.com" && (pathname.endsWith("/search") || pathname.endsWith("/trending"))) {
        if (searchParams.get("q")?.startsWith("broken")) return new Response("down", { status: 500 });
        const slug = pathname.includes("/stickers/") ? "sticker-wave" : "cat-dance";
        return Response.json({ result: true, data: { data: [klipyItem(slug)], has_next: false } });
      }
      if (hostname === "api.klipy.com" && pathname.endsWith("/gifs/items")) {
        return Response.json({ result: true, data: { data: [klipyItem(searchParams.get("slugs")!)] } });
      }
      if (hostname === "static.klipy.com")
        return new Response(clip, { headers: { "content-length": String(clip.length) } });
      if (hostname === "api.giphy.com" && pathname.endsWith("/cat1")) {
        return Response.json({ data: gif("cat1", "https://media.giphy.com/cat1/giphy.mp4") });
      }
      if (hostname === "api.giphy.com" && pathname.endsWith("/evil1")) {
        return Response.json({ data: gif("evil1", "http://169.254.169.254/latest/meta-data") });
      }
      if (hostname === "media.giphy.com")
        return new Response(clip, { headers: { "content-length": String(clip.length) } });
      return realFetch(input, init);
    });
  }

  it("lets guests find a GIF and send it anonymously from the same stored copy", async () => {
    const spy = mockGiphy();
    try {
      const { host } = await makeFriends();
      const { askCode } = await get(host, "/v1/me");
      env.INVITE_ONLY = true;
      const walkIn: Auth = (await loginAs(ctx.app, uniqueSub("walk-in"), "web", { guest: true })).json();
      expect(walkIn.user).toMatchObject({ guest: true });
      expect((await get(walkIn, "/v1/gifs?q=Cats")).items.map((g: { id: string }) => g.id)).toContain("cat1");
      const ask = (body: object) => call(walkIn, "POST", `/v1/ask/${askCode}`, body);
      expect((await ask({ gifId: "cat1", photo: "data:image/png;base64,AAAA" })).statusCode).toBe(400);
      expect((await ask({ gifId: "cat1" })).statusCode).toBe(204);
      const [m] = (await get(host, "/v1/ask")).items;
      expect(m).toMatchObject({ text: "", photoUrl: null, gif: { width: 480, height: 360 } });
      expect(m.gif.url).not.toContain("giphy");
      expect(Buffer.from(await (await fetch(m.gif.url)).arrayBuffer()).equals(clip)).toBe(true);
    } finally {
      env.INVITE_ONLY = false;
      spy.mockRestore();
    }
  });

  it("searches through the server and sends a stored copy", async () => {
    const spy = mockGiphy();
    try {
      const { host, guest, chatId } = await makeFriends();
      const found = await get(host, "/v1/gifs?q=Cats");
      expect(found.items).toEqual([
        {
          id: "cat1",
          title: "Cat typing",
          previewUrl: "https://media.giphy.com/cat1/200w.webp",
          width: 200,
          height: 150,
        },
        {
          id: "klipy-cat-dance",
          title: "Cat dance",
          previewUrl: "https://static.klipy.com/cat-dance/sm.webp",
          width: 220,
          height: 124,
        },
      ]);
      expect(found.nextCursor).toBeNull();
      expect(JSON.stringify(found)).not.toContain("api_key");

      const sent = (await send(host, chatId, "", { text: undefined, gifId: "cat1" })).json();
      expect(sent).toMatchObject({
        type: "gif",
        attachment: { kind: "gif", status: "ready", width: 480, height: 360 },
      });
      const seen = (await get(guest, `/v1/chats/${chatId}/messages`)).items[0];
      expect(seen.attachment.url).not.toContain("giphy");
      const file = await fetch(seen.attachment.url);
      expect(Buffer.from(await file.arrayBuffer()).equals(clip)).toBe(true);
      expect(file.headers.get("cache-control")).toContain("immutable");

      const downloads = () => spy.mock.calls.filter(([u]) => String(u).includes("media.giphy.com")).length;
      const before = downloads();
      const again = (await send(guest, chatId, "", { text: undefined, gifId: "cat1" })).json();
      expect(downloads()).toBe(before);
      await call(host, "DELETE", `/v1/messages?ids=${sent.id}&scope=all`);
      const kept = await fetch((await get(guest, `/v1/chats/${chatId}/messages`)).items[0].attachment.url);
      expect(again.attachment.id).not.toBe(sent.attachment.id);
      expect(Buffer.from(await kept.arrayBuffer()).equals(clip)).toBe(true);

      expect((await send(host, chatId, "", { text: undefined, gifId: "evil1" })).json().error.code).toBe(
        "GIF_NOT_FOUND",
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("sends a KLIPY GIF and searches stickers from both providers", async () => {
    const spy = mockGiphy();
    try {
      const { host, chatId } = await makeFriends();
      const sent = (await send(host, chatId, "", { text: undefined, gifId: "klipy-cat-dance" })).json();
      expect(sent).toMatchObject({ type: "gif", attachment: { kind: "gif", width: 498, height: 280 } });
      expect(sent.attachment.url).not.toContain("static.klipy.com");

      const stickers = await get(host, `/v1/gifs?q=wave${Date.now()}&kind=sticker`);
      expect(stickers.items.map((g: { id: string }) => g.id)).toEqual(["sticker1", "klipy-sticker-wave"]);
      expect(stickers.items[1].previewUrl).toBe("https://static.klipy.com/sticker-wave/hd.webp");
    } finally {
      spy.mockRestore();
    }
  });

  it("still answers with GIPHY when KLIPY is down, and leaves KLIPY alone for a while", async () => {
    const spy = mockGiphy();
    const klipyCalls = () => spy.mock.calls.filter(([u]) => String(u).includes("api.klipy.com")).length;
    try {
      const { host } = await makeFriends();
      const found = await get(host, `/v1/gifs?q=broken${Date.now()}`);
      expect(found.items.map((g: { id: string }) => g.id)).toEqual(["cat1"]);

      const before = klipyCalls();
      const next = await get(host, `/v1/gifs?q=dogs${Date.now()}`);
      expect(next.items.map((g: { id: string }) => g.id)).toEqual(["cat1"]);
      expect(klipyCalls()).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });

  it("shares a cached search between spellings and doesn't search a single letter", async () => {
    const spy = mockGiphy();
    const calls = (part: string) => spy.mock.calls.filter(([u]) => String(u).includes(part)).length;
    try {
      const { host } = await makeFriends();
      const tag = Date.now();
      await get(host, `/v1/gifs?q=Happy%20%20Cat${tag}%20`);
      const searches = calls("/gifs/search");
      await get(host, `/v1/gifs?q=happy%20cat${tag}`);
      expect(calls("/gifs/search")).toBe(searches);

      await get(host, "/v1/gifs?q=h");
      expect(calls("/gifs/search")).toBe(searches);
    } finally {
      spy.mockRestore();
    }
  });
});
