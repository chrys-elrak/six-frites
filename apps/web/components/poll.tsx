"use client";

import { POLL, type Poll } from "@six/shared";
import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Dialog } from "./dialog";
import { PrimaryButton } from "./ui";

/** A poll in a bubble: each option with its share of the votes, and who chose it when the poll shows that. */
export function PollView({
  poll,
  votes,
  myVote,
  visible,
  voters,
  nameOf,
  onVote,
}: {
  poll: Poll;
  votes: number[];
  myVote: number | null;
  visible: boolean;
  voters: { option: number; userId: string }[];
  nameOf: (userId: string) => string;
  onVote?: (option: number) => void;
}) {
  const tr = useT();
  const total = poll.options.reduce((n, _, i) => n + (votes[i] ?? 0), 0);
  return (
    <div className="w-72 max-w-full py-1">
      <p className="font-semibold break-words">{poll.question}</p>
      <p className="mb-2 text-[13px] opacity-70">
        {visible ? tr.messages.publicPoll : tr.messages.anonymousPoll} · {tr.messages.votes(total)}
      </p>
      <ul className="space-y-1.5">
        {poll.options.map((option, i) => {
          const count = votes[i] ?? 0;
          const share = total ? Math.round((count / total) * 100) : 0;
          const mine = myVote === i;
          const names = visible ? voters.filter((v) => v.option === i).map((v) => nameOf(v.userId)) : [];
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!onVote}
                onClick={() => onVote?.(i)}
                aria-pressed={mine}
                className="relative flex w-full items-center gap-2 overflow-hidden rounded-xl px-3 py-2 text-left text-[15px] leading-snug ring-1 ring-current/20 disabled:cursor-default"
              >
                <span aria-hidden className="absolute inset-y-0 left-0 bg-current/15 transition-[width]" style={{ width: `${share}%` }} />
                <span className="relative grid size-5 shrink-0 place-items-center rounded-full ring-2 ring-current/50">
                  {mine && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="relative min-w-0 flex-1 break-words">{option}</span>
                {total > 0 && <span className="relative shrink-0 text-[13px] font-semibold tabular-nums opacity-80">{share}%</span>}
              </button>
              {names.length > 0 && <p className="mt-0.5 truncate px-3 text-[12px] opacity-70">{names.join(", ")}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PollDialog({ onClose, onSend }: { onClose: () => void; onSend: (poll: Poll, visible: boolean) => void }) {
  const tr = useT();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [added, setAdded] = useState(false);
  const [visible, setVisible] = useState(false);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = !!question.trim() && filled.length >= 2;

  function add() {
    if (options.length >= POLL.options) return;
    setOptions([...options, ""]);
    setAdded(true);
  }

  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">{tr.composer.newPoll}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          onSend({ question: question.trim(), options: filled }, visible);
          onClose();
        }}
        className="max-h-[70dvh] space-y-2 overflow-y-auto p-4"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={POLL.question}
          placeholder={tr.composer.pollQuestionPlaceholder}
          aria-label={tr.composer.pollQuestion}
          autoFocus
          className="block w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] font-semibold dark:bg-stone-800 md:text-sm"
        />
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={option}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || i !== options.length - 1 || !option.trim()) return;
                e.preventDefault();
                add();
              }}
              maxLength={POLL.option}
              placeholder={tr.composer.pollOption(i + 1)}
              aria-label={tr.composer.pollOption(i + 1)}
              autoFocus={added && i === options.length - 1}
              className="min-w-0 flex-1 rounded-xl bg-stone-100 px-3 py-2 text-[16px] dark:bg-stone-800 md:text-sm"
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
                aria-label={tr.composer.removeOption}
                className="grid size-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
        {options.length < POLL.options && (
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <Plus className="size-4" /> {tr.composer.addOption}
          </button>
        )}
        <label className="flex items-center gap-2 py-1 text-sm font-medium">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-4 accent-brand" />
          {tr.composer.pollShowVoters}
        </label>
        <p className="text-xs text-stone-500">{visible ? tr.composer.pollVisibleHint : tr.composer.pollAnonymous}</p>
        <PrimaryButton type="submit" disabled={!ready} className="w-full">
          {tr.composer.sendPoll}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}
