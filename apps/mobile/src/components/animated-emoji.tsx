import LottieView from "lottie-react-native";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { animatedEmojiUrl } from "@/lib/emoji";

export function AnimatedEmoji({ emoji, size }: { emoji: string; size: number }) {
  const url = animatedEmojiUrl(emoji);
  const anim = useRef<LottieView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <Pressable
      accessibilityRole="image"
      accessibilityLabel={emoji}
      onPress={() => anim.current?.play(0)}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
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
