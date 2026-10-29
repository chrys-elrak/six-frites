"use client";

import {
  CALL_GAMES,
  CALL_REACTIONS,
  type CallGame,
  type DicePick,
  type Duel,
  GAME_EMOJI,
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
import { useQueryClient } from "@tanstack/react-query";
import {
  EyeOff,
  Gamepad2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  PictureInPicture2,
  SmilePlus,
  SwitchCamera,
  VenetianMask,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { type CSSProperties, Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import {
  type Call,
  acceptCall,
  declineCall,
  flipCamera,
  hangup,
  openGame,
  pickSecret,
  playAgain,
  playHand,
  rollDice,
  sendGuess,
  sendReaction,
  toggleCamera,
  toggleMute,
  useCall,
} from "@/lib/call";
import { useChat } from "@/lib/chats";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useVoiceEffect } from "@/lib/voice-fx";
import { Avatar } from "./avatar";
import { Portal } from "./portal";
import { VoiceEffectSelect } from "./voice-effect-select";

type Person = Pick<PublicUser, "displayName" | "avatarUrl">;

function Backdrop({ user }: { user?: Person }) {
  const alias = user && !user.avatarUrl ? aliasAvatar(user.displayName) : null;
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-stone-950">
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full scale-125 object-cover opacity-80 blur-3xl"
        />
      ) : (
        <div
          className="size-full opacity-60"
          style={{ backgroundImage: alias?.gradient ?? "linear-gradient(135deg, var(--color-brand), #1c1917 70%)" }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/80" />
    </div>
  );
}

function Media({ stream, muted, className }: { stream: MediaStream | null; muted?: boolean; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

/** Plays the other side's voice, with a button for browsers that block sound until a tap. */
function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const tr = useT();
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
          className="fixed inset-x-0 bottom-36 z-[71] mx-auto w-fit rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-900 shadow"
        >
          {tr.calls.tapForSound}
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

function FloatingReactions({ reactions }: { reactions: Call["reactions"] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[72] overflow-hidden">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="call-reaction absolute bottom-28 text-5xl drop-shadow-lg"
          style={
            {
              left: `${(r.mine ? 58 : 12) + ((r.id * 37) % 26)}%`,
              "--drift": `${r.id % 2 ? 28 : -28}px`,
            } as CSSProperties
          }
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

/** Holds the picks back for a beat so the fists can shake or the die can tumble. */
function useReveal() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 900);
    return () => clearTimeout(t);
  }, []);
  return revealed;
}

function PlayAgain({ game }: { game: CallGame }) {
  const tr = useT();
  return (
    <button
      onClick={() => playAgain(game)}
      className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-semibold text-stone-900 transition active:scale-95"
    >
      {tr.calls.playAgain}
    </button>
  );
}

function Verdict({ outcome, game }: { outcome: number; game: CallGame }) {
  const tr = useT();
  return (
    <>
      <p
        className={`reaction-pop mt-4 text-xl font-bold ${
          outcome === 1 ? "text-green-400" : outcome === -1 ? "text-red-400" : ""
        }`}
      >
        {outcome === 1 ? tr.calls.youWin : outcome === -1 ? tr.calls.youLose : tr.calls.draw}
      </p>
      <PlayAgain game={game} />
    </>
  );
}

function RpsShowdown({ mine, theirs, peerName }: { mine: RpsHand; theirs: RpsHand; peerName: string }) {
  const tr = useT();
  const revealed = useReveal();
  return (
    <>
      <div className="mt-5 flex justify-center gap-12">
        {[
          { who: tr.common.you, hand: mine },
          { who: peerName, hand: theirs },
        ].map(({ who, hand }) => (
          <span key={who} className="flex min-w-0 flex-col items-center gap-2">
            <span className={`text-6xl ${revealed ? "reaction-pop" : "rps-shake"}`}>
              {revealed ? RPS_EMOJI[hand] : RPS_EMOJI.rock}
            </span>
            <span className="max-w-24 truncate text-xs text-white/70">{who}</span>
          </span>
        ))}
      </div>
      {revealed && <Verdict outcome={rpsOutcome(mine, theirs)} game="rps" />}
    </>
  );
}

const dieFace = "grid place-items-center rounded-2xl bg-white font-bold text-stone-900 shadow-lg tabular-nums";

function DiceShowdown({ mine, theirs, peerName }: { mine: DicePick; theirs: DicePick; peerName: string }) {
  const tr = useT();
  const revealed = useReveal();
  const [face, setFace] = useState(1);
  useEffect(() => {
    if (revealed) return;
    const t = setInterval(() => setFace((f) => (f % 6) + 1), 90);
    return () => clearInterval(t);
  }, [revealed]);
  const roll = diceRoll(mine, theirs);
  return (
    <>
      <div className={`${dieFace} mx-auto mt-5 size-20 text-4xl ${revealed ? "reaction-pop" : "rps-shake"}`}>
        {revealed ? roll : face}
      </div>
      {revealed && (
        <>
          <p className="mt-3 text-sm text-white/75">{tr.calls.rolled(roll)}</p>
          <p className="mt-1 truncate text-sm tabular-nums">
            {tr.common.you} {mine.pick} · {theirs.pick} {peerName}
          </p>
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
      <p className="mt-1 truncate text-sm text-white/60 tabular-nums">
        {tr.common.you} {duel.wins} · {duel.losses} {peerName}
      </p>
      {duel.mine && duel.theirs ? (
        <Fragment key={duel.round}>{showdown(duel.mine, duel.theirs)}</Fragment>
      ) : duel.mine ? (
        <>
          <div className="reaction-pop mt-5">{mine(duel.mine)}</div>
          <p className="mt-4 animate-pulse text-sm text-white/75">{tr.calls.waitingFor(peerName)}</p>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm text-white/75">{duel.theirs ? tr.calls.theyPicked(peerName) : prompt}</p>
          <div className="mt-4">{picker}</div>
        </>
      )}
    </>
  );
}

function NumberGrid({ onPick, allowed }: { onPick: (n: number) => void; allowed: (n: number) => boolean }) {
  return (
    <div className="mt-4 grid grid-cols-10 gap-1">
      {Array.from({ length: GUESS_MAX }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          onClick={() => onPick(n)}
          disabled={!allowed(n)}
          className="aspect-square rounded-md bg-white/10 text-xs font-semibold tabular-nums transition hover:bg-white/25 active:scale-90 disabled:bg-transparent disabled:text-white/20"
        >
          {n}
        </button>
      ))}
    </div>
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
    if (!chooser) return <p className="mt-6 animate-pulse text-sm text-white/75">{tr.calls.theyArePicking(peerName)}</p>;
    return (
      <>
        <p className="mt-4 text-sm text-white/75">{tr.calls.pickSecret}</p>
        <NumberGrid onPick={pickSecret} allowed={() => true} />
        <button
          onClick={() => pickSecret(1 + Math.floor(Math.random() * GUESS_MAX))}
          className="mt-3 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium hover:bg-white/25"
        >
          {tr.calls.random}
        </button>
      </>
    );
  }

  return (
    <>
      <p className="mt-4 text-sm text-white/75">
        {chooser && game.secret !== null ? tr.calls.yourNumber(game.secret) : tr.calls.guessPrompt(peerName)}
      </p>
      {game.tries.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {game.tries.map((t, i) => (
            <span
              key={i}
              className={`reaction-pop rounded-full px-2.5 py-1 text-sm tabular-nums ${
                t.hint === "right" ? "bg-green-500 text-white" : "bg-white/10"
              }`}
            >
              {t.n} {t.hint === "higher" ? "↑" : t.hint === "lower" ? "↓" : t.hint === "right" ? "✓" : "…"}
            </span>
          ))}
        </div>
      )}
      {solved ? (
        <>
          <p className="reaction-pop mt-4 text-xl font-bold text-green-400">{tr.calls.hints.right}</p>
          <p className="text-sm text-white/75">{tr.calls.foundIn(game.tries.length)}</p>
          <PlayAgain game="guess" />
        </>
      ) : chooser ? (
        <p className="mt-4 animate-pulse text-sm text-white/75">{tr.calls.theyAreGuessing(peerName)}</p>
      ) : (
        <>
          {last && last !== "right" && <p className="reaction-pop mt-3 font-semibold">{tr.calls.hints[last]}</p>}
          <NumberGrid onPick={sendGuess} allowed={(n) => !pending && n >= lo && n <= hi && !tried.has(n)} />
        </>
      )}
    </>
  );
}

function GamesPanel({ call, peerName }: { call: Call; peerName: string }) {
  const tr = useT();
  const { games, game } = call;
  return (
    <div
      role="dialog"
      aria-label={tr.calls.games}
      className="absolute inset-x-4 top-1/2 z-30 mx-auto max-h-[calc(100dvh-2rem)] max-w-sm -translate-y-1/2 overflow-y-auto rounded-3xl bg-stone-900/90 p-5 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label={tr.calls.games} className="flex flex-1 gap-1">
          {CALL_GAMES.map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={g === game}
              aria-label={tr.calls[g]}
              title={tr.calls[g]}
              onClick={() => openGame(true, g)}
              className={`grid size-10 place-items-center rounded-full text-xl transition ${
                g === game ? "bg-white/25 ring-1 ring-white/40" : "hover:bg-white/10"
              }`}
            >
              {GAME_EMOJI[g]}
            </button>
          ))}
        </div>
        <button
          onClick={() => openGame(false)}
          aria-label={tr.common.close}
          title={tr.common.close}
          className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10"
        >
          <X className="size-4" />
        </button>
      </div>
      <h3 className="mt-3 font-semibold">{tr.calls[game]}</h3>
      {game === "rps" ? (
        <DuelBody
          duel={games.rps}
          peerName={peerName}
          prompt={tr.calls.pickHand}
          mine={(h) => <span className="text-6xl">{RPS_EMOJI[h]}</span>}
          picker={
            <div className="grid grid-cols-3 gap-3">
              {RPS_HANDS.map((h) => (
                <button
                  key={h}
                  onClick={() => playHand(h)}
                  className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 py-3 transition hover:bg-white/20 active:scale-95"
                >
                  <span className="text-4xl">{RPS_EMOJI[h]}</span>
                  <span className="text-xs text-white/75">{tr.calls.hands[h]}</span>
                </button>
              ))}
            </div>
          }
          showdown={(a, b) => <RpsShowdown mine={a} theirs={b} peerName={peerName} />}
        />
      ) : game === "dice" ? (
        <DuelBody
          duel={games.dice}
          peerName={peerName}
          prompt={tr.calls.pickDice}
          mine={(p) => <span className={`${dieFace} mx-auto size-16 text-3xl`}>{p.pick}</span>}
          picker={
            <div className="grid grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => rollDice(n)}
                  className="grid aspect-square place-items-center rounded-xl bg-white/10 text-lg font-bold tabular-nums transition hover:bg-white/20 active:scale-95"
                >
                  {n}
                </button>
              ))}
            </div>
          }
          showdown={(a, b) => <DiceShowdown mine={a} theirs={b} peerName={peerName} />}
        />
      ) : (
        <GuessBody key={games.guess.round} game={games.guess} outgoing={call.outgoing} peerName={peerName} />
      )}
    </div>
  );
}

