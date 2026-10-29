"use client";

import { type ReactNode, useState } from "react";
import { useT } from "@/lib/i18n";
import { VOICE_EFFECTS, type VoiceEffect, useVoiceEffect } from "@/lib/voice-fx";
import { Sheet } from "./sheet";

/**
 * Shows `children` as a button that opens the list of voice effects above it: the one for recording and calls,
 * or `value` with `onChange`. Its events stop here, so a message bubble around it doesn't take the taps.
 */
export function VoiceEffectSelect({
  className,
  children,
  value,
  onChange,
}: {
  className: string;
  children: ReactNode;
  value?: VoiceEffect;
  onChange?: (effect: VoiceEffect) => void;
}) {
  const tr = useT();
  const stored = useVoiceEffect((s) => s.effect);
  const store = useVoiceEffect((s) => s.set);
  const effect = value ?? stored;
  const set = onChange ?? store;
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const label = tr.composer.voiceEffect(tr.composer.voiceEffects[effect]);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <span className="contents" onClick={stop} onPointerDown={stop} onContextMenu={stop}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.left, y: r.top - 8 });
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!at}
        title={label}
        className={`relative ${className}`}
      >
        {children}
      </button>
      {at && (
        <Sheet
          at={at}
          onClose={() => setAt(null)}
          actions={VOICE_EFFECTS.map((e) => ({
            label: tr.composer.voiceEffects[e],
            checked: e === effect,
            onSelect: () => set(e),
          }))}
        />
      )}
    </span>
  );
}
