import type { AddressInfo } from "node:net";
import { strToU8, zipSync } from "fflate";
import { io as connect } from "socket.io-client";
import { describe, expect, it, vi } from "vitest";
import { runStickerImport } from "../src/services/sticker-import.js";
import { headObject, putObject } from "../src/lib/storage.js";
import { liftExpiredBans } from "../src/services/admin.js";
import { createSocketServer } from "../src/socket/index.js";
import { pairAlias } from "../src/services/users.js";
import { totp, totpStep } from "../src/lib/totp.js";
import { ADMIN_SECRET, type Auth, asAdmin, bearer, chatHelpers, loginAs, makeAdmin, prisma, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send, makeFriends } = chatHelpers(ctx);

const admin = () => asAdmin(ctx.app);

describe("admin access", () => {
  it("is only for the emails in ADMIN_EMAILS", async () => {
    const someone = await signUp("someone");
    expect((await get(someone, "/v1/admin/stats")).error.code).toBe("FORBIDDEN");
    expect((await get(someone, "/v1/admin/me")).error.code).toBe("FORBIDDEN");
    expect((await call(someone, "POST", "/v1/admin/2fa/secret")).statusCode).toBe(403);
    const boss = await admin();
    expect(await get(boss, "/v1/admin/me")).toEqual({ admin: true, twoFactor: "ok" });
    const stats = await get(boss, "/v1/admin/stats");
    expect(stats.users).toBeGreaterThan(0);
    expect(stats.signups).toHaveLength(30);
  });

  it("stays shut until an authenticator code is entered, and asks again after 12 hours", async () => {
    await prisma.user.updateMany({ where: { email: "the-admin@example.com" }, data: { totpSecret: null, totpStep: null } });
    const boss: Auth = (await loginAs(ctx.app, "the-admin")).json();
    const code = (secret: string, step = totpStep()) => ({ code: totp(secret, step), secret });

    expect(await get(boss, "/v1/admin/me")).toEqual({ admin: true, twoFactor: "setup" });
    expect((await get(boss, "/v1/admin/stats")).error.code).toBe("ADMIN_2FA_REQUIRED");
    const { secret, uri } = (await call(boss, "POST", "/v1/admin/2fa/secret")).json();
    expect(uri).toContain(`secret=${secret}`);
    expect((await call(boss, "POST", "/v1/admin/2fa", code(secret, totpStep() + 5))).json().error.code).toBe("WRONG_2FA_CODE");
    expect(await get(boss, "/v1/admin/me")).toEqual({ admin: true, twoFactor: "setup" });

    const first = code(ADMIN_SECRET);
    expect((await call(boss, "POST", "/v1/admin/2fa", first)).json()).toEqual({ admin: true, twoFactor: "ok" });
    expect((await get(boss, "/v1/admin/stats")).users).toBeGreaterThan(0);
    expect((await call(boss, "POST", "/v1/admin/2fa/secret")).json().error.code).toBe("CONFLICT");

    const laptop: Auth = (await loginAs(ctx.app, "the-admin")).json();
    expect(await get(laptop, "/v1/admin/me")).toEqual({ admin: true, twoFactor: "required" });
    expect((await call(laptop, "POST", "/v1/admin/2fa", first)).json().error.code).toBe("WRONG_2FA_CODE");
    expect((await call(laptop, "POST", "/v1/admin/2fa", { code: totp(secret, totpStep()) })).json().error.code).toBe(
      "WRONG_2FA_CODE",
    );

    await prisma.session.updateMany({
      where: { userId: boss.user.id, adminVerifiedAt: { not: null } },
      data: { adminVerifiedAt: new Date(Date.now() - 13 * 3_600_000) },
    });
    expect((await get(boss, "/v1/admin/stats")).error.code).toBe("ADMIN_2FA_REQUIRED");
  });
});

