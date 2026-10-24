import type { EntityType } from "@six/shared";

export function Styled({ styles, children }: { styles: Set<EntityType>; children: React.ReactNode }) {
  let node = children;
  if (styles.has("code")) {
    node = <code className="rounded bg-black/10 px-1 py-px font-mono text-[0.9em] dark:bg-white/10">{node}</code>;
  }
  if (styles.has("strike")) node = <s>{node}</s>;
  if (styles.has("italic")) node = <em>{node}</em>;
  if (styles.has("bold")) node = <strong className="font-semibold">{node}</strong>;
  return <>{node}</>;
}
