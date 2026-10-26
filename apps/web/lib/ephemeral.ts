import { type Dict, type EphemeralDTO, type EphemeralInput, durationLabel } from "@six/shared";
import { getT } from "@/lib/i18n";

export interface EphemeralOption {
  label: string;
  value: EphemeralInput;
}

const RULES: EphemeralInput[] = [
  { maxViews: 1 },
  { maxViews: 2 },
  { ttlSeconds: 3 },
  { ttlSeconds: 10 },
  { ttlSeconds: 30 },
  { ttlSeconds: 60 },
];

/** The picker's choices; each label is read in the current language when accessed. */
export const EPHEMERAL_OPTIONS: EphemeralOption[] = RULES.map((value) => ({
  value,
  get label() {
    const tr = getT();
    return value.maxViews
      ? tr.messages.views(value.maxViews)
      : tr.messages.afterOpening(durationLabel(value.ttlSeconds!, tr));
  },
}));

export function shortRule(e: Pick<EphemeralDTO, "maxViews" | "ttlSeconds">, tr: Dict = getT()) {
  const parts: string[] = [];
  if (e.maxViews) parts.push(tr.messages.views(e.maxViews));
  if (e.ttlSeconds) {
    parts.push(e.ttlSeconds < 60 ? tr.messages.seconds(e.ttlSeconds) : tr.messages.minutes(Math.round(e.ttlSeconds / 60)));
  }
  return parts.join(" · ");
}
