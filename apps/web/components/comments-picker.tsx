"use client";

import {
  AUTO_DELETE_UNITS,
  COMMENT_RULE_RANGE,
  COMMENT_RULES,
  type CommentRule,
  commentRuleLabel,
} from "@six/shared";
import { MessageSquareOff } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Dialog } from "./dialog";
import { Sheet } from "./sheet";
import { PrimaryButton } from "./ui";

const UNITS = AUTO_DELETE_UNITS.filter(([u]) => u !== "months");
const field =
  "rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800";

/** For a group admin: posts the next message with its comments closed, or closing after some comments or some time. */
export function CommentsPicker({
  value,
  onChange,
}: {
  value: CommentRule | null;
  onChange: (value: CommentRule | null) => void;
}) {
  const tr = useT();
  const [open, setOpen] = useState<"menu" | "custom" | null>(null);
  const label = value && commentRuleLabel(value, tr);

  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen("menu")}
        aria-label={label ?? tr.groups.commentsRule}
        title={label ?? tr.groups.commentsRule}
        className={`grid size-10 shrink-0 place-items-center rounded-full ${value ? "text-brand" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"}`}
      >
        <MessageSquareOff className="size-5" />
      </button>
      {open === "menu" && (
        <Sheet
          title={label ?? tr.groups.commentsRule}
          onClose={() => setOpen(null)}
          actions={[
            ...COMMENT_RULES.map((r) => ({
              label: commentRuleLabel(r, tr),
              onSelect: () => onChange(r),
            })),
            { label: tr.groups.customRule, onSelect: () => setOpen("custom") },
            ...(value
              ? [
                  {
                    label: tr.groups.commentsOpen,
                    onSelect: () => onChange(null),
                  },
                ]
              : []),
          ]}
        />
      )}
      {open === "custom" && (
        <CustomRule
          value={value}
          onSave={onChange}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function CustomRule({
  value,
  onSave,
  onClose,
}: {
  value: CommentRule | null;
  onSave: (r: CommentRule) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [count, setCount] = useState(
    value?.commentsLimit ? String(value.commentsLimit) : "",
  );
  const start =
    [...UNITS]
      .reverse()
      .find(
        ([, size]) =>
          value?.commentsCloseIn && value.commentsCloseIn % size === 0,
      ) ?? UNITS[0]!;
  const [amount, setAmount] = useState(
    value?.commentsCloseIn ? String(value.commentsCloseIn / start[1]) : "",
  );
  const [unit, setUnit] = useState<number>(start[1]);

  const limit = count ? Number(count) : undefined;
  const delay = amount ? Number(amount) * unit : undefined;
  const { count: c, delay: d } = COMMENT_RULE_RANGE;
  const valid =
    (limit !== undefined || delay !== undefined) &&
    (limit === undefined ||
      (Number.isInteger(limit) && limit >= c.min && limit <= c.max)) &&
    (delay === undefined ||
      (Number.isInteger(delay) && delay >= d.min && delay <= d.max));
  const rule: CommentRule = { commentsLimit: limit, commentsCloseIn: delay };

  return (
    <Dialog onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave(rule);
          onClose();
        }}
      >
        <h2 className="text-lg font-semibold">{tr.groups.customRuleTitle}</h2>
        <label className="block space-y-1.5">
          <span className="text-sm text-stone-600 dark:text-stone-300">
            {tr.groups.customRuleCount}
          </span>
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            min={c.min}
            max={c.max}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="10"
            className={`${field} w-full`}
          />
        </label>
        <div className="space-y-1.5">
          <span className="text-sm text-stone-600 dark:text-stone-300">
            {tr.groups.customRuleDelay}
          </span>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="2"
              aria-label={tr.chat.amount}
              className={`${field} w-24`}
            />
            <select
              value={unit}
              onChange={(e) => setUnit(Number(e.target.value))}
              aria-label={tr.chat.unit}
              className={`${field} min-w-0 flex-1`}
            >
              {UNITS.map(([u, size]) => (
                <option key={u} value={size}>
                  {tr.chat.units[u]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p
          className={`text-sm ${valid || (!count && !amount) ? "text-stone-500" : "text-red-600 dark:text-red-400"}`}
        >
          {valid
            ? commentRuleLabel(rule, tr)
            : count || amount
              ? tr.groups.customRuleRange
              : tr.groups.customRuleHint}
        </p>
        <PrimaryButton type="submit" className="w-full" disabled={!valid}>
          {tr.common.done}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}
