"use client";

import { SixApiError, unwrap } from "@six/sdk";
import {
  ASK_COLORS,
  ASK_PROMPT_MAX,
  type AnonMessageDTO,
  type AskProfileDTO,
  type SentAnonDTO,
  TEMP_LINK_HOURS,
  type UpdateAskProfileInput,
  askUrl,
  doodleTileSvg,
  durationLabel,
  expiryLabel,
  hasLink,
  splitLinks,
} from "@six/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Copy, Ellipsis, Link2, LogOut, Settings2, Share, ShieldAlert, Trash2, VenetianMask, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type CardStyle, askCardPng, saveAskCard, shareAskCard } from "@/lib/ask-card";
import { clockTime, shareAsk, timeAgo } from "@/lib/format";
import { getLocale, useT } from "@/lib/i18n";
import { receiveAnon } from "@/lib/realtime";
import { toAvatarDataUrl } from "@/lib/image";
import { segments } from "@/lib/markup";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { useMedia } from "@/lib/viewport";
import { VoicePlayer } from "./attachment";
import { Avatar } from "./avatar";
import { BrandActions } from "./brand-actions";
import { Dialog } from "./dialog";
import { LanguageSelect } from "./language-select";
import { LegalLinks } from "./legal-page";
import { Logo } from "./logo";
import { ReportDialog } from "./report-dialog";
import { Styled } from "./rich-text";
import { Sheet } from "./sheet";
import { StoryComposer } from "./story-composer";
import { Card, PrimaryButton, Toggle } from "./ui";

type Confirm = { m: AnonMessageDTO; action: "delete" | "block" };

const DOODLES_BG = `url("data:image/svg+xml,${encodeURIComponent(doodleTileSvg("#ffffff", 0.3, 150))}")`;

const textSize = (text: string) => (text.length < 80 ? "text-2xl" : text.length < 200 ? "text-xl" : "text-base");

/** A link's preview, fetched by our server so whoever is behind the link doesn't learn who opened it. */
function LinkPreview({ url, onOpen }: { url: string; onOpen: () => void }) {
  const { data } = useQuery({
    queryKey: ["link-preview", url],
    queryFn: async () => unwrap(await six.api.GET("/v1/link-preview", { params: { query: { url } } })),
    staleTime: Infinity,
    retry: false,
  });
  if (!data) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mx-5 mb-3 block w-[calc(100%-2.5rem)] overflow-hidden rounded-2xl text-left ring-1 ring-stone-200 transition hover:bg-stone-50 dark:ring-white/10 dark:hover:bg-white/5"
    >
      {data.image && <img src={data.image} alt="" className="aspect-[1.91] w-full object-cover" />}
      <span className="block px-3 py-2 text-sm">
        <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{data.siteName}</span>
        <span className="line-clamp-2 font-semibold">{data.title}</span>
      </span>
    </button>
  );
}

/** A message's text as it was written, styled; links ask before opening, and spoilers stay hidden until tapped. */
function AnonText({ m, onLink }: { m: Pick<AnonMessageDTO, "text" | "entities">; onLink?: (href: string) => void }) {
  const tr = useT();
  const [revealed, setRevealed] = useState(false);
  return (
    <>
      {segments(m.text, m.entities).map((seg, i) => {
        const hidden = seg.styles.has("spoiler") && !revealed;
        const styled = (
          <Styled styles={seg.styles} color={seg.color} font={seg.font} size={seg.size} highlight={seg.highlight} outline={seg.outline}>
            {hidden || seg.styles.has("code") || !onLink
              ? seg.text
              : splitLinks(seg.text).map((part, j) =>
                  part.href ? (
                    <button
                      key={j}
                      type="button"
                      onClick={() => onLink(part.href!)}
                      className="break-all text-sky-700 underline underline-offset-2 dark:text-sky-400"
                    >
                      {part.text}
                    </button>
                  ) : (
                    part.text
                  ),
                )}
          </Styled>
        );
        if (!hidden) return <span key={i}>{styled}</span>;
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            aria-label={tr.messages.revealSpoiler}
            onClick={() => setRevealed(true)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setRevealed(true)}
            className="spoiler cursor-pointer"
          >
            {styled}
          </span>
        );
      })}
    </>
  );
}

/**
 * Cards in two columns on wide screens, dealt left and right in turn so the newest stay on top, without the
 * gaps a grid leaves under a short card next to a tall one.
 */
