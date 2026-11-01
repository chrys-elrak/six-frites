"use client";

import { SixApiError, unwrap } from "@six/sdk";
import {
  ANON_PHOTO_BYTES,
  ASK_COLORS,
  ASK_MAX,
  type EntityType,
  SendAnonInput,
  emojifyEnd,
  emojifyTyped,
} from "@six/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, ImagePlus, SearchX, X } from "lucide-react";
import Link from "next/link";
import { use, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { CameraDialog } from "@/components/camera-dialog";
import { EmojiSuggestions, useEmojiSuggestions } from "@/components/emoji-suggestions";
import { FormatBar, formatShortcut } from "@/components/format-bar";
import { GoogleButton } from "@/components/google-button";
import { LanguageSelect } from "@/components/language-select";
import { LegalLinks } from "@/components/legal-page";
import { Logo } from "@/components/logo";
import { PrimaryButton } from "@/components/ui";
import { unlock } from "@/lib/app-lock";
import { isTouch } from "@/lib/camera";
import { useT } from "@/lib/i18n";
import { toPhotoDataUrl } from "@/lib/image";
import { MARKERS, parseMarkup } from "@/lib/markup";
import { deviceName, useSession } from "@/lib/session";
import { six } from "@/lib/six";

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
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["ask-profile", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/ask/{code}", { params: { path: { code } } })),
    retry: false,
  });

  const body = { ...parseMarkup(emojifyEnd(text)), photo: photo ?? undefined };
  const valid = SendAnonInput.safeParse(body).success;
  const sendError: Record<string, string | undefined> = {
    RATE_LIMITED: tr.ask.slowDown,
    CONFLICT: tr.ask.duplicate,
  };

  const send = useMutation({
    mutationFn: async () =>
      unwrap(await six.api.POST("/v1/ask/{code}", { params: { path: { code } }, body })),
    onSuccess: () => {
      setText("");
      setPhoto(null);
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
      setPhoto(await toPhotoDataUrl(f, ANON_PHOTO_BYTES));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : tr.common.couldNotReadImage);
    }
  }

  async function onCredential(idToken: string) {
    setSignInError(null);
    try {
      unlock();
      await six.auth.loginWithGoogle(idToken, { guest: true, deviceName: deviceName() });
    } catch (err) {
      setSignInError(
        err instanceof SixApiError
          ? ((tr.auth.errors as Record<string, string | undefined>)[err.code] ?? err.message)
          : tr.common.somethingWrong,
      );
    }
  }

  if (profile.isError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
        <SearchX className="size-12 text-stone-400" />
        <p className="text-stone-600 dark:text-stone-300">{tr.ask.linkGone}</p>
        <Link href="/inbox" className="font-medium text-brand hover:underline">
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
        {profile.data ? <Avatar user={profile.data} size="lg" /> : <Logo className="size-20" />}
        <h1 className="text-xl font-semibold tracking-tight">{profile.data && tr.ask.sendTo(profile.data.displayName)}</h1>
        {profile.data && (
          <p className="text-sm text-stone-500 dark:text-stone-400">{tr.ask.notOnSixFrites(profile.data.displayName)}</p>
        )}
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
              <span className="min-w-0 truncate text-[length:min(1rem,4.5cqw)]">{tr.ask.prompt}</span>
            </p>
            {photo && (
              <div className="relative">
                <img src={photo} alt="" className="max-h-72 w-full bg-stone-100 object-contain dark:bg-stone-950" />
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
              rows={photo ? 2 : 5}
              autoFocus
              placeholder={tr.ask.placeholder}
              aria-label={tr.ask.placeholder}
              className="block w-full resize-none bg-transparent px-4 pt-3 text-[17px] font-medium text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100"
            />
            <div className="flex items-center gap-2 px-2 pb-2">
              {emoji.items.length ? (
                <EmojiSuggestions {...emoji} className="min-w-0" />
              ) : hasSelection ? (
                <FormatBar onFormat={wrap} />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => file.current?.click()}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <ImagePlus className="size-5" />
                    {tr.ask.addPhoto}
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
              <span className={`ml-auto pr-2 text-xs ${body.text.length > ASK_MAX ? "text-red-600" : "text-stone-400"}`}>
                {body.text.length}/{ASK_MAX}
              </span>
            </div>
          </div>
          {(photoError || send.isError) && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {photoError ??
                ((send.error instanceof SixApiError && sendError[send.error.code]) || tr.common.somethingWrongRetry)}
            </p>
          )}
          <PrimaryButton type="submit" disabled={!valid || send.isPending} className="w-full">
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

      <Link href="/inbox" className="text-center text-sm font-medium text-brand hover:underline">
        {tr.ask.getYours}
      </Link>
      <LegalLinks />
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
