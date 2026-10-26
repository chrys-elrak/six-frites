import type { EphemeralInput } from "@six/shared";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useVideoPlayer, VideoView } from "expo-video";
import { RefreshCw, SendHorizontal, Trash2, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { LocalFile } from "@/lib/send";
import { brand, brandInk } from "@/lib/theme";
import { EphemeralPicker } from "./ephemeral-picker";

const MAX_MS = 60_000;

/** Paints the dark backdrop around a round window, since camera surfaces ignore rounded clipping on Android. */
function RoundMask({ size }: { size: number }) {
  const r = size / 2;
  const d = `M0 0H${size}V${size}H0Z M${r} 0A${r} ${r} 0 1 0 ${r} ${size}A${r} ${r} 0 1 0 ${r} 0Z`;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={d} fill="#0c0a09" fillRule="evenodd" />
    </Svg>
  );
}

function Ring({ size, progress }: { size: number; progress: number }) {
  const r = 49;
  const c = 2 * Math.PI * r;
  return (
    <Svg
      viewBox="0 0 100 100"
      width={size + 16}
      height={size + 16}
      style={{ position: "absolute", top: -8, left: -8, transform: [{ rotate: "-90deg" }] }}
      pointerEvents="none"
    >
      <Circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" />
      <Circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={brand}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
      />
    </Svg>
  );
}

function Replay({ uri, size }: { uri: string; size: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <View style={{ width: size, height: size }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <RoundMask size={size} />
    </View>
  );
}

export function VideoNoteRecorder({
  initialEphemeral,
  onClose,
  onSend,
}: {
  initialEphemeral: EphemeralInput | null;
  onClose: () => void;
  onSend: (file: LocalFile, ephemeral: EphemeralInput | null) => void;
}) {
  const tr = useT();
  const [ephemeral, setEphemeral] = useState(initialEphemeral);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.78, 320);
  const camera = useRef<CameraView>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const [result, setResult] = useState<{ uri: string; durationMs: number } | null>(null);

  useEffect(() => {
    if (camPerm && !camPerm.granted && camPerm.canAskAgain) void requestCam();
    if (micPerm && !micPerm.granted && micPerm.canAskAgain) void requestMic();
  }, [camPerm, micPerm, requestCam, requestMic]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt.current), 100);
    return () => clearInterval(timer);
  }, [recording]);

  async function start() {
    if (!camera.current) return;
    startedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
    try {
      const video = await camera.current.recordAsync({ maxDuration: MAX_MS / 1000 });
      const durationMs = Date.now() - startedAt.current;
      if (video?.uri && durationMs >= 700) setResult({ uri: video.uri, durationMs });
    } finally {
      setRecording(false);
    }
  }

  async function send() {
    if (!result) return;
    const size = (await (await fetch(result.uri)).blob()).size;
    onSend({
      uri: result.uri,
      kind: "video_note",
      name: `video-note-${new Date().toISOString().slice(0, 19)}.mp4`,
      mime: "video/mp4",
      size,
      durationMs: result.durationMs,
    }, ephemeral);
  }

  const denied = (camPerm && !camPerm.granted && !camPerm.canAskAgain) || (micPerm && !micPerm.granted && !micPerm.canAskAgain);
  const allowed = camPerm?.granted && micPerm?.granted;

  return (
    <Modal animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.top}>
          <Pressable onPress={onClose} accessibilityLabel={tr.common.close} style={styles.topButton}>
            <X size={26} color="#fff" />
          </Pressable>
          {!recording && !result && allowed && (
            <Pressable
              onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}
              accessibilityLabel={tr.composer.switchCamera}
              style={styles.topButton}
            >
              <RefreshCw size={22} color="#fff" />
            </Pressable>
          )}
        </View>

        <View style={styles.middle}>
          <View style={{ width: size, height: size }}>
            {(recording || result) && <Ring size={size} progress={result ? 1 : Math.min(elapsed / MAX_MS, 1)} />}
            {denied ? (
              <View style={[styles.denied, { borderRadius: size / 2 }]}>
                <Text style={styles.deniedText}>{tr.composer.cameraMicDenied}</Text>
              </View>
            ) : result ? (
              <Replay uri={result.uri} size={size} />
            ) : allowed ? (
              <View style={{ width: size, height: size }}>
                <CameraView
                  ref={camera}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                  mode="video"
                  videoQuality="720p"
                  onCameraReady={() => setReady(true)}
                />
                <RoundMask size={size} />
              </View>
            ) : (
              <View style={[styles.denied, { borderRadius: size / 2 }]} />
            )}
          </View>
          <Text style={styles.status}>
            {recording ? `● ${formatDuration(elapsed)} / 1:00` : result ? tr.composer.preview : tr.composer.upToOneMinute}
          </Text>
        </View>

        <View style={styles.controls}>
          <View style={styles.picker}>
            <EphemeralPicker value={ephemeral} onChange={setEphemeral} compact />
          </View>
          {result ? (
            <>
              <Pressable onPress={() => setResult(null)} accessibilityLabel={tr.composer.recordAgain} style={styles.secondary}>
                <Trash2 size={24} color="#fff" />
              </Pressable>
              <Pressable onPress={() => void send()} accessibilityLabel={tr.composer.sendVideoNote} style={styles.sendButton}>
                <SendHorizontal size={28} color={brandInk} />
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={recording ? () => camera.current?.stopRecording() : () => void start()}
              disabled={!ready}
              accessibilityLabel={recording ? tr.composer.stopRecording : tr.composer.startRecording}
              style={[styles.shutter, !ready && { opacity: 0.4 }]}
            >
              <View style={recording ? styles.stopDot : styles.recDot} />
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0a09" },
  top: { flexDirection: "row", justifyContent: "space-between", padding: 8 },
  topButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  denied: { flex: 1, backgroundColor: "#292524", alignItems: "center", justifyContent: "center", padding: 32 },
  deniedText: { color: "rgba(255,255,255,0.8)", textAlign: "center", fontSize: 14 },
  status: { color: "#fff", fontFamily: "monospace", fontSize: 14 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 32, padding: 24 },
  picker: { position: "absolute", right: 24, top: 0, bottom: 0, justifyContent: "center" },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  recDot: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#ef4444" },
  stopDot: { width: 28, height: 28, borderRadius: 6, backgroundColor: "#ef4444" },
  secondary: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: brand, alignItems: "center", justifyContent: "center" },
});
