import type { Realtime, SignalInput } from "@six/sdk";
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
import { create } from "zustand";
import { e2ee } from "./e2ee";
import { getT } from "./i18n";
import { six } from "./six";
import { type VoiceFx, useVoiceEffect, withVoiceEffect } from "./voice-fx";

const RING_TIMEOUT = 45_000;

export type CallPhase = "calling" | "ringing" | "incoming" | "connecting" | "active" | "ended";

export interface Call {
  id: string;
  chatId: string;
  peerId: string;
  outgoing: boolean;
  video: boolean;
  phase: CallPhase;
  connectedAt: number | null;
  local: MediaStream | null;
  remote: MediaStream | null;
  muted: boolean;
  cameraOn: boolean;
  peerVideo: boolean;
  ended: string | null;
  reactions: { id: number; emoji: CallReaction; mine: boolean }[];
  games: { rps: Duel<RpsHand>; dice: Duel<DicePick>; guess: GuessGame };
  game: CallGame;
  gameOpen: boolean;
}

const newGames = (): Call["games"] => ({ rps: newDuel(), dice: newDuel(), guess: NEW_GUESS });

export const useCall = create<{ call: Call | null }>(() => ({ call: null }));

const patch = (p: Partial<Call>) => useCall.setState((s) => (s.call ? { call: { ...s.call, ...p } } : s));

interface Live {
  realtime: Realtime;
  memberIds: string[];
  pc: RTCPeerConnection | null;
  offer: string | null;
  pendingIce: RTCIceCandidateInit[];
  peerDeviceId: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  fx: Promise<VoiceFx> | null;
}

let live: Live | null = null;
let realtimeRef: Realtime | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function signal(s: SignalInput) {
  const call = useCall.getState().call;
  const client = e2ee();
  const current = live;
  if (!call || !current || !client) return;
  const envelopes = await client.sealSignal(call.chatId, current.memberIds, call.id, s);
  if (!envelopes.length) throw new Error("NO_DEVICES");
  await current.realtime.sendCallSignal({ chatId: call.chatId, callId: call.id, envelopes });
}

async function iceServers() {
  const res = await six.api.GET("/v1/calls/ice-servers").catch(() => null);
  return res?.data?.iceServers ?? [{ urls: ["stun:stun.l.google.com:19302"] }];
}

async function connect(video: boolean) {
  const local = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
  const servers = await iceServers();
  if (!live) {
    for (const t of local.getTracks()) t.stop();
    throw new Error("ENDED");
  }
  const { muted = false, cameraOn = video } = useCall.getState().call ?? {};
  for (const t of local.getAudioTracks()) t.enabled = !muted;
  for (const t of local.getVideoTracks()) t.enabled = cameraOn;
  const pc = new RTCPeerConnection({ iceServers: servers });
  for (const track of local.getTracks()) pc.addTrack(track, local);
  const remote = new MediaStream();
  pc.ontrack = (e) => {
    remote.addTrack(e.track);
    patch({ remote: new MediaStream(remote.getTracks()) });
  };
  pc.onicecandidate = (e) => {
    const c = e.candidate;
    if (c) {
      void signal({
        type: "ice",
        candidate: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex },
      }).catch(() => null);
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      const call = useCall.getState().call;
      if (call && !call.connectedAt) patch({ phase: "active", connectedAt: Date.now() });
    }
    if (pc.connectionState === "failed") void hangup(getT().calls.connectionLost);
  };
  live!.pc = pc;
  patch({ local, remote });
  void applyVoiceEffect();
  return pc;
}

/** Puts the voice effect on the call's microphone the first time one is picked, by swapping the track being sent. */
async function applyVoiceEffect() {
  const current = live;
  const raw = useCall.getState().call?.local;
  if (!current?.pc || current.fx || !raw || useVoiceEffect.getState().effect === "none") return;
  current.fx = withVoiceEffect(raw);
  const fx = await current.fx;
  if (live !== current) return;
  const [track] = fx.stream.getAudioTracks();
  for (const t of raw.getAudioTracks()) t.enabled = true;
  if (track) track.enabled = !useCall.getState().call?.muted;
  await current.pc!.getSenders().find((s) => s.track?.kind === "audio")?.replaceTrack(track ?? null);
  patch({ local: fx.stream });
}

