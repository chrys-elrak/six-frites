"use client";

import { unwrap } from "@six/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { six } from "@/lib/six";

/** A random "hello" GIF for an empty chat, sent with one tap. Shows nothing when GIF search is off. */
export function HelloGif({ chatId }: { chatId: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const [pick] = useState(Math.random);
  const gifs = useQuery({
    queryKey: ["gifs", "hello"],
    queryFn: async () => unwrap(await six.api.GET("/v1/gifs", { params: { query: { q: "hello", kind: "gif" } } })).items,
    staleTime: 60 * 60_000,
    retry: false,
  });
  const gif = gifs.data?.[Math.floor(pick * gifs.data.length)];
  if (!gif) return null;
  return (
    <button
      type="button"
      onClick={() => realtime && void queueMessage(qc, realtime, chatId, { text: "", gif })}
      title={tr.messages.sendHello}
      aria-label={tr.messages.sendHello}
      className="mt-3 w-40 overflow-hidden rounded-2xl shadow-md transition-transform hover:scale-105 active:scale-95"
      style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
    >
      <img src={gif.previewUrl} alt={gif.title} draggable={false} className="size-full object-cover" />
    </button>
  );
}
