"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { useMutation } from "@tanstack/react-query";
import { EyeOff } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Dialog } from "./dialog";
import { Card, PrimaryButton, SectionTitle } from "./ui";

const codeErrors: Record<string, string> = {
  WRONG_CONTACT_PIN: "That's not your privacy code.",
  CONTACT_PIN_REQUIRED: "Enter your privacy code.",
  CONTACT_PIN_NOT_SET: "Set a privacy code in Settings first.",
  RATE_LIMITED: "Too many tries. Wait a minute.",
  VALIDATION_FAILED: "Use 4 to 8 digits.",
};

export function codeError(err: unknown) {
  const code = err instanceof SixApiError ? err.code : undefined;
  return (code && codeErrors[code]) ?? "Something went wrong. Try again.";
}

export function CodeInput({
  value,
  onChange,
  label,
  autoFocus,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-600 dark:text-stone-300">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, 8))
        }
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (onEnter && e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        className="w-full rounded-xl bg-stone-100 px-3 py-2.5 font-mono text-[16px] tracking-widest outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
      />
    </label>
  );
}

export function PrivacyCodeSettings() {
  const hasCode = useSession((s) => s.user!.hasContactPin);
  const [dialog, setDialog] = useState<"set" | "remove" | null>(null);

  return (
    <section className="space-y-3">
      <SectionTitle>Privacy code</SectionTitle>
      <Card className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          <EyeOff className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {hasCode
              ? "The real name of a contact you renamed only shows after you enter this code."
              : "Set a code to see the real name of a contact you renamed. Until then it stays hidden."}
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setDialog("set")}
              className="rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
            >
              {hasCode ? "Change code" : "Set code"}
            </button>
            {hasCode && (
              <button
                onClick={() => setDialog("remove")}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </Card>
      {dialog && (
        <CodeDialog
          removing={dialog === "remove"}
          hasCode={hasCode}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function CodeDialog({
  removing,
  hasCode,
  onClose,
}: {
  removing: boolean;
  hasCode: boolean;
  onClose: () => void;
}) {
  const setUser = useSession((s) => s.setUser);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const save = useMutation({
    mutationFn: async () =>
      removing
        ? unwrap(
            await six.api.DELETE("/v1/me/contact-pin", {
              body: { currentPin: current },
            }),
          )
        : unwrap(
            await six.api.PUT("/v1/me/contact-pin", {
              body: { pin: next, ...(hasCode && { currentPin: current }) },
            }),
          ),
    onSuccess: (u) => {
      setUser(u);
      onClose();
    },
  });
  const mismatch = !removing && again.length >= next.length && again !== next;
  const ready = removing
    ? current.length >= 4
    : next.length >= 4 && again === next && (!hasCode || current.length >= 4);

  return (
    <Dialog onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) save.mutate();
        }}
      >
        <h2 className="text-lg font-semibold">
          {removing
            ? "Remove privacy code"
            : hasCode
              ? "Change privacy code"
              : "Set a privacy code"}
        </h2>
        {!removing && (
          <p className="text-sm text-stone-600 dark:text-stone-300">
            4 to 8 digits. You'll need it to see the real name of a contact you
            renamed. Nobody can recover it for you.
          </p>
        )}
        {(removing || hasCode) && (
          <CodeInput
            label="Current code"
            value={current}
            onChange={setCurrent}
            autoFocus
          />
        )}
        {!removing && (
          <>
            <CodeInput
              label="New code"
              value={next}
              onChange={setNext}
              autoFocus={!hasCode}
            />
            <CodeInput
              label="New code again"
              value={again}
              onChange={setAgain}
            />
          </>
        )}
        {(save.isError || (mismatch && again.length > 0)) && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {save.isError ? codeError(save.error) : "The codes don't match."}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <PrimaryButton
            type="submit"
            className="flex-1"
            disabled={!ready || save.isPending}
          >
            {removing ? "Remove" : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
