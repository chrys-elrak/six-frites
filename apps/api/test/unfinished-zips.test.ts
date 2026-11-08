import { describe, expect, it } from "vitest";
import { asAdmin, chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call } = chatHelpers(ctx);

describe("unfinished sticker zips", () => {
  it("lists a zip whose upload never finished, and throws it away on request", async () => {
    const boss = await asAdmin(ctx.app);
    const presign = (
      await call(boss, "POST", "/v1/uploads/presign", { kind: "sticker_zip", mime: "application/zip", size: 1234, name: "Animals.zip" })
    ).json();

    const latest = await get(boss, "/v1/admin/sticker-packs/import");
    expect(latest.unfinished).toEqual(expect.arrayContaining([expect.objectContaining({ id: presign.upload.id, name: "Animals.zip", size: 1234 })]));

    expect((await call(boss, "DELETE", `/v1/admin/sticker-packs/uploads/${presign.upload.id}`)).statusCode).toBe(204);
    expect((await get(boss, "/v1/admin/sticker-packs/import")).unfinished.some((u: { id: string }) => u.id === presign.upload.id)).toBe(false);
    expect((await call(boss, "DELETE", `/v1/admin/sticker-packs/uploads/${presign.upload.id}`)).statusCode).toBe(404);
  });
});
