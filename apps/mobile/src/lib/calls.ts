import { type Realtime, type SignalInput, unwrap } from "@six/sdk";
import {
  type CallReaction,
  type CallSignal,
  type CallSignalDTO,
  type ChatDTO,
  type CallGame,
  type DicePick,
  type Duel,
  type GuessGame,
  NEW_GUESS,
  type RpsHand,
  diceOutcome,
  duelNext,
  duelPick,
  duelReceive,
  guessChooser,
  guessNext,
  guessOnHint,
  guessOnReady,
  guessOnTry,
  guessSetSecret,
  guessSolved,
  guessTry,
  newDuel,
  rpsOutcome,
} from "@six/shared";
import { randomUUID } from "expo-crypto";
import InCallManager from "react-native-incall-manager";
import {
  type MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from "react-native-webrtc";
import { create } from "zustand";
import { e2eeFor } from "./e2ee";
import { getT } from "./i18n";
import { six } from "./six";

export type CallStatus = "ringing" | "connecting" | "active" | "ended";

export interface Call {
  id: string;
  chatId: string;
  memberIds: string[];
  peer: { id: string; displayName: string; avatarUrl: string | null };
  direction: "outgoing" | "incoming";
  video: boolean;
  status: CallStatus;
  /** Why it ended, shown for a moment before the screen closes. */
  endReason: string | null;
  startedAt: number | null;
  muted: boolean;
  cameraOff: boolean;
  /** On the back camera, so the preview isn't mirrored. */
  back?: boolean;
  peerCameraOff: boolean;
  speaker: boolean;
  local: MediaStream | null;
  remote: MediaStream | null;
  reactions: { id: number; emoji: CallReaction; mine: boolean }[];
  games: { rps: Duel<RpsHand>; dice: Duel<DicePick>; guess: GuessGame };
  game: CallGame;
  gameOpen: boolean;
}

const newGames = (): Call["games"] => ({ rps: newDuel(), dice: newDuel(), guess: NEW_GUESS });

export const useCall = create<{ call: Call | null }>(() => ({ call: null }));

const RING_MS = 45_000;

let meId: string | null = null;
let realtime: Realtime | null = null;
let pc: RTCPeerConnection | null = null;
let pendingOffer: { sdp: string; fromDevice: string } | null = null;
let remoteDevice: string | null = null;
let queuedIce: CallSignal[] = [];
let ringTimer: ReturnType<typeof setTimeout> | null = null;

/** Lets the call code reach the socket and the encryption client of the signed-in account. */
export function attachCalls(userId: string, rt: Realtime | null) {
  meId = userId;
  realtime = rt;
}

const patch = (p: Partial<Call>) => useCall.setState((s) => (s.call ? { call: { ...s.call, ...p } } : s));

async function signal(call: Pick<Call, "id" | "chatId" | "memberIds">, s: SignalInput) {
  const e2ee = e2eeFor(meId ?? undefined);
  if (!e2ee || !realtime) throw new Error("not connected");
  const envelopes = await e2ee.sealSignal(call.chatId, call.memberIds, call.id, s);
  if (envelopes.length) await realtime.sendCallSignal({ chatId: call.chatId, callId: call.id, envelopes });
}

async function iceServers() {
  return unwrap(await six.api.GET("/v1/calls/ice-servers")).iceServers;
}

async function openMedia(video: boolean) {
  return mediaDevices.getUserMedia({
    audio: true,
    video: video ? { facingMode: "user", width: 1280, height: 720, frameRate: 30 } : false,
  });
}

async function connect(call: Call, local: MediaStream) {
  const conn = new RTCPeerConnection({ iceServers: await iceServers() });
  pc = conn;
  for (const track of local.getTracks()) conn.addTrack(track, local);
  conn.addEventListener("icecandidate", (e: { candidate: RTCIceCandidate | null }) => {
    if (!e.candidate) return;
    const { candidate, sdpMid, sdpMLineIndex } = e.candidate.toJSON();
    void signal(call, { type: "ice", candidate: { candidate, sdpMid: sdpMid ?? null, sdpMLineIndex: sdpMLineIndex ?? null } }).catch(
      () => null,
    );
  });
  conn.addEventListener("track", (e: { streams: MediaStream[] }) => {
    if (e.streams[0]) patch({ remote: e.streams[0] });
  });
  conn.addEventListener("connectionstatechange", () => {
    if (conn.connectionState === "connected") {
      const current = useCall.getState().call;
      if (current && current.status !== "active") patch({ status: "active", startedAt: Date.now() });
    } else if (conn.connectionState === "failed") {
      void end(getT().calls.connectionLost, true);
    }
  });
  return conn;
}

async function flushIce() {
  if (!pc?.remoteDescription) return;
  for (const s of queuedIce) {
    if (s.type === "ice") await pc.addIceCandidate(new RTCIceCandidate(s.candidate)).catch(() => null);
  }
  queuedIce = [];
}

function clearRing() {
  if (ringTimer) clearTimeout(ringTimer);
  ringTimer = null;
  InCallManager.stopRingtone();
  InCallManager.stopRingback();
}

/** Starts a call to the other person in a direct chat. */
export async function startCall(chat: ChatDTO, video: boolean) {
  if (useCall.getState().call || !meId) return;
  const peer = chat.members.find((m) => m.user.id !== meId)?.user;
  if (!peer) return;
  const call: Call = {
    id: randomUUID(),
    chatId: chat.id,
    memberIds: chat.members.map((m) => m.user.id),
    peer,
    direction: "outgoing",
    video,
    status: "ringing",
    endReason: null,
    startedAt: null,
    muted: false,
    cameraOff: false,
    peerCameraOff: false,
    speaker: video,
    local: null,
    remote: null,
    reactions: [],
    games: newGames(),
    game: "rps",
    gameOpen: false,
  };
  useCall.setState({ call });
  try {
    InCallManager.start({ media: video ? "video" : "audio" });
    InCallManager.setForceSpeakerphoneOn(video);
    const local = await openMedia(video);
    patch({ local });
    const conn = await connect(call, local);
    const offer = await conn.createOffer({});
    await conn.setLocalDescription(offer);
    await signal(call, { type: "offer", sdp: offer.sdp, video });
    InCallManager.startRingback("_DTMF_");
    ringTimer = setTimeout(() => void end(getT().calls.noAnswer, true), RING_MS);
  } catch {
    await end(getT().calls.couldNotStart, false);
  }
}

/** Picks up the call that is ringing on this phone. */
export async function acceptCall() {
  const call = useCall.getState().call;
  if (!call || call.direction !== "incoming" || call.status !== "ringing" || !pendingOffer) return;
  clearRing();
  patch({ status: "connecting" });
  try {
    InCallManager.start({ media: call.video ? "video" : "audio" });
    InCallManager.setForceSpeakerphoneOn(call.video);
    const local = await openMedia(call.video);
    const { muted, cameraOff } = useCall.getState().call ?? call;
    local.getAudioTracks().forEach((t) => (t.enabled = !muted));
    local.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
    patch({ local });
    const conn = await connect(call, local);
    await conn.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: pendingOffer.sdp }));
    const answer = await conn.createAnswer();
    await conn.setLocalDescription(answer);
    await signal(call, { type: "answer", sdp: answer.sdp });
    if (call.video && useCall.getState().call?.cameraOff) void signal(call, { type: "video", on: false }).catch(() => null);
    await flushIce();
  } catch {
    await end(getT().calls.couldNotConnect, true);
  }
}

