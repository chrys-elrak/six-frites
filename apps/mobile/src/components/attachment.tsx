import type { AttachmentDTO } from "@six/shared";
import { useEvent } from "expo";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { AlertCircle, Download, EyeOff, FileText, Pause, Play, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { shareRemoteFile } from "@/lib/download";
import { formatBytes, formatDuration } from "@/lib/format";
import { alpha, useBubbleColors } from "@/lib/bubble-colors";
import { useT } from "@/lib/i18n";
import { usePlaybackRate } from "@/lib/playback";
import type { PendingAttachment } from "@/lib/outbox";
import { brand, brandInk, stone, useTheme } from "@/lib/theme";

export type ShownAttachment =
  | { source: "server"; data: AttachmentDTO }
  | { source: "local"; data: PendingAttachment; failed: boolean };

export interface LightboxItem {
  kind: "image" | "video";
  url: string;
  poster: string | null;
  name: string;
  mime: string;
}

type State = "ready" | "failed" | "processing" | "uploading";

function view(a: ShownAttachment) {
  if (a.source === "local") {
    const d = a.data;
    return {
      kind: d.kind,
      name: d.name,
      mime: d.mime,
      size: d.size,
      url: d.localUrl as string | null,
      thumbUrl: d.kind === "image" ? d.localUrl : null,
      width: d.width,
      height: d.height,
      durationMs: d.durationMs,
      waveform: null as number[] | null,
      state: (a.failed ? "failed" : d.progress < 1 ? "uploading" : "processing") as State,
      progress: d.progress,
    };
  }
  const d = a.data;
  return {
    kind: d.kind,
    name: d.name,
    mime: d.mime,
    size: d.size,
    url: d.url,
    thumbUrl: d.thumbUrl,
    width: d.width,
    height: d.height,
    durationMs: d.durationMs,
    waveform: d.waveform,
    state: (d.status === "ready" ? "ready" : d.status === "failed" ? "failed" : "processing") as State,
    progress: 1,
  };
}

let stopCurrent: (() => void) | null = null;

/** Makes sure only one voice note or video message plays at a time. */
function claimPlayback(stop: () => void) {
  if (stopCurrent && stopCurrent !== stop) stopCurrent();
  stopCurrent = stop;
}

let audioModeSet = false;
function ensureAudioMode() {
  if (audioModeSet) return;
  audioModeSet = true;
  void setAudioModeAsync({ playsInSilentMode: true }).catch(() => null);
}

function ProgressRing({ value, size = 44 }: { value: number; size?: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <Svg viewBox="0 0 44 44" width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle cx="22" cy="22" r={r} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
      <Circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0.03, value))}
      />
    </Svg>
  );
}

function Overlay({ state, progress }: { state: State; progress: number }) {
  const tr = useT();
  if (state === "ready") return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      {state === "uploading" ? (
        <ProgressRing value={progress} />
      ) : state === "processing" ? (
        <View style={styles.chip}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.chipText}>{tr.messages.processing}</Text>
        </View>
      ) : (
        <View style={[styles.chip, { backgroundColor: "rgba(220,38,38,0.85)" }]}>
          <AlertCircle size={14} color="#fff" />
          <Text style={styles.chipText}>{tr.messages.failed}</Text>
        </View>
      )}
    </View>
  );
}

function boxSize(width: number | null, height: number | null, maxW: number) {
  const w = width ?? 4;
  const h = height ?? 3;
  const scale = Math.min(maxW / w, 340 / h, 1.5);
  const outW = Math.max(120, Math.round(w * scale));
  return { width: outW, height: Math.round((outW * h) / w) };
}

function SpeedButton({ tint, bg }: { tint: string; bg: string }) {
  const tr = useT();
  const rate = usePlaybackRate((s) => s.rate);
  const next = usePlaybackRate((s) => s.next);
  return (
    <Pressable
      onPress={next}
      hitSlop={6}
      accessibilityLabel={tr.messages.speed(rate)}
      style={[styles.speed, { backgroundColor: bg }]}
    >
      <Text style={{ color: tint, fontSize: 11, fontWeight: "700" }}>{rate}×</Text>
    </Pressable>
  );
}

