"use client";

import { unwrap } from "@six/sdk";
import { chatTheme } from "@six/shared";
import { useMutation } from "@tanstack/react-query";
import { Check, Delete, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCloseOnBack } from "@/lib/back";
import { unlock } from "@/lib/app-lock";
import { e2ee, signOut } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Wallpaper } from "./chat-background";
import { Dialog } from "./dialog";
import { useHasRecoveryKey } from "./encryption-settings";
import { Logo } from "./logo";
import { Sheet } from "./sheet";
import { Card, CodeInput, PrimaryButton, SectionTitle, codeError } from "./ui";

export function AppLockSettings() {
  const tr = useT();
  const hasLock = useSession((s) => s.user!.hasAppLock);
  const setUser = useSession((s) => s.setUser);
  const [turningOn, setTurningOn] = useState(false);
  const turnOff = useMutation({
    mutationFn: async () => unwrap(await six.api.DELETE("/v1/me/app-lock")),
    onSuccess: setUser,
  });

  return (
    <section id="app-lock" ref={(el) => void (location.hash === "#app-lock" && el?.scrollIntoView())} className="space-y-3">
      <SectionTitle>{tr.settings.appLock.title}</SectionTitle>
      <Card className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          <Lock className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {hasLock ? tr.settings.appLock.onHint : tr.settings.appLock.offHint}
          </p>
          {turnOff.isError && (
            <p className="text-sm text-red-600 dark:text-red-400">{tr.common.somethingWrongRetry}</p>
          )}
          <button
            onClick={() => (hasLock ? turnOff.mutate() : setTurningOn(true))}
            disabled={turnOff.isPending}
            className="rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
          >
            {hasLock ? tr.settings.appLock.turnOff : tr.settings.appLock.turnOn}
          </button>
        </div>
      </Card>
      {turningOn && <TurnOnDialog onClose={() => setTurningOn(false)} />}
    </section>
  );
}

/**
 * Turns the lock on with the backup PIN, so one code does both. Without a PIN yet, the new code becomes it, unless
 * this device can't make one without dropping an older backup: then the lock gets a code of its own.
 */
function TurnOnDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const hasKey = useHasRecoveryKey().data === true;
  const usePin = user.hasBackupPin;
  const makePin = !usePin && (hasKey || !user.backupKeyId);
  const max = makePin ? 6 : 8;
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      if (makePin) await e2ee()!.setBackupPin(code);
      return unwrap(await six.api.PUT("/v1/me/app-lock", { body: { code } }));
    },
    onSuccess: (u) => {
      unlock();
      setUser(u);
      onClose();
    },
  });
  const mismatch = !usePin && again.length >= code.length && again.length > 0 && again !== code;
  const ready = code.length >= (makePin ? 6 : 4) && (usePin || again === code);

  return (
    <Dialog onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) save.mutate();
        }}
      >
        <h2 className="text-lg font-semibold">{tr.settings.appLock.turnOnTitle}</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {usePin ? tr.settings.appLock.usePin : makePin ? tr.settings.appLock.newPin : tr.settings.appLock.newCode}
        </p>
        <CodeInput
          label={usePin ? tr.settings.backupPin.pin : tr.settings.appLock.code}
          value={code}
          onChange={(v) => setCode(v.slice(0, max))}
          autoFocus
        />
        {!usePin && <CodeInput label={tr.settings.appLock.again} value={again} onChange={(v) => setAgain(v.slice(0, max))} />}
        {(save.isError || mismatch) && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {save.isError ? codeError(save.error, tr, tr.settings.appLock.errors) : tr.settings.appLock.mismatch}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            {tr.common.cancel}
          </button>
          <PrimaryButton type="submit" className="flex-1" disabled={!ready || save.isPending}>
            {tr.settings.appLock.turnOn}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

/** On-screen digits, so no keyboard is needed. With `onSubmit`, the empty corner key sends a code of 4 digits or more. */
function Keypad({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit?: () => void }) {
  const tr = useT();
  const key = "grid size-16 place-items-center rounded-full text-2xl font-medium transition active:scale-95";

  return (
    <div className="mx-auto grid w-fit grid-cols-3 gap-x-5 gap-y-3">
      {[..."123456789", "", "0"].map((d) =>
        d ? (
          <button
            key={d}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange((value + d).slice(0, 8))}
            className={`${key} bg-white/60 shadow-sm ring-1 ring-black/5 backdrop-blur-sm hover:bg-white/80 dark:bg-white/10 dark:ring-white/10 dark:hover:bg-white/20`}
          >
            {d}
          </button>
        ) : onSubmit ? (
          <button
            key="ok"
            type="button"
            onClick={onSubmit}
            disabled={value.length < 4}
            aria-label={tr.settings.appLock.unlock}
            className={`${key} text-brand disabled:opacity-30`}
          >
            <Check className="size-7" />
          </button>
        ) : (
          <span key="gap" />
        ),
      )}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(value.slice(0, -1))}
        disabled={!value}
        aria-label={tr.settings.appLock.eraseDigit}
        className={`${key} text-stone-500 disabled:opacity-30`}
      >
        <Delete className="size-6" />
      </button>
    </div>
  );
}

