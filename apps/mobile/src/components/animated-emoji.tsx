import LottieView from "lottie-react-native";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./text";
import { animatedEmojiUrl } from "@/lib/emoji";

/**
 * An emoji that plays its Noto animation. `inline` drops it to sit on the line with the text around it: Android rests
 * views inside text on the baseline, above the letters' descent, so it would otherwise ride a little high.
 */
export function AnimatedEmoji({ emoji, size, inline = false }: { emoji: string; size: number; inline?: boolean }) {
  const url = animatedEmojiUrl(emoji);
  const anim = useRef<LottieView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <Pressable
      accessibilityRole="image"
      accessibilityLabel={emoji}
      onPress={() => anim.current?.play(0)}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        ...(inline && { transform: [{ translateY: size * 0.22 }] }),
      }}
    >
      {url && !failed && (
        <LottieView
          ref={anim}
          source={{ uri: url }}
          autoPlay
          loop={false}
          onAnimationLoaded={() => setReady(true)}
          onAnimationFailure={() => setFailed(true)}
          style={{ position: "absolute", width: size, height: size, opacity: ready ? 1 : 0 }}
        />
      )}
      {!ready && (
        <View>
          <Text style={{ fontSize: size * 0.7, lineHeight: size * 0.9 }}>{emoji}</Text>
        </View>
      )}
    </Pressable>
  );
}
