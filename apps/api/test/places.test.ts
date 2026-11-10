import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/env.js";
import { chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get } = chatHelpers(ctx);
const realFetch = globalThis.fetch;
const session = () => `s-${Math.random().toString(36).slice(2, 12)}`;

describe("place search", () => {
  const settings = { ...env };
  afterEach(() => {
    Object.assign(env, settings);
    vi.restoreAllMocks();
  });

  it("suggests places from Google as you type, counting one search per session", async () => {
    env.GOOGLE_MAPS_API_KEY = "test-maps-key";
    env.PLACE_SEARCHES_PER_MONTH = 2;
    const asked: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname !== "places.googleapis.com") return realFetch(input, init);
      asked.push(url.pathname);
      if (url.pathname.endsWith(":autocomplete")) {
        return Response.json({
          suggestions: [
            { placePrediction: { placeId: "ChIJanosy", structuredFormat: { mainText: { text: "Lac Anosy" }, secondaryText: { text: "Antananarivo" } } } },
          ],
        });
      }
      return Response.json({ location: { latitude: -18.9152, longitude: 47.5216 } });
    });
    const me = await signUp("searcher");
    const suggest = (q: string, s: string) => get(me, `/v1/place-suggest?q=${encodeURIComponent(q)}&session=${s}&lat=-18.9&lng=47.5&locale=mg`);

    const first = session();
    expect(await suggest("ano", first)).toEqual({ suggestions: [{ id: "ChIJanosy", name: "Lac Anosy", address: "Antananarivo" }], left: 1 });
    expect((await suggest("anosy", first)).left).toBe(1);
    expect(await get(me, `/v1/place-details?id=ChIJanosy&session=${first}`)).toEqual({ lat: -18.9152, lng: 47.5216 });
    expect((await suggest("ivato", session())).left).toBe(0);
    expect((await suggest("analakely", session())).error.code).toBe("PLACE_SEARCH_LIMIT_REACHED");
    expect((await get(me, `/v1/place-details?id=../x&session=${first}`)).error.code).toBe("NOT_FOUND");
    expect(asked).toEqual(["/v1/places:autocomplete", "/v1/places:autocomplete", "/v1/places/ChIJanosy", "/v1/places:autocomplete"]);
    expect((await suggest("a", session())).error.code).toBe("VALIDATION_FAILED");
  });

  it("falls back to OpenStreetMap, whose suggestions carry where they are", async () => {
    env.GOOGLE_MAPS_API_KEY = undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname !== "nominatim.openstreetmap.org") return realFetch(input, init);
      return Response.json([{ name: "Lac Anosy", display_name: "Lac Anosy, Antananarivo, Madagascar", lat: "-18.9137", lon: "47.5361" }]);
    });
    const me = await signUp("osm-searcher");
    const s = session();
    const found = await get(me, `/v1/place-suggest?q=anosy&session=${s}`);
    expect(found.suggestions).toEqual([{ id: "osm:-18.9137,47.5361", name: "Lac Anosy", address: "Lac Anosy, Antananarivo, Madagascar" }]);
    expect(await get(me, `/v1/place-details?id=osm:-18.9137,47.5361&session=${s}`)).toEqual({ lat: -18.9137, lng: 47.5361 });
  });

  it("caps each person's suggestions while typing", async () => {
    env.GOOGLE_MAPS_API_KEY = "test-maps-key";
    env.PLACE_SUGGESTIONS_PER_MONTH = 2;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      return url.hostname === "places.googleapis.com" ? Response.json({ suggestions: [] }) : realFetch(input, init);
    });
    const me = await signUp("typist");
    const s = session();
    for (const q of ["an", "ano"]) expect((await get(me, `/v1/place-suggest?q=${q}&session=${s}`)).suggestions).toEqual([]);
    expect((await get(me, `/v1/place-suggest?q=anos&session=${s}`)).error.code).toBe("PLACE_SEARCH_LIMIT_REACHED");
  });

  it("gives each person a share of Google's map pictures, counted by place, and of picker openings", async () => {
    env.GOOGLE_MAPS_API_KEY = "test-maps-key";
    env.MAP_PREVIEWS_PER_MONTH = 1;
    env.MAP_PICKERS_PER_MONTH = 1;
    const png = Buffer.from("png bytes");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname !== "maps.googleapis.com") return realFetch(input, init);
      expect(url.searchParams.get("key")).toBe("test-maps-key");
      return new Response(png, { headers: { "content-type": "image/png" } });
    });
    const me = await signUp("previewer");
    const picture = (lat: number) =>
      ctx.app.inject({ url: `/v1/map-preview?lat=${lat}&lng=47.5`, headers: { authorization: `Bearer ${me.accessToken}` } });

    const first = await picture(-18.9);
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("image/png");
    expect(first.rawPayload.equals(png)).toBe(true);
    expect((await picture(-18.9)).statusCode).toBe(200);
    expect((await picture(-19.1)).json().error.code).toBe("MAP_LIMIT_REACHED");

    const s = session();
    expect(await get(me, `/v1/map-picker?session=${s}`)).toEqual({ left: 0 });
    expect(await get(me, `/v1/map-picker?session=${s}`)).toEqual({ left: 0 });
    expect((await get(me, `/v1/map-picker?session=${session()}`)).error.code).toBe("MAP_LIMIT_REACHED");
  });
});