describe("aliases", () => {
  it("lead admins to the person behind them, and to who sees them that way", async () => {
    const { host, guest } = await makeFriends();
    const boss = await admin();
    const alias = pairAlias(guest.user.id, host.user.id).toLowerCase();
    const found = await get(boss, `/v1/admin/users?q=${encodeURIComponent(alias)}`);
    const match = found.items.find((u: { id: string }) => u.id === host.user.id);
    expect(match.seenBy.map((v: { id: string }) => v.id)).toContain(guest.user.id);
    const potato = await get(boss, `/v1/admin/users?q=${encodeURIComponent(`Potato ${alias}`)}`);
    expect(potato.items.map((u: { id: string }) => u.id)).toContain(host.user.id);
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
    expect((await loginAs(ctx.app, again.googleSub!)).json().error.code).toBe("ACCOUNT_BANNED");
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
  it("counts only a person's chats with other people, not the app's own or support", async () => {
    const boss = await admin();
    const { host } = await makeFriends();
    expect((await call(host, "POST", "/v1/bot", { locale: "en", open: true })).statusCode).toBe(200);
    const [row] = (await get(boss, `/v1/admin/users?q=${encodeURIComponent(host.user.email)}`)).items;
    expect(row).toMatchObject({ id: host.user.id, chats: 1 });
  });

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
    expect((await loginAs(ctx.app, user.googleSub!)).statusCode).toBe(200);

    expect(
      (await call(boss, "POST", `/v1/admin/users/${boss.user.id}/ban`, { reason: "oops" })).json().error.code,
    ).toBe("FORBIDDEN");
  });

  it("lifts a timed ban once it runs out", async () => {
    const boss = await admin();
    const target = await signUp("Trent");
    const banned = (await call(boss, "POST", `/v1/admin/users/${target.user.id}/ban`, { reason: "cool off", hours: 6 })).json();
    expect(Date.parse(banned.bannedUntil) - Date.now()).toBeGreaterThan(5.9 * 3_600_000);

    const { googleSub } = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    const refused = (await loginAs(ctx.app, googleSub!)).json().error;
    expect(refused).toMatchObject({ code: "ACCOUNT_BANNED", details: { until: banned.bannedUntil } });

    await prisma.user.update({ where: { id: target.user.id }, data: { bannedUntil: new Date(Date.now() - 1000) } });
    expect(await liftExpiredBans()).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } })).toMatchObject({ bannedAt: null, banReason: null });
    expect((await loginAs(ctx.app, googleSub!)).statusCode).toBe(200);
  });

  it("can ban from chats only, leaving anonymous messages, without following the phone", async () => {
    const boss = await admin();
    const phone = { device: { platform: "android", name: "Phone", id: `phone-${uniqueSub("chatban")}` } };
    const target: Auth = (await loginAs(ctx.app, uniqueSub("chatty"), "android", phone)).json();
    const fan = await signUp("fan");
    const status = async (who: Auth, url: string) => (await ctx.app.inject({ url, headers: bearer(who.accessToken) })).statusCode;
    const { askCode } = await get(target, "/v1/me");

    const banned = (await call(boss, "POST", `/v1/admin/users/${target.user.id}/ban`, { reason: "rude", hours: 24, scope: "chat" })).json();
    expect(banned).toMatchObject({ banScope: "chat", bannedAt: expect.any(String) });
    expect(await status(target, "/v1/chats")).toBe(403);
    expect((await get(target, "/v1/me")).chatBan).toEqual({ until: banned.bannedUntil });
    expect((await call(fan, "POST", `/v1/ask/${askCode}`, { text: "still around?" })).statusCode).toBe(204);
    expect((await get(target, "/v1/ask")).items.map((m: { text: string }) => m.text)).toEqual(["still around?"]);
    expect((await call(target, "POST", `/v1/ask/${(await get(fan, "/v1/me")).askCode}`, { text: "yes" })).statusCode).toBe(204);

    const { googleSub } = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect((await loginAs(ctx.app, googleSub!, "android", phone)).statusCode).toBe(200);
    expect((await loginAs(ctx.app, uniqueSub("sibling"), "android", phone)).statusCode).toBe(200);

    await call(boss, "POST", `/v1/admin/users/${target.user.id}/unban`);
    expect((await get(target, "/v1/me")).chatBan).toBeNull();
    expect(await status(target, "/v1/chats")).toBe(200);
  });

  it("follows a banned person to new accounts on the same browser or phone", async () => {
    const boss = await admin();
    const device = (id: string) => ({ device: { platform: "android", name: "Phone", id } });
    const phone = `phone-${uniqueSub("ban")}`;
    const troll: Auth = (await loginAs(ctx.app, uniqueSub("troll"), "android", device(phone))).json();
    const sibling = await loginAs(ctx.app, uniqueSub("sibling"), "android", device(phone));
    await call(boss, "POST", `/v1/admin/users/${troll.user.id}/ban`, { reason: "harassment", hours: 24 });

    const fresh = await loginAs(ctx.app, uniqueSub("troll-again"), "android", device(phone));
    expect(fresh.json().error).toMatchObject({ code: "ACCOUNT_BANNED", details: { until: expect.any(String) } });
    const refresh = await ctx.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: sibling.json().refreshToken } });
    expect(refresh.json().error.code).toBe("ACCOUNT_BANNED");
    expect((await loginAs(ctx.app, uniqueSub("elsewhere"), "android", device(`other-${phone}`))).statusCode).toBe(200);
    expect((await loginAs(ctx.app, "the-admin", "android", device(phone))).statusCode).toBe(200);
  });
});

