"use client";

import { unwrap } from "@six/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { parseMarkup, toMarkup } from "@/lib/markup";
import { six } from "@/lib/six";
import { FormatBar, formatShortcut } from "../format-bar";
import { DraftText, RichInput, type RichInputHandle } from "../rich-input";
import { Sheet } from "../sheet";

const fill = "rounded-xl bg-stone-100 dark:bg-stone-800";
const pad = "px-3 py-2.5 text-[16px] md:text-sm";

function History() {
  const posted = useQuery({
    queryKey: ["admin", "announcements"],
    queryFn: async () => unwrap(await six.api.GET("/v1/admin/announcements")),
  });

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">History</h2>
      {posted.isError && <p className="text-sm text-red-600 dark:text-red-400">Couldn't load the history.</p>}
      {posted.data?.length === 0 && <p className="text-sm text-stone-500">Nothing posted yet.</p>}
      {posted.data?.map((a) => (
        <article key={`${a.kind}:${a.sentAt}`} className={`${fill} space-y-1 px-3 py-2.5`}>
          <p className="text-xs text-stone-500">
            {new Date(a.sentAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
            {a.kind === "release" ? "Release notes, each member in their language" : "Announcement"} · {a.members}{" "}
            {a.members === 1 ? "member" : "members"}
          </p>
          <p className="text-sm break-words whitespace-pre-wrap">
            <DraftText markup={toMarkup(a.text, a.entities)} />
          </p>
        </article>
      ))}
    </section>
  );
}

export function Announce() {
  const qc = useQueryClient();
  const input = useRef<RichInputHandle>(null);
  const [markup, setMarkup] = useState("");
  const [email, setEmail] = useState(false);
  const [subject, setSubject] = useState("");
  const [confirm, setConfirm] = useState(false);
  const send = useMutation({
    mutationFn: async (sent: string) => {
      const { text, entities } = parseMarkup(sent);
      const body = { text, entities, ...(email && { email: { subject: subject.trim() } }) };
      return unwrap(await six.api.POST("/v1/admin/announcements", { body }));
    },
    onSuccess: (_, sent) => {
      setMarkup((now) => (now === sent ? "" : now));
      setSubject("");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "announcements"] }),
  });
  const ready = !!parseMarkup(markup).text && (!email || !!subject.trim()) && !send.isPending;

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Six Frites News posts this in every member's chat with it, with a notification, and brings that chat back for
        anyone who deleted it. Nobody can reply there. Guests, banned people and people still on the waiting list don't
        get it. It can't be taken back. Sending the same text again the same day only reaches the people it missed.
      </p>
      <div className="space-y-2">
        <FormatBar onFormat={(type, value) => input.current?.format(type, value)} />
        <div className={fill}>
          <RichInput
            ref={input}
            value={markup}
            onChange={(value) => setMarkup(value)}
            onKeyDown={(e) => {
              const type = formatShortcut(e);
              if (!type) return;
              e.preventDefault();
              input.current?.format(type);
            }}
            placeholder="Your announcement"
            aria-label="Announcement"
            className={`${pad} min-h-36`}
          />
        </div>
        <p className="text-xs text-stone-500">
          Select words, then pick a style above. It shows here the way members will see it in the chat.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} disabled={send.isPending} />
        Also send it by email
      </label>
      {email && (
        <div className="space-y-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            disabled={send.isPending}
            placeholder="Email subject"
            aria-label="Email subject"
            className={`block w-full ${fill} ${pad}`}
          />
          <p className="text-xs text-stone-500">
            It goes to members who haven't turned emails off, with the subject as its title. Bold, italic, underline,
            strike and code show in the email and spoilers as ••••; colours, fonts and sizes only in the app. The same subject again today only
            reaches members not emailed yet.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setConfirm(true)}
        disabled={!ready}
        className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        {send.isPending ? "Sending…" : "Send to everyone"}
      </button>
      {send.data && (
        <p role="status" className="text-sm text-stone-500">
          Sent to {send.data.sent} of {send.data.members} members.
          {send.data.emails !== null && ` Emailing ${send.data.emails} of them now; follow it in the Emails tab.`}
        </p>
      )}
      {send.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {send.error.message || "Couldn't send."} It may have reached some members already: sending the same text again
          today only reaches the others.
        </p>
      )}
      {confirm && (
        <Sheet
          title={email ? "Send this to every member, and by email?" : "Send this to every member?"}
          actions={[{ label: "Send it", onSelect: () => send.mutate(markup) }]}
          onClose={() => setConfirm(false)}
        />
      )}
      <History />
    </div>
  );
}
