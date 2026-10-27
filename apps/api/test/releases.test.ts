import { createHmac } from "node:crypto";
import type { PushPayload } from "@six/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setPushProviders } from "../src/push/providers.js";
import { chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, call } = chatHelpers(ctx);

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
  it("offers the store's newest version through a stable download link", async () => {
    const store = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(published));
    const latest = (await ctx.app.inject({ method: "GET", url: "/v1/app/android" })).json();
    expect(store).toHaveBeenCalledWith("https://store.test/api/apps/six-frites/latest", expect.anything());
    expect(latest).toMatchObject({ version: "1.2.0", notes: "Calls", size: 3 });
    expect(latest.downloadUrl).toMatch(/\/v1\/app\/android\/download$/);

    store.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await ctx.app.inject({ method: "GET", url: "/v1/app/android" })).json()).toBeNull();

    const download = await ctx.app.inject({ method: "GET", url: "/v1/app/android/download" });
    expect(download.statusCode).toBe(302);
    expect(download.headers.location).toBe("https://store.test/six-frites/download");
  });

  it("tells Android phones about a version once the store's signed webhook says it went live", async () => {
    const phone = await signUp("android-fan");
    const token = `fcm-${phone.user.id}`;
    await call(phone, "POST", "/v1/devices/push-token", { provider: "fcm", token, locale: "fr" });
    const pushed: { token: string; payload: PushPayload }[] = [];
    setPushProviders({ fcm: { send: async (to, payload) => (pushed.push({ token: to, payload }), "sent") } });

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
    expect(pushed.find((p) => p.token === token)!.payload).toMatchObject({
      title: "Six Frites 1.2.0 est disponible",
      chatId: null,
      url: expect.stringMatching(/\/v1\/app\/android\/download$/),
    });
  });
});
