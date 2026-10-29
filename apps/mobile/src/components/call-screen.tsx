import {
  CALL_GAMES,
  CALL_REACTIONS,
  type CallGame,
  type DicePick,
  type Duel,
  GUESS_MAX,
  type GuessGame,
  type PublicUser,
  RPS_EMOJI,
  RPS_HANDS,
  type RpsHand,
  aliasAvatar,
  diceOutcome,
  diceRoll,
  guessChooser,
  guessRange,
  guessSolved,
  rpsOutcome,
} from "@six/shared";
import { Image } from "expo-image";
import {
  EyeOff,
  Gamepad2,
  Lock,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  PictureInPicture2,
  SmilePlus,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react-native";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RTCView } from "react-native-webrtc";
import {
  type Call,
  acceptCall,
  declineCall,
  flipCamera,
  hangUp,
  openGame,
  pickSecret,
  playAgain,
  playHand,
  rollDice,
  sendGuess,
  sendReaction,
  toggleCamera,
  toggleMute,
  toggleSpeaker,
  useCall,
} from "@/lib/calls";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { brand } from "@/lib/theme";
import { Avatar } from "./avatar";

const RED = "#dc2626";
const GREEN = "#16a34a";

type Person = Pick<PublicUser, "displayName" | "avatarUrl">;

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

function Backdrop({ user }: { user: Person }) {
  const alias = user.avatarUrl ? null : aliasAvatar(user.displayName);
  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]} pointerEvents="none">
      {user.avatarUrl ? (
        <Image
          source={{ uri: user.avatarUrl }}
          style={[StyleSheet.absoluteFill, { opacity: 0.8 }]}
          contentFit="cover"
          blurRadius={40}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { opacity: 0.6, backgroundImage: alias?.gradient ?? `linear-gradient(135deg, ${brand}, #1c1917 70%)` },
          ]}
        />
      )}
      <View style={[StyleSheet.absoluteFill, styles.shade]} />
    </View>
  );
}

function FloatingEmoji({ id, emoji, mine }: Call["reactions"][number]) {
  const { height } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.timing(t, { toValue: 1, duration: 2800, easing: Easing.out(Easing.quad), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [t]);
  return (
    <Animated.Text
      style={[
        styles.floating,
        {
          left: `${(mine ? 58 : 12) + ((id * 37) % 26)}%`,
          opacity: t.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 1, 0.8, 0] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.55] }) },
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, id % 2 ? 28 : -28] }) },
            { scale: t.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0.5, 1.25, 1] }) },
          ],
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

function FloatingReactions({ reactions }: { reactions: Call["reactions"] }) {
  if (!reactions.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {reactions.map((r) => (
        <FloatingEmoji key={r.id} {...r} />
      ))}
    </View>
  );
}

const GAME_ICONS: Record<CallGame, string> = { rps: "✊", dice: "🎲", guess: "🔢" };

