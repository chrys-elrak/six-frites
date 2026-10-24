import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { processUpload } from "../src/media/process.js";
import { ensureBuiltinStickers } from "../src/services/stickers.js";
import { type Auth, chatHelpers, prisma, useApp } from "./helpers.js";

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
  it("are made from uploaded Lottie stickers that others can receive and save", async () => {
    const { host, guest, chatId } = await makeFriends();
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

  it("turns down files that are not stickers", async () => {
    const { host } = await makeFriends();
    const big = await call(host, "POST", "/v1/uploads/presign", {
      kind: "sticker",
      mime: "application/json",
      size: 600 * 1024,
      name: "big.json",
    });
    expect(big.json().error.code).toBe("VALIDATION_FAILED");

    const uploadId = await uploadSticker(host, Buffer.from('{"hello":"world"}'), "application/json", "nope.json");
    await expect(processUpload(uploadId)).rejects.toThrow(/Lottie/);
  });

  it("includes the built-in Noto packs for everyone", async () => {
    await ensureBuiltinStickers();
    const { host, chatId } = await makeFriends();
    const [faces] = (await get(host, "/v1/sticker-packs")).items;
    expect(faces).toMatchObject({ id: "noto-faces", builtin: true, saved: true, mine: false });
    expect(faces.stickers[0]).toMatchObject({
      id: "noto-1f602",
      emoji: "😂",
      format: "lottie",
      url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/lottie.json",
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
  const clip = Buffer.from("fake mp4 bytes");

  function mockGiphy() {
    const realFetch = globalThis.fetch;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const { hostname, pathname } = new URL(url);
      if (hostname === "api.giphy.com" && pathname.endsWith("/search")) {
        return Response.json({
          data: [gif("cat1", "https://media.giphy.com/cat1/giphy.mp4")],
          pagination: { total_count: 1 },
        });
      }
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
      ]);
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
});
