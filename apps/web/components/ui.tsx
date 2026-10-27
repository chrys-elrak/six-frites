import { SixApiError } from "@six/sdk";
import type { Dict } from "@six/shared";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{children}</h2>
      {action}
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 ${props.className ?? ""}`}
    />
  );
}

export function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-3 p-4 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-stone-500 dark:text-stone-400">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-6 w-10 shrink-0 rounded-full bg-stone-300 transition peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4 dark:bg-stone-700"
      />
    </label>
  );
}

export function codeError(err: unknown, tr: Dict, errors: Record<string, string | undefined>) {
  const code = err instanceof SixApiError ? err.code : undefined;
  return (code && errors[code]) ?? tr.common.somethingWrongRetry;
}

export function CodeInput({
  value,
  onChange,
  label,
  autoFocus,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-600 dark:text-stone-300">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, 8))
        }
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (onEnter && e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        className="w-full rounded-xl bg-stone-100 px-3 py-2.5 font-mono text-[16px] tracking-widest outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
      />
    </label>
  );
}