/** Shakes for a beat before the picks show, like fists pumping or a die tumbling. */
function useShake() {
  const [revealed, setRevealed] = useState(false);
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const step = (toValue: number) => Animated.timing(bounce, { toValue, duration: 150, useNativeDriver: true });
    const shake = Animated.loop(Animated.sequence([step(1), step(0)]), { iterations: 3 });
    shake.start(({ finished }) => finished && setRevealed(true));
    return () => shake.stop();
  }, [bounce]);
  const style = {
    transform: [
      { translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
      { rotate: bounce.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-14deg"] }) },
    ],
  };
  return { revealed, style };
}

function PlayAgain({ game }: { game: CallGame }) {
  const tr = useT();
  return (
    <Pressable onPress={() => playAgain(game)} accessibilityRole="button" style={styles.again}>
      <Text style={styles.againText}>{tr.calls.playAgain}</Text>
    </Pressable>
  );
}

function Verdict({ outcome, game }: { outcome: number; game: CallGame }) {
  const tr = useT();
  return (
    <>
      <Text style={[styles.verdict, { color: outcome === 1 ? "#4ade80" : outcome === -1 ? "#f87171" : "#fff" }]}>
        {outcome === 1 ? tr.calls.youWin : outcome === -1 ? tr.calls.youLose : tr.calls.draw}
      </Text>
      <PlayAgain game={game} />
    </>
  );
}

function RpsShowdown({ mine, theirs, peerName }: { mine: RpsHand; theirs: RpsHand; peerName: string }) {
  const tr = useT();
  const { revealed, style } = useShake();
  return (
    <>
      <View style={styles.hands}>
        {[
          { who: tr.common.you, hand: mine },
          { who: peerName, hand: theirs },
        ].map(({ who, hand }) => (
          <View key={who} style={styles.handBox}>
            <Animated.Text style={[styles.bigHand, !revealed && style]}>
              {revealed ? RPS_EMOJI[hand] : RPS_EMOJI.rock}
            </Animated.Text>
            <Text style={styles.handLabel} numberOfLines={1}>
              {who}
            </Text>
          </View>
        ))}
      </View>
      {revealed && <Verdict outcome={rpsOutcome(mine, theirs)} game="rps" />}
    </>
  );
}

function DiceShowdown({ mine, theirs, peerName }: { mine: DicePick; theirs: DicePick; peerName: string }) {
  const tr = useT();
  const { revealed, style } = useShake();
  const [face, setFace] = useState(1);
  useEffect(() => {
    if (revealed) return;
    const t = setInterval(() => setFace((f) => (f % 6) + 1), 90);
    return () => clearInterval(t);
  }, [revealed]);
  const roll = diceRoll(mine, theirs);
  return (
    <>
      <Animated.View style={[styles.die, styles.bigDie, !revealed && style]}>
        <Text style={[styles.dieText, { fontSize: 36 }]}>{revealed ? roll : face}</Text>
      </Animated.View>
      {revealed && (
        <>
          <Text style={styles.prompt}>{tr.calls.rolled(roll)}</Text>
          <Text style={styles.picks} numberOfLines={1}>
            {tr.common.you} {mine.pick} · {theirs.pick} {peerName}
          </Text>
          <Verdict outcome={diceOutcome(mine, theirs)} game="dice" />
        </>
      )}
    </>
  );
}

function DuelBody<T>({
  duel,
  peerName,
  prompt,
  mine,
  picker,
  showdown,
}: {
  duel: Duel<T>;
  peerName: string;
  prompt: string;
  mine: (pick: T) => ReactNode;
  picker: ReactNode;
  showdown: (mine: T, theirs: T) => ReactNode;
}) {
  const tr = useT();
  return (
    <>
      <Text style={styles.score} numberOfLines={1}>
        {tr.common.you} {duel.wins} · {duel.losses} {peerName}
      </Text>
      {duel.mine && duel.theirs ? (
        <Fragment key={duel.round}>{showdown(duel.mine, duel.theirs)}</Fragment>
      ) : duel.mine ? (
        <>
          <View style={{ marginTop: 16 }}>{mine(duel.mine)}</View>
          <Text style={styles.prompt}>{tr.calls.waitingFor(peerName)}</Text>
        </>
      ) : (
        <>
          <Text style={styles.prompt}>{duel.theirs ? tr.calls.theyPicked(peerName) : prompt}</Text>
          {picker}
        </>
      )}
    </>
  );
}

function NumberGrid({ onPick, allowed }: { onPick: (n: number) => void; allowed: (n: number) => boolean }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: GUESS_MAX }, (_, i) => i + 1).map((n) => {
        const ok = allowed(n);
        return (
          <Pressable
            key={n}
            onPress={() => onPick(n)}
            disabled={!ok}
            accessibilityRole="button"
            accessibilityLabel={String(n)}
            style={({ pressed }) => [styles.cell, !ok && styles.cellOff, pressed && styles.choicePressed]}
          >
            <Text style={[styles.cellText, !ok && styles.cellTextOff]}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function GuessBody({ game, outgoing, peerName }: { game: GuessGame; outgoing: boolean; peerName: string }) {
  const tr = useT();
  const chooser = guessChooser(game.round, outgoing);
  const solved = guessSolved(game);
  const pending = game.tries.some((t) => !t.hint);
  const last = game.tries.at(-1)?.hint;
  const { lo, hi } = guessRange(game);
  const tried = new Set(game.tries.map((t) => t.n));

  if (!game.ready) {
    if (!chooser) return <Text style={[styles.prompt, { marginTop: 24 }]}>{tr.calls.theyArePicking(peerName)}</Text>;
    return (
      <>
        <Text style={styles.prompt}>{tr.calls.pickSecret}</Text>
        <NumberGrid onPick={pickSecret} allowed={() => true} />
        <Pressable
          onPress={() => pickSecret(1 + Math.floor(Math.random() * GUESS_MAX))}
          accessibilityRole="button"
          style={styles.secondary}
        >
          <Text style={styles.chipText}>{tr.calls.random}</Text>
        </Pressable>
      </>
    );
  }

  return (
    <>
      <Text style={styles.prompt}>
        {chooser && game.secret !== null ? tr.calls.yourNumber(game.secret) : tr.calls.guessPrompt(peerName)}
      </Text>
      {game.tries.length > 0 && (
        <View style={styles.tries}>
          {game.tries.map((t, i) => (
            <View key={i} style={[styles.chip, t.hint === "right" && { backgroundColor: "#22c55e" }]}>
              <Text style={styles.chipText}>
                {t.n} {t.hint === "higher" ? "↑" : t.hint === "lower" ? "↓" : t.hint === "right" ? "✓" : "…"}
              </Text>
            </View>
          ))}
        </View>
      )}
      {solved ? (
        <>
          <Text style={[styles.verdict, { color: "#4ade80" }]}>{tr.calls.hints.right}</Text>
          <Text style={styles.picks}>{tr.calls.foundIn(game.tries.length)}</Text>
          <PlayAgain game="guess" />
        </>
      ) : chooser ? (
        <Text style={styles.prompt}>{tr.calls.theyAreGuessing(peerName)}</Text>
      ) : (
        <>
          {last && last !== "right" && <Text style={styles.hint}>{tr.calls.hints[last]}</Text>}
          <NumberGrid onPick={sendGuess} allowed={(n) => !pending && n >= lo && n <= hi && !tried.has(n)} />
        </>
      )}
    </>
  );
}

function GamesPanel({ call, top }: { call: Call; top: number }) {
  const tr = useT();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { games, game } = call;
  const peerName = call.peer.displayName;
  return (
    <View style={[styles.panel, { top, maxHeight: height - top - insets.bottom - 16 }]} accessibilityLabel={tr.calls.games}>
      <ScrollView contentContainerStyle={styles.panelBody} showsVerticalScrollIndicator={false}>
        <View style={styles.panelHead}>
          <View style={styles.tabs}>
            {CALL_GAMES.map((g) => (
              <Pressable
                key={g}
                onPress={() => openGame(true, g)}
                accessibilityRole="tab"
                accessibilityLabel={tr.calls[g]}
                accessibilityState={{ selected: g === game }}
                style={[styles.tab, g === game && styles.tabOn]}
              >
                <Text style={styles.tabIcon}>{GAME_ICONS[g]}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => openGame(false)} accessibilityLabel={tr.common.close} hitSlop={8}>
            <X size={18} color="#fff" />
          </Pressable>
        </View>
        <Text style={styles.panelTitle}>{tr.calls[game]}</Text>
        {game === "rps" ? (
          <DuelBody
            duel={games.rps}
            peerName={peerName}
            prompt={tr.calls.pickHand}
            mine={(h) => <Text style={styles.bigHand}>{RPS_EMOJI[h]}</Text>}
            picker={
              <View style={styles.choices}>
                {RPS_HANDS.map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => playHand(h)}
                    accessibilityRole="button"
                    accessibilityLabel={tr.calls.hands[h]}
                    style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
                  >
                    <Text style={styles.choiceHand}>{RPS_EMOJI[h]}</Text>
                    <Text style={styles.handLabel}>{tr.calls.hands[h]}</Text>
                  </Pressable>
                ))}
              </View>
            }
            showdown={(a, b) => <RpsShowdown mine={a} theirs={b} peerName={peerName} />}
          />
        ) : game === "dice" ? (
          <DuelBody
            duel={games.dice}
            peerName={peerName}
            prompt={tr.calls.pickDice}
            mine={(p) => (
              <View style={[styles.die, styles.smallDie]}>
                <Text style={[styles.dieText, { fontSize: 28 }]}>{p.pick}</Text>
              </View>
            )}
            picker={
              <View style={styles.choices}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => rollDice(n)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
                  >
                    <Text style={styles.diceChoice}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            }
            showdown={(a, b) => <DiceShowdown mine={a} theirs={b} peerName={peerName} />}
          />
        ) : (
          <GuessBody
            key={games.guess.round}
            game={games.guess}
            outgoing={call.direction === "outgoing"}
            peerName={peerName}
          />
        )}
      </ScrollView>
    </View>
  );
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

function Small({
  Icon,
  label,
  onPress,
  color = "rgba(255,255,255,0.15)",
  active = false,
}: {
  Icon: typeof Mic;
  label: string;
  onPress: () => void;
  color?: string;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      style={[styles.pillButton, { backgroundColor: active ? "#fff" : color }]}
    >
      <Icon size={18} color={active ? "#111" : "#fff"} />
    </Pressable>
  );
}

/**
 * Full-screen call UI, shown over everything while a call rings, runs or has just ended. Minimized, a video call
 * keeps playing in a floating window and a voice call (or a hidden video) shrinks to a pill.
 */
export function CallScreen() {
  const tr = useT();
  const call = useCall((s) => s.call);
  const me = useSession((s) => s.user);
  const insets = useSafeAreaInsets();
  const elapsed = useElapsed(call?.status === "active" ? call.startedAt : null);
  const [small, setSmall] = useState<"video" | "pill" | null>(null);
  const [tray, setTray] = useState(false);
  useEffect(() => setSmall(null), [call?.id]);
  useEffect(() => {
    if (call?.gameOpen) setSmall(null);
  }, [call?.gameOpen]);
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
  const floating = incomingRinging ? null : small;
  const muteLabel = call.muted ? tr.calls.unmute : tr.calls.mute;

  if (floating === "video") {
    return (
      <>
        <View style={[styles.pip, { bottom: insets.bottom + 96 }]}>
          <Pressable onPress={() => setSmall(null)} accessibilityLabel={tr.calls.backToCall} style={styles.pipVideo}>
            {showRemoteVideo ? (
              <RTCView streamURL={call.remote!.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={1} />
            ) : (
              <>
                <Backdrop user={call.peer} />
                <Avatar user={call.peer} size="md" />
              </>
            )}
            <View style={styles.pipCaption}>
              <Text style={styles.pillName} numberOfLines={1}>
                {call.peer.displayName}
              </Text>
              <Text style={styles.pillStatus}>{status}</Text>
            </View>
          </Pressable>
          {call.status !== "ended" && (
            <View style={styles.pipButtons}>
              <Small Icon={call.muted ? MicOff : Mic} label={muteLabel} active={call.muted} onPress={toggleMute} />
              <Small Icon={EyeOff} label={tr.calls.hideVideo} onPress={() => setSmall("pill")} />
              <Small Icon={PhoneOff} label={tr.calls.hangUp} color={RED} onPress={() => void hangUp()} />
            </View>
          )}
        </View>
        <FloatingReactions reactions={call.reactions} />
      </>
    );
  }

  if (floating === "pill") {
    return (
      <>
        <View style={[styles.pill, { top: insets.top + 8 }]}>
          <Pressable onPress={() => setSmall(null)} accessibilityLabel={tr.calls.backToCall} style={styles.pillInfo}>
            <Avatar user={call.peer} size="sm" />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.pillName} numberOfLines={1}>
                {call.peer.displayName}
              </Text>
              <Text style={styles.pillStatus}>{status}</Text>
            </View>
          </Pressable>
          {call.status !== "ended" && (
            <>
              {call.video && <Small Icon={PictureInPicture2} label={tr.calls.showVideo} onPress={() => setSmall("video")} />}
              <Small Icon={call.muted ? MicOff : Mic} label={muteLabel} active={call.muted} onPress={toggleMute} />
              <Small Icon={PhoneOff} label={tr.calls.hangUp} color={RED} onPress={() => void hangUp()} />
            </>
          )}
        </View>
        <FloatingReactions reactions={call.reactions} />
      </>
    );
  }

  const canShrink = !incomingRinging && call.status !== "ended";
  const shrink = () => setSmall(call.video ? "video" : "pill");
  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        if (canShrink) shrink();
      }}
    >
      <View style={styles.screen}>
        {showRemoteVideo ? (
          <RTCView streamURL={call.remote!.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" />
        ) : (
          <Backdrop user={call.peer} />
        )}

        {canShrink && (
          <Pressable
            onPress={shrink}
            accessibilityLabel={tr.calls.minimize}
            hitSlop={8}
            style={[styles.pillButton, styles.shrink, { top: insets.top + 12 }]}
          >
            <Minimize2 size={20} color="#fff" />
          </Pressable>
        )}
        {call.status === "active" && (
          <View style={[styles.fun, { top: insets.top + 12 }]}>
            <Small Icon={Gamepad2} label={tr.calls.games} active={call.gameOpen} onPress={() => openGame(!call.gameOpen)} />
            <Small Icon={SmilePlus} label={tr.calls.react} active={tray} onPress={() => setTray((t) => !t)} />
          </View>
        )}
        <View style={[styles.top, { paddingTop: insets.top + 32 }, showRemoteVideo && styles.topOnVideo]}>
          {!showRemoteVideo && (
            <View style={styles.halo}>
              <Avatar user={call.peer} size="xl" />
            </View>
          )}
          <Text style={styles.name} numberOfLines={1}>
            {call.peer.displayName}
          </Text>
          <Text style={styles.status}>{status}</Text>
          <View style={styles.chip}>
            <Lock size={12} color="#fff" />
            <Text style={styles.chipText}>{tr.calls.encrypted}</Text>
          </View>
          {call.video && call.status === "active" && call.peerCameraOff && (
            <View style={styles.chip}>
              <VideoOff size={13} color="#fff" />
              <Text style={styles.chipText}>{tr.calls.cameraIsOff}</Text>
            </View>
          )}
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
        {call.video && call.cameraOff && call.status === "active" && me && (
          <View style={[styles.self, styles.selfOff, { bottom: insets.bottom + 250 }]} accessibilityLabel={tr.calls.cameraIsOff}>
            <Backdrop user={me} />
            <Avatar user={me} size="md" />
            <View style={styles.selfIcon}>
              <VideoOff size={14} color="#fff" />
            </View>
          </View>
        )}

        <View style={[styles.controls, { paddingBottom: insets.bottom + 32 }]}>
          {incomingRinging ? (
            <>
              {call.video && (
                <View style={styles.row}>
                  <Round Icon={call.muted ? MicOff : Mic} label={muteLabel} size={52} active={call.muted} onPress={toggleMute} />
                  <Round
                    Icon={call.cameraOff ? VideoOff : Video}
                    label={call.cameraOff ? tr.calls.cameraOn : tr.calls.cameraOff}
                    size={52}
                    active={call.cameraOff}
                    onPress={toggleCamera}
                  />
                </View>
              )}
              <View style={styles.row}>
                <Round Icon={PhoneOff} label={tr.calls.decline} color={RED} size={72} onPress={() => void declineCall()} />
                <Round
                  Icon={call.video && !call.cameraOff ? Video : Phone}
                  label={tr.calls.accept}
                  color={GREEN}
                  size={72}
                  onPress={() => void acceptCall()}
                />
              </View>
            </>
          ) : call.status === "ended" ? null : (
            <>
              {tray && call.status === "active" && (
                <View style={styles.tray}>
                  {CALL_REACTIONS.map((e) => (
                    <Pressable
                      key={e}
                      onPress={() => sendReaction(e)}
                      accessibilityRole="button"
                      accessibilityLabel={e}
                      hitSlop={2}
                      style={({ pressed }) => [styles.trayItem, pressed && { transform: [{ scale: 0.85 }] }]}
                    >
                      <Text style={styles.trayEmoji}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.row}>
                <Round Icon={call.muted ? MicOff : Mic} label={muteLabel} active={call.muted} onPress={toggleMute} />
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
        {call.gameOpen && call.status === "active" && (
          <GamesPanel call={call} top={insets.top + 120} />
        )}
        <FloatingReactions reactions={call.reactions} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0a09" },
  backdrop: { backgroundColor: "#0c0a09", overflow: "hidden" },
  shade: { backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.45), rgba(0,0,0,0.8))" },
  top: { alignItems: "center", gap: 10, paddingHorizontal: 24 },
  halo: { padding: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", elevation: 12 },
  name: { color: "#fff", fontSize: 28, fontWeight: "700", marginTop: 12 },
  status: { color: "rgba(255,255,255,0.8)", fontSize: 16 },
  topOnVideo: { backgroundColor: "rgba(0,0,0,0.35)", paddingBottom: 16 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  self: { position: "absolute", right: 16, width: 110, height: 160, borderRadius: 14, overflow: "hidden" },
  selfOff: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  selfIcon: { position: "absolute", right: 8, bottom: 8 },
  controls: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 28 },
  row: { flexDirection: "row", justifyContent: "center", gap: 22, flexWrap: "wrap", paddingHorizontal: 16 },
  round: { alignItems: "center", justifyContent: "center" },
  roundLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
  pill: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "92%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 6,
    borderRadius: 999,
    backgroundColor: "#1c1917",
    elevation: 8,
  },
  pillInfo: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, paddingRight: 4 },
  pillName: { color: "#fff", fontSize: 14, fontWeight: "700" },
  pillStatus: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  pillButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  shrink: { position: "absolute", left: 16, zIndex: 2 },
  pip: {
    position: "absolute",
    right: 12,
    width: 132,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#1c1917",
    elevation: 10,
  },
  pipVideo: { height: 176, alignItems: "center", justifyContent: "center" },
  pipCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingTop: 20,
    paddingBottom: 6,
    backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
  },
  pipButtons: { flexDirection: "row", justifyContent: "center", gap: 6, padding: 6 },
  fun: { position: "absolute", right: 16, zIndex: 2, alignItems: "center", gap: 8 },
  tray: { flexDirection: "row", gap: 2, padding: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.4)" },
  trayItem: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  trayEmoji: { fontSize: 24 },
  floating: { position: "absolute", bottom: 150, fontSize: 44 },
  panel: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(28,25,23,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    elevation: 16,
  },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch" },
  panelTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 12 },
  score: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 4, fontVariant: ["tabular-nums"] },
  tabs: { flexDirection: "row", gap: 4 },
  tab: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: "rgba(255,255,255,0.25)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  tabIcon: { fontSize: 20 },
  choicePressed: { backgroundColor: "rgba(255,255,255,0.22)" },
  diceChoice: { color: "#fff", fontSize: 18, fontWeight: "700" },
  die: { alignSelf: "center", alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#fff", elevation: 6 },
  bigDie: { width: 80, height: 80, marginTop: 20 },
  smallDie: { width: 64, height: 64 },
  dieText: { color: "#111", fontWeight: "700", fontVariant: ["tabular-nums"] },
  picks: { color: "#fff", fontSize: 14, marginTop: 4, fontVariant: ["tabular-nums"] },
  hint: { color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 12 },
  tries: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 12 },
  panelBody: { padding: 20, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 3, marginTop: 16, alignSelf: "stretch" },
  cell: {
    width: "9%",
    aspectRatio: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  cellOff: { backgroundColor: "transparent" },
  cellText: { color: "#fff", fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"] },
  cellTextOff: { color: "rgba(255,255,255,0.2)" },
  secondary: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)" },
  prompt: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 16, textAlign: "center" },
  choices: { flexDirection: "row", gap: 10, marginTop: 16, alignSelf: "stretch" },
  choice: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)" },
  choiceHand: { fontSize: 36 },
  hands: { flexDirection: "row", justifyContent: "center", gap: 48, marginTop: 20 },
  handBox: { alignItems: "center", gap: 8, maxWidth: 110 },
  bigHand: { fontSize: 56 },
  handLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12 },
  verdict: { fontSize: 20, fontWeight: "700", marginTop: 16 },
  again: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 999, backgroundColor: "#fff" },
  againText: { color: "#111", fontSize: 14, fontWeight: "600" },
});