useVoiceEffect.subscribe(() => void applyVoiceEffect());

async function flushIce() {
  const pc = live?.pc;
  if (!pc?.remoteDescription) return;
  for (const c of live!.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => null);
}

/** Posts the call to the chat history; only the caller does, so it shows once. */
async function logCall(call: Call) {
  if (!call.outgoing) return;
  const durationSecs = call.connectedAt ? Math.round((Date.now() - call.connectedAt) / 1000) : null;
  await six.api
    .POST("/v1/chats/{id}/calls", {
      params: { path: { id: call.chatId } },
      body: { callId: call.id, video: call.video, durationSecs },
    })
    .catch(() => null);
}

function teardown(reason: string | null, log = true) {
  const call = useCall.getState().call;
  if (!call || call.phase === "ended") return;
  if (live?.timer) clearTimeout(live.timer);
  live?.pc?.close();
  void live?.fx?.then((fx) => fx.stop());
  for (const t of call.local?.getTracks() ?? []) t.stop();
  live = null;
  if (log) void logCall(call);
  if (!reason) {
    useCall.setState({ call: null });
    return;
  }
  patch({ phase: "ended", ended: reason, local: null, remote: null });
  setTimeout(() => {
    if (useCall.getState().call?.id === call.id) useCall.setState({ call: null });
  }, 1800);
}

function ringFor(id: string, onTimeout: () => void) {
  if (live) live.timer = setTimeout(() => useCall.getState().call?.id === id && onTimeout(), RING_TIMEOUT);
}

function mediaError(err: unknown) {
  const tr = getT().calls;
  const name = (err as Error).name;
  if (name === "NotAllowedError") return tr.allowMedia;
  if (name === "NotFoundError") return tr.noMedia;
  if ((err as Error).message === "NO_DEVICES") return tr.cantTakeCalls;
  if ((err as { code?: string }).code === "OFFLINE") return tr.offline;
  return tr.couldNotStart;
}

export function setCallRealtime(realtime: Realtime | null) {
  realtimeRef = realtime;
}

export async function startCall(chat: ChatDTO, meId: string, video: boolean) {
  if (useCall.getState().call || !realtimeRef) return;
  const peerId = chat.members.find((m) => m.user.id !== meId)?.user.id;
  if (!peerId) return;
  const id = crypto.randomUUID();
  live = {
    realtime: realtimeRef,
    memberIds: chat.members.map((m) => m.user.id),
    pc: null,
    offer: null,
    pendingIce: [],
    peerDeviceId: null,
    timer: null,
    fx: null,
  };
  useCall.setState({
    call: {
      id,
      chatId: chat.id,
      peerId,
      outgoing: true,
      video,
      phase: "calling",
      connectedAt: null,
      local: null,
      remote: null,
      muted: false,
      cameraOn: video,
      peerVideo: video,
      ended: null,
      reactions: [],
      games: newGames(),
      game: "rps",
      gameOpen: false,
    },
  });
  try {
    const pc = await connect(video);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await signal({ type: "offer", sdp: offer.sdp!, video });
    ringFor(id, () => void hangup(getT().calls.noAnswer));
  } catch (err) {
    teardown(mediaError(err), false);
  }
}

export async function acceptCall() {
  const call = useCall.getState().call;
  if (!call || call.phase !== "incoming" || !live?.offer) return;
  if (live.timer) clearTimeout(live.timer);
  patch({ phase: "connecting" });
  try {
    const pc = await connect(call.video);
    await pc.setRemoteDescription({ type: "offer", sdp: live.offer });
    await flushIce();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await signal({ type: "answer", sdp: answer.sdp! });
    if (call.video && !useCall.getState().call?.cameraOn) void signal({ type: "video", on: false }).catch(() => null);
  } catch (err) {
    void signal({ type: "hangup" }).catch(() => null);
    teardown(mediaError(err));
  }
}

