"use client";

import { SixApiError, unwrap } from "@six/sdk";
import {
  ANON_PHOTO_BYTES,
  ANON_VOICE_BYTES,
  ANON_VOICE_MS,
  ASK_COLORS,
  ASK_MAX,
  type EntityType,
  type GifDTO,
  SendAnonInput,
  emojifyEnd,
  hasLink,
  emojifyTyped,
  signInMessage,
} from "@six/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, ImagePlus, Info, Mic, Pencil, SearchX, Square, VenetianMask, X } from "lucide-react";
import Link from "next/link";
import { use, useRef, useState } from "react";
import { VoicePlayer } from "@/components/attachment";
import { Avatar } from "@/components/avatar";
import { CameraDialog } from "@/components/camera-dialog";
import { EmojiSuggestions, useEmojiSuggestions } from "@/components/emoji-suggestions";
import { FormatBar, formatShortcut } from "@/components/format-bar";
import { GifSearch } from "@/components/gif-picker";
import { GoogleButton } from "@/components/google-button";
import { LanguageSelect } from "@/components/language-select";
import { LegalLinks } from "@/components/legal-page";
import { Logo } from "@/components/logo";
import { PhotoEditor } from "@/components/photo-editor";
import { PrimaryButton } from "@/components/ui";
import { VoiceEffectSelect } from "@/components/voice-effect-select";
import { unlock } from "@/lib/app-lock";
import { isTouch } from "@/lib/camera";
import { formatDuration } from "@/lib/format";
import { getLocale, useT } from "@/lib/i18n";
import { toPhotoDataUrl } from "@/lib/image";
import { MARKERS, parseMarkup } from "@/lib/markup";
import { mediaMeta } from "@/lib/media-meta";
import { type Recording, useRecorder } from "@/lib/recorder";
import { deviceId, deviceName, useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { type VoiceEffect, disguiseVoice } from "@/lib/voice-fx";

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export default function AskPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const tr = useT();
  const status = useSession((s) => s.status);
  const [text, setText] = useState("");
  const [hasSelection, setHasSelection] = useState(false);
  const [caret, setCaret] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const emoji = useEmojiSuggestions(text, caret, (value, at) => {
    setText(value);
    setCaret(at);
    requestAnimationFrame(() => box.current?.setSelectionRange(at, at));
  });
  const [photo, setPhoto] = useState<{ url: string; file: File } | null>(null);
  const [editing, setEditing] = useState(false);
  const [gif, setGif] = useState<GifDTO | null>(null);
  const [gifSearch, setGifSearch] = useState(false);
  const [voice, setVoice] = useState<{
    blob: Blob;
    url: string;
    data: string;
    durationMs: number;
    waveform: number[] | null;
  } | null>(null);
  const [voiceFx, setVoiceFx] = useState<VoiceEffect>("none");
  const recorder = useRecorder({
    maxMs: ANON_VOICE_MS,
    bitsPerSecond: 32_000,
    raw: true,
    onLimit: (rec) => void keepVoice(rec),
  });
  const [photoError, setPhotoError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["ask-profile", code, status === "authed"],
    queryFn: async () => unwrap(await six.api.GET("/v1/ask/{code}", { params: { path: { code } } })),
    enabled: status !== "loading",
    retry: false,
  });

  const body = { ...parseMarkup(emojifyEnd(text)), photo: photo?.url, gifId: gif?.id, voice: voice?.data };
  const valid = SendAnonInput.safeParse(body).success;
  const linked = hasLink(body.text);
  const sendError = (err: unknown) =>
    err instanceof SixApiError
      ? ({ RATE_LIMITED: tr.ask.slowDown, CONFLICT: tr.ask.duplicate, ANON_BLOCKED: tr.ask.blocked } as Record<string, string>)[
          err.code
        ]
      : undefined;

  const send = useMutation({
    mutationFn: async () => {
      const sent =
        voice && voiceFx !== "none" ? { ...body, voice: await dataUrl(await disguiseVoice(voice.blob, voiceFx)) } : body;
      return unwrap(await six.api.POST("/v1/ask/{code}", { params: { path: { code } }, body: sent }));
    },
    onSuccess: () => {
      setText("");
      setPhoto(null);
      setGif(null);
      setVoice(null);
    },
  });

  function type(value: string) {
    const swapped = emojifyTyped(text, value);
    if (!swapped) return setText(value);
    setText(swapped.text);
    requestAnimationFrame(() => box.current?.setSelectionRange(swapped.caret, swapped.caret));
  }

  function wrap(format: EntityType) {
    const el = box.current;
    if (!el || el.selectionEnd <= el.selectionStart) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const marker = MARKERS[format];
    setText(`${text.slice(0, start)}${marker}${text.slice(start, end)}${marker}${text.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + marker.length, end + marker.length);
      setHasSelection(true);
    });
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setPhotoError(null);
    try {
      setPhoto({ url: await toPhotoDataUrl(f, ANON_PHOTO_BYTES), file: f });
      setGif(null);
      setVoice(null);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : tr.common.couldNotReadImage);
    }
  }

  async function keepVoice(rec: Recording | null) {
    if (!rec || rec.durationMs < 500) return;
    if (rec.blob.size > ANON_VOICE_BYTES) return setPhotoError(tr.ask.voiceTooBig);
    const { waveform } = await mediaMeta(rec.blob, "voice");
    const durationMs = Math.min(rec.durationMs, ANON_VOICE_MS);
    setVoice({
      blob: rec.blob,
      url: URL.createObjectURL(rec.blob),
      data: await dataUrl(rec.blob),
      durationMs,
      waveform: waveform ?? null,
    });
    setPhoto(null);
    setGif(null);
  }

  async function onCredential(idToken: string) {
    setSignInError(null);
    try {
      unlock();
      await six.auth.loginWithGoogle(idToken, { guest: true, deviceName: deviceName(), deviceId: deviceId() });
    } catch (err) {
      setSignInError(
        err instanceof SixApiError
          ? (signInMessage(getLocale(), err.code, err.details) ?? err.message)
          : tr.common.somethingWrong,
      );
    }
  }

  if (profile.isError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
        <SearchX className="size-12 text-stone-400" />
        <p className="text-stone-600 dark:text-stone-300">{tr.ask.linkGone}</p>
        <Link href="/inbox" target="_blank" rel="noopener" className="font-medium text-brand hover:underline">
          {tr.ask.getYours}
        </Link>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-14 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-2">
        <LanguageSelect />
      </div>
      <div className="flex flex-col items-center gap-3 text-center">
        {profile.data ? (
          <div className="relative">
            <Avatar user={profile.data} size="lg" />
            <button
              type="button"
              popoverTarget="ask-note"
              aria-label={tr.ask.aboutLink}
              title={tr.ask.aboutLink}
              className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-white text-stone-500 shadow-sm ring-1 ring-black/5 hover:text-stone-800 dark:bg-stone-800 dark:text-stone-300 dark:ring-white/10 dark:hover:text-white"
            >
              <Info className="size-4" />
            </button>
            <p
              id="ask-note"
              popover="auto"
              className="m-auto max-w-xs rounded-2xl bg-white p-4 text-center text-sm text-stone-600 shadow-xl ring-1 ring-black/5 backdrop:bg-black/30 dark:bg-stone-900 dark:text-stone-300 dark:ring-white/10"
            >
              {tr.ask.linkInfo}
            </p>
          </div>
        ) : (
          <Logo className="size-20" />
        )}
        <h1 className="text-xl font-semibold tracking-tight">{profile.data && tr.ask.sendTo(profile.data.displayName)}</h1>
      </div>

      {send.isSuccess ? (
        <div className="space-y-3 text-center">
          <p className="rounded-2xl bg-green-50 p-4 font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
            {tr.ask.sent}
          </p>
          <PrimaryButton type="button" onClick={() => send.reset()} className="w-full">
            {tr.ask.sendAnother}
          </PrimaryButton>
        </div>
      ) : status === "authed" && profile.data?.blocked ? (
        <p className="rounded-2xl bg-stone-100 p-4 text-center font-medium text-stone-600 dark:bg-stone-900 dark:text-stone-300">
          {tr.ask.blocked}
        </p>
      ) : status === "authed" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) send.mutate();
          }}
          className="space-y-3"
        >
          <div className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-black/5 dark:bg-stone-900 dark:ring-white/10">
            <p
              className="@container flex items-center justify-center gap-2 px-3 py-3.5 font-semibold text-white"
              style={{ backgroundImage: `linear-gradient(135deg, ${ASK_COLORS[0][0]}, ${ASK_COLORS[0][1]})` }}
            >
              <Logo className="size-6 shrink-0" />
              <span className="min-w-0 truncate text-[length:min(1rem,4.5cqw)]">{profile.data?.prompt ?? tr.ask.prompt}</span>
            </p>
            {photo && (
              <div className="relative">
                <img src={photo.url} alt="" className="max-h-72 w-full bg-stone-100 object-contain dark:bg-stone-950" />
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  title={tr.composer.editPhoto}
                  className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium text-white"
                >
                  <Pencil className="size-4" />
                  {tr.composer.edit}
                </button>
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  aria-label={tr.settings.removePhoto}
                  className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            {gif && (
              <div className="relative">
                <img src={gif.previewUrl} alt={gif.title} className="max-h-72 w-full bg-stone-100 object-contain dark:bg-stone-950" />
                <button
                  type="button"
                  onClick={() => setGif(null)}
                  aria-label={tr.common.remove}
                  className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            {voice && (
              <div className="flex items-center gap-2 px-3 pt-3">
                <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-2xl bg-stone-100 px-3 dark:bg-stone-800">
                  <VoicePlayer
                    key={voice.url}
                    url={voice.url}
                    durationMs={voice.durationMs}
                    waveform={voice.waveform}
                    mine={false}
                    label={tr.composer.playPreview}
                    compact
                    effects={false}
                    effect={voiceFx}
                  />
                  <VoiceEffectSelect
                    value={voiceFx}
                    onChange={setVoiceFx}
                    className={`ml-2 flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                      voiceFx === "none"
                        ? "text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                        : "bg-brand/15 text-brand"
                    }`}
                  >
                    <VenetianMask className="size-4" />
                    {voiceFx !== "none" && tr.composer.voiceEffects[voiceFx]}
                  </VoiceEffectSelect>
                </div>
                <button
                  type="button"
                  onClick={() => setVoice(null)}
                  aria-label={tr.common.remove}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <textarea
              ref={box}
              value={text}
              onChange={(e) => {
                setCaret(e.target.selectionEnd);
                type(e.target.value);
              }}
              onSelect={(e) => {
                setHasSelection(e.currentTarget.selectionEnd > e.currentTarget.selectionStart);
                setCaret(e.currentTarget.selectionEnd);
              }}
              onBlur={() => {
                setHasSelection(false);
                emoji.close();
              }}
              onKeyDown={(e) => {
                if (emoji.onKey(e)) return;
                const format = formatShortcut(e);
                if (!format) return;
                e.preventDefault();
                wrap(format);
              }}
              rows={photo || gif || voice ? 2 : 5}
              autoFocus
              placeholder={tr.ask.placeholder}
              aria-label={tr.ask.placeholder}
              className="block w-full resize-none bg-transparent px-4 pt-3 text-[17px] font-medium text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100"
            />
            {gifSearch && (
              <GifSearch
                onPick={(g) => {
                  setGif(g);
                  setPhoto(null);
                  setVoice(null);
                  setGifSearch(false);
                }}
              />
            )}
            <div className="flex items-center gap-2 px-2 pb-2">
              {recorder.recording ? (
                <>
                  <span className="ml-2 size-2.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
                  <span className="font-mono text-sm tabular-nums">
                    {formatDuration(recorder.elapsed)} / {formatDuration(ANON_VOICE_MS)}
                  </span>
                  <span className="min-w-0 truncate text-sm text-stone-500">{tr.composer.recording}</span>
                  <button
                    type="button"
                    onClick={() => recorder.cancel()}
                    aria-label={tr.common.cancel}
                    title={tr.common.cancel}
                    className="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <X className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void recorder.stop().then(keepVoice)}
                    aria-label={tr.composer.stopRecording}
                    title={tr.composer.stopRecording}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    <Square className="size-4 fill-current" />
                  </button>
                </>
              ) : emoji.items.length ? (
                <EmojiSuggestions {...emoji} className="min-w-0" />
              ) : hasSelection ? (
                <FormatBar onFormat={wrap} />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => file.current?.click()}
                    aria-label={tr.ask.addPhoto}
                    title={tr.ask.addPhoto}
                    className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <ImagePlus className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => (isTouch() ? cameraInput.current?.click() : setCamera(true))}
                    aria-label={tr.composer.takePhoto}
                    title={tr.composer.takePhoto}
                    className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Camera className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setGifSearch((on) => !on)}
                    aria-label={tr.ask.addGif}
                    aria-pressed={gifSearch}
                    title={tr.ask.addGif}
                    className={`grid size-8 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 ${
                      gifSearch ? "text-brand" : "text-stone-500"
                    }`}
                  >
                    <span className="rounded-[5px] border-2 border-current px-0.5 text-[10px] leading-3 font-bold">GIF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoError(null);
                      void recorder.start();
                    }}
                    aria-label={tr.composer.recordVoice}
                    title={tr.composer.recordVoice}
                    className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Mic className="size-5" />
                  </button>
                </>
              )}
              <input
                ref={file}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {!recorder.recording && (
                <span className={`ml-auto pr-2 text-xs ${body.text.length > ASK_MAX ? "text-red-600" : "text-stone-400"}`}>
                  {body.text.length}/{ASK_MAX}
                </span>
              )}
            </div>
          </div>
          {(photoError || recorder.error || linked || send.isError) && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {photoError ??
                recorder.error ??
                (linked ? tr.ask.noLinks : (sendError(send.error) ?? tr.common.somethingWrongRetry))}
            </p>
          )}
          <PrimaryButton type="submit" disabled={!valid || send.isPending || recorder.recording} className="w-full">
            {send.isPending ? tr.ask.sending : tr.common.send}
          </PrimaryButton>
        </form>
      ) : status === "anon" ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-stone-500 dark:text-stone-400">{tr.ask.signInToSend}</p>
          <GoogleButton onCredential={onCredential} />
          {signInError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {signInError}
            </p>
          )}
        </div>
      ) : (
        <p className="text-center text-sm text-stone-500">{tr.common.loading}</p>
      )}

      <Link href="/inbox" target="_blank" rel="noopener" className="text-center text-sm font-medium text-brand hover:underline">
        {tr.ask.getYours}
      </Link>
      <LegalLinks />
      {editing && photo && (
        <PhotoEditor
          file={photo.file}
          onCancel={() => setEditing(false)}
          onDone={(f) => {
            setEditing(false);
            void pick(f);
          }}
        />
      )}
      {camera && (
        <CameraDialog
          onClose={() => setCamera(false)}
          onCapture={(f) => {
            setCamera(false);
            void pick(f);
          }}
        />
      )}
    </main>
  );
}
