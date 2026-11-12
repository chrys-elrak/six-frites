import type { Realtime } from "@six/sdk";
import { type CreateLiveInput, LIVE_EMOJI, LIVE_SEATS, type LiveGame, type LiveInviteDTO, type LiveRoomDTO } from "@six/shared";
import * as Haptics from "expo-haptics";
import { type Href, router } from "expo-router";
import { Check, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";
import { useCall } from "@/lib/calls";
import { isAppChat, isFrozen, useChats } from "@/lib/chats";
import { useLocale, useT } from "@/lib/i18n";
import { playGameSound } from "@/lib/game-sound";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { Modal } from "./modal";
import { Sheet } from "./sheet";
import { Text } from "./text";
import { IconButton, PrimaryButton } from "./ui";

export const playHref = (roomId: string) => `/play/${roomId}` as Href;

type Unfinished = { input: CreateLiveInput; roomId: string; game: LiveGame };
const useUnfinished = create<{ unfinished: Unfinished | null }>(() => ({ unfinished: null }));

/**
 * Asks for a new live game and returns its room. When an unfinished game stops it, returns null and asks, in
 * `UnfinishedGame`, whether to go back to that one or quit it for the new one.
 */
export async function startLive(socket: Realtime["socket"] | undefined, input: CreateLiveInput) {
  const res = await socket?.timeout(10_000).emitWithAck("live:create", input).catch(() => null);
  if (res?.ok) return res.data.id;
  if (res?.error.code === "GAME_IN_PROGRESS") {
    useUnfinished.setState({ unfinished: { input, ...(res.error.details as { roomId: string; game: LiveGame }) } });
  }
  return null;
}

/** Continue the unfinished game, or quit it and start the one asked for. */
export function UnfinishedGame() {
  const tr = useT();
  const socket = useRealtime().realtime?.socket;
  const unfinished = useUnfinished((s) => s.unfinished);
  if (!unfinished) return null;
  const { input, roomId, game } = unfinished;

  async function switchGame() {
    await socket?.timeout(10_000).emitWithAck("live:end", { roomId }).catch(() => null);
    const id = await startLive(socket, input);
    if (id) router.push(playHref(id));
  }

  return (
    <Sheet
      title={`${LIVE_EMOJI[game]} ${tr.live.unfinished(tr.live.games[game])}`}
      actions={[
        { label: tr.live.continueGame, onSelect: () => router.push(playHref(roomId)) },
        { label: tr.live.switchGame(tr.live.games[input.game]), destructive: true, onSelect: () => void switchGame() },
      ]}
      onClose={() => useUnfinished.setState({ unfinished: null })}
    />
  );
}

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

const TURN_SOUND = require("../../assets/sounds/turn.wav");
const TICK_SOUND = require("../../assets/sounds/tick.wav");

/**
 * Whether the game waits on me, for my turn or a word hunt round I'm in, and the seconds I have left. Chimes and
 * buzzes when my turn comes, and ticks through its last 10 seconds.
 */
export function useMyTurn(room: LiveRoomDTO | null) {
  const view = room?.status === "playing" ? room.view : null;
  const mine = !!view && room!.mySeat !== null && (view.game === "words" || view.game === "reflex" || view.state.turn === room!.mySeat);
  const seconds = useSecondsLeft(mine ? room!.deadline : null);
  useEffect(() => {
    if (!mine) return;
    playGameSound(TURN_SOUND);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [mine]);
  useEffect(() => {
    if (seconds !== null && seconds > 0 && seconds <= 10) playGameSound(TICK_SOUND);
  }, [seconds]);
  return { mine, seconds };
}

/** Picks contacts for the game's free seats, then opens its room; nobody picked means playing with Frite Bot. */
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
        .filter((c) => !isFrozen(c) && !c.support && !c.supportDesk && !c.withSupport && !isAppChat(c))
        .flatMap((c) => c.members.filter((m) => m.user.id !== meId).map((m) => [m.user.id, m.user] as const)),
    ).values(),
  ];

  async function create() {
    if (!socket || busy) return;
    setBusy(true);
    setError(false);
    try {
      const id = await startLive(socket, { game, invite: picked, locale: useLocale.getState().locale });
      if (!id && useUnfinished.getState().unfinished) return onClose();
      if (!id) throw new Error("not created");
      onClose();
      router.push(playHref(id));
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
              const full = !on && picked.length >= LIVE_SEATS[game].max - 1;
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
      const call = useCall.getState().call;
      if (call?.status === "active" && call.peer.id === invite.from.id) return router.push(playHref(invite.roomId));
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
