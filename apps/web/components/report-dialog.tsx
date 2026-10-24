"use client";

import { unwrap } from "@six/sdk";
import type { ReportReason } from "@six/shared";
import { X } from "lucide-react";
import { useState } from "react";
import { REPORT_REASONS } from "@/lib/admin";
import { six } from "@/lib/six";
import { Dialog } from "./dialog";
import { PrimaryButton } from "./ui";

export function ReportDialog({
  target,
  title,
  onClose,
}: {
  target: { messageId: string } | { userId: string };
  title: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function submit() {
    if (!reason) return;
    setState("sending");
    try {
      unwrap(await six.api.POST("/v1/reports", { body: { ...target, reason, note: note.trim() || undefined } }));
      setState("sent");
    } catch {
      setState("failed");
    }
  }

  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      {state === "sent" ? (
        <div className="space-y-4 p-4">
          <p className="text-sm">Thanks. The moderators will take a look.</p>
          <PrimaryButton type="button" onClick={onClose} className="w-full">
            Done
          </PrimaryButton>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-3 p-4"
        >
          <fieldset className="space-y-1">
            <legend className="mb-2 text-sm text-stone-500">What's wrong?</legend>
            {REPORT_REASONS.map((r) => (
              <label
                key={r.value}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="accent-brand"
                />
                <span className="text-[15px]">{r.label}</span>
              </label>
            ))}
          </fieldset>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Anything to add? (optional)"
            aria-label="Details"
            className="block w-full resize-none rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] dark:bg-stone-800 md:text-sm"
          />
          <p className="text-xs text-stone-500">
            {"messageId" in target
              ? "The moderators will see this message and the few around it."
              : "The moderators will see your report, not your messages."}
          </p>
          {state === "failed" && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Couldn't send your report. Try again.
            </p>
          )}
          <PrimaryButton type="submit" disabled={!reason || state === "sending"} className="w-full">
            {state === "sending" ? "Sending…" : "Report"}
          </PrimaryButton>
        </form>
      )}
    </Dialog>
  );
}
