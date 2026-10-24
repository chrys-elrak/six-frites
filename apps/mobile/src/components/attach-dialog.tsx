import type { EphemeralInput, UploadKind } from "@six/shared";
import { Image } from "expo-image";
import { EyeOff, FileText, Play, SendHorizontal, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatBytes, formatDuration } from "@/lib/format";
import type { LocalFile } from "@/lib/send";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { EphemeralPicker } from "./ephemeral-picker";
import { IconButton } from "./ui";

export interface PickedFile {
  file: LocalFile;
  spoiler: boolean;
}

const visual = (kind: UploadKind) => kind === "image" || kind === "video";

function Preview({
  item,
  large,
  onToggleSpoiler,
  onRemove,
}: {
  item: PickedFile;
  large: boolean;
  onToggleSpoiler: () => void;
  onRemove: () => void;
}) {
  const t = useTheme();
  const { file } = item;
  const ratio = file.width && file.height ? file.width / file.height : 1;
  return (
    <View style={[styles.preview, { backgroundColor: t.field }, large ? { aspectRatio: Math.max(ratio, 0.6), maxHeight: 420 } : styles.tile]}>
      {file.kind === "image" ? (
        <Image
          source={{ uri: file.uri }}
          style={StyleSheet.absoluteFill}
          contentFit={large ? "contain" : "cover"}
          blurRadius={item.spoiler ? 40 : 0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.videoStub]}>
          <Play size={28} color="#fff" fill="#fff" />
          {!!file.durationMs && <Text style={styles.stubText}>{formatDuration(file.durationMs)}</Text>}
        </View>
      )}
      <View style={styles.previewBar}>
        <Pressable
          onPress={onToggleSpoiler}
          accessibilityLabel={item.spoiler ? "Show normally" : "Hide with spoiler"}
          style={[styles.spoilerToggle, { backgroundColor: item.spoiler ? brand : "rgba(0,0,0,0.45)" }]}
        >
          <EyeOff size={14} color={item.spoiler ? brandInk : "#fff"} />
          {large && (
            <Text style={{ color: item.spoiler ? brandInk : "#fff", fontSize: 12, fontWeight: "600" }}>
              {item.spoiler ? "Spoiler on" : "Spoiler"}
            </Text>
          )}
        </Pressable>
        <Pressable onPress={onRemove} accessibilityLabel="Remove" style={styles.remove}>
          <X size={16} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export function AttachDialog({
  files,
  initialCaption,
  initialEphemeral,
  onCancel,
  onSend,
}: {
  files: LocalFile[];
  initialCaption: string;
  initialEphemeral: EphemeralInput | null;
  onCancel: () => void;
  onSend: (items: PickedFile[], caption: string, ephemeral: EphemeralInput | null) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PickedFile[]>(() => files.map((file) => ({ file, spoiler: false })));
  const [caption, setCaption] = useState(initialCaption);
  const [ephemeral, setEphemeral] = useState(initialEphemeral);

  const media = items.filter((i) => visual(i.file.kind));
  const others = items.filter((i) => !visual(i.file.kind));
  const single = media.length === 1 && others.length === 0;
  const toggle = (it: PickedFile) =>
    setItems((list) => list.map((i) => (i === it ? { ...i, spoiler: !i.spoiler } : i)));
  const remove = (it: PickedFile) => {
    const next = items.filter((i) => i !== it);
    if (!next.length) onCancel();
    setItems(next);
  };

  const title =
    media.length && !others.length
      ? `Send ${media.length === 1 ? (media[0]!.file.kind === "image" ? "photo" : "video") : `${media.length} items`}`
      : `Send ${items.length === 1 ? "file" : `${items.length} files`}`;

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onCancel} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.text }]}>{title}</Text>
            <IconButton Icon={X} label="Cancel" onPress={onCancel} />
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {single ? (
              <Preview item={media[0]!} large onToggleSpoiler={() => toggle(media[0]!)} onRemove={() => remove(media[0]!)} />
            ) : (
              media.length > 0 && (
                <View style={styles.grid}>
                  {media.map((item) => (
                    <Preview
                      key={item.file.uri}
                      item={item}
                      large={false}
                      onToggleSpoiler={() => toggle(item)}
                      onRemove={() => remove(item)}
                    />
                  ))}
                </View>
              )
            )}
            {others.map((item) => (
              <View key={item.file.uri} style={[styles.fileRow, { backgroundColor: t.field }]}>
                <View style={styles.fileIcon}>
                  <FileText size={20} color={brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>
                    {item.file.name}
                  </Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{formatBytes(item.file.size)}</Text>
                </View>
                <IconButton Icon={X} size={16} label={`Remove ${item.file.name}`} onPress={() => remove(item)} />
              </View>
            ))}
            {media.length > 0 && (
              <Text style={{ color: t.muted, fontSize: 12, paddingHorizontal: 4 }}>
                Tap the eye on a photo or video to hide it as a spoiler.
              </Text>
            )}
            <View style={styles.ephemeralRow}>
              <Text style={{ color: t.muted, fontSize: 14, flex: 1 }}>Self-destruct after viewing</Text>
              <EphemeralPicker value={ephemeral} onChange={setEphemeral} />
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={4000}
              placeholder="Add a caption…"
              placeholderTextColor={t.muted}
              accessibilityLabel="Caption"
              style={[styles.caption, { backgroundColor: t.field, color: t.text }]}
            />
            <Pressable
              onPress={() => items.length && onSend(items, caption, ephemeral)}
              accessibilityLabel="Send"
              style={({ pressed }) => [styles.send, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <SendHorizontal size={20} color={brandInk} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" },
  head: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8, paddingTop: 12, paddingBottom: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  preview: { borderRadius: 12, overflow: "hidden", width: "100%" },
  tile: { width: "32%", aspectRatio: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  videoStub: { backgroundColor: "#292524", alignItems: "center", justifyContent: "center", gap: 4 },
  stubText: { color: "#fff", fontSize: 12 },
  previewBar: { position: "absolute", top: 6, left: 6, right: 6, flexDirection: "row", justifyContent: "space-between" },
  spoilerToggle: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  remove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 10 },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(235,138,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  ephemeralRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 },
  footer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  caption: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 16, maxHeight: 128 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: brand, alignItems: "center", justifyContent: "center" },
});