export async function declineCall() {
  const call = useCall.getState().call;
  if (!call) return;
  await signal(call, { type: "reject" }).catch(() => null);
  await finish(call, getT().calls.declined);
}

/** Hangs up (or cancels a call still ringing on the other side). */
export async function hangUp() {
  await end(null, true);
}

async function end(reason: string | null, tell: boolean) {
  const call = useCall.getState().call;
  if (!call || call.status === "ended") return;
  if (tell) await signal(call, { type: "hangup" }).catch(() => null);
  const tr = getT().calls;
  await finish(call, reason ?? (call.status === "active" ? tr.callEnded : tr.cancelled));
}

/** Closes the connection, logs the call when we placed it, and closes the screen after a moment. */
async function finish(call: Call, reason: string) {
  clearRing();
  pc?.close();
  pc = null;
  pendingOffer = null;
  remoteDevice = null;
  queuedIce = [];
  for (const s of [call.local, call.remote]) s?.getTracks().forEach((t) => t.stop());
  call.local?.release();
  InCallManager.stop();
  patch({ status: "ended", endReason: reason, local: null, remote: null });
  if (call.direction === "outgoing") {
    const secs = call.startedAt ? Math.round((Date.now() - call.startedAt) / 1000) : null;
    void six.api
      .POST("/v1/chats/{id}/calls", {
        params: { path: { id: call.chatId } },
        body: { callId: call.id, video: call.video, durationSecs: secs },
      })
      .catch(() => null);
  }
  setTimeout(() => useCall.setState((s) => (s.call?.id === call.id ? { call: null } : s)), 1500);
}

