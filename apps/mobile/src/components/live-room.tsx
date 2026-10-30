import { LIVE_EMOJI, LIVE_SEATS, type LiveRoomDTO, SEAT_COLORS, dotsScores, fanoronaCounts, memoryScores } from "@six/shared";
import { type Href, router } from "expo-router";
import { ArrowLeft, Gamepad2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { brand, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { DotsBoard } from "./dots-board";
import { EightsTable } from "./eights-table";
import { FanoronaBoard, STONES } from "./fanorona-board";
import { HowToPlay } from "./how-to-play";
import { type Play, useSecondsLeft } from "./live";
import { LudoBoard } from "./ludo-board";
import { MemoryBoard } from "./memory-board";
import { Text } from "./text";
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
            style={[styles.seat, { borderColor: turn === i ? brand : t.border, backgroundColor: t.surface }, seat.left && { opacity: 0.5 }]}
          >
            {seat.user ? <Avatar user={seat.user} /> : <BotFace />}
            {color && <View style={[styles.dot, { backgroundColor: color, borderColor: t.surface }]} />}
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 12, fontWeight: "600", maxWidth: 76 }}>
              {i === room.mySeat ? tr.common.you : nameOf(i)}
            </Text>
            <Text numberOfLines={1} style={{ color: turn === i ? brand : t.muted, fontSize: 11, fontWeight: turn === i ? "700" : "400" }}>
              {seat.left ? tr.live.left : turn === i && secs !== null ? `${secs}s` : sub}
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
export function LiveRoom({ id }: { id: string }) {
  const t = useTheme();
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const socket = useRealtime().realtime?.socket;
  const [room, setRoom] = useState<LiveRoomDTO | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const join = () =>
      void socket
        .timeout(10_000)
        .emitWithAck("live:join", { roomId: id })
        .then((res) => (res.ok ? setRoom(res.data) : setClosed(true)))
        .catch(() => null);
    const onRoom = (r: LiveRoomDTO) => r.id === id && setRoom(r);
    const onClosed = (e: { roomId: string }) => e.roomId === id && setClosed(true);
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

  const leave = () => {
    socket?.emit("live:leave", { roomId: id });
    if (router.canGoBack()) router.back();
    else router.replace("/" as Href);
  };
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

  const nameOf = (seat: number) => {
    const user = room?.seats[seat]?.user;
    if (user) return user.displayName;
    const bots = room?.seats.flatMap((s, i) => (s.user ? [] : [i])) ?? [];
    return bots.length > 1 ? `${tr.calls.bot} ${bots.indexOf(seat) + 1}` : tr.calls.bot;
  };
  const view = room?.view;
  const winners = room?.winners ?? [];
  const result =
    winners.length === 1 ? (winners[0] === room?.mySeat ? tr.live.youWon : tr.live.won(nameOf(winners[0]!))) : tr.live.tie;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader>
        <IconButton Icon={ArrowLeft} label={tr.live.leave} onPress={leave} />
        <Text numberOfLines={1} style={[styles.title, { color: t.text }]}>
          {room ? `${LIVE_EMOJI[room.game]} ${tr.live.games[room.game]}` : ""}
        </Text>
        {room && <HowToPlay game={room.game} size={22} />}
      </ScreenHeader>
      {closed ? (
        <EmptyState Icon={Gamepad2} title={tr.live.closed}>
          <PrimaryButton title={tr.live.leave} onPress={leave} />
        </EmptyState>
      ) : !room ? (
        <Loading />
      ) : (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, fontSize: 18, fontWeight: "700", paddingHorizontal: 4 },
  body: { flexGrow: 1, justifyContent: "center", padding: 16, gap: 16 },
  seats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  seat: { alignItems: "center", gap: 2, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 16, borderWidth: 2, minWidth: 80 },
  dot: { position: "absolute", top: 34, left: "50%", marginLeft: 6, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  bot: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(235,138,0,0.15)" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { fontSize: 11, fontWeight: "700", borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
