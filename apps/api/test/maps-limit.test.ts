import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/env.js";
import { asAdmin, chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call } = chatHelpers(ctx);
const realFetch = globalThis.fetch;

describe("Google Maps limit", () => {
  const settings = { ...env };
  afterEach(() => {
    Object.assign(env, settings);
    vi.restoreAllMocks();
  });

  it("moves someone to OpenStreetMap once they used the calls an admin gave them", async () => {
    env.GOOGLE_MAPS_API_KEY = "test-maps-key";
    const asked: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === "places.googleapis.com") {
        asked.push("google");
        return Response.json({ suggestions: [{ placePrediction: { placeId: "ChIJx", structuredFormat: { mainText: { text: "Google" } } } }] });
      }
      if (url.hostname === "nominatim.openstreetmap.org") {
        asked.push("osm");
        return Response.json([{ name: "OSM", display_name: "OSM", lat: "1", lon: "2" }]);
      }
      if (url.hostname === "maps.googleapis.com") return new Response("png", { headers: { "content-type": "image/png" } });
      return realFetch(input, init);
    });
    const me = await signUp("mapper");
    const boss = await asAdmin(ctx.app);
    const capped = await call(boss, "POST", `/v1/admin/users/${me.user.id}/maps-limit`, { limit: 2 });
    expect(capped.json()).toMatchObject({ mapsLimit: 2, mapsUsed: 0 });

    const suggest = (q: string) => get(me, `/v1/place-suggest?q=${q}&session=maps-limit-s1`);
    expect((await suggest("ano")).suggestions[0].name).toBe("Google");
    expect((await suggest("anos")).suggestions[0].name).toBe("Google");
    expect((await suggest("anosy")).suggestions[0].name).toBe("OSM");
    expect(asked).toEqual(["google", "google", "osm"]);
    expect((await get(me, "/v1/map-preview?lat=1&lng=2")).error.code).toBe("MAP_LIMIT_REACHED");

    const seen = await call(boss, "POST", `/v1/admin/users/${me.user.id}/maps-limit`, { limit: null });
    expect(seen.json()).toMatchObject({ mapsLimit: null, mapsUsed: 2 });
    expect((await suggest("anosy b")).suggestions[0].name).toBe("Google");
  });
});
