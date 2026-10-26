import type { MessageDTO } from "@six/shared";
import { Image } from "expo-image";
import { Flame, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { shortRule } from "@/lib/ephemeral";
import { segments } from "@/lib/markup";
import { flame } from "@/lib/theme";
import { AttachmentView, LightboxVideo } from "./attachment";
import { styleFor } from "./rich-text";

/** Full-screen view of an opened self-destructing message; closing it, or its timer running out, ends it. */
export function EphemeralViewer({
  message,
  expiresAt,
  onClose,
}: {
  message: MessageDTO;
  expiresAt: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const deadline = expiresAt ? Date.parse(expiresAt) : null;
  const [now, setNow] = useState(Date.now());
  const left = deadline ? Math.max(0, deadline - now) : null;
  const e = message.ephemeral;
  const a = message.attachment;
  const viewsLeft = e?.maxViews ? e.maxViews - e.views : null;

  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    if (left === 0) onClose();
  }, [left, onClose]);

  const mediaHeight = Math.round(height * 0.6);
  const text = message.text ?? "";

  return (
    <Modal animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.bar}>
          <Flame size={18} color={flame} fill={flame} />
          <Text style={styles.rule}>{e ? shortRule(e) : ""}</Text>
          {left !== null && <Text style={styles.countdown}>{Math.ceil(left / 1000)}s</Text>}
          <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={styles.close}>
            <X size={26} color="#fff" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {a?.url && a.kind === "image" && (
            <Image source={{ uri: a.url }} style={{ width: width - 32, height: mediaHeight }} contentFit="contain" />
          )}
          {a?.url && a.kind === "video" && (
            <View style={{ width: width - 32, height: mediaHeight }}>
              <LightboxVideo url={a.url} />
            </View>
          )}
          {a && (a.kind === "voice" || a.kind === "video_note" || a.kind === "file") && (
            <View style={styles.card}>
              <AttachmentView
                attachment={{ source: "server", data: a }}
                mine={false}
                onOpen={() => undefined}
                maxWidth={width - 64}
                autoPlay
              />
            </View>
          )}
          {!!text && (
            <Text style={styles.text}>
              {message.entities.length
                ? segments(text, message.entities).map((seg, i) => (
                    <Text key={i} style={styleFor(seg.styles, "rgba(255,255,255,0.15)")}>
                      {seg.text}
                    </Text>
                  ))
                : text}
            </Text>
          )}
        </ScrollView>

        <Text style={styles.footer}>
          {viewsLeft === 0
            ? "This message disappears when you close it."
            : left !== null
              ? "This message disappears when the timer ends."
              : viewsLeft
                ? `You can open it ${viewsLeft === 1 ? "once more" : `${viewsLeft} more times`}.`
                : ""}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)" },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, height: 56 },
  rule: { flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 14 },
  countdown: { color: flame, fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  body: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 16 },
  card: { borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", padding: 12 },
  text: { color: "#fff", fontSize: 19, lineHeight: 28, textAlign: "center" },
  footer: { color: "rgba(255,255,255,0.6)", fontSize: 12, textAlign: "center", paddingHorizontal: 16 },
});
