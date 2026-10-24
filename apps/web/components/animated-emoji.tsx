"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";
import { animatedEmojiUrl } from "@/lib/emoji";

export function AnimatedEmoji({ emoji, size }: { emoji: string; size: number }) {
  const box = useRef<HTMLSpanElement>(null);
  const anim = useRef<AnimationItem | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = await animatedEmojiUrl(emoji);
      if (!url || cancelled || !box.current) return;
      const { default: lottie } = await import("lottie-web/build/player/lottie_light");
      if (cancelled || !box.current) return;
      const item = lottie.loadAnimation({
        container: box.current,
        renderer: "svg",
        loop: false,
        autoplay: true,
        path: url,
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
      item.addEventListener("DOMLoaded", () => !cancelled && setReady(true));
      item.addEventListener("data_failed", () => item.destroy());
      anim.current = item;
    })();
    return () => {
      cancelled = true;
      anim.current?.destroy();
      anim.current = null;
    };
  }, [emoji]);

  return (
    <span
      role="img"
      aria-label={emoji}
      onClick={() => anim.current?.goToAndPlay(0, true)}
      className="relative inline-grid cursor-pointer place-items-center"
      style={{ width: size, height: size }}
    >
      <span ref={box} aria-hidden className={`absolute inset-0 ${ready ? "" : "invisible"}`} />
      {!ready && (
        <span aria-hidden style={{ fontSize: size * 0.78, lineHeight: 1 }}>
          {emoji}
        </span>
      )}
    </span>
  );
}
