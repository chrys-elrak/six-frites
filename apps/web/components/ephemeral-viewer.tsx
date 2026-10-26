"use client";

import { Flame, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Hydrated } from "@/lib/e2ee";
import { shortRule } from "@/lib/ephemeral";
import { segments } from "@/lib/markup";
import { AttachmentView, type ShownAttachment, useAttachmentUrl } from "./attachment";
import { Portal } from "./portal";
import { ProtectedImage, noSave } from "./protected-image";
import { Styled } from "./rich-text";

function Countdown({ msLeft, total }: { msLeft: number; total: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-10 place-items-center text-sm font-semibold text-white tabular-nums">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="rgb(249 115 22)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - msLeft / total)}
        />
      </svg>
      {Math.ceil(msLeft / 1000)}
    </span>
  );
}

function Media({ attachment }: { attachment: ShownAttachment }) {
  const url = useAttachmentUrl(attachment);
  const a = attachment.data;
  if (a.kind === "image") {
    return url ? (
      <ProtectedImage src={url} fit="contain" className="h-[70dvh] w-[min(90vw,64rem)]" />
    ) : (
      <p className="text-sm text-white/60">Loading…</p>
    );
  }
  if (a.kind === "video") {
    return url ? (
      <video
        src={url}
        autoPlay
        controls
        playsInline
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        {...noSave}
        className="max-h-[70dvh] max-w-full"
      />
    ) : (
      <p className="text-sm text-white/60">Loading…</p>
    );
  }
  return (
    <div className="rounded-2xl bg-white/10 p-3">
      <AttachmentView attachment={attachment} mine={false} onOpen={() => undefined} autoPlay />
    </div>
  );
}

/** Full-screen view of an opened self-destructing message; closing it, or its timer running out, ends it. */
export function EphemeralViewer({
  message,
  expiresAt,
  onClose,
}: {
  message: Hydrated;
  expiresAt: string | null;
  onClose: () => void;
}) {
  const deadline = expiresAt ? Date.parse(expiresAt) : null;
  const [now, setNow] = useState(Date.now());
  const e = message.ephemeral;
  const msLeft = deadline ? Math.max(0, deadline - now) : null;

  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [deadline]);

  useEffect(() => {
    if (msLeft === 0) onClose();
  }, [msLeft, onClose]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const a = message.attachment;
  const viewsLeft = e?.maxViews ? e.maxViews - e.views : null;
  const text = message.text ?? "";

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white"
        role="dialog"
        aria-modal
        aria-label="Self-destructing message"
      >
        <div className="flex items-center gap-3 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <span className="flex flex-1 items-center gap-2 pl-2 text-sm text-white/80">
            <Flame className="size-4 fill-orange-500 text-orange-500" />
            {e && shortRule(e)}
          </span>
          {msLeft !== null && e?.ttlSeconds && <Countdown msLeft={msLeft} total={e.ttlSeconds * 1000} />}
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full hover:bg-white/10"
          >
            <X className="size-6" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-4">
          <div className="flex max-h-full max-w-full flex-col items-center gap-4">
            {a && <Media attachment={{ source: "server", data: a, file: message.file }} />}
            {text && (
              <p className="max-w-lg text-center text-lg leading-relaxed break-words whitespace-pre-wrap select-none">
                {message.entities.length
                  ? segments(text, message.entities).map((seg, i) => (
                      <Styled key={i} styles={seg.styles}>
                        {seg.text}
                      </Styled>
                    ))
                  : text}
              </p>
            )}
          </div>
        </div>

        <p className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-white/60">
          {viewsLeft === 0
            ? "This message disappears when you close it."
            : msLeft !== null
              ? "This message disappears when the timer ends."
              : viewsLeft
                ? `You can open it ${viewsLeft === 1 ? "once more" : `${viewsLeft} more times`}.`
                : null}
        </p>
      </div>
    </Portal>
  );
}
