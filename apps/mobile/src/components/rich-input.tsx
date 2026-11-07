import { type ComponentRef, forwardRef, useRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { splitEmoji } from "@/lib/emoji";
import { applyEdit, markupMap, parseRaw, plainAt, segments } from "@/lib/markup";
import { AnimatedEmoji } from "./animated-emoji";
import { GradientText, styleFor } from "./rich-text";
import { Text } from "./text";

type Range = { start: number; end: number };

interface Props extends Omit<TextInputProps, "value" | "onChangeText" | "selection" | "onSelectionChange" | "children"> {
  /** The text with its styles as markup (**bold**, {red:…}), as the composer keeps and sends it. */
  value: string;
  onChangeText: (value: string) => void;
  /** Where to put the selection, in the markup. */
  selection?: Range;
  onSelectionChange?: (selection: Range) => void;
  /** Behind code and spoilers. */
  codeBg: string;
}

/**
 * The message box, showing bold, colours, fonts and the rest as they'll look once sent. It still talks markup with
 * the composer, so drafts, editing, emoji suggestions and commands work on the same string, while typing and
 * deleting act on what you see, never on hidden markers.
 */
export const RichTextInput = forwardRef<ComponentRef<typeof TextInput>, Props>(function RichTextInput(
  { value, onChangeText, selection, onSelectionChange, codeBg, ...rest },
  ref,
) {
  const latest = useRef({ value, model: parseRaw(value) });
  if (latest.current.value !== value) latest.current = { value, model: parseRaw(value) };
  const { model } = latest.current;
  const at = () => markupMap(latest.current.model.text, latest.current.model.entities).at;
  const shown = selection && { start: plainAt(at(), selection.start), end: plainAt(at(), selection.end) };

  return (
    <TextInput
      ref={ref}
      {...rest}
      selection={shown}
      onChangeText={(text) => {
        const before = latest.current.model;
        const next = { text, entities: applyEdit(before.text, text, before.entities) };
        const { markup } = markupMap(next.text, next.entities);
        latest.current = { value: markup, model: next };
        onChangeText(markup);
      }}
      onSelectionChange={(e) => {
        const { start, end } = e.nativeEvent.selection;
        const map = at();
        onSelectionChange?.({ start: map[start] ?? map.at(-1)!, end: map[end] ?? map.at(-1)! });
      }}
    >
      {segments(model.text, model.entities).map((seg, i) => (
        <Text key={i} style={[styleFor(seg, codeBg), seg.styles.has("spoiler") && { backgroundColor: "rgba(127,127,127,0.45)" }]}>
          {GradientText({ seg }) ?? seg.text}
        </Text>
      ))}
    </TextInput>
  );
});

/** Markup shown the way the message box shows it, spoilers readable, with animated emoji: for the parked draft. */
export function DraftText({ markup, codeBg }: { markup: string; codeBg: string }) {
  const { text, entities } = parseRaw(markup);
  return segments(text, entities).map((seg, i) => (
    <Text key={i} style={[styleFor(seg, codeBg), seg.styles.has("spoiler") && { backgroundColor: "rgba(127,127,127,0.45)" }]}>
      {GradientText({ seg }) ??
        splitEmoji(seg.text).map((part, j) => (j % 2 ? <AnimatedEmoji key={j} emoji={part} size={18} inline /> : part))}
    </Text>
  ));
}
