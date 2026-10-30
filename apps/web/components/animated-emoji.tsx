"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";
import { animatedEmojiUrl } from "@/lib/emoji";
import { LottieView } from "./sticker";

export function AnimatedEmoji({ emoji, size }: { emoji: string; size: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const anim = useRef<AnimationItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    void animatedEmojiUrl(emoji).then((found) => !cancelled && setUrl(found));
    return () => {
      cancelled = true;
    };
  }, [emoji]);

  return (
    <span
      role="img"
      aria-label={emoji}
      onClick={() => anim.current?.goToAndPlay(0, true)}
      className="inline-grid cursor-pointer align-text-bottom"
    >
      <LottieView
        url={url}
        size={size}
        onReady={(a) => (anim.current = a)}
        fallback={
          <span aria-hidden style={{ fontSize: size * 0.78, lineHeight: 1 }}>
            {emoji}
          </span>
        }
      />
    </span>
  );
}
