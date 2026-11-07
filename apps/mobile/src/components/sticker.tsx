import type { StickerDTO } from "@six/shared";
import { Image } from "expo-image";
import LottieView from "lottie-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "./text";
import { useT } from "@/lib/i18n";

/** A sticker: a Lottie animation or a picture (animated WebP plays by itself), with its emoji until it loads. */
export function StickerView({ sticker, size }: { sticker: StickerDTO; size: number }) {
  const tr = useT();
  const [ready, setReady] = useState(false);
  const box = { position: "absolute" as const, width: size, height: size, opacity: ready ? 1 : 0 };
  return (
    <View accessibilityRole="image" accessibilityLabel={tr.messages.sticker(sticker.emoji)} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {sticker.url &&
        (sticker.format === "lottie" ? (
          <LottieView source={{ uri: sticker.url }} autoPlay loop={false} onAnimationLoaded={() => setReady(true)} style={box} />
        ) : (
          <Image source={{ uri: sticker.url }} contentFit="contain" onLoad={() => setReady(true)} style={box} />
        ))}
      {!ready && <Text style={{ fontSize: size * 0.5, lineHeight: size * 0.65, opacity: 0.4 }}>{sticker.emoji}</Text>}
    </View>
  );
}
