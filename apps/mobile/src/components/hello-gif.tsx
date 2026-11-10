import { unwrap } from "@six/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable } from "react-native";
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
    <Pressable
      onPress={() => realtime && queueMessage(qc, realtime, chatId, { text: "", gif })}
      accessibilityRole="button"
      accessibilityLabel={tr.messages.sendHello}
      style={{ width: 160, aspectRatio: gif.width / gif.height, borderRadius: 16, overflow: "hidden", marginTop: 4 }}
    >
      <Image source={{ uri: gif.previewUrl }} style={{ flex: 1 }} contentFit="cover" />
    </Pressable>
  );
}
