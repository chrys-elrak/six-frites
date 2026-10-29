import { describe, expect, it } from "vitest";
import { headObject, putObject } from "../src/lib/storage.js";
import { type Auth, chatHelpers, loginAs, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send, makeFriends } = chatHelpers(ctx);

const admin = async (): Promise<Auth> => (await loginAs(ctx.app, "the-admin")).json();

describe("admin access", () => {
  it("is only for the emails in ADMIN_EMAILS", async () => {
    const someone = await signUp("someone");
    expect((await get(someone, "/v1/admin/stats")).error.code).toBe("FORBIDDEN");
    const boss = await admin();
    expect(await get(boss, "/v1/admin/me")).toEqual({ admin: true });
    const stats = await get(boss, "/v1/admin/stats");
    expect(stats.users).toBeGreaterThan(0);
    expect(stats.signups).toHaveLength(30);
  });
});

describe("reports", () => {
  it("copy the reported message with its context, and acting on them deletes it and bans the sender", async () => {
    const { host, guest, chatId } = await makeFriends();
    await send(guest, chatId, "hi");
    const bad = (await send(host, chatId, "something nasty")).json();
    await send(guest, chatId, "excuse me?");

    expect(
      (await call(host, "POST", "/v1/reports", { messageId: bad.id, reason: "harassment" })).json().error.code,
    ).toBe("VALIDATION_FAILED");
    const filed = await call(guest, "POST", "/v1/reports", { messageId: bad.id, reason: "harassment", note: "rude" });
    expect(filed.statusCode, filed.body).toBe(204);
    await call(guest, "POST", "/v1/reports", { messageId: bad.id, reason: "harassment" });
    await call(host, "PATCH", `/v1/messages/${bad.id}`, { text: "nothing to see" });

    const boss = await admin();
    const open = (await get(boss, "/v1/admin/reports")).items.filter(
      (r: { target: { id: string } }) => r.target.id === host.user.id,
    );
    expect(open).toHaveLength(1);
    const [report] = open;
    expect(report).toMatchObject({
      reason: "harassment",
      note: "rude",
      status: "open",
      reporter: { id: guest.user.id },
    });
    expect(report.messages.map((m: { text: string }) => m.text)).toEqual(["hi", "something nasty", "excuse me?"]);
    expect(report.messages.find((m: { reported: boolean }) => m.reported).id).toBe(bad.id);

    const resolved = await call(boss, "POST", `/v1/admin/reports/${report.id}/resolve`, {
      deleteMessage: true,
      banUser: true,
    });
    expect(resolved.json()).toMatchObject({ status: "actioned", resolution: "Message deleted, User banned" });
    const tomb = (await get(guest, `/v1/chats/${chatId}/messages`)).items.find((m: { id: string }) => m.id === bad.id);
    expect(tomb.deletedAt).not.toBeNull();

    expect((await get(host, "/v1/chats")).error.code).toBe("SESSION_REVOKED");
    const again = await prisma.user.findUniqueOrThrow({ where: { id: host.user.id } });
    expect((await loginAs(ctx.app, again.googleSub)).json().error.code).toBe("ACCOUNT_BANNED");
    expect((await call(boss, "POST", `/v1/admin/reports/${report.id}/resolve`, {})).json().error.code).toBe("CONFLICT");
    expect((await get(boss, "/v1/admin/reports?status=resolved")).items.map((r: { id: string }) => r.id)).toContain(
      report.id,
    );
  });

  it("can be about a person you share a chat with, and nobody else", async () => {
    const { host, guest } = await makeFriends();
    const stranger = await signUp("stranger");
    expect((await call(guest, "POST", "/v1/reports", { userId: host.user.id, reason: "spam" })).statusCode).toBe(204);
    expect(
      (await call(guest, "POST", "/v1/reports", { userId: stranger.user.id, reason: "spam" })).json().error.code,
    ).toBe("USER_NOT_FOUND");
  });
});

