import { unwrap } from "@six/sdk";
import {
  type GifDTO,
  LIVE_EMOJI,
  LIVE_SEATS,
  LIVE_VOICE_MS,
  type LiveRoomDTO,
  SEAT_COLORS,
  dotsScores,
  fanoronaCounts,
  memoryScores,
  parseCommand,
} from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import { type Href, router } from "expo-router";
import { ArrowLeft, Gamepad2, Mic, MoreVertical, SendHorizontal, Smile, X } from "lucide-react-native";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { GifLoop, VoicePlayer } from "./attachment";
import { Avatar } from "./avatar";
import { DotsBoard } from "./dots-board";
import { EightsTable } from "./eights-table";
import { EmojiPicker } from "./emoji-picker";
import { FanoronaBoard, STONES } from "./fanorona-board";
import { HowToPlay } from "./how-to-play";
import { type Play, useSecondsLeft } from "./live";
import { LudoBoard } from "./ludo-board";
import { MemoryBoard } from "./memory-board";
import { Sheet } from "./sheet";
import { Text, TextInput } from "./text";
import { Card, EmptyState, IconButton, Loading, PrimaryButton, ScreenHeader, TextButton } from "./ui";
import { WordHunt } from "./word-hunt";

const noop = () => {};

function BotFace({ size = 36 }: { size?: number }) {
  return (
    <View style={[styles.bot, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.55 }}>🤖</Text>
    </View>
  );
}

/** Everyone at the table, whose turn it is and how long they have left, with each game's score. */
function Seats({ room, nameOf }: { room: LiveRoomDTO; nameOf: (seat: number) => string }) {
  const t = useTheme();
  const tr = useT();
  const view = room.view;
  const turn = room.status === "playing" && view && view.game !== "words" ? view.state.turn : null;
  const secs = useSecondsLeft(view?.game === "words" ? null : room.deadline);
  return (
    <View style={styles.seats}>
      {room.seats.map((seat, i) => {
        const sub =
          view?.game === "eights"
            ? tr.live.cards(view.state.counts[i] ?? 0)
            : view?.game === "words"
              ? tr.live.points(view.state.scores[i] ?? 0)
              : view?.game === "dots"
                ? tr.live.boxes(dotsScores(view.state)[i] ?? 0)
                : view?.game === "fanorona"
                  ? tr.live.stones(fanoronaCounts(view.state)[i] ?? 0)
                  : view?.game === "memory"
                    ? tr.live.pairs(memoryScores(view.state)[i] ?? 0)
                    : null;
        const color =
          view?.game === "ludo"
            ? SEAT_COLORS[view.state.colors[i]!]
            : view?.game === "dots" || view?.game === "memory"
              ? SEAT_COLORS[i]
              : view?.game === "fanorona"
                ? STONES[i]
                : undefined;
        return (
          <View
            key={i}
            style={[styles.seat, { borderColor: turn === i ? brand : t.border, backgroundColor: t.surface }, (seat.left || seat.gaveUp) && { opacity: 0.5 }]}
          >
            {seat.user ? <Avatar user={seat.user} /> : <BotFace />}
            {color && <View style={[styles.dot, { backgroundColor: color, borderColor: t.surface }]} />}
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 12, fontWeight: "600", maxWidth: 76 }}>
              {i === room.mySeat ? tr.common.you : nameOf(i)}
            </Text>
            <Text numberOfLines={1} style={{ color: turn === i ? brand : t.muted, fontSize: 11, fontWeight: turn === i ? "700" : "400" }}>
              {seat.gaveUp ? tr.live.gaveUp : seat.left ? tr.live.left : turn === i && secs !== null ? `${secs}s` : sub}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Lobby({
  room,
  nameOf,
  onBot,
  onStart,
}: {
  room: LiveRoomDTO;
  nameOf: (seat: number) => string;
  onBot: (add: boolean) => void;
  onStart: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const host = meId === room.hostId;
  const { min, max } = LIVE_SEATS[room.game];
  const hostSeat = room.seats.findIndex((s) => s.user?.id === room.hostId);
  return (
    <Card style={{ padding: 16, gap: 12 }}>
      <Text style={{ color: t.muted, fontSize: 14 }}>{tr.live.waiting}</Text>
      {room.seats.map((seat, i) => (
        <View key={i} style={styles.row}>
          {seat.user ? <Avatar user={seat.user} /> : <BotFace />}
          <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "500" }}>
            {nameOf(i)}
          </Text>
          {seat.user?.id === room.hostId && <Text style={[styles.badge, { color: brand, borderColor: brand }]}>{tr.live.host}</Text>}
          {host && !seat.user && <IconButton Icon={X} size={18} label={tr.live.remove} onPress={() => onBot(false)} />}
        </View>
      ))}
      {room.invited.map((user) => (
        <View key={user.id} style={[styles.row, { opacity: 0.6 }]}>
          <Avatar user={user} />
          <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16 }}>
            {user.displayName}
          </Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>{tr.live.invited}</Text>
        </View>
      ))}
      {host ? (
        <View style={{ gap: 8 }}>
          {room.seats.length < max && <TextButton title={`🤖 ${tr.live.addBot}`} color={brand} onPress={() => onBot(true)} />}
          {room.seats.length < min && <Text style={{ color: t.muted, fontSize: 13, textAlign: "center" }}>{tr.live.needPlayers(min)}</Text>}
          <PrimaryButton title={tr.live.start} disabled={room.seats.length < min} onPress={onStart} />
        </View>
      ) : (
        <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>{tr.live.waitingForHost(nameOf(hostSeat))}</Text>
      )}
    </Card>
  );
}

/** A live game room: joins it on open and after every reconnect, then follows what the server sends. */
type Line = { text?: string; gifId?: string; voice?: ArrayBuffer };

const VOICE_NOTE = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 32_000 };

