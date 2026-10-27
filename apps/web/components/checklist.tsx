"use client";

import { CHECKLIST, type Checklist, type ChecklistMark } from "@six/shared";
import { Plus, Square, SquareCheckBig, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Dialog } from "./dialog";
import { PrimaryButton } from "./ui";

export function ChecklistView({
  list,
  checks,
  nameOf,
  onCheck,
}: {
  list: Checklist;
  checks: ChecklistMark[];
  nameOf: (userId: string) => string;
  onCheck?: (item: number) => void;
}) {
  const tr = useT();
  const marks = new Map(checks.map((c) => [c.item, c]));
  const done = list.items.filter((_, i) => marks.has(i)).length;
  return (
    <div className="w-72 max-w-full py-1">
      <p className="font-semibold break-words">{list.title}</p>
      <p className="mb-1 text-[13px] opacity-70">{tr.messages.tasksDone(done, list.items.length)}</p>
      <ul>
        {list.items.map((item, i) => {
          const mark = marks.get(i);
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!onCheck}
                onClick={() => onCheck?.(i)}
                aria-pressed={!!mark}
                title={mark ? tr.messages.doneBy(nameOf(mark.userId)) : undefined}
                className="flex w-full items-start gap-2 py-1 text-left text-[15px] leading-snug disabled:cursor-default"
              >
                {mark ? (
                  <SquareCheckBig className="mt-px size-5 shrink-0" />
                ) : (
                  <Square className="mt-px size-5 shrink-0 opacity-60" />
                )}
                <span className={`break-words ${mark ? "line-through opacity-70" : ""}`}>{item}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ChecklistDialog({ onClose, onSend }: { onClose: () => void; onSend: (list: Checklist) => void }) {
  const tr = useT();
  const [title, setTitle] = useState("");
  const [items, setItems] = useState(["", ""]);
  const [added, setAdded] = useState(false);
  const tasks = items.map((i) => i.trim()).filter(Boolean);
  const ready = !!title.trim() && tasks.length > 0;

  function add() {
    if (items.length >= CHECKLIST.items) return;
    setItems([...items, ""]);
    setAdded(true);
  }

  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">{tr.composer.newChecklist}</h2>
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
          onSend({ title: title.trim(), items: tasks });
          onClose();
        }}
        className="max-h-[70dvh] space-y-2 overflow-y-auto p-4"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={CHECKLIST.title}
          placeholder={tr.composer.checklistTitlePlaceholder}
          aria-label={tr.composer.checklistTitle}
          autoFocus
          className="block w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] font-semibold dark:bg-stone-800 md:text-sm"
        />
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Square className="size-4 shrink-0 text-stone-400" />
            <input
              value={item}
              onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || i !== items.length - 1 || !item.trim()) return;
                e.preventDefault();
                add();
              }}
              maxLength={CHECKLIST.item}
              placeholder={tr.composer.task(i + 1)}
              aria-label={tr.composer.task(i + 1)}
              autoFocus={added && i === items.length - 1}
              className="min-w-0 flex-1 rounded-xl bg-stone-100 px-3 py-2 text-[16px] dark:bg-stone-800 md:text-sm"
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                aria-label={tr.composer.removeTask}
                className="grid size-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
        {items.length < CHECKLIST.items && (
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <Plus className="size-4" /> {tr.composer.addTask}
          </button>
        )}
        <PrimaryButton type="submit" disabled={!ready} className="w-full">
          {tr.composer.sendChecklist}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}
