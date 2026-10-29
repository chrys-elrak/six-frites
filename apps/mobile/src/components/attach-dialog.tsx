import type { EphemeralInput, UploadKind } from "@six/shared";
import { Image } from "expo-image";
import { EyeOff, FileText, Pencil, Play, SendHorizontal, Volume2, VolumeX, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text, TextInput } from "./text";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatBytes, formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { muteVideo } from "@/lib/media";
import type { LocalFile } from "@/lib/send";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { EphemeralPicker } from "./ephemeral-picker";
import { PhotoEditor } from "./photo-editor";
import { IconButton } from "./ui";

export interface PickedFile {
  file: LocalFile;
  spoiler: boolean;
  /** The video with its sound, kept while it is muted so unmuting is instant. */
  unmuted?: LocalFile;
}

const visual = (kind: UploadKind) => kind === "image" || kind === "video";
const editable = (file: LocalFile) => file.kind === "image" && file.mime !== "image/gif";

function Pill({ on, label, Icon, title, onPress }: { on: boolean; label?: string; Icon: typeof Pencil; title: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={title}
      accessibilityState={{ selected: on }}
      style={[styles.pill, { backgroundColor: on ? brand : "rgba(0,0,0,0.45)" }]}
    >
      <Icon size={14} color={on ? brandInk : "#fff"} />
      {!!label && <Text style={{ color: on ? brandInk : "#fff", fontSize: 12, fontWeight: "600" }}>{label}</Text>}
    </Pressable>
  );
}

function Preview({
  item,
  large,
  onToggleSpoiler,
  onEdit,
  onToggleMute,
  onRemove,
}: {
  item: PickedFile;
  large: boolean;
  onToggleSpoiler: () => void;
  onEdit: () => void;
  onToggleMute: () => void;
  onRemove: () => void;
}) {
  const t = useTheme();
  const tr = useT();
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
        <View style={styles.pills}>
          <Pill
            on={item.spoiler}
            Icon={EyeOff}
            title={item.spoiler ? tr.composer.showNormally : tr.composer.hideWithSpoiler}
            label={large ? (item.spoiler ? tr.composer.spoilerOn : tr.summary.spoiler) : undefined}
            onPress={onToggleSpoiler}
          />
          {editable(file) && (
            <Pill on={false} Icon={Pencil} title={tr.composer.editPhoto} label={large ? tr.composer.edit : undefined} onPress={onEdit} />
          )}
          {file.kind === "video" && (
            <Pill
              on={!!item.unmuted}
              Icon={item.unmuted ? VolumeX : Volume2}
              title={item.unmuted ? tr.composer.unmute : tr.composer.mute}
              label={large ? (item.unmuted ? tr.composer.muted : tr.composer.mute) : undefined}
              onPress={onToggleMute}
            />
          )}
        </View>
        <Pressable onPress={onRemove} accessibilityLabel={tr.common.remove} style={styles.remove}>
          <X size={16} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export function AttachDialog({
  files,
  editFirst = false,
  initialCaption,
  initialEphemeral,
  onCancel,
  onSend,
}: {
  files: LocalFile[];
  editFirst?: boolean;
  initialCaption: string;
  initialEphemeral: EphemeralInput | null;
  onCancel: () => void;
  onSend: (items: PickedFile[], caption: string, ephemeral: EphemeralInput | null) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PickedFile[]>(() => files.map((file) => ({ file, spoiler: false })));
  const [caption, setCaption] = useState(initialCaption);
  const [ephemeral, setEphemeral] = useState(initialEphemeral);
  const [editing, setEditing] = useState<PickedFile | null>(() => (editFirst ? items[0]! : null));
  const [muting, setMuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const swap = (it: PickedFile, file: LocalFile, unmuted?: LocalFile) =>
    setItems((list) => list.map((i) => (i === it ? { ...i, file, unmuted } : i)));
  async function toggleMute(it: PickedFile) {
    setError(null);
    if (it.unmuted) return swap(it, it.unmuted);
    setMuting(true);
    try {
      const muted = await muteVideo(it.file);
      if (muted) swap(it, muted, it.file);
      else setError(tr.composer.couldNotMute);
    } catch {
      setError(tr.composer.couldNotMute);
    } finally {
      setMuting(false);
    }
  }
  const handlers = (it: PickedFile) => ({
    onToggleSpoiler: () => toggle(it),
    onEdit: () => setEditing(it),
    onToggleMute: () => void toggleMute(it),
    onRemove: () => remove(it),
  });

  const title =
    media.length && !others.length
      ? media.length === 1
        ? media[0]!.file.kind === "image"
          ? tr.composer.sendPhoto
          : tr.composer.sendVideo
        : tr.composer.sendItems(media.length)
      : tr.composer.sendFiles(items.length);

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onCancel} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.text }]}>{title}</Text>
            <IconButton Icon={X} label={tr.common.cancel} onPress={onCancel} />
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {single ? (
              <Preview item={media[0]!} large {...handlers(media[0]!)} />
            ) : (
              media.length > 0 && (
                <View style={styles.grid}>
                  {media.map((item) => (
                    <Preview key={item.file.uri} item={item} large={false} {...handlers(item)} />
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
                <IconButton Icon={X} size={16} label={tr.composer.removeNamed(item.file.name)} onPress={() => remove(item)} />
              </View>
            ))}
            {media.length > 0 && (
              <Text style={{ color: t.muted, fontSize: 12, paddingHorizontal: 4 }}>
                {tr.composer.spoilerTip}
              </Text>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={{ color: t.danger, fontSize: 14, paddingHorizontal: 4 }}>
                {error}
              </Text>
            )}
            <View style={styles.ephemeralRow}>
              <Text style={{ color: t.muted, fontSize: 14, flex: 1 }}>{tr.composer.selfDestructAfterViewing}</Text>
              <EphemeralPicker value={ephemeral} onChange={setEphemeral} />
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={4000}
              placeholder={tr.composer.addCaption}
              placeholderTextColor={t.muted}
              accessibilityLabel={tr.composer.caption}
              style={[styles.caption, { backgroundColor: t.field, color: t.text }]}
            />
            <Pressable
              onPress={() => items.length && onSend(items, caption, ephemeral)}
              disabled={muting}
              accessibilityLabel={tr.common.send}
              style={({ pressed }) => [styles.send, muting && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <SendHorizontal size={20} color={brandInk} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      {editing && (
        <PhotoEditor
          file={editing.file}
          onCancel={() => setEditing(null)}
          onDone={(file) => {
            setEditing(null);
            swap(editing, file);
          }}
        />
      )}
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
  pills: { flexDirection: "row", gap: 4 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
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