/** What the players said, with a box to say something, `/giphy` for a GIF, emoji and voice notes, under the game. */
function RoomChat({ room, say }: { room: LiveRoomDTO; say: (line: Line) => Promise<boolean> }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const meId = useSession((s) => s.user!.id);
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = useRef<ComponentRef<typeof ScrollView>>(null);
  const recorder = useAudioRecorder(VOICE_NOTE);
  const rec = useAudioRecorderState(recorder, 200);
  const command = parseCommand(text, ["giphy"]);
  const search = command?.kind === "run" ? command.args : null;
  const [q, setQ] = useState("");
  const gifs = useQuery({
    queryKey: ["gifs", "gif", q],
    queryFn: async () => unwrap(await six.api.GET("/v1/gifs", { params: { query: { q: q || undefined, kind: "gif" } } })),
    enabled: search !== null,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const found = search !== null ? (gifs.data?.items ?? []) : [];

  useEffect(() => {
    const timer = setTimeout(() => setQ(search ?? ""), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (recording && rec.durationMillis >= LIVE_VOICE_MS) void stopVoice(true);
  }, [recording, rec.durationMillis]);

  async function startVoice() {
    setError(null);
    if (!(await requestRecordingPermissionsAsync()).granted) return setError(tr.composer.micDenied);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  }

  async function stopVoice(keep: boolean) {
    const durationMs = rec.durationMillis;
    setRecording(false);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => null);
    if (keep && recorder.uri && durationMs >= 500) await say({ voice: await new File(recorder.uri).arrayBuffer() });
  }

  function sendGif(gif: GifDTO) {
    setText("");
    void say({ gifId: gif.id });
  }

  async function send() {
    if (recording) return void stopVoice(true);
    if (command?.kind === "names") return setText("/giphy ");
    if (command?.kind === "run") return found[0] && sendGif(found[0]);
    const line = text.trim();
    if (!line) return;
    setText("");
    if (!(await say({ text: line }))) setText(line);
  }

  return (
    <View style={[styles.chat, { borderColor: t.border, backgroundColor: t.bar, paddingBottom: Math.max(insets.bottom, 12) }]}>
      {room.chat.length > 0 && (
        <ScrollView
          ref={lines}
          style={{ maxHeight: 200 }}
          contentContainerStyle={styles.lines}
          onContentSizeChange={() => lines.current?.scrollToEnd({ animated: false })}
        >
          {room.chat.map((l) => (
            <View key={`${l.at}${l.user.id}`}>
              <Text style={{ color: t.text, fontSize: 14 }}>
                <Text style={{ fontWeight: "700" }}>{l.user.id === meId ? tr.common.you : l.user.displayName}</Text> {l.text}
              </Text>
              {l.gif && (
                <View
                  style={[
                    styles.gif,
                    { backgroundColor: t.chip, aspectRatio: l.gif.width && l.gif.height ? l.gif.width / l.gif.height : 4 / 3 },
                  ]}
                >
                  <GifLoop url={l.gif.url} fit="contain" />
                </View>
              )}
              {l.voice && (
                <View style={{ marginTop: 4, maxWidth: 280 }}>
                  <VoicePlayer
                    url={l.voice.url}
                    durationMs={l.voice.durationMs}
                    waveform={l.voice.waveform}
                    mine={l.user.id === meId}
                    compact
                  />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}
      {command?.kind === "names" && (
        <Pressable onPress={() => setText("/giphy ")} style={styles.hint}>
          <Text style={{ color: t.text, fontWeight: "700" }}>/giphy</Text>
          <Text style={{ color: t.muted, flexShrink: 1 }}>{tr.composer.commandHints.giphy}</Text>
        </Pressable>
      )}
      {search !== null &&
        (found.length ? (
          <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={styles.gifRow}>
            {found.map((g) => (
              <Pressable key={g.id} onPress={() => sendGif(g)} accessibilityLabel={g.title}>
                <Image
                  source={g.previewUrl}
                  style={{ height: 96, width: (96 * g.width) / g.height, borderRadius: 8, backgroundColor: t.chip }}
                />
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={[styles.hint, { color: t.muted }]}>
            {gifs.isError ? tr.composer.couldNotLoadGifs : gifs.data ? tr.composer.noGifs : tr.common.loading}
          </Text>
        ))}
      {error && <Text style={[styles.hint, { color: t.danger, fontSize: 12 }]}>{error}</Text>}
      <View style={styles.chatRow}>
        {recording ? (
          <>
            <IconButton Icon={X} label={tr.common.cancel} onPress={() => void stopVoice(false)} />
            <View style={styles.timer}>
              <View style={styles.dotRec} />
              <Text style={{ color: t.text, fontVariant: ["tabular-nums"] }}>
                {formatDuration(rec.durationMillis)} / {formatDuration(LIVE_VOICE_MS)}
              </Text>
            </View>
          </>
        ) : (
          <>
            <IconButton Icon={Smile} color={t.muted} label={tr.composer.commandHints.emoji} onPress={() => setEmoji(true)} />
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => void send()}
              submitBehavior="submit"
              returnKeyType="send"
              maxLength={200}
              placeholder={tr.live.saySomething}
              placeholderTextColor={t.muted}
              accessibilityLabel={tr.live.saySomething}
              style={[styles.chatInput, { backgroundColor: t.chip, color: t.text }]}
            />
          </>
        )}
        {text.trim() || recording ? (
          <IconButton
            Icon={SendHorizontal}
            color={brand}
            label={recording ? tr.composer.sendVoice : tr.common.send}
            onPress={() => void send()}
          />
        ) : (
          <IconButton Icon={Mic} color={brand} label={tr.composer.recordVoice} onPress={() => void startVoice()} />
        )}
      </View>
      <EmojiPicker open={emoji} onClose={() => setEmoji(false)} onPick={(e) => setText((x) => x + e)} />
    </View>
  );
}

export function LiveRoom({ id }: { id: string }) {
  const t = useTheme();
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const socket = useRealtime().realtime?.socket;
  const [room, setRoom] = useState<LiveRoomDTO | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [givingUp, setGivingUp] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const join = () =>
      void socket
        .timeout(10_000)
        .emitWithAck("live:join", { roomId: id })
        .then((res) => (res.ok ? setRoom(res.data) : setClosed(res.error.code)))
        .catch(() => null);
    const onRoom = (r: LiveRoomDTO) => r.id === id && setRoom(r);
    const onClosed = (e: { roomId: string }) => e.roomId === id && setClosed("ROOM_NOT_FOUND");
    socket.on("live:room", onRoom);
    socket.on("live:closed", onClosed);
    socket.on("connect", join);
    if (socket.connected) join();
    return () => {
      socket.off("live:room", onRoom);
      socket.off("live:closed", onClosed);
      socket.off("connect", join);
    };
  }, [socket, id]);

  const exit = (event: "live:leave" | "live:end") => {
    socket?.emit(event, { roomId: id });
    if (router.canGoBack()) router.back();
    else router.replace("/" as Href);
  };
  const leave = () => exit("live:leave");
  const play: Play = async (move) => {
    if (!socket) return "OFFLINE";
    try {
      const res = await socket.timeout(10_000).emitWithAck("live:move", { roomId: id, move });
      return res.ok ? null : res.error.code;
    } catch {
      return "TIMEOUT";
    }
  };
  const start = () => socket?.emit("live:start", { roomId: id }, noop);
  const say = async (line: Line) => {
    const res = await socket?.timeout(20_000).emitWithAck("live:say", { roomId: id, ...line }).catch(() => null);
    return !!res?.ok;
  };

  const nameOf = (seat: number) => {
    const user = room?.seats[seat]?.user;
    if (user) return user.displayName;
    const bots = room?.seats.flatMap((s, i) => (s.user ? [] : [i])) ?? [];
    return bots.length > 1 ? `${tr.calls.bot} ${bots.indexOf(seat) + 1}` : tr.calls.bot;
  };
  const view = room?.view;
  const winners = room?.winners ?? [];
  const result =
    winners.length === 1
      ? winners[0] === room?.mySeat
        ? tr.live.youWon
        : tr.live.won(nameOf(winners[0]!))
      : winners.length
        ? tr.live.tie
        : tr.live.noWinner;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader>
        <IconButton Icon={ArrowLeft} label={tr.live.leave} onPress={leave} />
        <Text numberOfLines={1} style={[styles.title, { color: t.text }]}>
          {room ? `${LIVE_EMOJI[room.game]} ${tr.live.games[room.game]}` : ""}
        </Text>
        {room && <HowToPlay game={room.game} size={22} />}
        {room?.status === "playing" && room.mySeat !== null && !closed && (
          <IconButton Icon={MoreVertical} label={tr.live.end} onPress={() => setMenu(true)} />
        )}
      </ScreenHeader>
      {closed ? (
        <EmptyState
          Icon={Gamepad2}
          title={closed === "GAME_STARTED" ? tr.live.started : closed === "ROOM_FULL" ? tr.live.full : tr.live.closed}
        >
          <PrimaryButton title={tr.live.leave} onPress={leave} />
        </EmptyState>
      ) : !room ? (
        <Loading />
      ) : (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.body}
            scrollEnabled={!(view?.game === "words" && room.status === "playing")}
            keyboardShouldPersistTaps="handled"
          >
            {room.status === "lobby" ? (
              <Lobby room={room} nameOf={nameOf} onBot={(add) => socket?.emit("live:bot", { roomId: id, add }, noop)} onStart={start} />
            ) : (
              <>
                <Seats room={room} nameOf={nameOf} />
                {room.status === "over" && (
                  <Card style={{ padding: 16, gap: 10, alignItems: "center" }}>
                    <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{result}</Text>
                    {meId === room.hostId && <PrimaryButton title={tr.live.rematch} onPress={start} style={{ alignSelf: "stretch" }} />}
                    <TextButton title={tr.live.leave} onPress={leave} />
                  </Card>
                )}
                {view?.game === "ludo" && <LudoBoard room={room} state={view.state} nameOf={nameOf} play={play} />}
                {view?.game === "eights" && <EightsTable room={room} state={view.state} nameOf={nameOf} play={play} />}
                {view?.game === "words" && <WordHunt room={room} state={view.state} nameOf={nameOf} play={play} />}
                {view?.game === "fanorona" && (
                  <FanoronaBoard
                    key={`${view.state.turn}-${view.state.last?.from}-${view.state.last?.to}`}
                    room={room}
                    state={view.state}
                    nameOf={nameOf}
                    play={play}
                  />
                )}
                {view?.game === "dots" && <DotsBoard room={room} state={view.state} nameOf={nameOf} play={play} />}
                {view?.game === "memory" && <MemoryBoard room={room} state={view.state} nameOf={nameOf} play={play} />}
              </>
            )}
          </ScrollView>
          <RoomChat room={room} say={say} />
        </KeyboardAvoidingView>
      )}
      {menu && (
        <Sheet
          title={tr.live.endHint}
          actions={[
            { label: tr.live.end, destructive: true, onSelect: () => exit("live:end") },
            { label: tr.live.giveUp, onSelect: () => setGivingUp(true) },
          ]}
          onClose={() => setMenu(false)}
        />
      )}
      {givingUp && (
        <Sheet
          title={tr.live.giveUpConfirm}
          actions={[
            { label: tr.live.giveUp, destructive: true, onSelect: () => socket?.emit("live:giveup", { roomId: id }, noop) },
          ]}
          onClose={() => setGivingUp(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, fontSize: 18, fontWeight: "700", paddingHorizontal: 4 },
  body: { flexGrow: 1, justifyContent: "center", padding: 16, gap: 16 },
  seats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  chat: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 10 },
  lines: { paddingHorizontal: 16, gap: 10 },
  gif: { marginTop: 4, height: 120, borderRadius: 12, overflow: "hidden", alignSelf: "flex-start" },
  gifRow: { gap: 6, paddingHorizontal: 12 },
  hint: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  timer: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 },
  dotRec: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" },
  chatRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 },
  chatInput: { flex: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, fontSize: 16 },
  seat: { alignItems: "center", gap: 2, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 16, borderWidth: 2, minWidth: 80 },
  dot: { position: "absolute", top: 34, left: "50%", marginLeft: 6, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  bot: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(235,138,0,0.15)" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { fontSize: 11, fontWeight: "700", borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
