"use client";

import { Check, type LucideIcon } from "lucide-react";
import { useCloseOnBack } from "@/lib/back";
import { useT } from "@/lib/i18n";
import { useMedia } from "@/lib/viewport";
import { Portal } from "./portal";

export interface SheetAction {
  label: string;
  /** Shown in an icon bar; sheets list labels only. */
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  keepOpen?: boolean;
  checked?: boolean;
}

export function Sheet({
  title,
  actions,
  onClose,
  children,
  at,
  bar,
}: {
  title?: React.ReactNode;
  actions: SheetAction[];
  onClose: () => void;
  children?: React.ReactNode;
  /** Shows a context menu at this point, as for a right-click, instead of the sheet. */
  at?: { x: number; y: number };
  /** On a narrow screen, shows the actions as icons in a bar at the bottom instead of the sheet. */
  bar?: boolean;
}) {
  const tr = useT();
  const narrow = useMedia("(width < 48rem)");
  useCloseOnBack(onClose);

  const select = (a: SheetAction) => {
    if (!a.keepOpen) onClose();
    a.onSelect();
  };

  const place = (el: HTMLDivElement | null) => {
    if (!el || !at) return;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, at.x + width > window.innerWidth - 8 ? at.x - width : at.x)}px`;
    el.style.top = `${Math.max(8, at.y + height > window.innerHeight - 8 ? at.y - height : at.y)}px`;
  };

  if (at) {
    const picking = actions.some((a) => a.checked !== undefined);
    return (
      <Portal>
        <div
          key="menu"
          className="fixed inset-0 z-[80]"
          onContextMenu={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <button type="button" aria-label={tr.common.close} onClick={onClose} className="absolute inset-0 cursor-default" />
          <div ref={place} className="fixed flex w-max flex-col items-start gap-2">
            {children}
            <div
              role="menu"
              className={`chat-colors max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl bg-(--bubble-their)/70 p-1 shadow-xl ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 dark:ring-white/10 ${
                picking ? "min-w-40" : "w-56"
              }`}
            >
              {actions.map((a, i) => (
                <button
                  type="button"
                  role={picking ? "menuitemradio" : "menuitem"}
                  aria-checked={a.checked}
                  key={a.label}
                  autoFocus={a.checked ?? i === 0}
                  onClick={() => select(a)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-brand/20 focus:outline-none focus-visible:bg-brand/20 ${
                    a.destructive ? "text-red-600 dark:text-red-400" : "text-(--bubble-their-ink)"
                  } ${a.checked ? "font-semibold" : ""}`}
                >
                  {picking && <Check className={`size-4 shrink-0 text-brand ${a.checked ? "" : "invisible"}`} />}
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Portal>
    );
  }

  if (bar && narrow) {
    return (
      <Portal>
        <div key="bar" className="fixed inset-0 z-[65]" role="dialog" aria-modal>
          <button
            type="button"
            aria-label={tr.common.close}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <ActionBar actions={actions} onSelect={select} />
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div key="sheet" className="fixed inset-0 z-[65] flex items-end justify-center md:items-center" role="dialog" aria-modal>
        <button
          type="button"
          aria-label={tr.common.close}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        />
        <div className="relative w-full max-w-sm space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
          {children}
          <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain rounded-2xl bg-white/70 shadow-xl backdrop-blur-xl backdrop-saturate-150 dark:bg-stone-900/70">
            {title && (
              <div className="border-b border-black/5 px-4 py-3 text-center text-sm text-stone-500 dark:border-white/10">
                {title}
              </div>
            )}
            {actions.map((a, i) => (
              <button
                type="button"
                key={a.label}
                autoFocus={i === 0}
                onClick={() => select(a)}
                className={`block w-full border-b border-black/5 px-4 py-3.5 text-center text-[17px] last:border-0 hover:bg-black/5 focus:bg-black/5 focus:outline-none dark:border-white/10 dark:hover:bg-white/10 dark:focus:bg-white/10 ${
                  a.destructive ? "text-red-600 dark:text-red-400" : "text-stone-900 dark:text-stone-100"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="block w-full rounded-2xl bg-white/70 py-3.5 text-[17px] font-semibold shadow-xl backdrop-blur-xl backdrop-saturate-150 hover:bg-white/85 dark:bg-stone-900/70 dark:hover:bg-stone-900/85"
          >
            {tr.common.cancel}
          </button>
        </div>
      </div>
    </Portal>
  );
}

export function ActionBar({
  actions,
  onSelect,
  ref,
}: {
  actions: SheetAction[];
  onSelect: (a: SheetAction) => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className="chat-colors fixed inset-x-0 bottom-0 overflow-x-auto bg-(--bubble-their)/80 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="flex w-max min-w-full justify-around gap-1">
        {actions.map((a, i) => (
          <button
            key={a.label}
            type="button"
            autoFocus={i === 0}
            onClick={() => onSelect(a)}
            className={`flex min-w-19 shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-xs leading-tight font-medium hover:bg-black/5 focus:outline-none focus-visible:bg-black/5 dark:hover:bg-white/10 dark:focus-visible:bg-white/10 ${
              a.destructive ? "text-red-600 dark:text-red-400" : "text-(--bubble-their-ink)"
            }`}
          >
            {a.icon && <a.icon className="size-5.5" />}
            <span className="whitespace-nowrap">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
