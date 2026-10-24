"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { USERNAME_PATTERN, type UpdateMeInput } from "@six/shared";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { contactUrl, formatCode, shareContact } from "@/lib/format";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { QrCode } from "./qr-code";
import { Sheet } from "./sheet";
import { Card, SectionTitle, Toggle } from "./ui";

const usernameErrors: Record<string, string> = {
  USERNAME_TAKEN: "That username is taken.",
  VALIDATION_FAILED: "3 to 20 letters, digits or _, starting with a letter.",
};

export function FindMe() {
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [username, setUsername] = useState(user.username ?? "");
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void six.api.GET("/v1/me").then(({ data }) => data && setUser(data));
  }, [setUser]);

  useEffect(() => setUsername(user.username ?? ""), [user.username]);

  const update = useMutation({
    mutationFn: async (body: UpdateMeInput) => unwrap(await six.api.PATCH("/v1/me", { body })),
    onSuccess: (u) => {
      setUser(u);
      setUsername(u.username ?? "");
    },
  });

  const reset = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/me/contact-code")),
    onSuccess: setUser,
  });

  async function share() {
    if ((await shareContact(user.contactCode)) === "copied") {
      setFlash("Link copied");
      setTimeout(() => setFlash(null), 1500);
    }
  }

  const typed = username.trim().replace(/^@/, "").toLowerCase();
  const dirty = typed !== (user.username ?? "");
  const valid = typed === "" || USERNAME_PATTERN.test(typed);

  if (!user.contactCode) return null;

  return (
    <section className="space-y-3">
      <SectionTitle>How people find you</SectionTitle>
      <Card className="divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">
        <div className="flex items-center gap-4 p-4">
          <QrCode value={contactUrl(user.contactCode)} className="size-28 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-sm text-stone-500 dark:text-stone-400">Your contact code</p>
              <p className="font-mono text-xl font-semibold tracking-widest">{formatCode(user.contactCode)}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={share}
                className="rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
              >
                {flash ?? "Share link"}
              </button>
              <button
                onClick={() => setConfirmReset(true)}
                disabled={reset.isPending}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                New code
              </button>
            </div>
          </div>
        </div>

        <form
          className="space-y-1.5 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty && valid) update.mutate({ username: typed || null });
          }}
        >
          <label htmlFor="username" className="text-sm font-medium text-stone-600 dark:text-stone-300">
            Username
          </label>
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-xl bg-stone-100 px-3 focus-within:ring-2 focus-within:ring-brand dark:bg-stone-800">
              <span className="text-stone-400">@</span>
              <input
                id="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  update.reset();
                }}
                placeholder="pick one"
                maxLength={21}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent py-2.5 pl-0.5 text-[16px] outline-none md:text-sm"
              />
            </div>
            {dirty && (
              <button
                disabled={!valid || update.isPending}
                className="rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
              >
                Save
              </button>
            )}
          </div>
          <p className={`text-xs ${update.isError || !valid ? "text-red-600 dark:text-red-400" : "text-stone-500"}`}>
            {update.isError
              ? update.error instanceof SixApiError
                ? (usernameErrors[update.error.code] ?? update.error.message)
                : "Couldn't save. Try again."
              : !valid
                ? usernameErrors.VALIDATION_FAILED
                : "Optional. People can type it to find you."}
          </p>
        </form>

        <Toggle
          label="Find me by email"
          hint={`People who type ${user.email} exactly can find you`}
          checked={user.findByEmail}
          disabled={update.isPending}
          onChange={(findByEmail) => update.mutate({ findByEmail })}
        />
      </Card>

      {confirmReset && (
        <Sheet
          title="Your current code, link and QR code will stop working. People you already chat with stay connected."
          actions={[{ label: "Get a new code", destructive: true, onSelect: () => reset.mutate() }]}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </section>
  );
}
