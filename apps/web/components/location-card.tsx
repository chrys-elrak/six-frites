"use client";

import {
  type EphemeralInput,
  type GeoPoint,
  type PlaceSuggestionDTO,
  type TravelMode,
  coordsLabel,
  directionsUrl,
  distanceLabel,
  distanceMeters,
  mapTiles,
  mapsUrl,
  project,
  unproject,
} from "@six/shared";
import { SixApiError, unwrap } from "@six/sdk";
import { Car, Footprints, Layers, LocateFixed, MapPin, Minus, Navigation, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { useCloseOnBack } from "@/lib/back";
import { getLocale, useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { useMedia } from "@/lib/viewport";
import { EphemeralPicker } from "./ephemeral-picker";
import { Portal } from "./portal";
import { Sheet } from "./sheet";

/** A browser key for Google's free embedded map; without it places show on OpenStreetMap. */
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const MIN_ZOOM = 2;

interface GoogleMap {
  getCenter(): { lat(): number; lng(): number } | undefined;
  getZoom(): number | undefined;
  setCenter(c: { lat: number; lng: number }): void;
  setZoom(z: number): void;
  setMapTypeId(id: "roadmap" | "hybrid"): void;
  addListener(event: string, run: () => void): void;
}
type GoogleMaps = { Map: new (el: HTMLElement, options: object) => GoogleMap };
type GoogleWindow = Window & {
  google?: { maps: { importLibrary(name: "maps"): Promise<GoogleMaps> } };
  gm_authFailure?: () => void;
  sixMapsReady?: () => void;
};

/** Ties the suggestions of one search to the place picked, which is how Google bills them. */
const newSession = () => `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

let googleMaps: Promise<GoogleMaps> | null = null;

/** Loads Google's interactive map script once per page; Google bills each map shown with it past a free allowance. */
function loadGoogleMaps() {
  return (googleMaps ??= new Promise<GoogleMaps>((resolve, reject) => {
    const w = window as GoogleWindow;
    w.sixMapsReady = () => void w.google!.maps.importLibrary("maps").then(resolve, reject);
    const script = document.createElement("script");
    const language = getLocale() === "mg" ? "fr" : getLocale();
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key: GOOGLE_MAPS_KEY!, callback: "sixMapsReady", loading: "async", language })}`;
    script.async = true;
    script.onerror = () => {
      googleMaps = null;
      reject(new Error("maps"));
    };
    document.head.append(script);
  }));
}
const MAX_ZOOM = 19;

interface Here {
  at: GeoPoint | null;
  when: number;
  problem: "denied" | "failed" | null;
  asking: boolean;
}

/** Where we are, shared by every place on screen so each can say how far away it is. */
const useHere = create<Here>(() => ({ at: null, when: 0, problem: null, asking: false }));

/** Finds where we are, at most every five minutes. Only `ask` may prompt for permission; otherwise it needs it already. */
function locateMe(ask: boolean) {
  const { when, asking } = useHere.getState();
  if (asking || Date.now() - when < 5 * 60_000) return;
  void (async () => {
    if (!ask) {
      const allowed = await navigator.permissions?.query({ name: "geolocation" }).catch(() => null);
      if (allowed?.state !== "granted") return;
    }
    useHere.setState({ asking: true });
    try {
      useHere.setState({ at: await currentPosition(), when: Date.now(), problem: null });
    } catch (e) {
      useHere.setState({ problem: (e as Error).message === "denied" ? "denied" : "failed" });
    } finally {
      useHere.setState({ asking: false });
    }
  })();
}

export function LocationCard({ point, mine }: { point: GeoPoint; mine: boolean }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [directions, setDirections] = useState(false);
  const { at, asking } = useHere();
  useEffect(() => locateMe(false), []);
  const directTo = () => openDirections(point, () => setDirections(true));
  const pill = `flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-semibold ${
    mine ? "bg-black/10 hover:bg-black/15" : "bg-brand/15 text-brand hover:bg-brand/25"
  }`;

  return (
    <div className="w-64 max-w-full py-1">
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <Preview point={point} />
        <span className="mt-1.5 block truncate font-semibold">{point.name ?? tr.summary.kinds.location}</span>
        <span className="block truncate text-[13px] opacity-75">
          {at ? tr.messages.away(distanceLabel(distanceMeters(at, point))) : coordsLabel(point)}
          {point.accuracy ? ` · ${tr.messages.within(Math.round(point.accuracy))}` : ""}
        </span>
      </button>
      <div className="mt-1.5 flex gap-1.5">
        <button type="button" onClick={directTo} className={pill}>
          <Navigation className="size-4" />
          {tr.messages.directions}
        </button>
        {!at && (
          <button type="button" onClick={() => locateMe(true)} disabled={asking} className={`${pill} disabled:opacity-50`}>
            <LocateFixed className="size-4" />
            {tr.messages.distance}
          </button>
        )}
      </div>
      {open && <LocationSheet point={point} onDirections={directTo} onClose={() => setOpen(false)} />}
      {directions && <DirectionsView point={point} onClose={() => setDirections(false)} />}
    </div>
  );
}

