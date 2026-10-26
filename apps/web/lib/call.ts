import type { Realtime, SignalInput } from "@six/sdk";
import type { CallSignal, CallSignalDTO, ChatDTO } from "@six/shared";
import { create } from "zustand";
import { e2ee } from "./e2ee";
import { six } from "./six";

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
}

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
    if (pc.connectionState === "failed") void hangup("Connection lost");
  };
  live!.pc = pc;
  patch({ local, remote, cameraOn: video });
  return pc;
}

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
  const name = (err as Error).name;
  if (name === "NotAllowedError") return "Allow the microphone and camera to call";
  if (name === "NotFoundError") return "No microphone or camera found";
  if ((err as Error).message === "NO_DEVICES") return "They can't take calls yet";
  if ((err as { code?: string }).code === "OFFLINE") return "You're offline";
  return "Couldn't start the call";
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
    },
  });
  try {
    const pc = await connect(video);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await signal({ type: "offer", sdp: offer.sdp!, video });
    ringFor(id, () => void hangup("No answer"));
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
  } catch (err) {
    void signal({ type: "hangup" }).catch(() => null);
    teardown(mediaError(err));
  }
}

export function declineCall() {
  void signal({ type: "reject" }).catch(() => null);
  teardown(null);
}

export async function hangup(reason = "Call ended") {
  await signal({ type: "hangup" }).catch(() => null);
  teardown(reason);
}

export function toggleMute() {
  const call = useCall.getState().call;
  if (!call?.local) return;
  const muted = !call.muted;
  for (const t of call.local.getAudioTracks()) t.enabled = !muted;
  patch({ muted });
}

export function toggleCamera() {
  const call = useCall.getState().call;
  if (!call?.local || !call.video) return;
  const cameraOn = !call.cameraOn;
  for (const t of call.local.getVideoTracks()) t.enabled = cameraOn;
  patch({ cameraOn });
  void signal({ type: "video", on: cameraOn }).catch(() => null);
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
    case "reject":
      teardown("Declined");
      break;
    case "busy":
      teardown("Busy on another call");
      break;
    case "hangup":
      teardown(call.phase === "incoming" ? null : "Call ended");
      break;
  }
}

/** Handles signals one at a time, in the order they arrive. */
export function receiveSignal(dto: CallSignalDTO, meId: string, chats: (chatId: string) => ChatDTO | undefined) {
  queue = queue.then(() => onSignal(dto, meId, chats)).catch((err) => console.error("call signal:", err));
}
