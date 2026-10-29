import { cutStart, type videoCuts } from "@six/shared";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { Check, Play, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { readVideoCuts } from "@/lib/media";
import type { LocalFile } from "@/lib/send";
import { brand, brandInk } from "@/lib/theme";
import { Text } from "./text";

const MIN_SECONDS = 0.5;
const HANDLE = 14;

/** One end of the range, dragged along a bar `width` px wide that stands for `length` seconds. */
function Handle({
  value,
  length,
  width,
  label,
  onMove,
  onStep,
}: {
  value: number;
  length: number;
  width: number;
  label: string;
  onMove: (seconds: number) => void;
  onStep: (direction: 1 | -1) => void;
}) {
  const latest = useRef({ value, length, width, onMove });
  latest.current = { value, length, width, onMove };
  const pan = useMemo(() => {
    let start = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => (start = latest.current.value),
      onPanResponderMove: (_, g) => {
        const { length: l, width: w, onMove: move } = latest.current;
        if (w) move(start + (g.dx / w) * l);
      },
    });
  }, []);
  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: formatDuration(value * 1000) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      hitSlop={{ left: 14, right: 14, top: 8, bottom: 8 }}
      style={[styles.handle, { left: (value / length) * width - HANDLE / 2 }]}
    />
  );
}

/** Picks the part of a video to send. The start snaps to keyframes, since the cut is made without re-encoding. */
export function VideoTrimmer({
  file,
  onCancel,
  onDone,
}: {
  file: LocalFile;
  onCancel: () => void;
  onDone: (from: number, to: number) => void;
}) {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [cuts, setCuts] = useState<ReturnType<typeof videoCuts> | undefined>(undefined);
  const [[from, to], setRange] = useState<[number, number]>([0, 0]);
  const [width, setWidth] = useState(0);
  const player = useVideoPlayer(file.uri, (p) => (p.timeUpdateEventInterval = 0.1));
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: false, oldIsPlaying: false });
  const { currentTime } = useEvent(player, "timeUpdate", {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  useEffect(() => {
    let live = true;
    readVideoCuts(file)
      .then((found) => {
        if (!live) return;
        setCuts(found);
        if (found) setRange([0, found.duration]);
      })
      .catch(() => live && setCuts(null));
    return () => {
      live = false;
    };
  }, [file]);
  useEffect(() => {
    if (isPlaying && currentTime >= to) {
      player.pause();
      player.currentTime = from;
    }
  }, [isPlaying, currentTime, from, to, player]);

  const seek = (t: number) => {
    player.pause();
    player.currentTime = t;
  };
  const setStart = (seconds: number) => {
    if (!cuts) return;
    const start = cutStart(cuts.keyframes, Math.max(0, Math.min(seconds, to - MIN_SECONDS)));
    setRange([start, to]);
    seek(start);
  };
  const setEnd = (seconds: number) => {
    if (!cuts) return;
    const end = Math.min(cuts.duration, Math.max(seconds, from + MIN_SECONDS));
    setRange([from, end]);
    seek(end);
  };
  const toggle = () => {
    if (isPlaying) return player.pause();
    if (player.currentTime < from || player.currentTime >= to - 0.05) player.currentTime = from;
    player.play();
  };
  const length = cuts?.duration || 1;
  const changed = !!cuts && (from > 0.01 || to < cuts.duration - 0.01);

  return (
    <Modal animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.top}>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={tr.common.cancel} style={styles.round}>
            <X size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>{tr.composer.cutVideo}</Text>
          <Pressable
            onPress={() => (changed ? onDone(from, to) : onCancel())}
            disabled={!cuts}
            accessibilityRole="button"
            accessibilityLabel={tr.composer.cut}
            style={[styles.round, { backgroundColor: brand }, !cuts && { opacity: 0.4 }]}
          >
            <Check size={24} color={brandInk} strokeWidth={2.6} />
          </Pressable>
        </View>
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? tr.messages.pause : tr.composer.play}
          style={styles.stage}
        >
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
          {!isPlaying && (
            <View style={styles.play}>
              <Play size={28} color="#fff" fill="#fff" />
            </View>
          )}
        </Pressable>
        {cuts === null ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {tr.composer.cantCut}
          </Text>
        ) : !cuts ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 24 }} />
        ) : (
          <View style={styles.controls}>
            <View style={styles.bar} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
              <View style={[styles.kept, { left: (from / length) * width, width: ((to - from) / length) * width }]} />
              <Handle
                value={from}
                length={length}
                width={width}
                label={tr.composer.cutStart}
                onMove={setStart}
                onStep={(d) => {
                  const next =
                    d > 0
                      ? cuts.keyframes.find((k) => k > from + 1e-3)
                      : [...cuts.keyframes].reverse().find((k) => k < from - 1e-3);
                  if (next !== undefined) setStart(next);
                }}
              />
              <Handle value={to} length={length} width={width} label={tr.composer.cutEnd} onMove={setEnd} onStep={(d) => setEnd(to + d)} />
            </View>
            <View style={styles.times}>
              <Text style={styles.time}>{formatDuration(from * 1000)}</Text>
              <Text style={[styles.time, { color: "#fff", fontWeight: "700" }]}>{formatDuration((to - from) * 1000)}</Text>
              <Text style={styles.time}>{formatDuration(to * 1000)}</Text>
            </View>
            <Text style={styles.hint}>{tr.composer.cutHint}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000", gap: 12 },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: "#fff", fontSize: 17, fontWeight: "700", textAlign: "center" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  play: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  error: { color: "#f87171", fontSize: 14, textAlign: "center", marginVertical: 24 },
  controls: { paddingHorizontal: 20, gap: 8 },
  bar: { height: 40, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.15)" },
  kept: { position: "absolute", top: 0, bottom: 0, borderRadius: 6, backgroundColor: "rgba(235,138,0,0.35)" },
  handle: { position: "absolute", top: 0, bottom: 0, width: HANDLE, borderRadius: 6, backgroundColor: brand },
  times: { flexDirection: "row", justifyContent: "space-between" },
  time: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontVariant: ["tabular-nums"] },
  hint: { color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center" },
});
