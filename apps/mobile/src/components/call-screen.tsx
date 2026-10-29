import {
  Lock,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RTCView } from "react-native-webrtc";
import {
  acceptCall,
  declineCall,
  flipCamera,
  hangUp,
  toggleCamera,
  toggleMute,
  toggleSpeaker,
  useCall,
} from "@/lib/calls";
import { useT } from "@/lib/i18n";
import { Avatar } from "./avatar";

const RED = "#dc2626";
const GREEN = "#16a34a";

function useElapsed(since: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return null;
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function Round({
  Icon,
  label,
  onPress,
  color = "rgba(0,0,0,0.35)",
  size = 64,
  active = false,
}: {
  Icon: typeof Mic;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  active?: boolean;
}) {
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.round,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: active ? "#fff" : color, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Icon size={size * 0.42} color={active ? "#111" : "#fff"} />
      </Pressable>
      <Text style={styles.roundLabel}>{label}</Text>
    </View>
  );
}

/** Full-screen call UI, shown over everything while a call rings, runs or has just ended. */
export function CallScreen() {
  const tr = useT();
  const call = useCall((s) => s.call);
  const insets = useSafeAreaInsets();
  const elapsed = useElapsed(call?.status === "active" ? call.startedAt : null);
  if (!call) return null;

  const incomingRinging = call.direction === "incoming" && call.status === "ringing";
  const showRemoteVideo = call.video && call.remote && !call.peerCameraOff && call.status === "active";
  const status =
    call.status === "ended"
      ? call.endReason
      : call.status === "active"
        ? elapsed
        : call.status === "connecting"
          ? tr.common.connecting
          : incomingRinging
            ? tr.calls.incoming(call.video)
            : tr.calls.calling;

  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.screen}>
        {showRemoteVideo ? (
          <RTCView streamURL={call.remote!.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
        )}

        <View style={[styles.top, { paddingTop: insets.top + 32 }, showRemoteVideo && styles.topOnVideo]}>
          {!showRemoteVideo && <Avatar user={call.peer} size="xl" />}
          <Text style={styles.name} numberOfLines={1}>
            {call.peer.displayName}
          </Text>
          <Text style={styles.status}>{status}</Text>
          <View style={styles.e2ee}>
            <Lock size={12} color="#fff" />
            <Text style={styles.e2eeText}>{tr.calls.encrypted}</Text>
          </View>
        </View>

        {call.video && call.local && !call.cameraOff && call.status !== "ended" && (
          <RTCView
            streamURL={call.local.toURL()}
            style={[styles.self, { bottom: insets.bottom + 250 }]}
            objectFit="cover"
            mirror={!call.back}
            zOrder={1}
          />
        )}

        <View style={[styles.controls, { paddingBottom: insets.bottom + 32 }]}>
          {incomingRinging ? (
            <View style={styles.row}>
              <Round Icon={PhoneOff} label={tr.calls.decline} color={RED} size={72} onPress={() => void declineCall()} />
              <Round
                Icon={call.video ? Video : Phone}
                label={tr.calls.accept}
                color={GREEN}
                size={72}
                onPress={() => void acceptCall()}
              />
            </View>
          ) : call.status === "ended" ? null : (
            <>
              <View style={styles.row}>
                <Round Icon={call.muted ? MicOff : Mic} label={call.muted ? tr.calls.unmute : tr.calls.mute} active={call.muted} onPress={toggleMute} />
                {call.video && (
                  <Round
                    Icon={call.cameraOff ? VideoOff : Video}
                    label={call.cameraOff ? tr.calls.cameraOn : tr.calls.cameraOff}
                    active={call.cameraOff}
                    onPress={toggleCamera}
                  />
                )}
                {call.video && <Round Icon={SwitchCamera} label={tr.calls.flip} onPress={flipCamera} />}
                <Round
                  Icon={call.speaker ? Volume2 : VolumeX}
                  label={tr.calls.speaker}
                  active={call.speaker}
                  onPress={toggleSpeaker}
                />
              </View>
              <Round Icon={PhoneOff} label={tr.calls.hangUp} color={RED} size={72} onPress={() => void hangUp()} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0a09" },
  backdrop: { backgroundColor: "#1c1917" },
  top: { alignItems: "center", gap: 10, paddingHorizontal: 24 },
  name: { color: "#fff", fontSize: 28, fontWeight: "700", marginTop: 12 },
  status: { color: "rgba(255,255,255,0.8)", fontSize: 16 },
  topOnVideo: { backgroundColor: "rgba(0,0,0,0.35)", paddingBottom: 16 },
  e2ee: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  e2eeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  self: { position: "absolute", right: 16, width: 110, height: 160, borderRadius: 14, overflow: "hidden" },
  controls: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 28 },
  row: { flexDirection: "row", justifyContent: "center", gap: 22, flexWrap: "wrap", paddingHorizontal: 16 },
  round: { alignItems: "center", justifyContent: "center" },
  roundLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
});