export function toggleMute() {
  const call = useCall.getState().call;
  if (!call) return;
  const muted = !call.muted;
  call.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  patch({ muted });
}

export function toggleCamera() {
  const call = useCall.getState().call;
  if (!call?.video) return;
  const cameraOff = !call.cameraOff;
  call.local?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
  patch({ cameraOff });
  if (call.local) void signal(call, { type: "video", on: !cameraOff }).catch(() => null);
}

export function flipCamera() {
  const call = useCall.getState().call;
  if (!call?.local) return;
  call.local.getVideoTracks().forEach((t) => t._switchCamera());
  patch({ back: !call.back });
}

let reactionId = 0;

function showReaction(emoji: CallReaction, mine: boolean) {
  const id = ++reactionId;
  const call = useCall.getState().call;
  if (!call) return;
  patch({ reactions: [...call.reactions.slice(-20), { id, emoji, mine }] });
  setTimeout(() => {
    const reactions = useCall.getState().call?.reactions;
    if (reactions) patch({ reactions: reactions.filter((r) => r.id !== id) });
  }, 3000);
}

export function sendReaction(emoji: CallReaction) {
  const call = useCall.getState().call;
  if (!call) return;
  showReaction(emoji, true);
  void signal(call, { type: "reaction", emoji }).catch(() => null);
}

function setGames(games: Partial<Call["games"]>, open?: CallGame) {
  const call = useCall.getState().call;
  if (call) patch({ games: { ...call.games, ...games }, ...(open && { game: open, gameOpen: true }) });
}

/** Opens or switches the game panel, and brings the other side to the same game. */
export function openGame(gameOpen: boolean, game?: CallGame) {
  const call = useCall.getState().call;
  if (!call) return;
  const next = game ?? call.game;
  patch({ gameOpen, game: next });
  if (gameOpen) void signal(call, { type: "game", game: next }).catch(() => null);
}

export function playHand(hand: RpsHand) {
  const call = useCall.getState().call;
  const next = call && duelPick(call.games.rps, hand, rpsOutcome);
  if (!next) return;
  setGames({ rps: next });
  void signal(call, { type: "rps", round: next.round, hand }).catch(() => null);
}

export function rollDice(pick: number) {
  const mine = { pick, seed: Math.floor(Math.random() * 6) };
  const call = useCall.getState().call;
  const next = call && duelPick(call.games.dice, mine, diceOutcome);
  if (!next) return;
  setGames({ dice: next });
  void signal(call, { type: "dice", round: next.round, ...mine }).catch(() => null);
}

export function pickSecret(n: number) {
  const call = useCall.getState().call;
  const guess = call?.games.guess;
  const next = guess && guessChooser(guess.round, call.direction === "outgoing") && guessSetSecret(guess, n);
  if (!next) return;
  setGames({ guess: next });
  void signal(call, { type: "guessReady", round: next.round }).catch(() => null);
}

export function sendGuess(n: number) {
  const call = useCall.getState().call;
  const next = call && guessTry(call.games.guess, n);
  if (!next) return;
  setGames({ guess: next });
  void signal(call, { type: "guessTry", round: next.round, n }).catch(() => null);
}

export function playAgain(game: CallGame) {
  const games = useCall.getState().call?.games;
  if (!games) return;
  if (game === "guess") {
    if (guessSolved(games.guess)) setGames({ guess: guessNext(games.guess) });
  } else if (game === "rps") {
    if (games.rps.mine && games.rps.theirs) setGames({ rps: duelNext(games.rps) });
  } else if (games.dice.mine && games.dice.theirs) {
    setGames({ dice: duelNext(games.dice) });
  }
}

export function toggleSpeaker() {
  const call = useCall.getState().call;
  if (!call) return;
  InCallManager.setForceSpeakerphoneOn(!call.speaker);
  patch({ speaker: !call.speaker });
}

