import { type EntityType, LABEL_FONTS, type TextFont, textColor, textSize } from "@six/shared";

/** The inline style for a colour, gradient, font and size; gradients fill the text through background-clip. */
export function paintStyle(color?: string, font?: string, size?: string): React.CSSProperties | null {
  const paint = textColor(color);
  const family = font && LABEL_FONTS[font as TextFont];
  const points = textSize(size);
  if (!paint && !family && !points) return null;
  return {
    ...(family && { fontFamily: family }),
    ...(points && { fontSize: `${points}px`, lineHeight: 1.25 }),
    ...(paint && "solid" in paint && { color: paint.solid }),
    ...(paint &&
      "gradient" in paint && {
        backgroundImage: `linear-gradient(90deg, ${paint.gradient[0]}, ${paint.gradient[1]})`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
      }),
  };
}

/** A background behind the text, a gradient going left to right, with room around the letters. */
export function highlightStyle(value: string | undefined): React.CSSProperties | null {
  const paint = textColor(value);
  if (!paint) return null;
  return {
    ...("solid" in paint
      ? { backgroundColor: paint.solid }
      : { backgroundImage: `linear-gradient(90deg, ${paint.gradient[0]}, ${paint.gradient[1]})` }),
    borderRadius: "0.35em",
    padding: "0.08em 0.35em",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  };
}

/** A line around each letter, drawn under the letters' own colour; a gradient gives its first colour. */
export function outlineStyle(value: string | undefined): React.CSSProperties | null {
  const paint = textColor(value);
  if (!paint) return null;
  return { WebkitTextStroke: `0.12em ${"solid" in paint ? paint.solid : paint.gradient[0]}`, paintOrder: "stroke fill" };
}

export function Styled({
  styles,
  color,
  font,
  size,
  highlight,
  outline,
  children,
}: {
  styles: Set<EntityType>;
  color?: string;
  font?: string;
  size?: string;
  highlight?: string;
  outline?: string;
  children: React.ReactNode;
}) {
  let node = children;
  if (styles.has("code")) {
    node = <code className="rounded bg-black/10 px-1 py-px font-mono text-[0.9em] dark:bg-white/10">{node}</code>;
  }
  if (styles.has("strike")) node = <s>{node}</s>;
  if (styles.has("underline")) node = <u className="underline-offset-2">{node}</u>;
  if (styles.has("italic")) node = <em>{node}</em>;
  if (styles.has("bold")) node = <strong className="font-semibold">{node}</strong>;
  const paint = paintStyle(color, font, size);
  if (paint) node = <span style={paint}>{node}</span>;
  const around = outlineStyle(outline);
  if (around) node = <span style={around}>{node}</span>;
  const behind = highlightStyle(highlight);
  if (behind) node = <span style={behind}>{node}</span>;
  return <>{node}</>;
}
