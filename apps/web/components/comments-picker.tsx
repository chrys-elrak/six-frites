"use client";

import { COMMENT_RULES, type CommentRule } from "@six/shared";
import { MessageSquareOff } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Sheet } from "./sheet";

/** For a group admin: posts the next message with its comments closed, or closing after some comments or some time. */
export function CommentsPicker({
  value,
  onChange,
}: {
  value: CommentRule | null;
  onChange: (value: CommentRule | null) => void;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const label = (r: CommentRule) =>
    r.commentsClosed
      ? tr.groups.commentsClosed
      : r.commentsLimit
        ? tr.groups.closeAfterComments(r.commentsLimit)
        : tr.groups.closeAfterHours(r.commentsCloseIn! / 3600);

  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(true)}
        aria-label={value ? label(value) : tr.groups.commentsRule}
        title={value ? label(value) : tr.groups.commentsRule}
        className={`grid size-10 shrink-0 place-items-center rounded-full ${value ? "text-brand" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"}`}
      >
        <MessageSquareOff className="size-5" />
      </button>
      {open && (
        <Sheet
          title={tr.groups.commentsRule}
          onClose={() => setOpen(false)}
          actions={[
            ...COMMENT_RULES.map((r) => ({
              label: label(r),
              onSelect: () => onChange(r),
            })),
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
    </>
  );
}
