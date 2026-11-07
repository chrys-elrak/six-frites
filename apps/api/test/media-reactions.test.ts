import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { redisConnection } from "../src/lib/queue.js";
import { ensureBuiltinStickers } from "../src/services/stickers.js";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { call, send, makeFriends } = chatHelpers(ctx);

const react = (who: Parameters<typeof call>[0], id: string, body: object) => call(who, "POST", `/v1/messages/${id}/reactions`, body);
const unreact = (who: Parameters<typeof call>[0], id: string, key: string) =>
  call(who, "DELETE", `/v1/messages/${id}/reactions/${encodeURIComponent(key)}`);

describe("sticker and GIF reactions", () => {
  const redis = redisConnection();
  const unpause = () => redis.del("six-test:giphy:paused", "six-test:klipy:paused");
  beforeEach(unpause);
  beforeAll(() => ensureBuiltinStickers());
  afterAll(async () => {
    await unpause();
    redis.disconnect();
  });

  it("reacts with a sticker, shows it to both, and takes it off by its key", async () => {
    const { host, guest, chatId } = await makeFriends();
    const m = (await send(host, chatId, "look")).json();

    expect((await react(guest, m.id, { emoji: "😂", stickerId: "noto-1f602" })).statusCode).toBe(400);
    expect((await react(guest, m.id, { stickerId: "nope" })).json().error.code).toBe("STICKER_NOT_FOUND");

    const reacted = (await react(guest, m.id, { stickerId: "noto-1f602" })).json();
    expect(reacted.reactions).toEqual([
      { emoji: "sticker:noto-1f602", userIds: [guest.user.id], sticker: expect.objectContaining({ emoji: "😂" }) },
    ]);
    const again = (await react(host, m.id, { stickerId: "noto-1f602" })).json();
    expect(again.reactions[0].userIds).toEqual([guest.user.id, host.user.id]);

    const off = (await unreact(guest, m.id, "sticker:noto-1f602")).json();
    expect(off.reactions[0].userIds).toEqual([host.user.id]);
    expect((await unreact(guest, m.id, "sticker:../../etc")).statusCode).toBe(400);
  });

  it("reacts with a GIF kept in our own storage", async () => {
    const clip = Buffer.from("fake mp4 bytes");
    const realFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const { hostname, pathname } = new URL(input instanceof Request ? input.url : String(input));
      if (hostname === "api.giphy.com" && pathname.endsWith("/cat1")) {
        return Response.json({
          data: {
            id: "cat1",
            title: "Cat",
            images: {
              fixed_width: { url: "https://media.giphy.com/cat1/200w.gif", webp: "https://media.giphy.com/cat1/200w.webp", width: "200", height: "150" },
              original_mp4: { mp4: "https://media.giphy.com/cat1/giphy.mp4", width: "480", height: "360" },
            },
          },
        });
      }
      if (hostname === "media.giphy.com") return new Response(clip, { headers: { "content-length": String(clip.length) } });
      return realFetch(input, init);
    });
    try {
      const { host, guest, chatId } = await makeFriends();
      const m = (await send(host, chatId, "dance?")).json();
      const reacted = (await react(guest, m.id, { gifId: "cat1" })).json();
      expect(reacted.reactions).toEqual([
        { emoji: "gif:cat1", userIds: [guest.user.id], gif: { url: expect.stringContaining("cat1"), width: 480, height: 360 } },
      ]);
      expect(await prisma.messageReaction.count({ where: { messageId: m.id, gifKey: { not: null } } })).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
