"use client";

import { unwrap } from "@six/sdk";
import { ChevronRight, Compass } from "lucide-react";
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { Dialog } from "./dialog";
import { PrimaryButton } from "./ui";

const ART = ["🍟", null, "💌", "🤫", "🎲"];
const SAMPLE = { displayName: "#EF4535", avatarUrl: null };

/** Remembers the tour as seen for this account, so no app shows it on its own again. */
export function markTourSeen() {
  const { user, setUser } = useSession.getState();
  if (!user || user.tourSeen) return;
  setUser({ ...user, tourSeen: true });
  void six.api
    .PATCH("/v1/me", { body: { tourSeen: true } })
    .then((r) => setUser(unwrap(r)))
    .catch(() => null);
}

/**
 * A few cards that swipe sideways, on how the app works, for someone new or anyone who asks for them again. A guest
 * who was just let all the way in gets a first card saying so.
 */
export function Tour({ onClose, upgraded }: { onClose: () => void; upgraded?: boolean }) {
  const tr = useT();
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const cards = upgraded ? [tr.tour.upgraded, ...tr.tour.cards.slice(1)] : tr.tour.cards;
  const art = upgraded ? ["🎉", ...ART.slice(1)] : ART;
  const last = at === cards.length - 1;

  const go = (i: number) => {
    const el = track.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <Dialog onClose={onClose}>
      <div
        ref={track}
        role="region"
        aria-label={tr.tour.title}
        onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
      >
        {cards.map((c, i) => (
          <section
            key={c.title}
            aria-hidden={i !== at}
            className="flex w-full shrink-0 snap-center flex-col items-center gap-3 px-6 pt-8 pb-2 text-center"
          >
            {art[i] ? (
              <div className="grid size-20 place-items-center rounded-full bg-brand/15 text-5xl leading-none select-none">
                {art[i]}
              </div>
            ) : (
              <Avatar user={SAMPLE} size="lg" />
            )}
            <h2 className="text-lg font-semibold">{c.title}</h2>
            <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">{c.body}</p>
          </section>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 pt-3">
        {cards.map((c, i) => (
          <button
            key={c.title}
            type="button"
            onClick={() => go(i)}
            aria-label={c.title}
            aria-current={i === at}
            className={`h-1.5 rounded-full transition-all ${i === at ? "w-5 bg-brand" : "w-1.5 bg-stone-300 dark:bg-stone-600"}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={onClose}
          className={`rounded-xl px-3 py-2.5 text-sm font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 ${last ? "invisible" : ""}`}
        >
          {tr.tour.skip}
        </button>
        <PrimaryButton type="button" autoFocus onClick={() => (last ? onClose() : go(at + 1))} className="ml-auto min-w-28">
          {last ? tr.tour.start : tr.common.next}
        </PrimaryButton>
      </div>
    </Dialog>
  );
}

export function TourAgain() {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl bg-surface backdrop-blur-md px-4 py-3 text-left shadow-sm ring-1 ring-surface-line hover:bg-white/80 dark:hover:bg-stone-800/70"
      >
        <Compass className="size-5 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{tr.tour.again}</span>
          <span className="block text-xs text-stone-500">{tr.tour.againHint}</span>
        </span>
        <ChevronRight className="size-5 text-stone-400" />
      </button>
      {open && <Tour onClose={() => setOpen(false)} />}
    </>
  );
}