/**
 * A small picture of the place: Google's, through our API which keeps each person within their monthly share, or
 * OpenStreetMap when that's used up or Google isn't set up.
 */
function Preview({ point }: { point: GeoPoint }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(!GOOGLE_MAPS_KEY);

  useEffect(() => {
    if (failed) return;
    let live = true;
    let url: string | null = null;
    six.api
      .GET("/v1/map-preview", { params: { query: { lat: point.lat, lng: point.lng, locale: getLocale() } }, parseAs: "blob" })
      .then(({ data, response }) => {
        if (!response.ok || !(data instanceof Blob)) throw new Error("no picture");
        url = URL.createObjectURL(data);
        if (live) setSrc(url);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [point.lat, point.lng, failed]);

  if (failed) return <TileMap center={point} className="h-32 rounded-xl" />;
  return src ? (
    <img src={src} alt="" draggable={false} className="h-32 w-full rounded-xl object-cover" />
  ) : (
    <div className="h-32 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-800" />
  );
}

/** OpenStreetMap around `center`, filling its box, with a pin in the middle. */
export function TileMap({ center, zoom = 15, className = "" }: { center: GeoPoint; zoom?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = box.current!;
    const seen = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  return (
    <div ref={box} className={`relative overflow-hidden bg-stone-200 select-none dark:bg-stone-800 ${className}`}>
      {size.width > 0 &&
        mapTiles(center, size.width, size.height, zoom).map((t) => (
          <img
            key={t.url}
            src={t.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute size-64 max-w-none"
            style={{ left: t.x, top: t.y }}
          />
        ))}
      <MapPin className="pointer-events-none absolute top-1/2 left-1/2 size-9 -translate-x-1/2 -translate-y-full fill-red-500 text-white drop-shadow" />
      <span className="pointer-events-none absolute right-0 bottom-0 bg-white/70 px-1 text-[10px] text-stone-600">© OpenStreetMap</span>
    </div>
  );
}

/** The place on a map, its name and how far it is from us. */
export function LocationDetails({ point, className = "" }: { point: GeoPoint; className?: string }) {
  const tr = useT();
  const [satellite, setSatellite] = useState(false);
  const { at, problem, asking } = useHere();
  useEffect(() => locateMe(false), []);

  return (
    <div className={`overflow-hidden rounded-2xl ${className}`}>
      {GOOGLE_MAPS_KEY ? (
        <div className="relative h-56">
          <iframe
            title={point.name ?? tr.summary.kinds.location}
            src={`https://www.google.com/maps/embed/v1/place?${new URLSearchParams({
              key: GOOGLE_MAPS_KEY,
              q: `${point.lat},${point.lng}`,
              zoom: "16",
              maptype: satellite ? "satellite" : "roadmap",
              language: getLocale() === "mg" ? "fr" : getLocale(),
            })}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="size-full border-0"
          />
          <button
            type="button"
            onClick={() => setSatellite(!satellite)}
            className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 shadow-md hover:bg-stone-100"
          >
            <Layers className="size-4" />
            {satellite ? tr.messages.mapView : tr.messages.satellite}
          </button>
        </div>
      ) : (
        <TileMap center={point} className="h-48" />
      )}
      <div className="px-4 py-3 text-center text-sm">
        {point.name && <div className="font-semibold">{point.name}</div>}
        <div className="opacity-60">
          {coordsLabel(point)}
          {point.accuracy ? ` · ${tr.messages.within(Math.round(point.accuracy))}` : ""}
        </div>
        {at ? (
          <div className="mt-1 font-semibold">{tr.messages.away(distanceLabel(distanceMeters(at, point)))}</div>
        ) : problem ? (
          <div className="mt-1 font-semibold text-red-600 dark:text-red-400">
            {problem === "denied" ? tr.composer.locationDenied : tr.composer.locationFailed}
          </div>
        ) : (
          <button type="button" onClick={() => locateMe(true)} disabled={asking} className="mt-1 font-semibold text-brand disabled:opacity-50">
            {tr.messages.distanceFromMe}
          </button>
        )}
      </div>
    </div>
  );
}

/** Shows directions to the place in the app, on Google's free embedded map, or in Google Maps without a key. */
export function openDirections(point: GeoPoint, inApp: () => void) {
  if (GOOGLE_MAPS_KEY) inApp();
  else window.open(directionsUrl(point), "_blank", "noopener");
}

/** The way from where we are to the place, by car or on foot, with a hand-off to Google Maps to be guided. */
export function DirectionsView({ point, onClose }: { point: GeoPoint; onClose: () => void }) {
  const tr = useT();
  const { at, problem } = useHere();
  const [mode, setMode] = useState<TravelMode>("driving");
  const pane = useMedia("(width >= 48rem)") ? document.getElementById("pane") : null;
  useCloseOnBack(onClose);
  useEffect(() => locateMe(true), []);
  const src =
    at &&
    `https://www.google.com/maps/embed/v1/directions?${new URLSearchParams({
      key: GOOGLE_MAPS_KEY!,
      origin: `${at.lat},${at.lng}`,
      destination: `${point.lat},${point.lng}`,
      mode,
      language: getLocale() === "mg" ? "fr" : getLocale(),
    })}`;

  const view = (
    <div
      className={`${pane ? "absolute" : "fixed"} inset-0 z-[70] flex flex-col bg-white dark:bg-stone-900`}
      role="dialog"
      aria-modal={!pane}
      aria-label={tr.messages.directions}
    >
      <div className="flex items-center gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label={tr.common.close} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
          <X className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate font-semibold">{point.name ?? tr.summary.kinds.location}</span>
        <div className="flex shrink-0 rounded-full bg-black/5 p-0.5 dark:bg-white/10">
          {(["driving", "walking"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold ${
                mode === m ? "bg-white shadow dark:bg-stone-700" : "text-stone-500"
              }`}
            >
              {m === "driving" ? <Car className="size-4" /> : <Footprints className="size-4" />}
              {tr.messages[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-stone-200 dark:bg-stone-800">
        {src ? (
          <iframe title={tr.messages.directions} src={src} referrerPolicy="no-referrer-when-downgrade" className="size-full border-0" />
        ) : (
          <p className="grid size-full place-items-center p-6 text-center text-sm text-stone-500">
            {problem === "denied" ? tr.composer.locationDenied : problem ? tr.composer.locationFailed : tr.messages.findingYou}
          </p>
        )}
      </div>
      <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <a
          href={directionsUrl(point, mode)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-full bg-brand py-3 font-semibold text-brand-ink"
        >
          <Navigation className="size-5" />
          {tr.messages.startInGoogleMaps}
        </a>
      </div>
    </div>
  );
  return pane ? createPortal(view, pane) : <Portal>{view}</Portal>;
}

function LocationSheet({ point, onDirections, onClose }: { point: GeoPoint; onDirections: () => void; onClose: () => void }) {
  const tr = useT();
  const link = mapsUrl(point);
  const share = () =>
    navigator.share
      ? void navigator.share({ title: point.name ?? tr.summary.kinds.location, url: link }).catch(() => null)
      : void navigator.clipboard.writeText(link).catch(() => null);

  return (
    <Sheet
      onClose={onClose}
      actions={[
        { label: tr.messages.directions, onSelect: onDirections },
        { label: tr.messages.openInMaps, onSelect: () => window.open(link, "_blank", "noopener") },
        { label: tr.messages.saveLocation, onSelect: share },
        { label: tr.messages.copyCoords, onSelect: () => void navigator.clipboard.writeText(coordsLabel(point)).catch(() => null) },
      ]}
    >
      <LocationDetails point={point} className="bg-white/70 shadow-xl backdrop-blur-xl backdrop-saturate-150 dark:bg-stone-900/70" />
    </Sheet>
  );
}

/**
 * Picks a place to send: where we are, or anywhere found by moving the map or searching. Search goes through our
 * API, which allows each person a few a day.
 */
export function LocationPicker({
  initialEphemeral,
  onSend,
  onClose,
}: {
  initialEphemeral: EphemeralInput | null;
  onSend: (point: GeoPoint, ephemeral: EphemeralInput | null) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [center, setCenter] = useState<GeoPoint>({ lat: 0, lng: 20 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [name, setName] = useState<string | undefined>();
  const [me, setMe] = useState<GeoPoint | null>(null);
  const [ephemeral, setEphemeral] = useState(initialEphemeral);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PlaceSuggestionDTO[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [session, setSession] = useState(newSession);
  const [pickerId] = useState(newSession);
  const typed = useRef("");
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
  const lastWheel = useRef(0);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const useGoogle = !!GOOGLE_MAPS_KEY && !googleFailed;
  const mapEl = useRef<HTMLDivElement>(null);
  const gmap = useRef<GoogleMap | null>(null);
  const view = useRef({ center, zoom });
  useEffect(() => {
    view.current = { center, zoom };
  });
  useCloseOnBack(onClose);

  const goTo = (p: GeoPoint, z: number) => {
    setCenter(p);
    setZoom(z);
    gmap.current?.setCenter({ lat: p.lat, lng: p.lng });
    gmap.current?.setZoom(z);
  };

  useEffect(() => {
    if (!useGoogle) return;
    let live = true;
    (window as GoogleWindow).gm_authFailure = () => setGoogleFailed(true);
    six.api
      .GET("/v1/map-picker", { params: { query: { session: pickerId } } })
      .then((res) => {
        unwrap(res);
        return loadGoogleMaps();
      })
      .then(
      (maps) => {
        if (!live || !mapEl.current) return;
        const { center: c, zoom: z } = view.current;
        const m = new maps.Map(mapEl.current, {
          center: { lat: c.lat, lng: c.lng },
          zoom: z,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        m.addListener("idle", () => {
          const at = m.getCenter();
          if (at) setCenter({ lat: at.lat(), lng: at.lng() });
          setZoom(m.getZoom() ?? z);
        });
        m.addListener("dragstart", () => {
          setName(undefined);
          setFound(null);
        });
        gmap.current = m;
      },
      () => setGoogleFailed(true),
    );
    return () => {
      live = false;
      gmap.current = null;
    };
  }, [useGoogle]);

  useEffect(() => gmap.current?.setMapTypeId(satellite ? "hybrid" : "roadmap"), [satellite]);

  const locate = () =>
    currentPosition().then(
      (p) => {
        setMe(p);
        goTo(p, 16);
        setName(undefined);
      },
      (e: Error) => setNote(e.message === "denied" ? tr.composer.locationDenied : tr.composer.locationFailed),
    );

  useEffect(() => void locate(), []);

  const move = (to: GeoPoint, z = zoom) => {
    setCenter(to);
    setZoom(z);
    setName(undefined);
  };

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    move(unproject(d.from.x - (e.clientX - d.x), d.from.y - (e.clientY - d.y), zoom));
  }

  function onWheel(e: React.WheelEvent) {
    if (Date.now() - lastWheel.current < 250 || !e.deltaY) return;
    lastWheel.current = Date.now();
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + (e.deltaY < 0 ? 1 : -1))));
  }

  async function suggest(q: string) {
    if (q.length < 2) return;
    setNote(null);
    const near = zoom > 6 ? { lat: center.lat, lng: center.lng } : {};
    try {
      const res = unwrap(await six.api.GET("/v1/place-suggest", { params: { query: { q, session, locale: getLocale(), ...near } } }));
      if (typed.current !== q) return;
      setFound(res.suggestions);
      setNote(res.suggestions.length ? tr.composer.searchesLeft(res.left) : tr.composer.noPlaces);
    } catch (err) {
      if (typed.current !== q) return;
      setFound(null);
      setNote(err instanceof SixApiError && err.code === "PLACE_SEARCH_LIMIT_REACHED" ? tr.composer.placeSearchLimit : tr.composer.placesUnavailable);
    }
  }

  useEffect(() => {
    const q = query.trim();
    typed.current = q;
    if (q.length < 2) return;
    const timer = setTimeout(() => void suggest(q), 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function pick(p: PlaceSuggestionDTO) {
    setFound(null);
    try {
      goTo(unwrap(await six.api.GET("/v1/place-details", { params: { query: { id: p.id, session, locale: getLocale() } } })), 17);
      setName(p.name);
    } catch {
      setNote(tr.composer.placesUnavailable);
    }
    setSession(newSession());
  }

  const round = "grid size-10 place-items-center rounded-full bg-white text-stone-700 shadow-md hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-200";

  return (
    <Portal>
      <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/40 md:items-center" role="dialog" aria-modal aria-label={tr.composer.sharePlace}>
        <div className="flex h-[min(100dvh,44rem)] w-full max-w-lg flex-col overflow-hidden bg-white md:rounded-2xl dark:bg-stone-900">
          <div className="flex items-center gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button type="button" onClick={onClose} aria-label={tr.common.close} className="grid size-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
              <X className="size-5" />
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void suggest(query.trim());
              }}
              className="relative flex-1"
            >
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr.composer.searchPlaces}
                enterKeyHint="search"
                className="w-full appearance-none rounded-full bg-black/5 py-2 pr-3 pl-9 text-[16px] outline-none focus:ring-2 focus:ring-brand md:text-sm dark:bg-white/10"
              />
            </form>
          </div>
          {note && <p className="px-4 pb-2 text-center text-xs text-stone-500">{note}</p>}
          <div className="relative min-h-0 flex-1">
            {useGoogle ? (
              <>
                <div ref={mapEl} className="absolute inset-0 bg-stone-200 dark:bg-stone-800" />
                <MapPin className="pointer-events-none absolute top-1/2 left-1/2 size-9 -translate-x-1/2 -translate-y-full fill-red-500 text-white drop-shadow" />
              </>
            ) : (
              <div
                className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, from: project(center, zoom) };
                  setFound(null);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onWheel={onWheel}
              >
                <TileMap center={center} zoom={zoom} className="size-full" />
              </div>
            )}
            {found && found.length > 0 && query.trim().length >= 2 && (
              <ul className="absolute inset-x-2 top-2 max-h-[60%] overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-stone-800">
                {found.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => void pick(p)}
                      className="block w-full px-4 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      {p.address && <span className="block truncate text-xs text-stone-500">{p.address}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="absolute right-3 bottom-6 flex flex-col items-end gap-2">
              {useGoogle && (
                <button
                  type="button"
                  onClick={() => setSatellite(!satellite)}
                  className="flex h-10 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-stone-700 shadow-md hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-200"
                >
                  <Layers className="size-4" />
                  {satellite ? tr.messages.mapView : tr.messages.satellite}
                </button>
              )}
              <button type="button" onClick={() => void locate()} aria-label={tr.composer.myLocation} title={tr.composer.myLocation} className={round}>
                <LocateFixed className="size-5" />
              </button>
              <button type="button" onClick={() => goTo(center, Math.min(MAX_ZOOM, Math.round(zoom) + 1))} aria-label={tr.composer.zoomIn} className={round}>
                <Plus className="size-5" />
              </button>
              <button type="button" onClick={() => goTo(center, Math.max(MIN_ZOOM, Math.round(zoom) - 1))} aria-label={tr.composer.zoomOut} className={round}>
                <Minus className="size-5" />
              </button>
            </div>
          </div>
          <div className="space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="text-center text-sm">
              {name && <div className="truncate font-semibold">{name}</div>}
              <div className="text-stone-500">{coordsLabel(center)}</div>
            </div>
            <div className="flex items-center gap-2">
              <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
              <button
                type="button"
                onClick={() => onSend({ lat: center.lat, lng: center.lng, ...(name && { name }) }, ephemeral)}
                disabled={zoom < 10}
                className="flex-1 rounded-full bg-brand py-2.5 font-semibold text-brand-ink disabled:opacity-40"
              >
                {tr.composer.sendThisPlace}
              </button>
            </div>
            {me && (
              <button
                type="button"
                onClick={() => onSend(me, ephemeral)}
                className="w-full rounded-full bg-black/5 py-2.5 font-semibold hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
              >
                {tr.composer.sendMyLocation}
                {me.accuracy ? ` · ${tr.messages.within(Math.round(me.accuracy))}` : ""}
              </button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** Where the browser thinks we are. Rejects with "denied" when the user or the site settings said no. */
export function currentPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("failed"));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Math.min(Math.round(p.coords.accuracy), 100_000),
        }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? "denied" : "failed")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}