describe("user moderation", () => {
  it("searches, bans, unbans and never bans an admin", async () => {
    const boss = await admin();
    const target = await signUp("Mallory");
    const found = (await get(boss, "/v1/admin/users?q=mallory")).items;
    expect(found.map((u: { id: string }) => u.id)).toContain(target.user.id);

    const banned = await call(boss, "POST", `/v1/admin/users/${target.user.id}/ban`, { reason: "spam bot" });
    expect(banned.json()).toMatchObject({ banReason: "spam bot", activeSessions: 0 });
    expect((await get(boss, "/v1/admin/users?banned=true")).items.map((u: { id: string }) => u.id)).toContain(
      target.user.id,
    );

    expect((await call(boss, "POST", `/v1/admin/users/${target.user.id}/unban`)).json().bannedAt).toBeNull();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect((await loginAs(ctx.app, user.googleSub)).statusCode).toBe(200);

    expect(
      (await call(boss, "POST", `/v1/admin/users/${boss.user.id}/ban`, { reason: "oops" })).json().error.code,
    ).toBe("FORBIDDEN");
  });
});

describe("sticker moderation", () => {
  it("takes a pack down everywhere, including messages that already show it", async () => {
    const { host, guest, chatId } = await makeFriends();
    const pack = (await call(host, "POST", "/v1/sticker-packs", { title: "Edgy" })).json();
    const sticker = await prisma.sticker.create({
      data: { packId: pack.id, emoji: "😈", lottieUrl: "https://example.com/edgy.json" },
    });
    const sent = (await send(host, chatId, "", { text: undefined, stickerId: sticker.id })).json();
    expect(sent.sticker.url).toBe("https://example.com/edgy.json");

    const boss = await admin();
    expect((await get(boss, "/v1/admin/sticker-packs")).items.map((p: { id: string }) => p.id)).toContain(pack.id);
    expect((await call(boss, "DELETE", `/v1/admin/sticker-packs/${pack.id}`)).statusCode).toBe(204);

    expect((await get(guest, `/v1/sticker-packs/${pack.id}`)).error.code).toBe("STICKER_PACK_NOT_FOUND");
    expect((await get(host, "/v1/sticker-packs")).items.map((p: { id: string }) => p.id)).not.toContain(pack.id);
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items[0].sticker.url).toBeNull();
    expect((await send(host, chatId, "", { text: undefined, stickerId: sticker.id })).json().error.code).toBe(
      "STICKER_NOT_FOUND",
    );
  });
});

describe("official sticker packs", () => {
  it("are made by admins, show up for everyone, and can be tidied without blanking old messages", async () => {
    const boss = await admin();
    const { host, guest, chatId } = await makeFriends();
    expect((await call(host, "POST", "/v1/admin/sticker-packs", { title: "Mine" })).json().error.code).toBe(
      "FORBIDDEN",
    );

    const pack = (await call(boss, "POST", "/v1/admin/sticker-packs", { title: "Six Frites" })).json();
    expect(pack).toMatchObject({ title: "Six Frites", official: true });
    const upload = await prisma.upload.create({
      data: {
        ownerId: boss.user.id,
        kind: "sticker",
        status: "ready",
        name: "fries.json",
        mime: "application/json",
        mainMime: "application/json",
        size: 10,
        key: `test/${Math.random()}`,
      },
    });
    const added = await call(boss, "POST", `/v1/admin/sticker-packs/${pack.id}/stickers`, {
      uploadId: upload.id,
      emoji: "🍟",
    });
    expect(added.statusCode, added.body).toBe(201);
    const sticker = added.json();

    const theirs = (await get(guest, "/v1/sticker-packs")).items.find((p: { id: string }) => p.id === pack.id);
    expect(theirs).toMatchObject({ builtin: true, saved: true, stickers: [{ id: sticker.id, format: "lottie" }] });
    expect(
      (
        await call(boss, "POST", "/v1/admin/sticker-packs/noto-faces/stickers", { uploadId: upload.id, emoji: "x" })
      ).json().error.code,
    ).toBe("STICKER_PACK_NOT_FOUND");

    await send(host, chatId, "", { text: undefined, stickerId: sticker.id });
    expect((await call(boss, "DELETE", `/v1/admin/stickers/${sticker.id}`)).statusCode).toBe(204);
    expect((await get(guest, `/v1/sticker-packs/${pack.id}`)).stickers).toEqual([]);
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items[0].sticker.url).not.toBeNull();
    expect((await get(boss, "/v1/admin/sticker-packs?official=true")).items.map((p: { id: string }) => p.id)).toContain(
      pack.id,
    );
  });
});

