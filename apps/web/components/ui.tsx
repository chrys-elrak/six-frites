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