function VoicePlayer({
  url,
  durationMs,
  waveform,
  mine,
  autoPlay = false,
}: {
  url: string | null;
  durationMs: number | null;
  waveform: number[] | null;
  mine: boolean;
  autoPlay?: boolean;
}) {
  const tr = useT();
  const player = useAudioPlayer(null);
  const rate = usePlaybackRate((s) => s.rate);
  const status = useAudioPlayerStatus(player);
  const loaded = useRef(false);
  const [barsWidth, setBarsWidth] = useState(1);
  const bars = waveform ?? Array.from({ length: 48 }, () => 18);
  const total = durationMs ?? (status.duration ? status.duration * 1000 : 0);
  const position = status.currentTime * 1000;
  const stop = useRef(() => player.pause()).current;

  useEffect(() => {
    if (status.isLoaded) player.setPlaybackRate(rate);
  }, [player, rate, status.isLoaded]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      void player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  function toggle() {
    if (!url) return;
    ensureAudioMode();
    if (!loaded.current) {
      player.replace({ uri: url });
      loaded.current = true;
    }
    if (status.playing) player.pause();
    else {
      claimPlayback(stop);
      player.play();
    }
  }

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoPlay || !url || autoStarted.current) return;
    autoStarted.current = true;
    toggle();
  });

  function seek(x: number) {
    if (!loaded.current || !total) return;
    void player.seekTo(((x / barsWidth) * total) / 1000);
  }

  const done = total ? position / total : 0;
  const bubble = useBubbleColors();
  const fg = mine ? bubble.ink : (bubble.theirInk ?? undefined);
  return (
    <View style={styles.voice}>
      <Pressable
        onPress={toggle}
        disabled={!url}
        accessibilityLabel={status.playing ? tr.messages.pause : tr.messages.playVoice}
        style={[styles.voiceButton, { backgroundColor: mine ? bubble.ink : brand, opacity: url ? 1 : 0.5 }]}
      >
        {status.playing ? (
          <Pause size={20} color={mine ? bubble.bg : brandInk} fill={mine ? bubble.bg : brandInk} />
        ) : (
          <Play size={20} color={mine ? bubble.bg : brandInk} fill={mine ? bubble.bg : brandInk} style={{ marginLeft: 2 }} />
        )}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Pressable
          onPress={(e) => seek(e.nativeEvent.locationX)}
          onLayout={(e) => setBarsWidth(e.nativeEvent.layout.width)}
          style={styles.bars}
        >
          {bars.map((v, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: `${Math.max(12, v)}%`,
                  backgroundColor: fg ?? stone[500],
                  opacity: i / bars.length < done ? 1 : 0.35,
                },
              ]}
            />
          ))}
        </Pressable>
        <View style={styles.voiceFoot}>
          <Text style={[styles.small, fg && { color: fg }]}>
            {formatDuration(status.playing || position ? position : total)}
          </Text>
          <SpeedButton
            tint={mine ? bubble.ink : brand}
            bg={mine ? alpha(bubble.ink, 0.15) : "rgba(235,138,0,0.15)"}
          />
        </View>
      </View>
    </View>
  );
}

const NOTE = 224;

function VideoNotePlayer({ url, onDone }: { url: string; onDone: () => void }) {
  const rate = usePlaybackRate((s) => s.rate);
  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.playbackRate = usePlaybackRate.getState().rate;
    p.play();
  });

  useEffect(() => {
    player.playbackRate = rate;
  }, [player, rate]);
  const { currentTime } = useEvent(player, "timeUpdate", { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: true, oldIsPlaying: false });
  const stop = useRef(() => onDone()).current;

  useEffect(() => {
    claimPlayback(stop);
    const sub = player.addListener("playToEnd", onDone);
    return () => sub.remove();
  }, [player, onDone, stop]);

  const duration = player.duration || 1;
  const r = 49;
  const c = 2 * Math.PI * r;

  return (
    <Pressable onPress={() => (isPlaying ? player.pause() : player.play())} style={styles.note}>
      <View style={styles.noteClip}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} surfaceType="textureView" />
      </View>
      <Svg viewBox="0 0 100 100" style={[styles.noteRing, { transform: [{ rotate: "-90deg" }] }]} pointerEvents="none">
        <Circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={brand}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(currentTime / duration, 1))}
        />
      </Svg>
      {!isPlaying && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <View style={styles.play}>
            <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
          </View>
        </View>
      )}
      <View style={styles.noteTime}>
        <Text style={styles.chipText}>{formatDuration(currentTime * 1000)}</Text>
      </View>
    </Pressable>
  );
}

