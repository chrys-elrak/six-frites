import type { LucideIcon } from "lucide-react";

export function EmptyPane({ Icon, children }: { Icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center text-sm text-stone-500">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800 dark:text-stone-500">
          <Icon className="size-8" strokeWidth={1.6} />
        </span>
        <p>{children}</p>
      </div>
    </div>
  );
}
