import { describe, expect, it } from "vitest";
import { type Auth, chatHelpers, loginAs, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call } = chatHelpers(ctx);

const admin = async (): Promise<Auth> => (await loginAs(ctx.app, "the-admin")).json();

describe("android releases", () => {
  it("are uploaded by admins, then offered to everyone through a stable download link", async () => {
    const someone = await signUp("app-fan");
    expect((await call(someone, "POST", "/v1/admin/releases", { version: "1.0", size: 3 })).json().error.code).toBe(
      "FORBIDDEN",
    );

    const boss = await admin();
    const apk = Buffer.from("PK\u0003\u0004 fake apk");
    const created = await call(boss, "POST", "/v1/admin/releases", { version: "1.2.0", notes: "Calls", size: apk.length });
    expect(created.statusCode, created.body).toBe(201);
    const { release, url, headers } = created.json();
    expect(release).toMatchObject({ version: "1.2.0", published: false });

    expect((await call(boss, "POST", `/v1/admin/releases/${release.id}/publish`)).json().error.code).toBe("UPLOAD_MISSING");
    expect((await fetch(url, { method: "PUT", headers, body: apk })).ok).toBe(true);
    expect((await call(boss, "POST", `/v1/admin/releases/${release.id}/publish`)).json()).toMatchObject({ published: true });

    const latest = (await ctx.app.inject({ method: "GET", url: "/v1/app/android" })).json();
    expect(latest).toMatchObject({ version: "1.2.0", notes: "Calls", size: apk.length });
    expect(latest.downloadUrl).toMatch(/\/v1\/app\/android\/download$/);

    const download = await ctx.app.inject({ method: "GET", url: "/v1/app/android/download" });
    expect(download.statusCode).toBe(302);
    const file = await fetch(download.headers.location as string);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(apk);
    expect(file.headers.get("content-disposition")).toContain("six-frites-1.2.0.apk");

    expect((await get(boss, "/v1/admin/releases"))[0]).toMatchObject({ id: release.id, published: true });
    expect((await call(boss, "DELETE", `/v1/admin/releases/${release.id}`)).statusCode).toBe(204);
    expect((await get(boss, "/v1/admin/releases")).some((r: { id: string }) => r.id === release.id)).toBe(false);
  });
});