function VideoNote({
  url,
  poster,
  durationMs,
  state,
  progress,
  autoPlay = false,
}: {
  url: string | null;
  poster: string | null;
  durationMs: number | null;
  state: State;
  progress: number;
  autoPlay?: boolean;
}) {
  const [playing, setPlaying] = useState(autoPlay && !!url);
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      {playing && url ? (
        <VideoNotePlayer url={url} onDone={() => setPlaying(false)} />
      ) : (
        <VideoNoteCover url={url} poster={poster} durationMs={durationMs} state={state} progress={progress} onPlay={() => setPlaying(true)} />
      )}
      {state === "ready" && <SpeedButton tint="#fff" bg="rgba(0,0,0,0.45)" />}
    </View>
  );
}

function VideoNoteCover({
  url,
  poster,
  durationMs,
  state,
  progress,
  onPlay,
}: {
  url: string | null;
  poster: string | null;
  durationMs: number | null;
  state: State;
  progress: number;
  onPlay: () => void;
}) {
  const tr = useT();
  return (
    <Pressable
      onPress={() => url && onPlay()}
      disabled={!url}
      accessibilityLabel={tr.messages.playVideoNote}
      style={styles.note}
    >
      <View style={[styles.noteClip, { backgroundColor: stone[700] }]}>
        {poster && <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />}
        <Overlay state={state} progress={progress} />
      </View>
      {state === "ready" && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <View style={styles.play}>
            <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
          </View>
        </View>
      )}
      <View style={styles.noteTime}>
        <Text style={styles.chipText}>{formatDuration(durationMs)}</Text>
      </View>
    </Pressable>
  );
}

export function AttachmentView({
  attachment,
  mine,
  onOpen,
  hidden = false,
  onReveal,
  maxWidth,
  autoPlay = false,
}: {
  attachment: ShownAttachment;
  mine: boolean;
  onOpen: (item: LightboxItem) => void;
  hidden?: boolean;
  onReveal?: () => void;
  maxWidth: number;
  autoPlay?: boolean;
}) {
  const t = useTheme();
  const tr = useT();
  const bubble = useBubbleColors();
  const a = view(attachment);
  const [busy, setBusy] = useState(false);

  if (a.kind === "image" || a.kind === "video") {
    const size = boxSize(a.width, a.height, Math.min(280, maxWidth));
    const ready = a.state === "ready" && a.url;
    const open = () =>
      ready &&
      onOpen({ kind: a.kind as "image" | "video", url: a.url!, poster: a.thumbUrl, name: a.name, mime: a.mime });
    return (
      <Pressable
        onPress={hidden ? onReveal : open}
        disabled={!ready && !hidden}
        accessibilityLabel={hidden ? tr.messages.revealSpoiler : a.kind === "image" ? tr.messages.openPhoto : tr.messages.playVideo}
        style={[styles.visual, size, { backgroundColor: t.dark ? stone[700] : stone[200] }]}
      >
        {a.thumbUrl && (
          <Image
            source={{ uri: a.thumbUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={hidden ? 40 : 0}
            transition={150}
          />
        )}
        {hidden && (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "rgba(0,0,0,0.25)" }]}>
            <View style={styles.chip}>
              <EyeOff size={14} color="#fff" />
              <Text style={styles.chipText}>{tr.summary.spoiler}</Text>
            </View>
          </View>
        )}
        {a.kind === "video" && a.state === "ready" && !hidden && (
          <>
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              <View style={styles.play}>
                <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
              </View>
            </View>
            <View style={styles.videoTime}>
              <Text style={styles.chipText}>{formatDuration(a.durationMs)}</Text>
            </View>
          </>
        )}
        <Overlay state={a.state} progress={a.progress} />
      </Pressable>
    );
  }

  if (a.kind === "video_note") {
    return (
      <VideoNote
        url={a.state === "ready" ? a.url : null}
        poster={a.thumbUrl}
        durationMs={a.durationMs}
        state={a.state}
        progress={a.progress}
        autoPlay={autoPlay}
      />
    );
  }

  if (a.kind === "voice") {
    return (
      <View>
        <VoicePlayer
          url={a.state === "ready" ? a.url : null}
          durationMs={a.durationMs}
          waveform={a.waveform}
          mine={mine}
          autoPlay={autoPlay}
        />
        {a.state !== "ready" && (
          <View style={styles.voiceState}>
            {a.state === "failed" ? (
              <AlertCircle size={12} color={mine ? bubble.ink : t.muted} />
            ) : (
              <ActivityIndicator size="small" color={mine ? bubble.ink : t.muted} />
            )}
            <Text style={[styles.small, mine && { color: bubble.ink }]}>
              {a.state === "uploading"
                ? tr.messages.uploading(Math.round(a.progress * 100))
                : a.state === "failed"
                  ? tr.messages.failed
                  : tr.messages.processing}
            </Text>
          </View>
        )}
      </View>
    );
  }

  const ready = a.state === "ready" && attachment.source === "server" && a.url;
  const fg = mine ? bubble.ink : (bubble.theirInk ?? t.text);
  return (
    <Pressable
      disabled={!ready || busy}
      onPress={async () => {
        setBusy(true);
        await shareRemoteFile(a.url!, a.name, a.mime).catch(() => null);
        setBusy(false);
      }}
      style={styles.file}
    >
      <View style={[styles.fileIcon, { backgroundColor: mine ? alpha(bubble.ink, 0.15) : "rgba(235,138,0,0.15)" }]}>
        {a.state === "uploading" || busy ? (
          <ActivityIndicator size="small" color={mine ? bubble.ink : brand} />
        ) : ready ? (
          <Download size={20} color={mine ? bubble.ink : brand} />
        ) : (
          <FileText size={20} color={mine ? bubble.ink : brand} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: fg, fontSize: 14, fontWeight: "600" }}>
          {a.name}
        </Text>
        <Text style={[styles.small, { color: fg }]}>
          {a.state === "uploading"
            ? tr.messages.uploadedOf(Math.round(a.progress * 100), formatBytes(a.size))
            : formatBytes(a.size)}
        </Text>
      </View>
    </Pressable>
  );
}

