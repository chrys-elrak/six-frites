import type { EphemeralDTO, EphemeralInput } from "@six/shared";

export interface EphemeralOption {
  label: string;
  value: EphemeralInput;
}

export const EPHEMERAL_OPTIONS: EphemeralOption[] = [
  { label: "View once", value: { maxViews: 1 } },
  { label: "View twice", value: { maxViews: 2 } },
  { label: "3 seconds after opening", value: { ttlSeconds: 3 } },
  { label: "10 seconds after opening", value: { ttlSeconds: 10 } },
  { label: "30 seconds after opening", value: { ttlSeconds: 30 } },
  { label: "1 minute after opening", value: { ttlSeconds: 60 } },
];

export function shortRule(e: Pick<EphemeralDTO, "maxViews" | "ttlSeconds">) {
  const parts: string[] = [];
  if (e.maxViews === 1) parts.push("View once");
  else if (e.maxViews) parts.push(`View ${e.maxViews === 2 ? "twice" : `${e.maxViews}×`}`);
  if (e.ttlSeconds) parts.push(e.ttlSeconds < 60 ? `${e.ttlSeconds}s` : `${Math.round(e.ttlSeconds / 60)} min`);
  return parts.join(" · ");
}