function AnonVoice({ voice }: { voice: NonNullable<AnonMessageDTO["voice"]> }) {
  return (
    <div className="flex min-h-11 items-center rounded-2xl bg-stone-100 px-3 dark:bg-stone-800">
      <VoicePlayer url={voice.url} durationMs={voice.durationMs} waveform={voice.waveform} mine={false} compact />
    </div>
  );
}

function Columns({ children, gap }: { children: React.ReactNode[]; gap: string }) {
  const wide = useMedia("(min-width: 64rem)");
  const columns = wide ? [children.filter((_, i) => i % 2 === 0), children.filter((_, i) => i % 2 === 1)] : [children];
  return (
    <div className={`flex items-start ${gap}`}>
      {columns.map((cards, i) => (
        <div key={i} className={`flex min-w-0 flex-1 flex-col ${gap}`}>
          {cards}
        </div>
      ))}
    </div>
  );
}

/** The anonymous messages you sent. Only you see them; removing one leaves the recipient's copy alone. */
function SentList() {
  const tr = useT();
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<SentAnonDTO | null>(null);
  const sent = useInfiniteQuery({
    queryKey: ["ask-sent"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/ask/sent", { params: { query: { limit: 30, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnMount: "always",
  });
  const items = sent.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      {sent.isSuccess && !items.length && (
        <p className="mx-auto max-w-xs py-10 text-center text-sm text-stone-500">{tr.ask.sentEmpty}</p>
      )}
      <Columns gap="gap-3">
        {items.map((m) => (
          <Card key={m.id} className="space-y-2.5 p-4">
            <div className="flex items-center gap-2.5">
              <Avatar user={m.to} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{tr.ask.sentTo(m.to.displayName)}</span>
              <span className="shrink-0 text-xs text-stone-400">{timeAgo(m.createdAt)}</span>
              <button
                type="button"
                onClick={() => setRemoving(m)}
                aria-label={tr.common.remove}
                className="grid size-8 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {m.photoUrl && (
              <img
                src={m.photoUrl}
                alt={tr.summary.kinds.image}
                className="max-h-60 w-full rounded-xl bg-stone-100 object-contain dark:bg-stone-800"
              />
            )}
            {m.gif && (
              <video
                src={m.gif.url}
                autoPlay
                loop
                muted
                playsInline
                aria-label="GIF"
                className="max-h-60 w-full rounded-xl bg-stone-100 object-contain dark:bg-stone-800"
              />
            )}
            {m.voice && <AnonVoice voice={m.voice} />}
            {m.text && (
              <p className="break-words whitespace-pre-wrap select-text">
                <AnonText m={m} />
              </p>
            )}
          </Card>
        ))}
      </Columns>
      {sent.hasNextPage && (
        <button
          type="button"
          onClick={() => void sent.fetchNextPage()}
          disabled={sent.isFetchingNextPage}
          className="w-full rounded-xl p-3 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          {tr.common.loadMore}
        </button>
      )}
      {removing && (
        <Sheet
          title={tr.ask.deleteSentConfirm(removing.to.displayName)}
          onClose={() => setRemoving(null)}
          actions={[
            {
              label: tr.common.remove,
              destructive: true,
              onSelect: () =>
                void six.api
                  .DELETE("/v1/ask/sent/{id}", { params: { path: { id: removing.id } } })
                  .finally(() => qc.invalidateQueries({ queryKey: ["ask-sent"] })),
            },
          ]}
        />
      )}
    </>
  );
}

