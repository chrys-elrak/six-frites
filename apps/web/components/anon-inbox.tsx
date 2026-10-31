"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { ASK_COLORS, type AnonMessageDTO, type UpdateAskProfileInput, askUrl } from "@six/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Ellipsis, LogOut, Share, VenetianMask, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type CardStyle, askCardPng, saveAskCard, shareAskCard } from "@/lib/ask-card";
import { shareAsk, timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { receiveAnon } from "@/lib/realtime";
import { toAvatarDataUrl } from "@/lib/image";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { Dialog } from "./dialog";
import { LanguageSelect } from "./language-select";
import { Logo } from "./logo";
import { ReportDialog } from "./report-dialog";
import { Sheet } from "./sheet";
import { Card, PrimaryButton, Toggle } from "./ui";

type Confirm = { m: AnonMessageDTO; action: "delete" | "block" };

const textSize = (text: string) => (text.length < 80 ? "text-2xl" : text.length < 200 ? "text-xl" : "text-base");

/** Previews a message as an image in the color and background you pick, then shares or saves it. */
function CardExport({
  text,
  link,
  style,
  onStyle: setStyle,
  onClose,
}: {
  text: string;
  link: string;
  style: CardStyle;
  onStyle: (style: CardStyle) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [png, setPng] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    let live = true;
    askCardPng(text, link, style).then(
      (blob) => live && setPng({ blob, url: URL.createObjectURL(blob) }),
      () => null,
    );
    return () => void (live = false);
  }, [text, link, style]);
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
function PublicProfile({ code }: { code: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const profile = useQuery({
    queryKey: ["ask-profile", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/ask/{code}", { params: { path: { code } } })),
  });

  const save = useMutation({
    mutationFn: async (body: UpdateAskProfileInput) => unwrap(await six.api.PATCH("/v1/ask/profile", { body })),
    onSuccess: (p) => {
      qc.setQueryData(["ask-profile", code], p);
      setName(null);
    },
    onError: (err) => setError(err instanceof SixApiError ? err.message : tr.common.couldNotSave),
  });

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
            if (dirty) save.mutate({ name: name!.trim() });
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
            <button
              disabled={save.isPending}
              className="rounded-lg bg-stone-900 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
            >
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

/** The Anonymous tab: your link to share, and what people sent through it. For guests it is the whole app. */
export function AnonInbox({ guest = false }: { guest?: boolean }) {
  const tr = useT();
  const qc = useQueryClient();
  const code = useSession((s) => s.user!.askCode);
  const setUser = useSession((s) => s.setUser);
  const [copied, setCopied] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [menu, setMenu] = useState<AnonMessageDTO | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reporting, setReporting] = useState<AnonMessageDTO | null>(null);
  const [exporting, setExporting] = useState<AnonMessageDTO | null>(null);
  const [cardStyle, setCardStyle] = useState<CardStyle>({ colors: ASK_COLORS[0], transparent: false });
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

  async function shareLink() {
    if ((await shareAsk(code)) !== "copied") return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function renew() {
    const res = await six.api.POST("/v1/ask/code");
    if (res.data) setUser(res.data);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-stone-200 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:pt-3 dark:border-stone-800">
        {guest && <Logo className="size-9" />}
        <h1 className="flex-1 text-xl font-semibold tracking-tight">{guest ? tr.common.appName : tr.ask.title}</h1>
        {guest && <LanguageSelect />}
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
          <Card className="space-y-3 p-4">
            <PublicProfile code={code} />
            <p className="border-t border-stone-200 pt-3 text-sm font-semibold tracking-wide text-stone-500 uppercase dark:border-stone-800 dark:text-stone-400">
              {tr.ask.yourLink}
            </p>
            <p className="truncate font-mono text-sm select-text">{link.replace(/^https?:\/\//, "")}</p>
            <p className="text-sm text-stone-500 dark:text-stone-400">{tr.ask.linkHint}</p>
            <PrimaryButton type="button" onClick={() => void shareLink()} className="w-full">
              {copied ? tr.settings.linkCopied : tr.common.shareLink}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => setRenewing(true)}
              className="w-full text-center text-sm font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            >
              {tr.ask.newLink}
            </button>
          </Card>
          {guest && (
            <p className="px-1 text-sm text-stone-500 dark:text-stone-400">
              {tr.ask.guestNote}{" "}
              <Link href="/support" className="font-medium text-brand hover:underline">
                {tr.support.chatWithSupport}
              </Link>
            </p>
          )}
          {messages.isSuccess && !items.length && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800">
                <VenetianMask className="size-8" strokeWidth={1.6} />
              </span>
              <p className="max-w-xs text-sm text-stone-500">{tr.ask.empty}</p>
            </div>
          )}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {items.map((m) => (
              <article
                key={m.id}
                className="overflow-hidden rounded-3xl bg-white text-stone-900 shadow-lg shadow-stone-900/10 ring-1 ring-black/5 dark:shadow-black/40"
              >
                <p
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white"
                  style={{ backgroundImage: `linear-gradient(135deg, ${cardStyle.colors[0]}, ${cardStyle.colors[1]})` }}
                >
                  <Logo className="size-5 shrink-0" />
                  {tr.ask.prompt}
                </p>
                <p
                  className={`px-5 pt-6 pb-5 text-center leading-snug font-bold break-words whitespace-pre-wrap select-text ${textSize(m.text)}`}
                >
                  {m.text}
                </p>
                <div className="flex items-center gap-2 border-t border-stone-100 py-2.5 pr-2.5 pl-5">
                  <span className="flex-1 text-xs text-stone-400">{timeAgo(m.createdAt)}</span>
                  <button
                    type="button"
                    onClick={() => setExporting(m)}
                    className="flex items-center gap-1.5 rounded-full bg-stone-900 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-stone-700 active:scale-95"
                  >
                    <Share className="size-4" />
                    {tr.common.share}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenu(m)}
                    aria-label={tr.ask.options}
                    className="grid size-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                  >
                    <Ellipsis className="size-5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
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
        </div>
      </div>
      {menu && (
        <Sheet
          onClose={() => setMenu(null)}
          actions={[
            { label: tr.common.report, onSelect: () => setReporting(menu) },
            { label: tr.ask.block, destructive: true, onSelect: () => setConfirm({ m: menu, action: "block" }) },
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
          text={exporting.text}
          link={link}
          style={cardStyle}
          onStyle={setCardStyle}
          onClose={() => setExporting(null)}
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
