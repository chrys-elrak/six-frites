"use client";

import { type Realtime, SixApiError, unwrap } from "@six/sdk";
import { type ChatDTO, type MessageDTO, splitLinks } from "@six/shared";
import { LogOut, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GoogleButton } from "@/components/google-button";
import { Logo } from "@/components/logo";
import { unlock } from "@/lib/app-lock";
import { clockTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { deviceName, useSession } from "@/lib/session";
import { six } from "@/lib/six";

function SignIn() {
  const tr = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCredential(idToken: string) {
    setBusy(true);
    setError(null);
    try {
      unlock();
      await six.auth.loginWithGoogle(idToken, { support: true, deviceName: deviceName() });
    } catch (err) {
      setError(
        err instanceof SixApiError
          ? ((tr.auth.errors as Record<string, string | undefined>)[err.code] ?? err.message)
          : tr.common.somethingWrong,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="space-y-3 text-center">
        <Logo className="mx-auto size-20 drop-shadow-sm" />
        <h1 className="text-2xl font-semibold tracking-tight">{tr.support.title}</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">{tr.support.intro}</p>
      </div>
      <div className="space-y-3">
        <GoogleButton onCredential={onCredential} />
        {busy && <p className="text-center text-sm text-stone-500">{tr.auth.signingIn}</p>}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

const inviteCode = (text: string) => text.match(/\/invite\/([A-Za-z0-9]+)/)?.[1];

function Bubble({ m, mine }: { m: MessageDTO; mine: boolean }) {
  const tr = useT();
  const code = inviteCode(m.text!);
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] space-y-2 rounded-2xl px-3 py-1.5 break-words whitespace-pre-wrap ${
          mine ? "bg-brand text-brand-ink" : "bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
        }`}
      >
        <p>
          {splitLinks(m.text!).map((part, i) =>
            part.href ? (
              <a key={i} href={part.href} className="underline underline-offset-2">
                {part.text}
              </a>
            ) : (
              part.text
            ),
          )}
          <span className="ml-2 text-[11px] opacity-60">{clockTime(m.createdAt)}</span>
        </p>
        {code && (
          <Link
            href={`/invite/${code}`}
            className="block rounded-xl bg-brand px-3 py-2 text-center text-sm font-semibold text-brand-ink"
          >
            {tr.support.join}
          </Link>
        )}
      </div>
    </div>
  );
}

function SupportChat({ meId }: { meId: string }) {
  const tr = useT();
  const [chat, setChat] = useState<ChatDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const realtime = useRef<Realtime | null>(null);

  const upsert = (incoming: MessageDTO[]) =>
    setMessages((list) => {
      const byId = new Map(list.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });

  useEffect(() => {
    let live = true;
    const rt = six.realtime({
      onEvent: (e) => {
        if (e.type === "message.new" || e.type === "message.edited") upsert([e.data]);
        if (e.type === "message.deleted") setMessages((list) => list.filter((m) => !e.data.messageIds.includes(m.id)));
      },
    });
    realtime.current = rt;
    rt.start();
    (async () => {
      const opened = unwrap(await six.api.POST("/v1/support"));
      const page = unwrap(
        await six.api.GET("/v1/chats/{id}/messages", { params: { path: { id: opened.id }, query: { limit: 100 } } }),
      );
      if (!live) return;
      setChat(opened);
      upsert(page.items);
    })().catch(() => live && setError(tr.support.unavailable));
    return () => {
      live = false;
      rt.stop();
    };
  }, [tr]);

  const shown = messages.filter((m) => m.chatId === chat?.id && m.type === "text" && m.text && !m.deletedAt);
  const newest = shown[0];

  useEffect(() => {
    if (chat && newest && newest.senderId !== meId) void realtime.current?.markRead(chat.id).catch(() => null);
  }, [chat, newest, meId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !chat || !realtime.current) return;
    setText("");
    setError(null);
    try {
      upsert([await realtime.current.sendMessage(chat.id, { clientId: crypto.randomUUID(), text: body })]);
    } catch {
      setText(body);
      setError(tr.common.somethingWrongRetry);
    }
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col">
      <header className="flex items-center gap-3 border-b border-black/5 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 dark:border-white/10">
        <Logo className="size-9" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{tr.support.team}</span>
          <span className="block text-xs text-stone-500">{tr.support.title}</span>
        </span>
        <button
          type="button"
          onClick={() => void six.auth.logout()}
          aria-label={tr.settings.signOut}
          title={tr.settings.signOut}
          className="grid size-10 place-items-center rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
        >
          <LogOut className="size-5" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col-reverse gap-1.5 overflow-y-auto px-3 py-3">
        {shown.map((m) => (
          <Bubble key={m.id} m={m} mine={m.senderId === meId} />
        ))}
        {chat && !shown.length && <p className="m-auto max-w-xs text-center text-sm text-stone-500">{tr.support.empty}</p>}
      </div>
      {error && (
        <p role="alert" className="px-4 pb-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <form
        onSubmit={send}
        className="flex items-end gap-1.5 border-t border-black/5 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-white/10"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            const desktop = window.matchMedia("(any-pointer: fine)").matches;
            if (e.key === "Enter" && !e.shiftKey && desktop && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={4000}
          disabled={!chat}
          placeholder={tr.common.message}
          aria-label={tr.common.message}
          className="max-h-40 min-h-10 min-w-0 flex-1 resize-none rounded-2xl bg-white px-4 py-2 text-[16px] leading-6 ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-brand dark:bg-stone-900 dark:ring-stone-800"
        />
        <button
          type="submit"
          disabled={!chat || !text.trim()}
          aria-label={tr.common.send}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition active:scale-95 disabled:opacity-40"
        >
          <SendHorizontal className="size-5" strokeWidth={2.2} />
        </button>
      </form>
    </main>
  );
}

export default function SupportPage() {
  const tr = useT();
  const router = useRouter();
  const { status, user } = useSession();
  const member = status === "authed" && !user!.guest;

  useEffect(() => {
    if (!member) return;
    six.api.POST("/v1/support").then(
      (res) => router.replace(res.data ? `/chats/${res.data.id}` : "/"),
      () => router.replace("/"),
    );
  }, [member, router]);

  if (status === "anon") return <SignIn />;
  if (status === "authed" && user!.guest) return <SupportChat meId={user!.id} />;
  return <main className="grid h-dvh place-items-center text-sm text-stone-500">{tr.common.loading}</main>;
}