/** Previews a message as an image in the color and background you pick, then shares or saves it. */
function CardExport({
  m,
  link,
  style,
  onStyle: setStyle,
  onClose,
}: {
  m: AnonMessageDTO;
  link: string;
  style: CardStyle;
  onStyle: (style: CardStyle) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [png, setPng] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    let live = true;
    askCardPng(m, link, style).then(
      (blob) => live && setPng({ blob, url: URL.createObjectURL(blob) }),
      () => null,
    );
    return () => void (live = false);
  }, [m, link, style]);
  useEffect(
    () => () => {
      if (png) URL.revokeObjectURL(png.url);
    },
    [png],
  );

  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">{tr.ask.shareStory}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid min-h-40 place-items-center rounded-xl bg-stone-200 p-3 dark:bg-stone-700">
          {png && <img src={png.url} alt="" className="max-h-[42dvh] w-auto rounded-md object-contain" />}
        </div>
        <div className="flex flex-wrap justify-center gap-2.5" role="group">
          {ASK_COLORS.map((c, i) => (
            <button
              key={c.join()}
              type="button"
              aria-label={tr.ask.color(i + 1)}
              aria-pressed={style.colors === c}
              onClick={() => setStyle({ ...style, colors: c })}
              style={{ backgroundImage: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }}
              className={`size-9 rounded-full ring-offset-2 ring-offset-white transition active:scale-90 dark:ring-offset-stone-900 ${
                style.colors === c ? "ring-2 ring-stone-900 dark:ring-stone-100" : ""
              }`}
            />
          ))}
        </div>
        <Toggle
          label={tr.ask.transparent}
          hint={tr.ask.transparentHint}
          checked={style.transparent}
          onChange={(transparent) => setStyle({ ...style, transparent })}
        />
        {!style.transparent && (
          <Toggle
            label={tr.ask.doodles}
            hint={tr.ask.doodlesHint}
            checked={style.doodles}
            onChange={(doodles) => setStyle({ ...style, doodles })}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!png}
            onClick={() => png && saveAskCard(png.blob)}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-stone-300 transition active:scale-[0.98] disabled:opacity-50 dark:ring-stone-700"
          >
            {tr.ask.saveImage}
          </button>
          <PrimaryButton type="button" disabled={!png} onClick={() => png && void shareAskCard(png.blob)}>
            {tr.common.share}
          </PrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}