export function LightboxVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => p.play());
  useEffect(() => claimPlayback(() => player.pause()), [player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

export function Lightbox({ item, onClose }: { item: LightboxItem; onClose: () => void }) {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  return (
    <Modal animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.lightbox}>
        <View style={{ width, height: height - insets.top - insets.bottom - 56, marginTop: insets.top + 56 }}>
          {item.kind === "image" ? (
            <Image source={{ uri: item.url }} style={StyleSheet.absoluteFill} contentFit="contain" />
          ) : (
            <LightboxVideo url={item.url} />
          )}
        </View>
        <View style={[styles.lightboxBar, { top: insets.top }]}>
          <Pressable accessibilityLabel={tr.common.close} onPress={onClose} style={styles.lightboxButton}>
            <X size={26} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  overlay: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  chipText: { color: "#fff", fontSize: 11 },
  visual: { borderRadius: 12, overflow: "hidden", maxWidth: "100%" },
  play: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoTime: {
    position: "absolute",
    top: 6,
    left: 6,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  voice: { flexDirection: "row", alignItems: "center", gap: 12, width: 240, maxWidth: "100%", paddingVertical: 4 },
  voiceButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  bars: { flexDirection: "row", alignItems: "center", gap: 2, height: 32 },
  bar: { flex: 1, borderRadius: 2 },
  small: { fontSize: 11, opacity: 0.7, color: stone[500] },
  voiceFoot: { flexDirection: "row", alignItems: "center", gap: 6 },
  speed: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  voiceState: { flexDirection: "row", alignItems: "center", gap: 4 },
  note: { width: NOTE, height: NOTE },
  noteClip: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: NOTE / 2, overflow: "hidden" },
  noteRing: { position: "absolute", top: -6, left: -6, width: NOTE + 12, height: NOTE + 12 },
  noteTime: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  file: { flexDirection: "row", alignItems: "center", gap: 12, width: 256, maxWidth: "100%", paddingVertical: 4 },
  fileIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  lightbox: { flex: 1, backgroundColor: "#000" },
  lightboxBar: { position: "absolute", right: 8, flexDirection: "row", gap: 4, paddingTop: 8 },
  lightboxButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
