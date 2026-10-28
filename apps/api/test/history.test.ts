import { describe, expect, it } from "vitest";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { get, send, makeFriends } = chatHelpers(ctx);

describe("message history", () => {
  it("loads everything down to a message in one page, to jump to it", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = [];
    for (let i = 0; i < 40; i++) sent.push((await send(i % 2 ? host : guest, chatId, `m${i}`)).json());

    const page = await get(guest, `/v1/chats/${chatId}/messages?limit=5&until=${sent[3].id}`);
    expect(page.items.map((m: { id: string }) => m.id)).toContain(sent[3].id);
    expect(page.items.at(-1).id).toBe(sent[3].id);
    expect(page.nextCursor).toBe(sent[3].id);
    expect((await get(guest, `/v1/chats/${chatId}/messages?limit=5`)).items).toHaveLength(5);
  });

  it("narrows to a date range and to messages that can hold text", async () => {
    const { host, guest, chatId } = await makeFriends();
    const january = (await send(host, chatId, "happy new year")).json();
    const february = (await send(host, chatId, "valentine")).json();
    await send(host, chatId, "gone soon", { ephemeral: { maxViews: 1 } });
    await prisma.message.update({ where: { id: january.id }, data: { createdAt: new Date("2026-01-01T10:00:00Z") } });
    await prisma.message.update({ where: { id: february.id }, data: { createdAt: new Date("2026-02-14T10:00:00Z") } });

    const ids = async (query: string) =>
      (await get(guest, `/v1/chats/${chatId}/messages?${query}`)).items.map((m: { id: string }) => m.id);
    expect(await ids("from=2026-02-01T00:00:00Z&to=2026-03-01T00:00:00Z")).toEqual([february.id]);
    expect(await ids("only=text&to=2026-03-01T00:00:00Z")).toEqual([february.id, january.id]);
    expect(await ids("only=text")).toEqual([february.id, january.id]);
    expect((await ids("limit=10")).length).toBeGreaterThan(2);
  });
});