/** The name and photo people see on your link, kept apart from your account's. */
/** The user's link as visitors see it, and a way to change it; `error` holds why the last change failed. */
function useAskProfile(code: string) {
  const tr = useT();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const profile = useQuery({
    queryKey: ["ask-profile", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/ask/{code}", { params: { path: { code } } })),
  });
  const save = useMutation({
    mutationFn: async (body: UpdateAskProfileInput) => unwrap(await six.api.PATCH("/v1/ask/profile", { body })),
    onSuccess: (p) => {
      qc.setQueryData(["ask-profile", code], p);
      setError(null);
    },
    onError: (err) => setError(err instanceof SixApiError ? err.message : tr.common.couldNotSave),
  });
  return { profile, save, error, setError };
}

const saveButton =
  "rounded-lg bg-stone-900 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900";

/** The line at the top of the user's link, which they can change right where they share it. */
function PromptField({ code }: { code: string }) {
  const tr = useT();
  const { profile, save, error } = useAskProfile(code);
  const [prompt, setPrompt] = useState<string | null>(null);
  if (!profile.data) return null;
  const text = prompt ?? profile.data.prompt ?? "";
  const dirty = prompt !== null && prompt.trim() !== (profile.data.prompt ?? "");

  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save.mutate({ prompt: prompt!.trim() }, { onSuccess: () => setPrompt(null) });
      }}
    >
      <label htmlFor="ask-prompt" className="flex justify-between text-sm font-medium">
        {tr.ask.promptLabel}
        <span className="text-xs font-normal text-stone-400">
          {text.length}/{ASK_PROMPT_MAX}
        </span>
      </label>
      <div className="flex gap-2">
        <input
          id="ask-prompt"
          value={text}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={ASK_PROMPT_MAX}
          placeholder={tr.ask.prompt}
          className="min-w-0 flex-1 rounded-lg bg-stone-100 px-3 py-2 text-sm ring-stone-300 outline-none focus:ring-2 dark:bg-stone-800 dark:ring-stone-700"
        />
        {dirty && (
          <button disabled={save.isPending} className={saveButton}>
            {tr.common.save}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

function PublicProfile({ code }: { code: string }) {
  const tr = useT();
  const { profile, save, error, setError } = useAskProfile(code);
  const [name, setName] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      save.mutate({ photo: await toAvatarDataUrl(f) });
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.common.couldNotReadImage);
    }
  }

  if (!profile.data) return null;
  const dirty = name !== null && name.trim() !== profile.data.displayName;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={save.isPending}
          className="group relative shrink-0 rounded-full"
          aria-label={tr.settings.changePhoto}
        >
          <Avatar user={profile.data} size="md" />
          <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-brand text-brand-ink ring-2 ring-white transition group-hover:scale-110 dark:ring-stone-900">
            <Camera className="size-4" />
          </span>
        </button>
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
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) save.mutate({ name: name!.trim() }, { onSuccess: () => setName(null) });
          }}
        >
          <input
            value={name ?? profile.data.displayName}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            aria-label={tr.ask.publicName}
            className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-lg font-medium outline-none ring-stone-300 focus:ring-2 dark:ring-stone-700"
          />
          {dirty && (
            <button disabled={save.isPending} className={saveButton}>
              {tr.common.save}
            </button>
          )}
        </form>
      </div>
      <p className="text-sm text-stone-500 dark:text-stone-400">{tr.ask.publicHint}</p>
      {profile.data.avatarUrl && (
        <button
          type="button"
          onClick={() => save.mutate({ photo: null })}
          disabled={save.isPending}
          className="text-sm font-medium text-red-600 disabled:opacity-50 dark:text-red-400"
        >
          {tr.settings.removePhoto}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

const iconButton =
  "grid size-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800";

/** Links that stop working after a while, for a story, under the user's own link `code`, which stays. */
function TempLinks({ code }: { code: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const [title, setTitle] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const links = useQuery({
    queryKey: ["ask-links"],
    queryFn: async () => unwrap(await six.api.GET("/v1/ask/links")),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["ask-links"] });
  const create = useMutation({
    mutationFn: async (hours: number) =>
      unwrap(await six.api.POST("/v1/ask/links", { body: { prompt: title!.trim(), hours } })),
    onSuccess: () => {
      setTitle(null);
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async (temp: string) => six.api.DELETE("/v1/ask/links/{code}", { params: { path: { code: temp } } }),
    onSuccess: refresh,
  });
  const url = (temp: string) => askUrl(window.location.origin, temp);

  function flash(temp: string) {
    setCopied(temp);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-2 border-t border-stone-200 pt-3 dark:border-stone-800">
      <p className="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">{tr.ask.tempLinks}</p>
      <p className="text-sm text-stone-500 dark:text-stone-400">{tr.ask.tempHint}</p>
      {links.data?.map((l) => (
        <div key={l.code} className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            {l.prompt && <p className="truncate text-sm font-medium">{l.prompt}</p>}
            <p className="truncate font-mono text-xs select-text">{url(l.code).replace(/^https?:\/\//, "")}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">{expiryLabel(l.expiresAt, tr)}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const prompt = l.prompt ?? qc.getQueryData<AskProfileDTO>(["ask-profile", code])?.prompt;
              if ((await shareAsk(l.code, prompt)) === "copied") flash(l.code);
            }}
            aria-label={tr.common.share}
            title={tr.common.share}
            className={iconButton}
          >
            <Share className="size-4" />
          </button>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(url(l.code));
              flash(l.code);
            }}
            aria-label={tr.common.copyLink}
            title={tr.common.copyLink}
            className={iconButton}
          >
            {copied === l.code ? <Check className="size-4 text-brand" /> : <Copy className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => remove.mutate(l.code)}
            aria-label={tr.common.delete}
            title={tr.common.delete}
            className={`${iconButton} hover:text-red-600 dark:hover:text-red-400`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      {title === null ? (
        <button
          type="button"
          onClick={() => setTitle("")}
          className="w-full text-center text-sm font-semibold text-brand hover:underline"
        >
          {tr.ask.newTempLink}
        </button>
      ) : (
        <div className="space-y-2 rounded-xl bg-stone-100 p-3 dark:bg-stone-800/60">
          <label htmlFor="temp-title" className="flex justify-between text-sm font-medium">
            {tr.ask.tempTitle}
            <span className="text-xs font-normal text-stone-400">
              {title.length}/{ASK_PROMPT_MAX}
            </span>
          </label>
          <input
            id="temp-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={ASK_PROMPT_MAX}
            placeholder={tr.ask.prompt}
            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 dark:bg-stone-900 dark:ring-stone-700"
          />
          <p className="text-sm text-stone-500 dark:text-stone-400">{tr.ask.tempFor}</p>
          <div className="flex gap-2">
            {TEMP_LINK_HOURS.map((h) => (
              <button
                key={h}
                type="button"
                disabled={!title.trim() || create.isPending}
                onClick={() => create.mutate(h)}
                className="flex-1 rounded-lg bg-stone-900 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
              >
                {durationLabel(h * 3600, tr)}
              </button>
            ))}
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {create.error.message}
            </p>
          )}
          <button type="button" onClick={() => setTitle(null)} className="w-full text-center text-sm text-stone-500">
            {tr.common.cancel}
          </button>
        </div>
      )}
    </div>
  );
}

/** The Anonymous tab: your link to share, and what people sent through it. For guests it is the whole app. */
export function AnonInbox({ guest = false }: { guest?: boolean }) {
  const tr = useT();
  const qc = useQueryClient();
  const code = useSession((s) => s.user!.askCode);
  const chatBan = useSession((s) => s.user!.chatBan);
  const anonBot = useSession((s) => s.user!.anonBot);
  const setUser = useSession((s) => s.setUser);
  const [copied, setCopied] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [menu, setMenu] = useState<AnonMessageDTO | null>(null);
  const [sharing, setSharing] = useState<AnonMessageDTO | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number }>();
  const [opening, setOpening] = useState<string | null>(null);
  const [view, setView] = useState<"received" | "sent">("received");
  const [settings, setSettings] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reporting, setReporting] = useState<AnonMessageDTO | null>(null);
  const [exporting, setExporting] = useState<AnonMessageDTO | null>(null);
  const [cardStyle, setCardStyle] = useState<CardStyle>({ colors: ASK_COLORS[0], transparent: false, doodles: true });
  const link = askUrl(window.location.origin, code);

  const messages = useInfiniteQuery({
    queryKey: ["ask"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/ask", { params: { query: { limit: 30, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnMount: "always",
  });
  const items = messages.data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    if (!guest) return;
    const rt = six.realtime({ onEvent: () => null });
    rt.socket.on("ask:new", (m) => receiveAnon(qc, m, true, () => window.focus()));
    rt.socket.on("connect", () => void qc.invalidateQueries({ queryKey: ["ask"] }));
    rt.start();
    return () => rt.stop();
  }, [guest, qc]);

  function act({ m, action }: Confirm) {
    const path = { params: { path: { id: m.id } } };
    const done =
      action === "delete"
        ? six.api.DELETE("/v1/ask/messages/{id}", path)
        : six.api.POST("/v1/ask/messages/{id}/block", path);
    void done.finally(() => qc.invalidateQueries({ queryKey: ["ask"] }));
  }

  function flashCopied() {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareLink() {
    if ((await shareAsk(code, qc.getQueryData<AskProfileDTO>(["ask-profile", code])?.prompt)) === "copied") flashCopied();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    flashCopied();
  }

  async function renew() {
    const res = await six.api.POST("/v1/ask/code");
    if (res.data) setUser(res.data);
  }

  async function toggleBot(on: boolean) {
    const res = await six.api.PUT("/v1/ask/bot", { body: { on } });
    if (res.data) setUser(res.data);
  }

  const headerButton = `grid place-items-center rounded-full hover:bg-stone-200 dark:hover:bg-stone-800 ${guest ? "size-10 text-stone-500" : "size-9 text-brand"}`;
  const linkButton = (
    <button type="button" onClick={() => setLinkOpen(true)} aria-label={tr.ask.yourLink} title={tr.ask.yourLink} className={headerButton}>
      <Link2 className="size-5" />
    </button>
  );
  const gear = (
    <button
      type="button"
      onClick={() => setSettings(true)}
      aria-label={tr.common.settings}
      title={tr.common.settings}
      className={headerButton}
    >
      <Settings2 className="size-5" />
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!guest && (
        <BrandActions>
          {linkButton}
          {gear}
        </BrandActions>
      )}
      {linkOpen && (
        <Dialog onClose={() => setLinkOpen(false)}>
          <div className="space-y-3 p-4">
            <p className="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">{tr.ask.yourLink}</p>
            <p className="truncate font-mono text-sm select-text">{link.replace(/^https?:\/\//, "")}</p>
            <PromptField code={code} />
            <p className="text-sm text-stone-500 dark:text-stone-400">{tr.ask.linkHint}</p>
            <PrimaryButton type="button" onClick={() => void shareLink()} className="w-full">
              {tr.common.shareLink}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="w-full text-center text-sm font-semibold text-brand hover:underline"
            >
              {copied ? tr.settings.linkCopied : tr.common.copyLink}
            </button>
          </div>
        </Dialog>
      )}
      {settings && (
        <Dialog onClose={() => setSettings(false)}>
          <div className="space-y-3 p-4">
            <PublicProfile code={code} />
            <TempLinks code={code} />
            <div className="-mx-4 border-t border-stone-200 dark:border-stone-800">
              <Toggle label={tr.ask.bot} hint={tr.ask.botHint} checked={anonBot} onChange={(on) => void toggleBot(on)} />
            </div>
            <button
              type="button"
              onClick={() => {
                setSettings(false);
                setRenewing(true);
              }}
              className="w-full border-t border-stone-200 pt-3 text-center text-sm font-medium text-stone-500 hover:text-stone-800 dark:border-stone-800 dark:hover:text-stone-200"
            >
              {tr.ask.newLink}
            </button>
          </div>
        </Dialog>
      )}
      <header className={`${guest ? "flex" : "hidden"} items-center gap-3 border-b border-stone-200 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:pt-3 dark:border-stone-800`}>
        {guest && <Logo className="size-9" />}
        <h1 className="flex-1 text-xl font-semibold tracking-tight">{guest ? tr.common.appName : tr.ask.title}</h1>
        {guest && <LanguageSelect />}
        {guest && linkButton}
        {guest && gear}
        {guest && (
          <button
            type="button"
            onClick={() => void six.auth.logout()}
            aria-label={tr.settings.signOut}
            title={tr.settings.signOut}
            className="grid size-10 place-items-center rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
          >
            <LogOut className="size-5" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-lg space-y-4 p-4 lg:max-w-5xl lg:p-6">
          <div role="tablist" className="flex rounded-full bg-stone-200/70 p-1 dark:bg-stone-800">
            {(["received", "sent"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`flex-1 rounded-full py-1.5 text-sm font-semibold transition ${
                  view === v ? "bg-white shadow-sm dark:bg-stone-950" : "text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                }`}
              >
                {v === "received" ? tr.ask.received : tr.ask.sentTab}
              </button>
            ))}
          </div>
          {view === "sent" ? (
            <SentList />
          ) : (
            <>
              {messages.isSuccess && !items.length && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800">
                    <VenetianMask className="size-8" strokeWidth={1.6} />
                  </span>
                  <p className="max-w-xs text-sm text-stone-500">{tr.ask.empty}</p>
                  <PrimaryButton type="button" onClick={() => setLinkOpen(true)}>
                    {tr.common.shareLink}
                  </PrimaryButton>
                </div>
              )}
              <Columns gap="gap-4">
                {items.map((m) => (
                  <article
                    key={m.id}
                    className="overflow-hidden rounded-3xl bg-white text-stone-900 shadow-lg shadow-stone-900/10 ring-1 ring-black/5 dark:bg-stone-900 dark:text-stone-50 dark:shadow-black/40 dark:ring-white/10"
                  >
                    <p
                      className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white"
                      style={{
                        backgroundImage: `${DOODLES_BG}, linear-gradient(135deg, ${cardStyle.colors[0]}, ${cardStyle.colors[1]})`,
                      }}
                    >
                      <Logo className="size-5 shrink-0" />
                      {m.prompt ?? tr.ask.prompt}
                    </p>
                    {m.photoUrl && (
                      <a href={m.photoUrl} target="_blank" rel="noreferrer" className="block bg-stone-100 dark:bg-stone-950">
                        <img src={m.photoUrl} alt={tr.summary.kinds.image} className="max-h-96 w-full object-contain" />
                      </a>
                    )}
                    {m.gif && (
                      <video
                        src={m.gif.url}
                        autoPlay
                        loop
                        muted
                        playsInline
                        aria-label="GIF"
                        className="max-h-96 w-full bg-stone-100 object-contain dark:bg-stone-950"
                      />
                    )}
                    {m.voice && (
                      <div className={`px-5 ${m.text ? "pt-5" : "py-5"}`}>
                        <AnonVoice voice={m.voice} />
                      </div>
                    )}
                    {m.text && (
                      <p
                        className={`px-5 pt-6 pb-5 text-center leading-snug font-bold break-words whitespace-pre-wrap select-text [&_strong]:font-black ${textSize(m.text)}`}
                      >
                        <AnonText m={m} onLink={setOpening} />
                      </p>
                    )}
                    {splitLinks(m.text)
                      .filter((p) => p.href)
                      .slice(0, 1)
                      .map((p) => (
                        <LinkPreview key={p.href} url={p.href!} onOpen={() => setOpening(p.href)} />
                      ))}
                    {hasLink(m.text) && (
                      <p className="mx-5 mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
                        <ShieldAlert className="mt-px size-4 shrink-0" />
                        {tr.ask.linkWarning}
                      </p>
                    )}
                    <div className="flex items-center gap-2 border-t border-stone-100 py-2.5 dark:border-white/10 pr-2.5 pl-5">
                      <span className="flex-1 text-xs text-stone-400">
                        {timeAgo(m.createdAt)} · {clockTime(m.createdAt)}
                        {m.oldLink && ` · ${tr.ask.oldLink}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExporting(m)}
                        className="flex items-center gap-1.5 rounded-full bg-stone-900 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-stone-700 active:scale-95 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
                      >
                        <Share className="size-4" />
                        {tr.common.share}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setMenuAt(matchMedia("(pointer: fine)").matches ? { x: r.left, y: r.bottom } : undefined);
                          setMenu(m);
                        }}
                        aria-label={tr.ask.options}
                        className="grid size-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-white/10 dark:hover:text-stone-200"
                      >
                        <Ellipsis className="size-5" />
                      </button>
                    </div>
                  </article>
                ))}
              </Columns>
              {messages.hasNextPage && (
                <button
                  type="button"
                  onClick={() => void messages.fetchNextPage()}
                  disabled={messages.isFetchingNextPage}
                  className="w-full rounded-xl p-3 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  {tr.common.loadMore}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {guest && (
        <footer className="shrink-0 space-y-2 border-t border-stone-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-stone-800">
          <p className="text-center text-sm text-stone-500 dark:text-stone-400">
            {chatBan ? tr.ask.chatsSuspended(chatBan.until && new Date(chatBan.until).toLocaleString(getLocale(), { dateStyle: "medium", timeStyle: "short" })) : tr.ask.guestNote}{" "}
            <Link href="/support" className="font-medium text-brand hover:underline">
              {tr.support.chatWithSupport}
            </Link>
          </p>
          <LegalLinks />
        </footer>
      )}
      {sharing && <StoryComposer anon={sharing} onClose={() => setSharing(null)} />}
      {menu && (
        <Sheet
          at={menuAt}
          onClose={() => setMenu(null)}
          actions={[
            ...(menu.text.trim() || menu.photoUrl || menu.gif ? [{ label: tr.stories.shareToStory, onSelect: () => setSharing(menu) }] : []),
            ...(menu.bot
              ? []
              : [
                  { label: tr.common.report, onSelect: () => setReporting(menu) },
                  { label: tr.ask.block, destructive: true, onSelect: () => setConfirm({ m: menu, action: "block" }) },
                ]),
            { label: tr.common.delete, destructive: true, onSelect: () => setConfirm({ m: menu, action: "delete" }) },
          ]}
        />
      )}
      {confirm && (
        <Sheet
          title={confirm.action === "delete" ? tr.ask.deleteConfirm : tr.ask.blockConfirm}
          onClose={() => setConfirm(null)}
          actions={[
            {
              label: confirm.action === "delete" ? tr.common.delete : tr.ask.block,
              destructive: true,
              onSelect: () => act(confirm),
            },
          ]}
        />
      )}
      {renewing && (
        <Sheet
          title={tr.ask.newLinkConfirm}
          onClose={() => setRenewing(false)}
          actions={[{ label: tr.ask.newLink, destructive: true, onSelect: () => void renew() }]}
        />
      )}
      {exporting && (
        <CardExport
          m={exporting}
          link={link}
          style={cardStyle}
          onStyle={setCardStyle}
          onClose={() => setExporting(null)}
        />
      )}
      {opening && (
        <Sheet
          title={
            <span className="block space-y-1">
              <span className="block">{tr.ask.openLinkConfirm}</span>
              <span className="block font-mono text-xs break-all text-stone-500">{opening}</span>
            </span>
          }
          onClose={() => setOpening(null)}
          actions={[{ label: tr.ask.openLink, onSelect: () => window.open(opening, "_blank", "noopener,noreferrer") }]}
        />
      )}
      {reporting && (
        <ReportDialog
          target={{ anonMessageId: reporting.id }}
          title={tr.common.report}
          onClose={() => setReporting(null)}
        />
      )}
    </div>
  );
}