export function declineCall() {
  void signal({ type: "reject" }).catch(() => null);
  teardown(null);
}

export async function hangup(reason = getT().calls.callEnded) {
  await signal({ type: "hangup" }).catch(() => null);
  teardown(reason);
}

export function toggleMute() {
  const call = useCall.getState().call;
  if (!call) return;
  const muted = !call.muted;
  for (const t of call.local?.getAudioTracks() ?? []) t.enabled = !muted;
  patch({ muted });
}

export function toggleCamera() {
  const call = useCall.getState().call;
  if (!call?.video) return;
  const cameraOn = !call.cameraOn;
  for (const t of call.local?.getVideoTracks() ?? []) t.enabled = cameraOn;
  patch({ cameraOn });
  if (call.local) void signal({ type: "video", on: cameraOn }).catch(() => null);
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
  showReaction(emoji, true);
  void signal({ type: "reaction", emoji }).catch(() => null);
}

function setGames(games: Partial<Call["games"]>, open?: CallGame) {
  const call = useCall.getState().call;
  if (call) patch({ games: { ...call.games, ...games }, ...(open && { game: open, gameOpen: true }) });
}

/** Opens or switches the game panel, and brings the other side to the same game. */
export function openGame(gameOpen: boolean, game?: CallGame) {
  const next = game ?? useCall.getState().call?.game;
  if (!next) return;
  patch({ gameOpen, game: next });
  if (gameOpen) void signal({ type: "game", game: next }).catch(() => null);
}

export function playHand(hand: RpsHand) {
  const rps = useCall.getState().call?.games.rps;
  const next = rps && duelPick(rps, hand, rpsOutcome);
  if (!next) return;
  setGames({ rps: next });
  void signal({ type: "rps", round: next.round, hand }).catch(() => null);
}

export function rollDice(pick: number) {
  const mine = { pick, seed: Math.floor(Math.random() * 6) };
  const dice = useCall.getState().call?.games.dice;
  const next = dice && duelPick(dice, mine, diceOutcome);
  if (!next) return;
  setGames({ dice: next });
  void signal({ type: "dice", round: next.round, ...mine }).catch(() => null);
}

export function pickSecret(n: number) {
  const call = useCall.getState().call;
  const next = call && guessChooser(call.games.guess.round, call.outgoing) && guessSetSecret(call.games.guess, n);
  if (!next) return;
  setGames({ guess: next });
  void signal({ type: "guessReady", round: next.round }).catch(() => null);
}

export function sendGuess(n: number) {
  const guess = useCall.getState().call?.games.guess;
  const next = guess && guessTry(guess, n);
  if (!next) return;
  setGames({ guess: next });
  void signal({ type: "guessTry", round: next.round, n }).catch(() => null);
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

let flipping = false;

/** Switches to the other camera (front or back on phones, the next one elsewhere) and sends it in place of the current one. */
export async function flipCamera() {
  const current = live;
  const old = useCall.getState().call?.local?.getVideoTracks()[0];
  if (!current?.pc || !old || flipping) return;
  flipping = true;
  try {
    const { facingMode, deviceId } = old.getSettings();
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    const next = cameras[(cameras.findIndex((d) => d.deviceId === deviceId) + 1) % cameras.length];
    const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
    const target = facingMode
      ? { facingMode: { exact: facingMode === "user" ? "environment" : "user" } }
      : { deviceId: { exact: next?.deviceId } };
    old.stop();
    const stream = await navigator.mediaDevices
      .getUserMedia({ video: { ...size, ...target } })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: { ...size, deviceId: { exact: deviceId } } }));
    const [track] = stream.getVideoTracks();
    const local = useCall.getState().call?.local;
    if (live !== current || !track || !local) return stream.getTracks().forEach((t) => t.stop());
    track.enabled = useCall.getState().call?.cameraOn ?? true;
    await current.pc?.getSenders().find((s) => s.track === old)?.replaceTrack(track);
    local.removeTrack(old);
    local.addTrack(track);
    patch({ local: new MediaStream(local.getTracks()) });
  } finally {
    flipping = false;
  }
}

