import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useVideoPlayer, VideoView } from "expo-video";
import { RefreshCw, Square } from "lucide-react-native";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { LocalFile } from "@/lib/send";
import { brand } from "@/lib/theme";

const MAX_MS = 60_000;

export interface VideoNoteHandle {
  /** Stops and returns the clip, or null when it was too short or never started. */
  stop: () => Promise<LocalFile | null>;
  cancel: () => void;
}

/** Paints the backdrop around a round window, since camera surfaces ignore rounded clipping on Android. */
function RoundMask({ size, color }: { size: number; color: string }) {
  const r = size / 2;
  const d = `M0 0H${size}V${size}H0Z M${r} 0A${r} ${r} 0 1 0 ${r} ${size}A${r} ${r} 0 1 0 ${r} 0Z`;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={d} fill={color} fillRule="evenodd" />
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

const BACKDROP = "#0c0a09";

/**
 * Records a round video message over the chat, above the composer (`bottom` is its height). The
 * camera can be flipped mid-recording; on builds without the persistent-recording patch a flip ends
 * the clip, which then goes out like one that hit the time limit.
 */
export const VideoNoteCapture = forwardRef<
  VideoNoteHandle,
  { bottom: number; onTick: (ms: number) => void; onLimit: () => void; onStop: () => void }
>(function VideoNoteCapture({ bottom, onTick, onLimit, onStop }, ref) {
  const tr = useT();
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.72, 300);
  const camera = useRef<CameraView>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [elapsed, setElapsed] = useState(0);
  const pending = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const startedAt = useRef(0);
  const stopped = useRef(false);
  const handlers = useRef({ onTick, onLimit });
  handlers.current = { onTick, onLimit };

  useEffect(() => {
    if (camPerm && !camPerm.granted && camPerm.canAskAgain) void requestCam();
    else if (micPerm && !micPerm.granted && micPerm.canAskAgain) void requestMic();
  }, [camPerm, micPerm, requestCam, requestMic]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!pending.current || stopped.current) return;
      const ms = Math.min(Date.now() - startedAt.current, MAX_MS);
      setElapsed(ms);
      handlers.current.onTick(ms);
    }, 100);
    return () => {
      clearInterval(timer);
      if (pending.current && !stopped.current) camera.current?.stopRecording();
    };
  }, []);

  function begin() {
    if (pending.current || stopped.current || !camera.current) return;
    startedAt.current = Date.now();
    pending.current = camera.current.recordAsync({ maxDuration: MAX_MS / 1000 }).catch(() => undefined);
    void pending.current.then(() => !stopped.current && handlers.current.onLimit());
  }

  useImperativeHandle(
    ref,
    () => ({
      stop: async () => {
        stopped.current = true;
        const recording = pending.current;
        if (!recording) return null;
        camera.current?.stopRecording();
        const video = await recording;
        const durationMs = Math.min(Date.now() - startedAt.current, MAX_MS);
        if (!video?.uri || durationMs < 700) return null;
        const bytes = (await (await fetch(video.uri)).blob()).size;
        return {
          uri: video.uri,
          kind: "video_note",
          name: `video-note-${new Date().toISOString().slice(0, 19)}.mp4`,
          mime: "video/mp4",
          size: bytes,
          durationMs,
        };
      },
      cancel: () => {
        stopped.current = true;
        if (pending.current) camera.current?.stopRecording();
      },
    }),
    [],
  );

  const denied =
    (camPerm && !camPerm.granted && !camPerm.canAskAgain) || (micPerm && !micPerm.granted && !micPerm.canAskAgain);
  const allowed = camPerm?.granted && micPerm?.granted;

  return (
    <View style={[styles.overlay, { bottom }]}>
      <View style={{ width: size, height: size }}>
        {allowed ? (
          <View style={{ width: size, height: size }}>
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mode="video"
              videoQuality="720p"
              onCameraReady={begin}
            />
            <RoundMask size={size} color={BACKDROP} />
          </View>
        ) : (
          <View style={[styles.empty, { borderRadius: size / 2 }]}>
            {denied && <Text style={styles.deniedText}>{tr.composer.cameraMicDenied}</Text>}
          </View>
        )}
        <Ring size={size} progress={elapsed / MAX_MS} />
      </View>
      <Text style={styles.time}>{formatDuration(elapsed)} / 1:00</Text>
      {allowed && (
        <View style={styles.controls}>
          <Pressable
            onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}
            accessibilityLabel={tr.composer.switchCamera}
            hitSlop={8}
            style={styles.flip}
          >
            <RefreshCw size={22} color="#fff" />
          </Pressable>
          <Pressable onPress={onStop} accessibilityLabel={tr.composer.stopRecording} hitSlop={8} style={styles.stop}>
            <Square size={20} color="#fff" fill="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );
});

/** Plays a recorded video message in its circle, on a loop, until it is sent or thrown away. Tap to pause. */
export function VideoNotePreview({ uri, bottom }: { uri: string; bottom: number }) {
  const tr = useT();
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.72, 300);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <View style={[styles.overlay, { bottom }]}>
      <Pressable
        onPress={() => (player.playing ? player.pause() : player.play())}
        accessibilityLabel={tr.composer.playPreview}
        style={{ width: size, height: size }}
      >
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        <RoundMask size={size} color={BACKDROP} />
        <Ring size={size} progress={1} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: BACKDROP,
  },
  empty: { flex: 1, backgroundColor: "#292524", alignItems: "center", justifyContent: "center", padding: 32 },
  deniedText: { color: "rgba(255,255,255,0.8)", textAlign: "center", fontSize: 14 },
  time: { color: "#fff", fontFamily: "monospace", fontSize: 14 },
  controls: { flexDirection: "row", alignItems: "center", gap: 20 },
  stop: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center" },
  flip: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});
