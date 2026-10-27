"use client";

import { type GeoPoint, coordsLabel, mapsUrl } from "@six/shared";
import { MapPin } from "lucide-react";
import { useT } from "@/lib/i18n";

export function LocationCard({ point, mine }: { point: GeoPoint; mine: boolean }) {
  const tr = useT();
  return (
    <a
      href={mapsUrl(point)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-64 max-w-full items-center gap-3 py-1"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full ${
          mine ? "bg-black/10" : "bg-brand/15 text-brand"
        }`}
      >
        <MapPin className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{tr.summary.kinds.location}</span>
        <span className="block truncate text-[13px] opacity-75">
          {coordsLabel(point)}
          {point.accuracy ? ` · ${tr.messages.within(Math.round(point.accuracy))}` : ""}
        </span>
        <span className="block text-[13px] font-medium underline underline-offset-2">{tr.messages.openInMaps}</span>
      </span>
    </a>
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