const roundButton = "grid size-14 place-items-center rounded-full transition active:scale-95";
const smallButton = "grid size-9 shrink-0 place-items-center rounded-full";

export function CallScreen() {
  const call = useCall((s) => s.call);
  return call ? <CallView call={call} /> : null;
}

function CallView({ call }: { call: Call }) {
  const tr = useT();
  const qc = useQueryClient();
  const chat = useChat(qc, call.chatId);
  const me = useSession((s) => s.user);
  const effect = useVoiceEffect((s) => s.effect);
  const [small, setSmall] = useState<"video" | "pill" | null>(null);
  const [tray, setTray] = useState(false);
  useEffect(() => {
    if (call.gameOpen) setSmall(null);
  }, [call.gameOpen]);
  useRingtone(call.phase === "incoming");
  const [cameras, setCameras] = useState(0);
  useEffect(() => {
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setCameras(d.filter((x) => x.kind === "videoinput").length));
  }, [call.local]);
  const mirror = call.local?.getVideoTracks()[0]?.getSettings().facingMode === "environment" ? "" : "[transform:scaleX(-1)]";

  const peer = chat.data?.members.find((m) => m.user.id === call.peerId)?.user;
  const name = chat.data?.title ?? peer?.displayName ?? tr.calls.call;
  const showRemoteVideo = call.video && call.peerVideo && call.phase === "active";
  const ringing = call.phase === "incoming" || call.phase === "calling" || call.phase === "ringing";
  const status =
    call.phase === "ended"
      ? call.ended
      : call.phase === "incoming"
        ? tr.calls.incoming(call.video)
        : call.phase === "calling"
          ? tr.calls.calling
          : call.phase === "ringing"
            ? tr.calls.ringing
            : call.phase === "connecting"
              ? tr.common.connecting
              : null;
  const statusLine = status ?? (call.connectedAt ? <Elapsed since={call.connectedAt} /> : null);
  const floating = call.phase === "incoming" ? null : small;

  const muteButton = (size: string) => (
    <button
      onClick={toggleMute}
      aria-label={call.muted ? tr.calls.unmute : tr.calls.mute}
      title={call.muted ? tr.calls.unmute : tr.calls.mute}
      aria-pressed={call.muted}
      className={`${size} ${call.muted ? "bg-white text-stone-900" : "bg-white/15 hover:bg-white/25"}`}
    >
      {call.muted ? <MicOff className="size-[45%]" /> : <Mic className="size-[45%]" />}
    </button>
  );
  const cameraButton = (size: string) => (
    <button
      onClick={toggleCamera}
      aria-label={call.cameraOn ? tr.calls.cameraOff : tr.calls.cameraOn}
      title={call.cameraOn ? tr.calls.cameraOff : tr.calls.cameraOn}
      aria-pressed={!call.cameraOn}
      className={`${size} ${call.cameraOn ? "bg-white/15 hover:bg-white/25" : "bg-white text-stone-900"}`}
    >
      {call.cameraOn ? <Video className="size-[45%]" /> : <VideoOff className="size-[45%]" />}
    </button>
  );
  const hangupButton = (size: string) => (
    <button onClick={() => void hangup()} aria-label={tr.calls.hangUp} title={tr.calls.hangUp} className={`${size} bg-red-600`}>
      <PhoneOff className="size-[45%]" />
    </button>
  );

  return (
    <Portal>
      {floating === "video" ? (
        <div className="fixed right-4 bottom-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] z-[70] w-36 overflow-hidden rounded-2xl bg-stone-900 text-white shadow-2xl ring-1 ring-white/15 md:w-52">
          <button
            onClick={() => setSmall(null)}
            aria-label={tr.calls.backToCall}
            title={tr.calls.backToCall}
            className="relative grid aspect-[3/4] w-full place-items-center overflow-hidden"
          >
            {showRemoteVideo ? (
              <Media stream={call.remote} muted className="absolute inset-0 size-full object-cover" />
            ) : (
              <>
                <Backdrop user={peer} />
                {peer && (
                  <span className="relative">
                    <Avatar user={peer} size="md" />
                  </span>
                )}
              </>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pt-8 pb-2 text-left">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block text-xs text-white/75 tabular-nums">{statusLine}</span>
            </span>
          </button>
          {call.phase !== "ended" && (
            <div className="flex justify-center gap-2 p-2">
              {muteButton(smallButton)}
              <button
                onClick={() => setSmall("pill")}
                aria-label={tr.calls.hideVideo}
                title={tr.calls.hideVideo}
                className={`${smallButton} bg-white/15 hover:bg-white/25`}
              >
                <EyeOff className="size-4" />
              </button>
              {hangupButton(smallButton)}
            </div>
          )}
        </div>
      ) : floating === "pill" ? (
        <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 z-[70] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-stone-900 p-1.5 text-white shadow-xl ring-1 ring-white/10">
          <button
            onClick={() => setSmall(null)}
            aria-label={tr.calls.backToCall}
            title={tr.calls.backToCall}
            className="flex min-w-0 items-center gap-2 pr-1 text-left"
          >
            {peer && <Avatar user={peer} />}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block text-xs text-white/70 tabular-nums">{statusLine}</span>
            </span>
          </button>
          {call.phase !== "ended" && (
            <>
              {call.video && (
                <button
                  onClick={() => setSmall("video")}
                  aria-label={tr.calls.showVideo}
                  title={tr.calls.showVideo}
                  className={`${smallButton} bg-white/15 hover:bg-white/25`}
                >
                  <PictureInPicture2 className="size-4" />
                </button>
              )}
              {muteButton(smallButton)}
              {hangupButton(smallButton)}
            </>
          )}
        </div>
      ) : (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-stone-950 text-white"
          role="dialog"
          aria-modal
          aria-label={tr.calls.callWith(name)}
        >
          {!showRemoteVideo && <Backdrop user={peer} />}
          {call.phase !== "incoming" && call.phase !== "ended" && (
            <button
              onClick={() => setSmall(call.video ? "video" : "pill")}
              aria-label={tr.calls.minimize}
              title={tr.calls.minimize}
              className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 z-20 grid size-10 place-items-center rounded-full bg-white/15 hover:bg-white/25"
            >
              <Minimize2 className="size-5" />
            </button>
          )}
          {call.phase === "active" && (
            <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-20 flex flex-col items-center gap-2">
              <button
                onClick={() => openGame(!call.gameOpen)}
                aria-label={tr.calls.games}
                title={tr.calls.games}
                aria-pressed={call.gameOpen}
                className={`grid size-10 place-items-center rounded-full ${
                  call.gameOpen ? "bg-white text-stone-900" : "bg-white/15 hover:bg-white/25"
                }`}
              >
                <Gamepad2 className="size-5" />
              </button>
              <button
                onClick={() => setTray((t) => !t)}
                aria-label={tr.calls.react}
                title={tr.calls.react}
                aria-expanded={tray}
                className={`grid size-10 place-items-center rounded-full ${
                  tray ? "bg-white text-stone-900" : "bg-white/15 hover:bg-white/25"
                }`}
              >
                <SmilePlus className="size-5" />
              </button>
            </div>
          )}
          {call.gameOpen && call.phase === "active" && <GamesPanel call={call} peerName={peer?.displayName ?? name} />}
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
                  ? `absolute right-4 bottom-32 z-10 aspect-[3/4] w-28 rounded-2xl object-cover shadow-lg ring-1 ring-white/20 md:w-40 ${mirror}`
                  : `absolute inset-0 size-full object-cover opacity-60 ${mirror}`
              }
            />
          )}
          {call.video && !call.cameraOn && call.phase === "active" && me && (
            <div
              title={tr.calls.cameraIsOff}
              className="absolute right-4 bottom-32 z-10 grid aspect-[3/4] w-28 place-items-center overflow-hidden rounded-2xl shadow-lg ring-1 ring-white/20 md:w-40"
            >
              <Backdrop user={me} />
              <span className="relative">
                <Avatar user={me} size="md" />
              </span>
              <VideoOff className="absolute right-2 bottom-2 size-4 text-white/80" />
            </div>
          )}

          <div
            className={`relative z-10 flex flex-col items-center gap-3 px-6 pt-[max(4rem,env(safe-area-inset-top))] text-center ${
              showRemoteVideo ? "bg-gradient-to-b from-black/60 to-transparent pb-10" : ""
            }`}
          >
            {!showRemoteVideo && peer && (
              <span className="relative mb-2">
                {ringing && <span className="absolute inset-0 animate-ping rounded-full bg-white/25" />}
                <span className="relative block rounded-full shadow-2xl ring-4 ring-white/10">
                  <Avatar user={peer} size="xl" />
                </span>
              </span>
            )}
            <h2 className="text-2xl font-semibold drop-shadow">{name}</h2>
            <p className="text-sm text-white/75 tabular-nums drop-shadow">{statusLine}</p>
            {call.video && call.phase === "active" && !call.peerVideo && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
                <VideoOff className="size-3.5" />
                {tr.calls.cameraIsOff}
              </span>
            )}
          </div>

          <div className="relative z-10 mt-auto flex flex-col items-center gap-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            {tray && call.phase === "active" && (
              <div className="reaction-pop flex max-w-[calc(100vw-2rem)] gap-0.5 overflow-x-auto rounded-full bg-black/40 p-1 backdrop-blur">
                {CALL_REACTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => sendReaction(e)}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-2xl transition hover:scale-125 active:scale-90"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {call.phase === "incoming" && call.video && (
              <div className="flex gap-4">
                {muteButton("grid size-12 place-items-center rounded-full transition active:scale-95")}
                {cameraButton("grid size-12 place-items-center rounded-full transition active:scale-95")}
              </div>
            )}
            <div className="flex items-center justify-center gap-6">
              {call.phase === "incoming" ? (
                <>
                  <button onClick={declineCall} aria-label={tr.calls.decline} className={`${roundButton} size-16 bg-red-600`}>
                    <PhoneOff className="size-7" />
                  </button>
                  <button
                    onClick={() => void acceptCall()}
                    aria-label={tr.calls.accept}
                    className={`${roundButton} size-16 bg-green-600`}
                  >
                    {call.video && call.cameraOn ? <Video className="size-7" /> : <Phone className="size-7" />}
                  </button>
                </>
              ) : call.phase === "ended" ? null : (
                <>
                  {muteButton(roundButton)}
                  <VoiceEffectSelect
                    className={`${roundButton} ${effect === "none" ? "bg-white/15 hover:bg-white/25" : "bg-white text-stone-900"}`}
                  >
                    <VenetianMask className="size-6" />
                    {effect !== "none" && (
                      <span className="absolute -bottom-6 text-xs font-medium whitespace-nowrap text-white">
                        {tr.composer.voiceEffects[effect]}
                      </span>
                    )}
                  </VoiceEffectSelect>
                  {call.video && cameraButton(roundButton)}
                  {call.video && cameras > 1 && (
                    <button
                      onClick={() => void flipCamera()}
                      aria-label={tr.calls.flip}
                      title={tr.calls.flip}
                      className={`${roundButton} bg-white/15 hover:bg-white/25`}
                    >
                      <SwitchCamera className="size-6" />
                    </button>
                  )}
                  {hangupButton(roundButton)}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {call.reactions.length > 0 && <FloatingReactions reactions={call.reactions} />}
      {call.phase !== "ended" && <RemoteAudio stream={call.remote} />}
    </Portal>
  );
}