/**
 * Handles a signal relayed to this phone. Offers from the other person ring (or answer busy);
 * our own other phones picking up or declining stop the ringing here; everything else only
 * counts when it comes from the device this call is connected to.
 */
export async function onCallSignal(dto: CallSignalDTO, chatOf: (chatId: string) => ChatDTO | undefined) {
  const e2ee = e2eeFor(meId ?? undefined);
  if (!e2ee || !meId) return;
  const s = await e2ee.openSignal(dto);
  if (!s) return;
  const call = useCall.getState().call;
  const fromMe = dto.fromUserId === meId;

  if (s.type === "offer") {
    if (fromMe) return;
    const chat = chatOf(dto.chatId);
    const peer = chat?.members.find((m) => m.user.id === dto.fromUserId)?.user;
    if (!chat || !peer) return;
    const target = { id: s.callId, chatId: s.chatId, memberIds: chat.members.map((m) => m.user.id) };
    if (call && call.status !== "ended") {
      if (call.id !== s.callId) await signal(target, { type: "busy" }).catch(() => null);
      return;
    }
    pendingOffer = { sdp: s.sdp, fromDevice: dto.fromDeviceId };
    remoteDevice = dto.fromDeviceId;
    useCall.setState({
      call: {
        ...target,
        peer,
        direction: "incoming",
        video: s.video,
        status: "ringing",
        endReason: null,
        startedAt: null,
        muted: false,
        cameraOff: false,
        peerCameraOff: false,
        speaker: s.video,
        local: null,
        remote: null,
        reactions: [],
        games: newGames(),
        game: "rps",
        gameOpen: false,
      },
    });
    InCallManager.startRingtone("_DEFAULT_", [0, 600, 900], "playback", RING_MS / 1000);
    ringTimer = setTimeout(() => {
      const c = useCall.getState().call;
      if (c?.id === s.callId && c.status === "ringing") void finish(c, getT().calls.missed);
    }, RING_MS);
    await signal(target, { type: "ringing" }).catch(() => null);
    return;
  }

  if (!call || call.id !== s.callId || call.status === "ended") return;

  if (fromMe) {
    if (call.direction === "incoming" && call.status === "ringing" && (s.type === "answer" || s.type === "reject")) {
      await finish(call, s.type === "answer" ? getT().calls.answeredElsewhere : getT().calls.declinedElsewhere);
    }
    return;
  }

  if (call.direction === "outgoing" && s.type === "answer" && !remoteDevice) {
    remoteDevice = dto.fromDeviceId;
    clearRing();
    patch({ status: "connecting" });
    await pc?.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: s.sdp }));
    await flushIce();
    return;
  }
  if (remoteDevice && dto.fromDeviceId !== remoteDevice) return;

  switch (s.type) {
    case "ice":
      if (pc?.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(s.candidate)).catch(() => null);
      else queuedIce.push(s);
      break;
    case "video":
      patch({ peerCameraOff: !s.on });
      break;
    case "reaction":
      showReaction(s.emoji, false);
      break;
    case "game":
      patch({ game: s.game, gameOpen: true });
      break;
    case "rps": {
      const rps = duelReceive(call.games.rps, s.round, s.hand, rpsOutcome);
      if (rps) setGames({ rps }, "rps");
      break;
    }
    case "dice": {
      const dice = duelReceive(call.games.dice, s.round, { pick: s.pick, seed: s.seed }, diceOutcome);
      if (dice) setGames({ dice }, "dice");
      break;
    }
    case "guessReady": {
      const guess = guessOnReady(call.games.guess, s.round);
      if (guess) setGames({ guess }, "guess");
      break;
    }
    case "guessTry": {
      const answer = guessOnTry(call.games.guess, s.round, s.n);
      if (!answer) break;
      setGames({ guess: answer.game }, "guess");
      void signal(call, { type: "guessHint", round: s.round, n: s.n, hint: answer.hint }).catch(() => null);
      break;
    }
    case "guessHint": {
      const guess = guessOnHint(call.games.guess, s.round, s.n, s.hint);
      if (guess) setGames({ guess });
      break;
    }
    case "reject":
      await finish(call, getT().calls.declined);
      break;
    case "busy":
      await finish(call, getT().calls.busy);
      break;
    case "hangup":
      await finish(call, call.status === "ringing" && call.direction === "incoming" ? getT().calls.missed : getT().calls.callEnded);
      break;
  }
}
