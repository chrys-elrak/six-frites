"use client";

import type { EphemeralInput } from "@six/shared";
import { Flame } from "lucide-react";
import { useState } from "react";
import { EPHEMERAL_OPTIONS, shortRule } from "@/lib/ephemeral";
import { useT } from "@/lib/i18n";
import { Sheet } from "./sheet";

export function EphemeralPicker({
  value,
  onChange,
  compact = false,
}: {
  value: EphemeralInput | null;
  onChange: (value: EphemeralInput | null) => void;
  compact?: boolean;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const label = value
    ? shortRule({ maxViews: value.maxViews ?? null, ttlSeconds: value.ttlSeconds ?? null }, tr)
    : null;

  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(true)}
        aria-label={label ? tr.composer.selfDestructRule(label) : tr.composer.selfDestruct}
        title={tr.composer.selfDestructAfterViewing}
        className={
          compact
            ? `grid size-10 shrink-0 place-items-center rounded-full transition ${
                value ? "text-orange-500" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              }`
            : `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                value
                  ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
              }`
        }
      >
        <Flame className={`size-5 ${value ? "fill-current" : ""}`} />
        {!compact && (label ?? tr.composer.selfDestruct)}
      </button>
      {open && (
        <Sheet
          title={tr.composer.selfDestructAfterViewing}
          onClose={() => setOpen(false)}
          actions={[
            ...EPHEMERAL_OPTIONS.map((o) => ({ label: o.label, onSelect: () => onChange(o.value) })),
            ...(value ? [{ label: tr.common.off, destructive: true, onSelect: () => onChange(null) }] : []),
          ]}
        />
      )}
    </>
  );
}
