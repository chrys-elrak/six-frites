"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Call, acceptCall, declineCall, hangup, toggleCamera, toggleMute, useCall } from "@/lib/call";
import { useChat } from "@/lib/chats";
import { formatDuration } from "@/lib/format";
import { Avatar } from "./avatar";
import { Portal } from "./portal";

function Media({ stream, muted, className }: { stream: MediaStream | null; muted?: boolean; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

/** Plays the other side's voice, with a button for browsers that block sound until a tap. */
function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    );
  }, [stream]);
  return (
    <>
      <audio ref={ref} autoPlay />
      {blocked && (
        <button
          onClick={() => void ref.current?.play().then(() => setBlocked(false))}
          className="relative z-20 mx-auto mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-900 shadow"
        >
          Tap to turn on sound
        </button>
      )}
    </>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{formatDuration(now - since)}</>;
}

/** A soft two-tone ring while a call is ringing, made with Web Audio so there's no file to load. */
function useRingtone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const ring = () => {
      for (const [i, freq] of [440, 480].entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.05 + i * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35 + i * 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.4);
        osc.stop(ctx.currentTime + 0.4 + i * 0.4);
      }
    };
    ring();
    const t = setInterval(ring, 2500);
    return () => {
      clearInterval(t);
      void ctx.close();
    };
  }, [on]);
}

const roundButton = "grid size-14 place-items-center rounded-full transition active:scale-95";

export function CallScreen() {
  const call = useCall((s) => s.call);
  return call ? <CallView call={call} /> : null;
}

function CallView({ call }: { call: Call }) {
  const qc = useQueryClient();
  const chat = useChat(qc, call.chatId);
  useRingtone(call.phase === "incoming");

  const peer = chat.data?.members.find((m) => m.user.id === call.peerId)?.user;
  const name = chat.data?.title ?? peer?.displayName ?? "Call";
  const showRemoteVideo = call.video && call.peerVideo && call.phase === "active";
  const status =
    call.phase === "ended"
      ? call.ended
      : call.phase === "incoming"
        ? `Incoming ${call.video ? "video" : "voice"} call`
        : call.phase === "calling"
          ? "Calling…"
          : call.phase === "ringing"
            ? "Ringing…"
            : call.phase === "connecting"
              ? "Connecting…"
              : null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col bg-stone-950 text-white"
        role="dialog"
        aria-modal
        aria-label={`Call with ${name}`}
      >
        <Media
          stream={call.remote}
          muted
          className={
            showRemoteVideo
              ? "absolute inset-0 size-full object-cover"
              : "pointer-events-none absolute size-0 opacity-0"
          }
        />
        {call.video && call.cameraOn && call.local && call.phase !== "incoming" && (
          <Media
            stream={call.local}
            muted
            className={
              call.phase === "active"
                ? "absolute right-4 bottom-32 z-10 aspect-[3/4] w-28 rounded-2xl object-cover shadow-lg ring-1 ring-white/20 md:w-40 [transform:scaleX(-1)]"
                : "absolute inset-0 size-full object-cover opacity-60 [transform:scaleX(-1)]"
            }
          />
        )}

        <div
          className={`relative z-10 flex flex-col items-center gap-3 px-6 pt-[max(4rem,env(safe-area-inset-top))] text-center ${
            showRemoteVideo ? "bg-gradient-to-b from-black/60 to-transparent pb-10" : ""
          }`}
        >
          {!showRemoteVideo && peer && <Avatar user={peer} size="lg" />}
          <h2 className="text-2xl font-semibold drop-shadow">{name}</h2>
          <p className="text-sm text-white/75 tabular-nums drop-shadow">
            {status ?? (call.connectedAt ? <Elapsed since={call.connectedAt} /> : null)}
          </p>
        </div>

        {call.phase !== "ended" && <RemoteAudio stream={call.remote} />}

        <div className="relative z-10 mt-auto flex items-center justify-center gap-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          {call.phase === "incoming" ? (
            <>
              <button onClick={declineCall} aria-label="Decline" className={`${roundButton} size-16 bg-red-600`}>
                <PhoneOff className="size-7" />
              </button>
              <button
                onClick={() => void acceptCall()}
                aria-label="Answer"
                className={`${roundButton} size-16 bg-green-600`}
              >
                {call.video ? <Video className="size-7" /> : <Phone className="size-7" />}
              </button>
            </>
          ) : call.phase === "ended" ? null : (
            <>
              <button
                onClick={toggleMute}
                aria-label={call.muted ? "Unmute" : "Mute"}
                aria-pressed={call.muted}
                className={`${roundButton} ${call.muted ? "bg-white text-stone-900" : "bg-white/15"}`}
              >
                {call.muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
              </button>
              {call.video && (
                <button
                  onClick={toggleCamera}
                  aria-label={call.cameraOn ? "Turn camera off" : "Turn camera on"}
                  aria-pressed={!call.cameraOn}
                  className={`${roundButton} ${call.cameraOn ? "bg-white/15" : "bg-white text-stone-900"}`}
                >
                  {call.cameraOn ? <Video className="size-6" /> : <VideoOff className="size-6" />}
                </button>
              )}
              <button onClick={() => void hangup()} aria-label="Hang up" className={`${roundButton} bg-red-600`}>
                <PhoneOff className="size-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
