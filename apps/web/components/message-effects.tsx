"use client";

import { MessageEffect } from "@six/shared";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

const KEY = "six:effects-seen";

function loadSeen() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return new Set<string>();
  }
}

let seen: Set<string> | null = null;

/** Remembers that this device already played a message's effect or opened its gift, so it doesn't happen again. */
function once(id: string) {
  seen ??= loadSeen();
  if (seen.has(id)) return false;
  seen.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen].slice(-500)));
  } catch {}
  return true;
}

const wasSeen = (id: string) => (seen ??= loadSeen()).has(id);

const CONFETTI = ["#f97316", "#facc15", "#22c55e", "#3b82f6", "#ec4899", "#a855f7"];

function particles(effect: "hearts" | "confetti") {
  const n = effect === "hearts" ? 9 : 26;
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
    const reach = 50 + ((i * 37) % 40);
    return {
      i,
      x: effect === "hearts" ? 8 + ((i * 29) % 84) : 50,
      dx: effect === "hearts" ? ((i % 5) - 2) * 6 : Math.cos(angle) * reach,
      dy: effect === "hearts" ? -60 - ((i * 13) % 50) : Math.sin(angle) * reach - 20,
      rot: (i * 47) % 360,
      delay: (i % 6) * 70,
      color: CONFETTI[i % CONFETTI.length]!,
    };
  });
}

/**
 * Draws a text bubble's effect over it. Put it first inside the bubble, which must be `relative`.
 * `id` stays the same from sending to sent, so hearts and confetti play once and a gift stays open.
 */
export function EffectLayer({ effect, id }: { effect: MessageEffect; id: string }) {
  const tr = useT();
  const [wrapped, setWrapped] = useState(() => effect === "gift" && !wasSeen(`gift:${id}`));
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if ((effect !== "hearts" && effect !== "confetti") || !once(`play:${id}`)) return;
    setBurst(true);
    const t = setTimeout(() => setBurst(false), 2200);
    return () => clearTimeout(t);
  }, [effect, id]);

  if (effect === "fire") {
    return (
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]">
        <span className="absolute inset-0 animate-[fx-glow_1.6s_ease-in-out_infinite] rounded-[inherit] motion-reduce:animate-none" />
        <span className="absolute inset-x-1 -top-3.5 flex justify-around text-sm">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="animate-[fx-flicker_0.9s_ease-in-out_infinite] motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }}>
              🔥
            </span>
          ))}
        </span>
      </span>
    );
  }

  if (effect === "gift") {
    if (!wrapped) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          once(`gift:${id}`);
          setWrapped(false);
        }}
        aria-label={tr.messages.openGift}
        title={tr.messages.openGift}
        className="absolute inset-0 z-10 grid min-h-full place-items-center overflow-hidden rounded-[inherit] bg-gradient-to-br from-pink-400 to-rose-500"
      >
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-2.5 -translate-x-1/2 bg-white/90" />
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 bg-white/90" />
        <span aria-hidden className="relative animate-[fx-wiggle_1.4s_ease-in-out_infinite] text-xl motion-reduce:animate-none">
          🎀
        </span>
      </button>
    );
  }

  if (!burst) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-10 motion-reduce:hidden">
      {particles(effect).map((p) => (
        <span
          key={p.i}
          className="absolute top-1/2 animate-[fx-fly_1.6s_ease-out_forwards] opacity-0"
          style={
            {
              left: `${p.x}%`,
              animationDelay: `${p.delay}ms`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
            } as React.CSSProperties
          }
        >
          {effect === "hearts" ? (
            <span className="text-lg">❤️</span>
          ) : (
            <span className="block h-2.5 w-1.5 rounded-[1px]" style={{ background: p.color }} />
          )}
        </span>
      ))}
    </span>
  );
}

/** The composer's effects tray: the message as it would look with each effect; picking one sends it. */
export function EffectTray({ text, onPick }: { text: string; onPick: (effect: MessageEffect) => void }) {
  const tr = useT();
  return (
    <div role="group" aria-label={tr.messages.effects} className="flex gap-3 overflow-x-auto px-1 pt-3 pb-1">
      {MessageEffect.options.map((effect) => (
        <button
          key={effect}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(effect)}
          aria-label={tr.messages.sendWithEffect(tr.messages.effectNames[effect])}
          className="flex shrink-0 flex-col items-center gap-1.5"
        >
          <span className="relative max-w-36 truncate rounded-2xl bg-brand px-3 py-1.5 text-sm text-brand-ink">
            {effect === "gift" ? (
              <span className="invisible">{text}</span>
            ) : (
              text
            )}
            <EffectPreview effect={effect} />
          </span>
          <span className="text-xs text-stone-500">{tr.messages.effectNames[effect]}</span>
        </button>
      ))}
    </div>
  );
}

function EffectPreview({ effect }: { effect: MessageEffect }) {
  if (effect === "fire") {
    return (
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[0_0_12px_rgba(249,115,22,0.75)]" />
    );
  }
  if (effect === "gift") {
    return (
      <span aria-hidden className="absolute inset-0 grid place-items-center overflow-hidden rounded-[inherit] bg-gradient-to-br from-pink-400 to-rose-500">
        <span className="absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 bg-white/90" />
        <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 bg-white/90" />
        <span className="relative text-sm">🎀</span>
      </span>
    );
  }
  return (
    <span aria-hidden className="pointer-events-none absolute -top-2 -right-1 text-sm">
      {effect === "hearts" ? "❤️" : "🎉"}
    </span>
  );
}