/** One dot per digit of the code, each taking the brand colour once typed. They shake each time `shake` goes up. */
function CodeDots({ count, filled, shake }: { count: number; filled: number; shake: number }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shake) row.current?.animate([0, -10, 10, -7, 7, -3, 0].map((x) => ({ transform: `translateX(${x}px)` })), 360);
  }, [shake]);
  return (
    <div ref={row} className="flex h-8 items-center justify-center gap-4" aria-hidden>
      {Array.from({ length: count }, (_, i) =>
        i < filled ? (
          <span key={`on${i}`} className="size-3.5 rounded-full border-2 border-brand bg-brand" style={{ animation: "piece-pop 220ms ease-out" }} />
        ) : (
          <span key={`off${i}`} className="size-3.5 rounded-full border-2 border-stone-900/40 dark:border-white/50" />
        ),
      )}
    </div>
  );
}

/**
 * Covers the app until the app lock code is entered. Forgetting it means signing out and in again. With
 * `onCancel` it guards a single screen, like the archived chats, and can be backed out of instead. With
 * `check` the code goes there instead of the plain unlock, for actions that need it, like a private label.
 */
export function LockScreen({
  title,
  onUnlock = unlock,
  onCancel,
  check: verify,
}: {
  title?: string;
  onUnlock?: () => void;
  onCancel?: () => void;
  check?: (code: string) => Promise<unknown>;
}) {
  const tr = useT();
  const [code, setCode] = useState("");
  const length = useSession((s) => s.user?.appLockLength ?? 0);
  const [fails, setFails] = useState(0);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const hasKey = useHasRecoveryKey();
  useCloseOnBack(() => onCancel?.(), !!onCancel);
  const check = useMutation({
    mutationFn: async (value: string) =>
      verify ? verify(value) : unwrap(await six.api.POST("/v1/me/app-lock/unlock", { body: { code: value } })),
    onSuccess: (_, value) => {
      onUnlock();
      const { user, setUser } = useSession.getState();
      if (!verify && user && user.appLockLength !== value.length) setUser({ ...user, appLockLength: value.length });
      if (!verify && hasKey.data && user?.hasAppLock && !user.appLockIsPin) {
        void e2ee()?.setBackupPin(value).then(setUser).catch(() => null);
      }
    },
    onError: () => {
      setCode("");
      setFails((n) => n + 1);
    },
  });

  const type = (v: string) => {
    setCode(v);
    if (check.isError) check.reset();
    if (length && v.length === length && !check.isPending) check.mutate(v);
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-stone-50 p-6 dark:bg-stone-950">
      <div className="pointer-events-none absolute inset-0">
        <Wallpaper theme={chatTheme(null)} id="lock" />
      </div>
      <form
        className="relative w-full max-w-xs space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length >= 4) check.mutate(code);
        }}
      >
        <Logo className="mx-auto size-14" />
        <h1 className="text-center text-xl font-semibold">{title ?? tr.settings.appLock.locked}</h1>
        <p
          role="alert"
          className={`-mt-2 flex min-h-10 items-center justify-center text-center text-sm ${
            check.isError ? "text-red-600 dark:text-red-400" : "text-stone-600 dark:text-stone-300"
          }`}
        >
          {check.isError ? codeError(check.error, tr, tr.settings.appLock.errors) : tr.settings.appLock.enterCode}
        </p>
        <CodeDots count={Math.max(length || 4, code.length)} filled={code.length} shake={fails} />
        <Keypad value={code} onChange={type} onSubmit={length ? undefined : () => check.mutate(code)} />
        <button
          type="button"
          onClick={onCancel ?? (() => setConfirmSignOut(true))}
          className="block w-full text-center text-sm text-stone-500 underline-offset-2 hover:underline"
        >
          {onCancel ? tr.common.cancel : tr.settings.appLock.forgot}
        </button>
      </form>
      {confirmSignOut && (
        <Sheet
          title={hasKey.data ? tr.settings.signOutWithKey : tr.settings.signOutWithoutKey}
          actions={[{ label: tr.settings.signOut, destructive: true, onSelect: () => void signOut() }]}
          onClose={() => setConfirmSignOut(false)}
          overLock
        />
      )}
    </div>
  );
}
