"use client";

import type { StickerDTO } from "@six/shared";
import type { AnimationItem } from "lottie-web";
import { useEffect, useRef, useState } from "react";

export function LottieView({
  url,
  size,
  autoplay = true,
  fallback,
  onReady,
}: {
  url: string | null;
  size: number;
  autoplay?: boolean;
  fallback?: React.ReactNode;
  onReady?: (anim: AnimationItem) => void;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const ready$ = useRef(onReady);
  ready$.current = onReady;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let item: AnimationItem | null = null;
    void (async () => {
      const { default: lottie } = await import("lottie-web/build/player/lottie_light");
      if (cancelled || !box.current) return;
      item = lottie.loadAnimation({
        container: box.current,
        renderer: "svg",
        loop: false,
        autoplay,
        path: url,
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
      const anim = item;
      anim.addEventListener("DOMLoaded", () => {
        if (cancelled) return;
        setReady(true);
        ready$.current?.(anim);
      });
      anim.addEventListener("data_failed", () => anim.destroy());
    })();
    return () => {
      cancelled = true;
      item?.destroy();
      setReady(false);
    };
  }, [url, autoplay]);

  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <span ref={box} aria-hidden className={`absolute inset-0 ${ready ? "" : "invisible"}`} />
      {!ready && fallback}
    </span>
  );
}

/** A sticker: plays once in a chat (again on hover), or sits still in a picker until hovered. */
export function StickerView({ sticker, size, still = false }: { sticker: StickerDTO; size: number; still?: boolean }) {
  const anim = useRef<AnimationItem | null>(null);
  const placeholder = (
    <span aria-hidden style={{ fontSize: size * 0.6, lineHeight: 1 }} className="opacity-40">
      {sticker.emoji}
    </span>
  );

  return (
    <span
      role="img"
      aria-label={`${sticker.emoji} sticker`}
      onPointerEnter={(e) => e.pointerType === "mouse" && anim.current?.goToAndPlay(0, true)}
      className="inline-grid place-items-center"
      style={{ width: size, height: size }}
    >
      {sticker.format === "lottie" ? (
        <LottieView
          url={sticker.url}
          size={size}
          autoplay={!still}
          fallback={placeholder}
          onReady={(a) => (anim.current = a)}
        />
      ) : sticker.url ? (
        <img src={sticker.url} alt="" draggable={false} className="size-full object-contain" />
      ) : (
        placeholder
      )}
    </span>
  );
}
