import { Camera, Shuffle } from "lucide-react-native";
import { type Gender, aliasAvatar, randomAlias } from "@six/shared";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { suggestAvatars } from "@/lib/avatar-suggestions";
import { useT } from "@/lib/i18n";
import { pickAvatar } from "@/lib/media";
import { brand, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { Text } from "./text";

const MAX_BYTES = 64 * 1024;

type Kind = "food" | Gender;

const suggest = (kind?: Kind) => (kind === "food" ? Array.from({ length: 5 }, randomAlias) : suggestAvatars(5, kind));

/** A round photo to tap for one from the gallery, with a row of generated pictures to pick from instead; hands back a data URL. With a `kind` (foods, or heads of a girl or a boy), the first picture is picked straight away when there's no photo yet, and again when the kind changes unless a photo from the gallery was chosen. */
export function PhotoPicker({
  name,
  photo,
  onChange,
  kind,
  ring,
}: {
  name: string;
  photo: string | null;
  onChange: (dataUrl: string) => void;
  kind?: Kind;
  ring?: string;
}) {
  const t = useTheme();
  const tr = useT();
  const [suggestions, setSuggestions] = useState(() => suggest(kind));
  const [picked, setPicked] = useState<string | null>(null);
  const [rendering, setRendering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shownKind, setShownKind] = useState(kind);
  const [auto, setAuto] = useState(!!kind && !photo);
  const shot = useRef<ComponentRef<typeof View>>(null);
  const food = kind === "food";

  if (shownKind !== kind) {
    setShownKind(kind);
    setSuggestions(suggest(kind));
    setAuto(!photo || picked !== null);
  }

  useEffect(() => {
    if (auto) void choose(0);
  });

  async function fromGallery() {
    setError(null);
    try {
      const url = await pickAvatar();
      if (url) {
        onChange(url);
        setPicked(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.common.couldNotReadImage);
    }
  }

  async function choose(i: number) {
    setAuto(false);
    setError(null);
    setRendering(suggestions[i]!);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      for (const quality of [0.85, 0.7, 0.55]) {
        const base64 = await captureRef(shot, { format: "jpg", quality, result: "base64", width: 192, height: 192 });
        if (Math.floor((base64.length * 3) / 4) <= MAX_BYTES) {
          onChange(`data:image/jpeg;base64,${base64}`);
          setPicked(suggestions[i]!);
          return;
        }
      }
      throw new Error("too big");
    } catch {
      setError(tr.contacts.couldNotUsePicture);
    }
  }

  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <Pressable
        onPress={() => void fromGallery()}
        accessibilityLabel={tr.contacts.choosePhoto}
        style={ring && { borderWidth: 3, borderColor: ring, borderRadius: 999, padding: 2 }}
      >
        <Avatar user={{ displayName: name || "?", avatarUrl: photo }} size="lg" />
        <View style={styles.cameraBadge}>
          <Camera size={22} color="#fff" />
        </View>
      </Pressable>
      <View style={styles.row}>
        {suggestions.map((svg, i) => (
          <Pressable
            key={i}
            onPress={() => void choose(i)}
            accessibilityLabel={tr.contacts.usePicture}
            style={[styles.suggestion, picked === svg && { borderColor: brand }]}
          >
            {food ? (
              <Avatar user={{ displayName: svg, avatarUrl: null }} />
            ) : (
              <View style={styles.clip}>
                <SvgXml xml={svg} width="100%" height="100%" />
              </View>
            )}
          </Pressable>
        ))}
        <Pressable
          onPress={() => setSuggestions(suggest(kind))}
          accessibilityLabel={tr.contacts.shuffle}
          hitSlop={6}
          style={styles.shuffle}
        >
          <Shuffle size={20} color={brand} />
        </Pressable>
      </View>
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      {rendering && (
        <View ref={shot} collapsable={false} style={styles.offscreen}>
          {food ? (
            <View style={[styles.food, { backgroundColor: rendering }]}>
              <Text style={styles.foodText}>{aliasAvatar(rendering)?.food}</Text>
            </View>
          ) : (
            <SvgXml xml={rendering} width={192} height={192} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cameraBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  suggestion: { width: 42, height: 42, borderRadius: 999, borderWidth: 2, borderColor: "transparent", padding: 1 },
  clip: { flex: 1, borderRadius: 999, overflow: "hidden" },
  shuffle: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  food: { flex: 1, alignItems: "center", justifyContent: "center" },
  foodText: { fontSize: 104, lineHeight: 132, includeFontPadding: false },
  offscreen: { position: "absolute", left: -1000, top: 0, width: 192, height: 192, backgroundColor: "#fff" },
});
