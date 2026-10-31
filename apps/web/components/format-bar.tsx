"use client";

import type { EntityType } from "@six/shared";
import { Bold, Code, EyeOff, Italic, type LucideIcon, Strikethrough } from "lucide-react";
import { useT } from "@/lib/i18n";

const formats: { type: EntityType; keys: string; Icon: LucideIcon }[] = [
  { type: "bold", keys: "B", Icon: Bold },
  { type: "italic", keys: "I", Icon: Italic },
  { type: "strike", keys: "Shift+X", Icon: Strikethrough },
  { type: "code", keys: "E", Icon: Code },
  { type: "spoiler", keys: "Shift+P", Icon: EyeOff },
];

const modifierKey = () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl+");

export const keepSelection = (onPress: () => void) => ({
  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
  onTouchStart: (e: React.TouchEvent) => e.preventDefault(),
  onTouchEnd: (e: React.TouchEvent) => {
    e.preventDefault();
    onPress();
  },
  onClick: onPress,
});

/** The style a ⌘/Ctrl shortcut asks for: B, I or E, or X or P with Shift. */
export function formatShortcut(e: React.KeyboardEvent): EntityType | undefined {
  if (!(e.metaKey || e.ctrlKey)) return undefined;
  const key = e.key.toLowerCase();
  return e.shiftKey
    ? ({ x: "strike", p: "spoiler" } as const)[key as "x" | "p"]
    : ({ b: "bold", i: "italic", e: "code" } as const)[key as "b" | "i" | "e"];
}

export function FormatBar({ onFormat }: { onFormat: (type: EntityType) => void }) {
  const tr = useT();
  return (
    <div role="toolbar" aria-label={tr.composer.formatting} className="flex gap-1">
      {formats.map(({ type, keys, Icon }) => (
        <button
          key={type}
          type="button"
          {...keepSelection(() => onFormat(type))}
          aria-label={tr.composer.formats[type]}
          title={`${tr.composer.formats[type]} (${modifierKey()}${keys})`}
          className="grid size-9 place-items-center rounded-lg bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-800 dark:hover:bg-stone-800"
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
