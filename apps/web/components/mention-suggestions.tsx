"use client";

import { type ChatMemberDTO, type MentionOption, mentionOptions, mentionQuery } from "@six/shared";
import { ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Avatar } from "./avatar";

/**
 * What to mention for the `@` typed right before the caret: @everyone and @admin, then members whose nickname starts
 * like it. Picking one hands `replace` the text with the mention in place of what was typed, and where the caret goes.
 */
export function useMentionSuggestions(
  text: string,
  caret: number,
  members: ChatMemberDTO[] | null,
  meId: string | undefined,
  replace: (text: string, caret: number) => void,
) {
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const q = members && dismissed !== text ? mentionQuery(text, caret) : null;
  const items = q ? mentionOptions({ members: members! }, meId ?? "", q.query) : [];

  function pick(option: MentionOption) {
    if (!q) return;
    const mention = `${option.insert} `;
    setActive(0);
    replace(text.slice(0, q.start) + mention + text.slice(caret), q.start + mention.length);
  }

  /** Arrows move through the members, Enter or Tab picks one, Escape closes the list; true when it took the key. */
  function onKey(e: React.KeyboardEvent) {
    if (!items.length || e.nativeEvent.isComposing) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      pick(items[Math.min(active, items.length - 1)]!);
    } else if (e.key === "Escape") {
      setDismissed(text);
    } else return false;
    e.preventDefault();
    return true;
  }

  return { items, active: Math.min(active, Math.max(0, items.length - 1)), setActive, pick, onKey };
}

export function MentionSuggestions({
  items,
  active,
  setActive,
  pick,
  className = "",
}: Pick<ReturnType<typeof useMentionSuggestions>, "items" | "active" | "setActive" | "pick"> & { className?: string }) {
  const tr = useT();
  if (!items.length) return null;
  return (
    <div
      role="listbox"
      aria-label={tr.composer.mentionSuggestions}
      className={`w-64 max-w-full overflow-hidden rounded-xl bg-white/80 p-1 shadow-lg ring-1 ring-surface-line backdrop-blur-xl backdrop-saturate-150 dark:bg-stone-900/80 ${className}`}
    >
      {items.map((m, i) => (
        <button
          key={m.insert}
          type="button"
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setActive(i)}
          onClick={() => pick(m)}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${i === active ? "bg-brand/20" : ""}`}
        >
          {m.member ? (
            <Avatar user={m.member.user} size="sm" />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/20 text-brand">
              {m.group === "everyone" ? <Users className="size-4" /> : <ShieldCheck className="size-4" />}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {m.member ? m.member.user.displayName : m.group === "everyone" ? tr.composer.mentionEveryone : tr.composer.mentionAdmins}
          </span>
          <span className="shrink-0 text-xs text-stone-500">{m.member ? m.member.user.alias : m.insert}</span>
        </button>
      ))}
    </div>
  );
}
