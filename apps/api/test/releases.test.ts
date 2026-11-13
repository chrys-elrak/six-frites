import { createHmac } from "node:crypto";
import { CHANGELOG, type PushPayload, SIX_FRITES_ID, releaseAnnouncement } from "@six/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setPushProviders } from "../src/push/providers.js";
import { postReleaseNotes } from "../src/services/bot.js";
import { asAdmin, chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, call, get } = chatHelpers(ctx);

const published = {
  app: "six-frites",
  name: "Six Frites",
  version: "1.2.0",
  notes: "Calls",
  size: 3,
  sha256: "abc",
  publishedAt: "2026-10-27T09:00:00.000Z",
  downloadUrl: "https://store.test/six-frites/1.2.0/download",
};

afterEach(() => vi.restoreAllMocks());

describe("android releases on Koera Store", () => {
  it("offers the store's newest version with a link to its store page", async () => {
    const store = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(published));
    const latest = (await ctx.app.inject({ method: "GET", url: "/v1/app/android" })).json();
    expect(store).toHaveBeenCalledWith("https://store.test/api/apps/six-frites/latest", expect.anything());
    expect(latest).toMatchObject({ version: "1.2.0", notes: "Calls", size: 3 });
    expect(latest.downloadUrl).toBe("https://store.test/six-frites");

    store.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await ctx.app.inject({ method: "GET", url: "/v1/app/android" })).json()).toBeNull();

    const download = await ctx.app.inject({ method: "GET", url: "/v1/app/android/download" });
    expect(download.statusCode).toBe(302);
    expect(download.headers.location).toBe("https://store.test/six-frites");
  });

  it("tells Android phones about a version once the store's signed webhook says it went live", async () => {
    const phone = await signUp("android-fan");
    const token = `fcm-${phone.user.id}`;
    await call(phone, "POST", "/v1/devices/push-token", { provider: "fcm", token, locale: "fr" });
    const pushed: { token: string; payload: PushPayload }[] = [];
    const send = async (to: string, payload: PushPayload) => (pushed.push({ token: to, payload }), "sent" as const);
    setPushProviders({ fcm: { send }, fcmPlay: { send } });
    const playPhone = await signUp("play-fan");
    const playToken = `play-${playPhone.user.id}`;
    expect((await call(playPhone, "POST", "/v1/devices/push-token", { provider: "fcmPlay", token: playToken, locale: "en" })).statusCode).toBeLessThan(300);

    const body = JSON.stringify(published);
    const hook = (signature: string) =>
      ctx.app.inject({
        method: "POST",
        url: "/v1/app/android/published",
        headers: { "content-type": "application/json", "x-koera-signature": signature },
        payload: body,
      });

    expect((await hook(`sha256=${createHmac("sha256", "wrong").update(body).digest("hex")}`)).statusCode).toBe(403);
    expect(pushed).toHaveLength(0);

    const res = await hook(`sha256=${createHmac("sha256", "test-store-secret").update(body).digest("hex")}`);
    expect(res.statusCode, res.body).toBe(204);
    await vi.waitFor(() => expect(pushed.find((p) => p.token === token)).toBeDefined());
    expect(pushed.find((p) => p.token === playToken)).toBeUndefined();
    expect(pushed.find((p) => p.token === token)!.payload).toMatchObject({
      title: "Six Frites 1.2.0 est disponible",
      chatId: null,
      url: "https://store.test/six-frites",
    });
  });

  it("has Six Frites News post a published version's notes to members in their language, once, and lists it for admins", async () => {
    const reader = await signUp("french-reader");
    await call(reader, "POST", "/v1/bot", { locale: "fr", open: false });
    const version = CHANGELOG[0]!.version;
    const body = JSON.stringify({ ...published, version });
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/app/android/published",
      headers: { "content-type": "application/json", "x-koera-signature": `sha256=${createHmac("sha256", "test-store-secret").update(body).digest("hex")}` },
      payload: body,
    });
    expect(res.statusCode, res.body).toBe(204);

    const french = releaseAnnouncement(version, "fr");
    const got = () =>
      prisma.message.findMany({
        where: { senderId: SIX_FRITES_ID, clientId: `release:${version}:${reader.user.id}` },
        select: { text: true, entities: true },
      });
    await vi.waitFor(async () => expect(await got()).toEqual([french]), { timeout: 60_000, interval: 500 });
    await postReleaseNotes(version, "");
    expect(await got()).toHaveLength(1);

    type Posted = { kind: string; version: string | null; text: string; members: number };
    const history: Posted[] = await get(await asAdmin(ctx.app), "/v1/admin/announcements");
    const posted = history.find((a) => a.version === version)!;
    expect(posted).toMatchObject({ kind: "release", text: releaseAnnouncement(version, "en").text });
    expect(posted.members).toBeGreaterThan(0);
  }, 120_000);
});
