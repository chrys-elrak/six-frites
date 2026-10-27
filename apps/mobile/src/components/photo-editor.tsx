import { type CropHandle, FULL_CROP, dragCrop, turnCrop } from "@six/shared";
import { Image } from "expo-image";
import { ImageManipulator, type ImageRef } from "expo-image-manipulator";
import { Check, RotateCcw, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { type GestureResponderHandlers, Modal, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { editPhoto } from "@/lib/media";
import type { LocalFile } from "@/lib/send";
import { brand, brandInk } from "@/lib/theme";

const CORNERS = ["nw", "ne", "sw", "se"] as const;
const pct = (v: number) => `${v * 100}%` as const;

export function PhotoEditor({
  file,
  onCancel,
  onDone,
}: {
  file: LocalFile;
  onCancel: () => void;
  onDone: (file: LocalFile) => void;
}) {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [source, setSource] = useState<ImageRef | null>(null);
  const [turns, setTurns] = useState(0);
  const [crop, setCrop] = useState(FULL_CROP);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ImageManipulator.manipulate(file.uri).renderAsync().then(setSource, onCancel);
  }, [file.uri]);

  const odd = turns % 2 === 1;
  const w = source ? (odd ? source.height : source.width) : 1;
  const h = source ? (odd ? source.width : source.height) : 1;
  const fit = Math.min(stage.width / w, stage.height / h);
  const frame = { width: w * fit, height: h * fit };
  const pic = odd ? { width: frame.height, height: frame.width } : frame;

  const latest = useRef({ crop, frame });
  latest.current = { crop, frame };
  const grips = useMemo(
    () =>
      Object.fromEntries(
        (["move", ...CORNERS] as const).map((handle) => {
          let from = FULL_CROP;
          const pan = PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: () => {
              from = latest.current.crop;
            },
            onPanResponderMove: (_, g) => {
              const f = latest.current.frame;
              setCrop(dragCrop(from, handle, g.dx / f.width, g.dy / f.height));
            },
          });
          return [handle, pan.panHandlers];
        }),
      ) as Record<CropHandle, GestureResponderHandlers>,
    [],
  );

  async function done() {
    if (!source) return;
    if (!turns && crop === FULL_CROP) return onCancel();
    setBusy(true);
    try {
      onDone(await editPhoto(file, source, turns, crop));
    } catch {
      onCancel();
    }
  }

  const shade = [
    { left: 0, right: 0, top: 0, height: pct(crop.y) },
    { left: 0, right: 0, top: pct(crop.y + crop.h), bottom: 0 },
    { left: 0, width: pct(crop.x), top: pct(crop.y), height: pct(crop.h) },
    { left: pct(crop.x + crop.w), right: 0, top: pct(crop.y), height: pct(crop.h) },
  ];

  return (
    <Modal animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.stage} onLayout={(e) => setStage(e.nativeEvent.layout)}>
          {source && fit > 0 && (
            <View style={frame}>
              <Image
                source={source}
                contentFit="fill"
                style={{
                  position: "absolute",
                  ...pic,
                  left: (frame.width - pic.width) / 2,
                  top: (frame.height - pic.height) / 2,
                  transform: [{ rotate: `${-90 * turns}deg` }],
                }}
              />
              {shade.map((s, i) => (
                <View key={i} pointerEvents="none" style={[styles.shade, s]} />
              ))}
              <View
                {...grips.move}
                style={[styles.box, { left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }]}
              >
                {CORNERS.map((corner) => (
                  <View
                    key={corner}
                    {...grips[corner]}
                    style={[
                      styles.grip,
                      corner[0] === "n" ? { top: 0, justifyContent: "flex-start" } : { bottom: 0, justifyContent: "flex-end" },
                      corner[1] === "w" ? { left: 0, alignItems: "flex-start" } : { right: 0, alignItems: "flex-end" },
                    ]}
                  >
                    <View style={styles.dot} />
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
        <View style={styles.tools}>
          <Pressable onPress={onCancel} accessibilityLabel={tr.common.cancel} hitSlop={8} style={styles.tool}>
            <X size={26} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => {
              setTurns((t) => (t + 1) % 4);
              setCrop(turnCrop);
            }}
            accessibilityLabel={tr.composer.rotate}
            hitSlop={8}
            style={styles.tool}
          >
            <RotateCcw size={26} color="#fff" />
          </Pressable>
          <Pressable
            onPress={done}
            disabled={!source || busy}
            accessibilityLabel={tr.common.done}
            style={[styles.tool, styles.done, (!source || busy) && { opacity: 0.5 }]}
          >
            <Check size={26} color={brandInk} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  stage: { flex: 1, margin: 28, alignItems: "center", justifyContent: "center" },
  shade: { position: "absolute", backgroundColor: "rgba(0,0,0,0.6)" },
  box: { position: "absolute", borderWidth: 2, borderColor: "#fff" },
  grip: { position: "absolute", width: 44, height: 44 },
  dot: { width: 16, height: 16, borderRadius: 8, margin: -9, backgroundColor: "#fff" },
  tools: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24 },
  tool: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  done: { backgroundColor: brand },
});