describe("storage", () => {
  it("adds up each person's uploads, processed copies included, and ranks the biggest", async () => {
    const boss = await admin();
    const hoarder = await signUp("Hoarder");
    const files = [
      { size: 4_000_000, storedBytes: 9_000_000 },
      { size: 1_000_000, storedBytes: null },
    ];
    for (const f of files) {
      await prisma.upload.create({
        data: {
          ownerId: hoarder.user.id,
          kind: "video",
          status: "ready",
          name: "v.mp4",
          mime: "video/mp4",
          key: `test/${Math.random()}`,
          ...f,
        },
      });
    }
    await prisma.upload.create({
      data: {
        ownerId: hoarder.user.id,
        kind: "gif",
        status: "ready",
        name: "g.mp4",
        mime: "video/mp4",
        size: 500,
        key: `test/${Math.random()}`,
      },
    });

    const [found] = (await get(boss, "/v1/admin/users?q=hoarder")).items;
    expect(found.storageBytes).toBe(10_000_000);
    const stats = await get(boss, "/v1/admin/stats");
    expect(stats.topStorage[0]).toMatchObject({ user: { id: hoarder.user.id }, bytes: 10_000_000 });
    expect(stats.storageBytes).toBeGreaterThanOrEqual(10_000_000);
    expect(stats.gifCacheBytes).toBeGreaterThanOrEqual(500);
  });
});

describe("ads", () => {
  it("can be turned off for some people and back on", async () => {
    const a = await signUp("ads-a");
    const b = await signUp("ads-b");
    expect((await get(a, "/v1/me")).ads).toBe(true);
    expect((await call(a, "POST", "/v1/admin/users/ads", { userIds: [b.user.id], ads: false })).statusCode).toBe(403);

    const boss = await admin();
    const off = await call(boss, "POST", "/v1/admin/users/ads", { userIds: [a.user.id, b.user.id], ads: false });
    expect(off.statusCode, off.body).toBe(204);
    expect((await get(a, "/v1/me")).ads).toBe(false);
    expect((await get(boss, `/v1/admin/users/${b.user.id}`)).ads).toBe(false);
    const event = await prisma.changeEvent.findFirst({ where: { userId: a.user.id, type: "me.updated" }, orderBy: { id: "desc" } });
    expect(event?.payload).toMatchObject({ ads: false });

    await call(boss, "POST", "/v1/admin/users/ads", { userIds: [b.user.id], ads: true });
    expect((await get(b, "/v1/me")).ads).toBe(true);
    expect((await get(a, "/v1/me")).ads).toBe(false);
  });
});

describe("large files", () => {
  it("can be sent under an encrypted caption, listed, and removed, leaving the message saying so", async () => {
    const { host, guest, chatId } = await makeFriends();
    const id = `big${Date.now().toString(36)}`;
    const key = `u/${host.user.id}/${id}/original`;
    await putObject(key, Buffer.from("pretend this is 200 MB"), "video/mp4");
    await prisma.upload.create({
      data: { id, ownerId: host.user.id, kind: "file", name: "holiday.mp4", mime: "video/mp4", size: 200 * 1024 * 1024, storedBytes: 22, key, status: "ready" },
    });
    const sent = (await send(host, chatId, "the video", { attachmentId: id })).json();
    expect(sent.attachment).toMatchObject({ id, status: "ready", encrypted: false });

    const boss = await admin();
    expect((await get(guest, "/v1/admin/large-files")).error.code).toBe("FORBIDDEN");
    const listed = (await get(boss, "/v1/admin/large-files")).items.find((f: { id: string }) => f.id === id);
    expect(listed).toMatchObject({ name: "holiday.mp4", status: "ready", owner: { id: host.user.id } });

    expect((await call(boss, "DELETE", `/v1/admin/large-files/${id}`)).statusCode).toBe(204);
    expect(await headObject(key)).toBeNull();
    const seen = (await get(guest, `/v1/chats/${chatId}/messages`)).items.find((m: { id: string }) => m.id === sent.id);
    expect(seen.attachment).toMatchObject({ id, status: "removed", url: null });
    expect((await get(boss, "/v1/admin/large-files")).items.find((f: { id: string }) => f.id === id).status).toBe("removed");
    expect((await get(guest, `/v1/chats/${chatId}/messages?only=files`)).items).toEqual([]);
  });
});
