import type { EntityType, MessageEntity } from "@six/shared";
import { segments } from "@/lib/markup";

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

/** Formatted text with spoilers shown, for places where the reader has already chosen to see it. */
export function RichText({ text, entities }: { text: string; entities: MessageEntity[] }) {
  if (!entities.length) return <>{text}</>;
  return (
    <>
      {segments(text, entities).map((seg, i) => (
        <span key={i} className={seg.styles.has("spoiler") ? "rounded bg-white/10 px-0.5" : undefined}>
          <Styled styles={seg.styles}>{seg.text}</Styled>
        </span>
      ))}
    </>
  );
}
