import { CUSTOM_THEME_COLORS, customTheme, customThemeColors } from "@six/shared";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { Wallpaper } from "./chat-background";
import { PrimaryButton, TextButton } from "./ui";

const HEX = /^#?([0-9a-f]{6})$/i;

/**
 * Picks your bubble colour and, optionally, the other person's, previewing the whole theme built from
 * them: wallpaper, doodles and both kinds of bubble.
 */
export function CustomThemePicker({
  title,
  current,
  onPick,
  onClose,
}: {
  title: string;
  current: string | null;
  onPick: (mine: string, theirs: string | null) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const start = customThemeColors(current);
  const [mine, setMine] = useState(start?.mine ?? CUSTOM_THEME_COLORS[0]!);
  const [theirs, setTheirs] = useState<string | null>(start?.theirs ?? null);
  const [target, setTarget] = useState<"mine" | "theirs">("mine");
  const hex = target === "mine" ? mine : theirs;
  const [typed, setTyped] = useState(mine);
  const theme = customTheme(mine, theirs);
  const w = t.dark ? theme.dark : theme.light;

  const choose = (c: string | null) => {
    if (target === "mine") setMine(c ?? mine);
    else setTheirs(c);
    setTyped(c ?? "");
  };
  const switchTo = (next: "mine" | "theirs") => {
    setTarget(next);
    setTyped((next === "mine" ? mine : theirs) ?? "");
  };

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>

          <View style={[styles.preview, { borderColor: t.border }]}>
            <Wallpaper theme={theme} dark={t.dark} id="custom-preview" />
            <View style={[styles.bubble, styles.incoming, { backgroundColor: w.theirBubble }]}>
              <Text style={{ color: w.theirBubbleInk, fontSize: 14 }}>{tr.chat.previewTheirs}</Text>
            </View>
            <View style={[styles.bubble, styles.outgoing, { backgroundColor: w.bubble }]}>
              <Text style={{ color: w.bubbleInk, fontSize: 14 }}>{tr.chat.previewMine}</Text>
            </View>
          </View>

          <View style={[styles.tabs, { backgroundColor: t.field }]}>
            {(["mine", "theirs"] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => switchTo(k)}
                accessibilityState={{ selected: target === k }}
                style={[styles.tab, target === k && { backgroundColor: brand }]}
              >
                <Text style={{ color: target === k ? brandInk : t.textSoft, fontWeight: "600", fontSize: 14 }}>
                  {k === "mine" ? tr.chat.yourMessages : tr.chat.theirMessages}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.swatches}>
            {target === "theirs" && (
              <Pressable
                onPress={() => choose(null)}
                accessibilityLabel={tr.chat.automatic}
                accessibilityState={{ selected: theirs === null }}
                style={[styles.swatch, styles.auto, { borderColor: theirs === null ? brand : t.border }]}
              >
                <Text style={{ color: t.textSoft, fontSize: 11, fontWeight: "700" }}>{tr.chat.auto}</Text>
              </Pressable>
            )}
            {CUSTOM_THEME_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => choose(c)}
                accessibilityLabel={tr.chat.colour(c)}
                accessibilityState={{ selected: c === hex }}
                style={[styles.swatch, { backgroundColor: c }]}
              >
                {c === hex && <Check size={18} color={customTheme(c).light.bubbleInk} strokeWidth={3} />}
              </Pressable>
            ))}
          </View>

          <View style={[styles.hexRow, { backgroundColor: t.field }]}>
            <View style={[styles.hexDot, { backgroundColor: hex ?? w.theirBubble }]} />
            <TextInput
              value={typed}
              onChangeText={(v) => {
                setTyped(v);
                const m = HEX.exec(v.trim());
                if (m) {
                  const c = `#${m[1]!.toLowerCase()}`;
                  if (target === "mine") setMine(c);
                  else setTheirs(c);
                }
              }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={7}
              placeholder={target === "theirs" ? tr.chat.auto : "#eb8a00"}
              placeholderTextColor={t.muted}
              accessibilityLabel={tr.chat.colourCode}
              style={{ flex: 1, color: t.text, fontSize: 16, fontFamily: "monospace", paddingVertical: 8 }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <TextButton title={tr.common.cancel} onPress={onClose} />
            </View>
            <PrimaryButton
              title={tr.chat.useColours}
              style={{ flex: 1 }}
              onPress={() => {
                onPick(mine, theirs);
                onClose();
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 14 },
  title: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  preview: { height: 150, borderRadius: 16, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  bubble: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, maxWidth: "75%" },
  incoming: { alignSelf: "flex-start", borderBottomLeftRadius: 6 },
  outgoing: { alignSelf: "flex-end", borderBottomRightRadius: 6 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  tabs: { flexDirection: "row", borderRadius: 12, padding: 3 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  auto: { borderWidth: 2 },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  hexRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingHorizontal: 12 },
  hexDot: { width: 22, height: 22, borderRadius: 11 },
});
