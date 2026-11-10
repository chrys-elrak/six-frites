import {
  AppError,
  type Locale,
  type MapPreviewQuery,
  type PlaceDetailsDTO,
  type PlaceDetailsQuery,
  type PlaceNameDTO,
  type PlaceSuggestDTO,
  type PlaceSuggestQuery,
  type PlaceSuggestionDTO,
  STORY_LIMITS,
} from "@six/shared";
import type { Redis } from "ioredis";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";

interface Nominatim {
  name?: string;
  address?: Record<string, string | undefined>;
}

const names = new Map<string, string | null>();
let turn = Promise.resolve();

/**
 * What OpenStreetMap calls a place: its neighbourhood and town. Answers are kept by spot (about 100 m), and asks
 * go out one a second, as Nominatim's usage policy wants.
 * ponytail: in-memory cache and throttle per API instance; move both to Redis if instances multiply.
 */
export async function placeName(lat: number, lng: number, locale: Locale): Promise<PlaceNameDTO> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${locale}`;
  if (names.has(key)) return { name: names.get(key)! };
  const name = await inTurn(() => lookup(lat, lng, locale)).catch(() => undefined);
  if (name === undefined) return { name: null };
  if (names.size > 5000) names.clear();
  names.set(key, name);
  return { name };
}

/** Runs `ask` once the Nominatim asks before it are done, leaving a second between each. */
function inTurn<T>(ask: () => Promise<T>) {
  const asked = turn.then(ask);
  const pause = () => new Promise<void>((r) => setTimeout(r, 1000));
  turn = asked.then(pause, pause);
  return asked;
}

const nominatimHeaders = () => ({ "user-agent": `SixFrites (${env.WEB_ORIGIN})` });

async function lookup(lat: number, lng: number, locale: Locale) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.search = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "16", "accept-language": locale }).toString();
  const res = await fetch(url, { headers: nominatimHeaders(), signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
  const { name, address = {} } = (await res.json()) as Nominatim;
  const spot = address.suburb ?? address.neighbourhood ?? address.quarter ?? address.village ?? address.hamlet ?? name;
  const town = address.city ?? address.town ?? address.village ?? address.county ?? address.state;
  const parts = [...new Set([spot, town].filter((p): p is string => !!p))];
  return parts.length ? parts.join(", ").slice(0, STORY_LIMITS.place) : null;
}

let client: Redis | null = null;
const redis = () => (client ??= redisConnection());
const googleLanguage = (locale: Locale) => (locale === "mg" ? "fr" : locale);

type LimitCode = "PLACE_SEARCH_LIMIT_REACHED" | "MAP_LIMIT_REACHED";
const MONTH_SECONDS = 32 * 24 * 60 * 60;
const monthKey = (kind: string, userId: string) => `${env.QUEUE_PREFIX}:${kind}:${userId}:${new Date().toISOString().slice(0, 7)}`;

/**
 * Lets `item` count once against this person's `limit` of `kind` for the month (UTC), and says how many are left.
 * The same item again is free, like a search session Google bills once however much is typed in it.
 */
async function allowance(userId: string, kind: string, item: string, limit: number, code: LimitCode) {
  const key = monthKey(kind, userId);
  const [known, used] = await Promise.all([redis().sismember(key, item), redis().scard(key)]);
  if (known) return Math.max(0, limit - used);
  if (used >= limit) throw new AppError(code, `${limit} ${kind} a month`);
  await redis().multi().sadd(key, item).expire(key, MONTH_SECONDS).exec();
  return Math.max(0, limit - used - 1);
}

/** Counts one more `kind` against this person's `limit` for the month (UTC). */
async function spend(userId: string, kind: string, limit: number, code: LimitCode) {
  const key = monthKey(kind, userId);
  const [[, used]] = (await redis().multi().incr(key).expire(key, MONTH_SECONDS).exec()) as [[unknown, number]];
  if (used > limit) throw new AppError(code, `${limit} ${kind} a month`);
}

/**
 * Counts one call to Google Maps for this person this month, or says no once they used the cap an admin set them.
 * The counter runs for everyone, so moderation can see who uses Google most.
 */
async function useGoogle(userId: string) {
  const key = monthKey("google-maps", userId);
  const [user, used] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { mapsLimit: true } }),
    redis().get(key),
  ]);
  if (user?.mapsLimit != null && Number(used ?? 0) >= user.mapsLimit) return false;
  await redis().multi().incr(key).expire(key, MONTH_SECONDS).exec();
  return true;
}

/** Calls to Google Maps each of these people made this month. */
export async function googleMapsUsed(userIds: string[]) {
  const counts = userIds.length ? await redis().mget(userIds.map((id) => monthKey("google-maps", id))) : [];
  return new Map(userIds.map((id, i) => [id, Number(counts[i] ?? 0)]));
}

const openSession = (userId: string, session: string) =>
  allowance(userId, "place-sessions", session, env.PLACE_SEARCHES_PER_MONTH, "PLACE_SEARCH_LIMIT_REACHED");

/**
 * Places matching what is typed so far, from Google's autocomplete when GOOGLE_MAPS_API_KEY is set, and from
 * OpenStreetMap otherwise or when Google fails.
 * ponytail: the OpenStreetMap fallback is throttled to one ask a second for the whole API; fine as a fallback only.
 */
export async function suggestPlaces(userId: string, q: PlaceSuggestQuery): Promise<PlaceSuggestDTO> {
  const left = await openSession(userId, q.session);
  const osm = () => inTurn(() => nominatim(q));
  let key = env.GOOGLE_MAPS_API_KEY;
  if (key) await spend(userId, "place-suggestions", env.PLACE_SUGGESTIONS_PER_MONTH, "PLACE_SEARCH_LIMIT_REACHED");
  if (key && !(await useGoogle(userId))) key = undefined;
  const suggestions = await (key ? googleSuggest(q, key).catch(osm) : osm()).catch(() => {
    throw new AppError("PLACES_UNAVAILABLE");
  });
  return { suggestions, left };
}

/** Where a suggested place is. OpenStreetMap suggestions carry it in their id; Google ones are looked up. */
export async function placeDetails(userId: string, q: PlaceDetailsQuery): Promise<PlaceDetailsDTO> {
  const osm = /^osm:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(q.id);
  if (osm) return { lat: Number(osm[1]), lng: Number(osm[2]) };
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key || !/^[\w-]+$/.test(q.id)) throw new AppError("NOT_FOUND", "No such place");
  await openSession(userId, q.session);
  if (!(await useGoogle(userId))) throw new AppError("PLACE_SEARCH_LIMIT_REACHED", "Google Maps limit reached");
  const url = `https://places.googleapis.com/v1/places/${q.id}?${new URLSearchParams({ sessionToken: q.session, languageCode: googleLanguage(q.locale) })}`;
  const res = await fetch(url, { headers: { "x-goog-api-key": key, "x-goog-fieldmask": "location" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (res?.status === 404 || res?.status === 400) throw new AppError("NOT_FOUND", "No such place");
  if (!res?.ok) throw new AppError("PLACES_UNAVAILABLE");
  const { location } = (await res.json()) as { location?: { latitude: number; longitude: number } };
  if (!location) throw new AppError("NOT_FOUND", "No such place");
  return { lat: location.latitude, lng: location.longitude };
}

/**
 * Google's small picture of a place for a message, fetched with our hidden key so each person can only use their
 * MAP_PREVIEWS_PER_MONTH, counted by place. MAP_LIMIT_REACHED past that; the app then draws OpenStreetMap.
 */
export async function mapPreview(userId: string, q: MapPreviewQuery) {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new AppError("PLACES_UNAVAILABLE");
  const spot = `${q.lat.toFixed(5)},${q.lng.toFixed(5)}`;
  await allowance(userId, "map-previews", spot, env.MAP_PREVIEWS_PER_MONTH, "MAP_LIMIT_REACHED");
  if (!(await useGoogle(userId))) throw new AppError("MAP_LIMIT_REACHED", "Google Maps limit reached");
  const params = { center: spot, zoom: "15", size: "256x128", scale: "2", markers: `color:red|${spot}`, language: googleLanguage(q.locale), key };
  const res = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) throw new AppError("PLACES_UNAVAILABLE");
  return { type: res.headers.get("content-type") ?? "image/png", body: Buffer.from(await res.arrayBuffer()) };
}

/** Whether this person may open the picker on Google's interactive map once more this month. */
export async function openMapPicker(userId: string, session: string) {
  const left = await allowance(userId, "map-pickers", session, env.MAP_PICKERS_PER_MONTH, "MAP_LIMIT_REACHED");
  if (!(await useGoogle(userId))) throw new AppError("MAP_LIMIT_REACHED", "Google Maps limit reached");
  return { left };
}

interface GooglePrediction {
  placePrediction?: {
    placeId: string;
    text?: { text?: string };
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  };
}

async function googleSuggest(q: PlaceSuggestQuery, key: string): Promise<PlaceSuggestionDTO[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      input: q.q,
      sessionToken: q.session,
      languageCode: googleLanguage(q.locale),
      ...(q.lat !== undefined && q.lng !== undefined && {
        locationBias: { circle: { center: { latitude: q.lat, longitude: q.lng }, radius: 50_000 } },
      }),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google Places answered ${res.status}`);
  const { suggestions = [] } = (await res.json()) as { suggestions?: GooglePrediction[] };
  return suggestions.flatMap(({ placePrediction: p }) =>
    p
      ? [
          {
            id: p.placeId,
            name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
            address: p.structuredFormat?.secondaryText?.text ?? null,
          },
        ]
      : [],
  );
}

async function nominatim(q: PlaceSuggestQuery): Promise<PlaceSuggestionDTO[]> {
  const params = new URLSearchParams({ format: "jsonv2", q: q.q, limit: "8", "accept-language": q.locale });
  if (q.lat !== undefined && q.lng !== undefined) params.set("viewbox", `${q.lng - 0.5},${q.lat + 0.5},${q.lng + 0.5},${q.lat - 0.5}`);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: nominatimHeaders(), signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
  const found = (await res.json()) as { name?: string; display_name: string; lat: string; lon: string }[];
  return found.map((p) => ({
    id: `osm:${Number(p.lat)},${Number(p.lon)}`,
    name: p.name || p.display_name.split(",")[0]!,
    address: p.display_name,
  }));
}
