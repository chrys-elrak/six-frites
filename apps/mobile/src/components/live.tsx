import { LIVE_EMOJI, type LiveGame, type LiveInviteDTO } from "@six/shared";
import { type Href, router } from "expo-router";
import { Check, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isFrozen, useChats } from "@/lib/chats";
import { useLocale, useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { Text } from "./text";
import { IconButton, PrimaryButton } from "./ui";

export const playHref = (roomId: string) => `/play/${roomId}` as Href;

/** Sends a move to the room; resolves to the error code, or null when it was played. */
export type Play = (move: unknown) => Promise<string | null>;

export function useSecondsLeft(deadline: string | null) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : null;
}

const MAX_INVITES = 3;

/** Picks up to three contacts for a live game, then opens its room; nobody picked means playing with Frite Bot. */
export function LiveInviteSheet({ game, onClose }: { game: LiveGame; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const socket = useRealtime().realtime?.socket;
  const meId = useSession((s) => s.user!.id);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const friends = [
    ...new Map(
      (useChats().data ?? [])
        .filter((c) => !isFrozen(c))
        .flatMap((c) => c.members.filter((m) => m.user.id !== meId).map((m) => [m.user.id, m.user] as const)),
    ).values(),
  ];

  async function create() {
    if (!socket || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await socket
        .timeout(10_000)
        .emitWithAck("live:create", { game, invite: picked, locale: useLocale.getState().locale });
      if (!res.ok) throw new Error(res.error.code);
      onClose();
      router.push(playHref(res.data.id));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: t.text }]}>
                {LIVE_EMOJI[game]} {tr.live.games[game]}
              </Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>{tr.live.inviteHint}</Text>
            </View>
            <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          </View>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>
            {tr.live.inviteFriends}
          </Text>
          <FlatList
            data={friends}
            keyExtractor={(u) => u.id}
            style={{ maxHeight: 360 }}
            renderItem={({ item: u }) => {
              const on = picked.includes(u.id);
              const full = !on && picked.length >= MAX_INVITES;
              return (
                <Pressable
                  onPress={() => setPicked((p) => (on ? p.filter((id) => id !== u.id) : full ? p : [...p, u.id]))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: full }}
                  style={({ pressed }) => [styles.friend, pressed && { backgroundColor: t.pressed }, full && { opacity: 0.4 }]}
                >
                  <Avatar user={u} />
                  <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "500" }}>
                    {u.displayName}
                  </Text>
                  <View style={[styles.check, { borderColor: on ? brand : t.border, backgroundColor: on ? brand : "transparent" }]}>
                    {on && <Check size={14} color={brandInk} strokeWidth={3} />}
                  </View>
                </Pressable>
              );
            }}
          />
          {error && <Text style={{ color: t.danger, fontSize: 13, textAlign: "center" }}>{tr.common.somethingWrongRetry}</Text>}
          <PrimaryButton title={tr.live.create} onPress={() => void create()} busy={busy} disabled={!socket} />
        </View>
      </View>
    </Modal>
  );
}

/** Banners for live games my contacts ask me to join, shown wherever I am in the app. */
export function LiveInvites() {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const socket = useRealtime().realtime?.socket;
  const [invites, setInvites] = useState<LiveInviteDTO[]>([]);

  useEffect(() => {
    if (!socket) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const onInvite = (invite: LiveInviteDTO) => {
      setInvites((list) => [...list.filter((i) => i.roomId !== invite.roomId), invite]);
      timers.push(setTimeout(() => setInvites((list) => list.filter((i) => i !== invite)), 60_000));
    };
    socket.on("live:invite", onInvite);
    return () => {
      socket.off("live:invite", onInvite);
      timers.forEach(clearTimeout);
    };
  }, [socket]);

  if (!invites.length) return null;
  const dismiss = (roomId: string) => setInvites((list) => list.filter((i) => i.roomId !== roomId));

  return (
    <View pointerEvents="box-none" style={[styles.banners, { paddingTop: insets.top + 8 }]}>
      {invites.map((invite) => (
        <Animated.View
          key={invite.roomId}
          entering={FadeInUp.springify().damping(16)}
          exiting={FadeOutUp.duration(160)}
          style={[styles.banner, { backgroundColor: t.surface, borderColor: t.border }]}
        >
          <Avatar user={invite.from} />
          <Text numberOfLines={2} style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: "600" }}>
            {LIVE_EMOJI[invite.game]} {tr.live.invites(invite.from.displayName, tr.live.games[invite.game])}
          </Text>
          <Pressable
            onPress={() => {
              dismiss(invite.roomId);
              router.push(playHref(invite.roomId));
            }}
            accessibilityRole="button"
            style={styles.join}
          >
            <Text style={{ color: brandInk, fontWeight: "700" }}>{tr.live.join}</Text>
          </Pressable>
          <IconButton Icon={X} size={16} label={tr.common.dismiss} onPress={() => dismiss(invite.roomId)} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { fontSize: 18, fontWeight: "700" },
  friend: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  banners: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", gap: 10, paddingHorizontal: 12 },
  banner: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  join: { backgroundColor: brand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
});