describe("sticker moderation", () => {
  it("takes a pack down everywhere, including messages that already show it", async () => {
    const { host, guest, chatId } = await makeFriends();
    makeAdmin(host);
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

describe("sticker zip import", () => {
  it("unpacks an uploaded zip on the server into an official pack per folder", async () => {
    const boss = await admin();
    const lottie = (w: number) => strToU8(JSON.stringify({ v: "5.7.4", fr: 30, ip: 0, op: 30, w, h: w, layers: [] }));
    const zip = zipSync({
      "Activities/Party Popper.json": lottie(64),
      "Activities/ball.json": lottie(64),
      "Smileys/😂 laugh.json": lottie(64),
      "Smileys/notes.txt": strToU8("not a sticker"),
      "Smileys/huge.png": new Uint8Array(7 * 1024 * 1024),
      "__MACOSX/Smileys/._x.json": strToU8("junk"),
    });
    const presign = await call(boss, "POST", "/v1/uploads/presign", {
      kind: "sticker_zip",
      mime: "application/zip",
      size: zip.length,
      name: "Emojis.zip",
    });
    expect(presign.statusCode, presign.body).toBe(201);
    const { url, headers, upload } = presign.json();
    expect((await fetch(url, { method: "PUT", body: zip, headers })).status).toBe(200);
    expect((await call(boss, "POST", `/v1/uploads/${upload.id}/complete`)).json().status).toBe("ready");

    const started = await call(boss, "POST", "/v1/admin/sticker-packs/import", { uploadId: upload.id });
    expect(started.statusCode, started.body).toBe(202);
    await runStickerImport(upload.id);
    const progress = await get(boss, `/v1/admin/sticker-packs/import/${upload.id}`);
    expect(progress).toMatchObject({ total: 4, done: 4, skipped: 1, finished: true, error: null, packs: ["Activities", "Smileys"] });

    const packs = (await get(boss, "/v1/admin/sticker-packs?official=true")).items as { title: string; stickers: { emoji: string }[] }[];
    expect(packs.find((p) => p.title === "Activities")?.stickers.map((s) => s.emoji).sort()).toEqual(["⭐", "🎉"].sort());
    expect(packs.find((p) => p.title === "Smileys")?.stickers.map((s) => s.emoji)).toEqual(["😂"]);

    const someone = await signUp("someone");
    const refused = await call(someone, "POST", "/v1/uploads/presign", { kind: "sticker_zip", mime: "application/zip", size: 10, name: "x.zip" });
    expect(refused.json().error.code).toBe("FORBIDDEN");

    const smileys = packs.find((p) => p.title === "Smileys") as unknown as { id: string };
    expect((await call(boss, "DELETE", `/v1/admin/sticker-packs/${smileys.id}/forever`)).statusCode).toBe(204);
    const left = (await get(boss, "/v1/admin/sticker-packs?official=true")).items as { id: string }[];
    expect(left.some((p) => p.id === smileys.id)).toBe(false);
  });

  it("runs one import at a time per admin, and can cancel one", async () => {
    const boss = await admin();
    const upload = async () => {
      const zip = zipSync({ "A/x.json": strToU8(JSON.stringify({ v: "5.7.4", fr: 30, ip: 0, op: 30, w: 8, h: 8, layers: [] })) });
      const presign = (await call(boss, "POST", "/v1/uploads/presign", { kind: "sticker_zip", mime: "application/zip", size: zip.length, name: "a.zip" })).json();
      await fetch(presign.url, { method: "PUT", body: zip, headers: presign.headers });
      await call(boss, "POST", `/v1/uploads/${presign.upload.id}/complete`);
      return presign.upload.id as string;
    };
    const first = await upload();
    const second = await upload();
    expect((await call(boss, "POST", "/v1/admin/sticker-packs/import", { uploadId: first })).statusCode).toBe(202);
    expect((await get(boss, "/v1/admin/sticker-packs/import")).import).toMatchObject({ uploadId: first, finished: false });
    expect((await call(boss, "POST", "/v1/admin/sticker-packs/import", { uploadId: second })).json().error.code).toBe("STICKER_IMPORT_RUNNING");

    const cancelled = (await call(boss, "POST", `/v1/admin/sticker-packs/import/${first}/cancel`)).json();
    expect(cancelled).toMatchObject({ finished: true, error: "Cancelled" });
    expect((await call(boss, "POST", "/v1/admin/sticker-packs/import", { uploadId: second })).statusCode).toBe(202);
    await call(boss, "POST", `/v1/admin/sticker-packs/import/${second}/cancel`);
  });
});

describe("full access", () => {
  it("lets a guest or someone waiting all the way in, and tells them once, in the app and by email", async () => {
    const boss = await admin();
    const guest = await signUp("upgraded");
    await prisma.user.update({ where: { id: guest.user.id }, data: { guest: true } });
    const grant = (who: Auth, id: string) => call(who, "POST", `/v1/admin/users/${id}/full-access`);

    expect((await grant(guest, guest.user.id)).statusCode).toBe(403);
    createSocketServer(ctx.app.server);
    await ctx.app.listen({ port: 0, host: "127.0.0.1" });
    const url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
    const socket = connect(url, { auth: { token: guest.accessToken }, transports: ["websocket"], forceNew: true });
    try {
      await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
      const told = new Promise((resolve) => socket.once("notifications:changed", resolve));
      const upgraded = new Promise<{ data: { guest: boolean } }>((resolve) =>
        socket.on("change", (e: { type: string; data: { guest: boolean } }) => e.type === "me.updated" && resolve(e)),
      );
      const res = await grant(boss, guest.user.id);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ guest: false, queued: false });
      expect((await upgraded).data.guest).toBe(false);
      await told;
    } finally {
      socket.disconnect();
    }
    expect((await get(guest, "/v1/notifications")).items).toEqual([expect.objectContaining({ kind: "full_access", user: null })]);
    await vi.waitFor(async () =>
      expect(await prisma.mailLog.findFirst({ where: { userId: guest.user.id } })).toMatchObject({ kind: "access" }),
    );

    await grant(boss, guest.user.id);
    expect(await prisma.notification.count({ where: { userId: guest.user.id, kind: "full_access" } })).toBe(1);

    const sub = uniqueSub("waiting");
    const waiting = (await loginAs(ctx.app, sub)).json();
    await prisma.user.update({ where: { id: waiting.user.id }, data: { queuedAt: new Date() } });
    expect((await loginAs(ctx.app, sub)).json().error.code).toBe("ACCOUNT_QUEUED");
    await grant(boss, waiting.user.id);
    expect((await loginAs(ctx.app, sub)).statusCode).toBe(200);
  });
});
