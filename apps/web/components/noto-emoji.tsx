"use client";

import { useState } from "react";
import { drawsNotoFont, notoPictureUrl } from "@/lib/emoji";

const font = drawsNotoFont();
const NOTO = { fontFamily: '"Noto Color Emoji", sans-serif' };

/**
 * One emoji the way Noto draws it, in every browser: with the font where it works, else as Noto's picture, so Safari
 * shows the same faces and doesn't miss the newest emoji. Falls back to the device's own if the picture fails.
 */
export function NotoEmoji({ emoji, className = "size-[1em]" }: { emoji: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (font || failed) return <span style={NOTO}>{emoji}</span>;
  return (
    <img src={notoPictureUrl(emoji)} alt={emoji} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} className={className} />
  );
}
