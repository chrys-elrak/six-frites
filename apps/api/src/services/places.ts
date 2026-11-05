import { type Locale, type PlaceNameDTO, STORY_LIMITS } from "@six/shared";
import { env } from "../env.js";

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
  const asked = turn.then(() => lookup(lat, lng, locale));
  turn = asked.then(
    () => new Promise((r) => setTimeout(r, 1000)),
    () => new Promise((r) => setTimeout(r, 1000)),
  );
  const name = await asked.catch(() => undefined);
  if (name === undefined) return { name: null };
  if (names.size > 5000) names.clear();
  names.set(key, name);
  return { name };
}

async function lookup(lat: number, lng: number, locale: Locale) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.search = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "16", "accept-language": locale }).toString();
  const res = await fetch(url, { headers: { "user-agent": `SixFrites (${env.WEB_ORIGIN})` }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
  const { name, address = {} } = (await res.json()) as Nominatim;
  const spot = address.suburb ?? address.neighbourhood ?? address.quarter ?? address.village ?? address.hamlet ?? name;
  const town = address.city ?? address.town ?? address.village ?? address.county ?? address.state;
  const parts = [...new Set([spot, town].filter((p): p is string => !!p))];
  return parts.length ? parts.join(", ").slice(0, STORY_LIMITS.place) : null;
}