async function onSignal(dto: CallSignalDTO, meId: string, chats: (chatId: string) => ChatDTO | undefined) {
  const client = e2ee();
  if (!client) return;
  const s = await client.openSignal(dto);
  if (!s) return;
  const current = useCall.getState().call;
  const call = current?.phase === "ended" ? null : current;
  const fromMe = dto.fromUserId === meId;

  if (s.type === "offer") {
    if (fromMe) return;
    if (call && call.id !== s.callId) {
      const chat = chats(s.chatId);
      if (!chat || !realtimeRef) return;
      const envelopes = await client.sealSignal(
        s.chatId,
        chat.members.map((m) => m.user.id),
        s.callId,
        {
          type: "busy",
        },
      );
      if (envelopes.length) {
        await realtimeRef.sendCallSignal({ chatId: s.chatId, callId: s.callId, envelopes }).catch(() => null);
      }
      return;
    }
    const chat = chats(s.chatId);
    if (call || !chat || !realtimeRef) return;
    live = {
      realtime: realtimeRef,
      memberIds: chat.members.map((m) => m.user.id),
      pc: null,
      offer: s.sdp,
      pendingIce: [],
      peerDeviceId: dto.fromDeviceId,
      timer: null,
      fx: null,
    };
    useCall.setState({
      call: {
        id: s.callId,
        chatId: s.chatId,
        peerId: dto.fromUserId,
        outgoing: false,
        video: s.video,
        phase: "incoming",
        connectedAt: null,
        local: null,
        remote: null,
        muted: false,
        cameraOn: s.video,
        peerVideo: s.video,
        ended: null,
        reactions: [],
        games: newGames(),
        game: "rps",
        gameOpen: false,
      },
    });
    void signal({ type: "ringing" }).catch(() => null);
    ringFor(s.callId, () => teardown(null));
    return;
  }

  if (!call || call.id !== s.callId || !live) return;
  if (fromMe) {
    if (call.phase === "incoming" && ["answer", "answered", "reject", "hangup"].includes(s.type)) teardown(null);
    return;
  }
  if (live.peerDeviceId && dto.fromDeviceId !== live.peerDeviceId && s.type !== "ringing") return;
  await handle(call, s, dto.fromDeviceId);
}

async function handle(call: Call, s: CallSignal, fromDeviceId: string) {
  switch (s.type) {
    case "ringing":
      if (call.phase === "calling") patch({ phase: "ringing" });
      break;
    case "answer":
      if (!call.outgoing || live!.peerDeviceId) break;
      live!.peerDeviceId = fromDeviceId;
      if (live!.timer) clearTimeout(live!.timer);
      patch({ phase: "connecting" });
      await live!.pc?.setRemoteDescription({ type: "answer", sdp: s.sdp });
      await flushIce();
      break;
    case "ice":
      live!.pendingIce.push(s.candidate as RTCIceCandidateInit);
      await flushIce();
      break;
    case "video":
      patch({ peerVideo: s.on });
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
      void signal({ type: "guessHint", round: s.round, n: s.n, hint: answer.hint }).catch(() => null);
      break;
    }
    case "guessHint": {
      const guess = guessOnHint(call.games.guess, s.round, s.n, s.hint);
      if (guess) setGames({ guess });
      break;
    }
    case "reject":
      teardown(getT().calls.declined);
      break;
    case "busy":
      teardown(getT().calls.busy);
      break;
    case "hangup":
      teardown(call.phase === "incoming" ? null : getT().calls.callEnded);
      break;
  }
}

/** Handles signals one at a time, in the order they arrive. */
export function receiveSignal(dto: CallSignalDTO, meId: string, chats: (chatId: string) => ChatDTO | undefined) {
  queue = queue.then(() => onSignal(dto, meId, chats)).catch((err) => console.error("call signal:", err));
}
