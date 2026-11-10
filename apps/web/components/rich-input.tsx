"use client";

import type { EntityType, MessageEntity } from "@six/shared";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import { animatedEmojiUrl, splitEmoji } from "@/lib/emoji";
import { applyEdit, markupMap, parseRaw, plainAt, segments, toggleFormat } from "@/lib/markup";
import { AnimatedEmoji } from "./animated-emoji";
import { Styled, highlightStyle, outlineStyle, paintStyle } from "./rich-text";

export interface RichInputHandle {
  focus(): void;
  /** Like focus, but also brings back an on-screen keyboard that was closed while the box kept its focus. */
  refocus(): void;
  /** Where the selection starts and ends, in the markup the composer keeps. */
  readonly selectionStart: number;
  readonly selectionEnd: number;
  setSelectionRange(start: number, end: number): void;
  /** Turns a style on or off over the selection; false when nothing is selected. */
  format(type: EntityType, value?: string): boolean;
}

interface Props {
  /** The text with its styles as markup (**bold**, {red:…}), as the composer keeps and sends it. */
  value: string;
  onChange: (value: string, caret: number) => void;
  onSelectionChange?: (start: number, end: number) => void;
  onBlur?: () => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  "aria-label"?: string;
}

type Model = { text: string; entities: MessageEntity[] };

const plainOnly = () => {
  const probe = document.createElement("div");
  probe.contentEditable = "plaintext-only";
  return probe.contentEditable === "plaintext-only";
};

type EmojiTile = HTMLSpanElement & { anim?: AnimationItem };

/** How spoiler text looks while it's still being written: readable, striped and outlined. */
export const SPOILER_DRAFT = {
  background: "repeating-linear-gradient(135deg, rgba(127,127,127,0.42) 0 3px, rgba(127,127,127,0.16) 3px 6px)",
  outline: "1px dashed rgba(127,127,127,0.9)",
  outlineOffset: "1px",
  borderRadius: "4px",
} as const;

/** Markup shown the way the message box shows it, spoilers readable, with animated emoji: for the parked draft. */
export function DraftText({ markup, emojiSize = 18 }: { markup: string; emojiSize?: number }) {
  const { text, entities } = parseRaw(markup);
  return segments(text, entities).map((seg, i) => {
    const inner = splitEmoji(seg.text).map((part, j) => (j % 2 ? <AnimatedEmoji key={j} emoji={part} size={emojiSize} /> : part));
    const styled = (
      <Styled key={i} styles={seg.styles} color={seg.color} font={seg.font} size={seg.size} highlight={seg.highlight} outline={seg.outline}>
        {inner}
      </Styled>
    );
    return seg.styles.has("spoiler") ? (
      <span key={i} style={SPOILER_DRAFT}>
        {styled}
      </span>
    ) : (
      styled
    );
  });
}

/**
 * One emoji as an animated Noto emoji, playing on a loop, that the caret steps over: it can't be typed into, and
 * deleting it removes the whole emoji. It shows the plain emoji until its animation has loaded, or for good when
 * there's none. Its box is no taller than the text, so lines and spoiler outlines stay even; the animation spills over.
 */
function emojiTile(emoji: string): EmojiTile {
  const tile: EmojiTile = document.createElement("span");
  tile.dataset.emoji = emoji;
  tile.contentEditable = "false";
  tile.className = "relative inline-grid h-[1.1em] w-[1.25em] place-items-center align-baseline";
  const plain = document.createElement("span");
  plain.textContent = emoji;
  plain.style.cssText = "font-size:1.05em;line-height:1";
  tile.append(plain);
  void animatedEmojiUrl(emoji).then(async (url) => {
    if (!url) return;
    const { default: lottie } = await import("lottie-web/build/player/lottie_light");
    const box = document.createElement("span");
    box.className = "absolute inset-x-0 -inset-y-[0.075em] invisible";
    tile.append(box);
    const anim = lottie.loadAnimation({ container: box, renderer: "svg", loop: true, autoplay: true, path: url });
    tile.anim = anim;
    anim.addEventListener("DOMLoaded", () => {
      box.classList.remove("invisible");
      plain.style.visibility = "hidden";
    });
    anim.addEventListener("data_failed", () => anim.destroy());
  });
  return tile;
}

/**
 * A run of text drawn with its styles, the way a sent message shows it, with emoji as animated tiles. Tiles from
 * the last drawing are reused, so an emoji doesn't start its animation again at every keystroke.
 */
function draw(model: Model, tiles: Map<string, EmojiTile[]>) {
  const spare = new Map([...tiles].map(([k, list]) => [k, [...list]]));
  const used = new Map<string, EmojiTile[]>();
  const fill = (parent: Node[], text: string) =>
    splitEmoji(text).forEach((part, i) => {
      if (!(i % 2)) return part && parent.push(document.createTextNode(part));
      const tile = spare.get(part)?.shift() ?? emojiTile(part);
      used.set(part, [...(used.get(part) ?? []), tile]);
      parent.push(tile);
    });
  const nodes: Node[] = segments(model.text, model.entities).flatMap((seg) => {
    const s = seg.styles;
    const inner: Node[] = [];
    fill(inner, seg.text);
    if (!s.size) return inner;
    const span = document.createElement("span");
    span.append(...inner);
    const st = span.style;
    if (s.has("bold")) st.fontWeight = "600";
    if (s.has("italic")) st.fontStyle = "italic";
    const lines = [s.has("underline") && "underline", s.has("strike") && "line-through"].filter(Boolean).join(" ");
    if (lines) st.textDecoration = lines;
    if (s.has("code")) {
      st.fontFamily = "ui-monospace, monospace";
      st.fontSize = "0.9em";
      st.background = "rgba(127,127,127,0.18)";
      st.borderRadius = "4px";
    }
    if (s.has("spoiler")) Object.assign(st, SPOILER_DRAFT);
    Object.assign(st, paintStyle(seg.color, seg.font, seg.size), outlineStyle(seg.outline));
    const behind = highlightStyle(seg.highlight);
    if (!behind) return [span];
    const mark = document.createElement("span");
    Object.assign(mark.style, behind);
    mark.append(span);
    return [mark];
  });
  for (const list of spare.values()) for (const tile of list) tile.anim?.destroy();
  tiles.clear();
  for (const [k, list] of used) tiles.set(k, list);
  const end = document.createElement("br");
  end.dataset.end = "";
  return [...nodes, end];
}

/** The text in the box, reading line breaks some browsers add as <br>. */
function textOf(root: HTMLElement) {
  let out = "";
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? "";
    else if ((n as HTMLElement).dataset?.emoji) out += (n as HTMLElement).dataset.emoji;
    else if (n.nodeName === "BR") out += (n as HTMLElement).dataset.end === undefined ? "\n" : "";
    else {
      if (n !== root && n.nodeName === "DIV" && out && !out.endsWith("\n")) out += "\n";
      n.childNodes.forEach(walk);
    }
  };
  walk(root);
  return out;
}

/** How many characters of text come before a DOM position. */
function offsetOf(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  const box = document.createElement("div");
  box.appendChild(range.cloneContents());
  return textOf(box).length;
}

/** The DOM position for a character offset in the text, stepping over emoji tiles whole. */
function pointAt(root: HTMLElement, at: number): [Node, number] {
  let left = at;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) =>
      n.parentElement?.closest("[data-emoji]")
        ? NodeFilter.FILTER_REJECT
        : n.nodeType === Node.TEXT_NODE || (n as HTMLElement).dataset?.emoji
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP,
  });
  const after = (n: Node): [Node, number] => [n.parentNode!, [...n.parentNode!.childNodes].indexOf(n as ChildNode) + 1];
  let last: Node | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const len = (n as Text).length;
      if (left <= len) return [n, left];
      left -= len;
    } else {
      const len = (n as HTMLElement).dataset.emoji!.length;
      if (left === 0) return [n.parentNode!, [...n.parentNode!.childNodes].indexOf(n as ChildNode)];
      if (left <= len) return after(n);
      left -= len;
    }
    last = n;
  }
  if (!last) return [root, 0];
  return last.nodeType === Node.TEXT_NODE ? [last, (last as Text).length] : after(last);
}

/**
 * The message box, showing bold, colours, fonts and the rest as they'll look once sent. It still talks markup with
 * the composer, so drafts, editing, emoji suggestions and commands work on the same string; typing, deleting and
 * pasting act on what you see, never on hidden markers.
 */
export const RichInput = forwardRef<RichInputHandle, Props>(function RichInput(
  { value, onChange, onSelectionChange, onBlur, onPaste, onKeyDown, placeholder, maxLength = 4000, className, ...aria },
  handle,
) {
  const root = useRef<HTMLDivElement>(null);
  const model = useRef<Model>(parseRaw(value));
  const sent = useRef(value);
  const composing = useRef(false);
  const history = useRef<{ model: Model; caret: number; at: number }[]>([]);
  const future = useRef<Model[]>([]);
  const lastEdit = useRef({ at: 0, dir: 0, caret: 0 });
  const empty = !value;

  const map = () => markupMap(model.current.text, model.current.entities);

  const selection = useCallback((): [number, number] => {
    const el = root.current;
    const sel = document.getSelection();
    if (!el || !sel?.rangeCount || !el.contains(sel.anchorNode)) {
      const n = model.current.text.length;
      return [n, n];
    }
    const r = sel.getRangeAt(0);
    return [offsetOf(el, r.startContainer, r.startOffset), offsetOf(el, r.endContainer, r.endOffset)];
  }, []);

  const select = (start: number, end = start) => {
    const el = root.current;
    const sel = document.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.setStart(...pointAt(el, start));
    range.setEnd(...pointAt(el, end));
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const tiles = useRef(new Map<string, EmojiTile[]>());
  const render = () => root.current?.replaceChildren(...draw(model.current, tiles.current));

  /** Takes a new text and ranges, redraws unless the keyboard is mid-word, and tells the composer. */
  const commit = (next: Model, caret: number, redraw = true) => {
    const now = Date.now();
    const dir = Math.sign(next.text.length - model.current.text.length);
    const last = lastEdit.current;
    const fresh = now - last.at > 800 || dir === 0 || dir !== last.dir || Math.abs(caret - last.caret) > 1;
    if (fresh || !history.current.length) {
      history.current = [...history.current.slice(-99), { model: model.current, caret: last.caret, at: now }];
    }
    lastEdit.current = { at: now, dir, caret };
    future.current = [];
    model.current = next;
    if (redraw) {
      render();
      select(caret);
    }
    const { markup, at } = map();
    sent.current = markup;
    onChange(markup, at[caret] ?? markup.length);
  };

  const insert = (text: string) => {
    const [s, e] = selection();
    const { text: before, entities } = model.current;
    const after = (before.slice(0, s) + text + before.slice(e)).slice(0, maxLength);
    commit({ text: after, entities: applyEdit(before, after, entities) }, Math.min(s + text.length, after.length));
  };

  useLayoutEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    model.current = parseRaw(value);
    render();
    if (root.current && document.activeElement === root.current) {
      select(model.current.text.length);
      root.current.scrollTop = root.current.scrollHeight;
    }
    onSelectionChange?.(value.length, value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useLayoutEffect(() => {
    render();
    if (root.current) root.current.contentEditable = plainOnly() ? "plaintext-only" : "true";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!onSelectionChange) return;
    const onChangeSel = () => {
      const el = root.current;
      const sel = document.getSelection();
      if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
      const [s, e] = selection();
      const { at } = map();
      onSelectionChange(at[s] ?? 0, at[e] ?? 0);
    };
    document.addEventListener("selectionchange", onChangeSel);
    return () => document.removeEventListener("selectionchange", onChangeSel);
  }, [onSelectionChange, selection]);

  useImperativeHandle(handle, () => ({
    focus: () => root.current?.focus(),
    refocus() {
      const el = root.current;
      if (el && document.activeElement === el) {
        const [start, end] = selection();
        el.blur();
        el.focus();
        select(start, end);
      } else el?.focus();
    },
    get selectionStart() {
      return map().at[selection()[0]] ?? 0;
    },
    get selectionEnd() {
      return map().at[selection()[1]] ?? 0;
    },
    setSelectionRange(start: number, end: number) {
      const { at } = map();
      root.current?.focus();
      select(plainAt(at, start), plainAt(at, end));
    },
    format(type: EntityType, val?: string) {
      const [s, e] = selection();
      if (e <= s) return false;
      commit({ text: model.current.text, entities: toggleFormat(model.current.entities, s, e, type, val) }, e);
      select(s, e);
      return true;
    },
  }));

  return (
    <div className="relative min-w-0 flex-1">
      {empty && (
        <span aria-hidden className={`pointer-events-none absolute inset-0 truncate text-stone-400 ${className ?? ""}`}>
          {placeholder}
        </span>
      )}
      <div
        ref={root}
        role="textbox"
        aria-multiline
        aria-placeholder={placeholder}
        {...aria}
        suppressContentEditableWarning
        spellCheck
        className={`relative overflow-y-auto break-words whitespace-pre-wrap outline-none ${className ?? ""}`}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => {
          composing.current = false;
          const caret = selection()[1];
          render();
          select(caret);
        }}
        onInput={() => {
          const el = root.current!;
          const before = model.current.text;
          let after = textOf(el);
          const caret = selection()[1];
          if (after.length > maxLength) {
            after = before;
            render();
            select(Math.min(caret, before.length));
            return;
          }
          commit({ text: after, entities: applyEdit(before, after, model.current.entities) }, caret, !composing.current);
        }}
        onPaste={(e) => {
          onPaste?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          insert(e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n"));
        }}
        onDrop={(e) => e.preventDefault()}
        onBlur={onBlur}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || e.nativeEvent.isComposing) return;
          const mod = e.metaKey || e.ctrlKey;
          if (e.key === "Enter") {
            e.preventDefault();
            insert("\n");
          } else if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
            e.preventDefault();
            const prev = history.current.pop();
            if (!prev) return;
            future.current.push(model.current);
            model.current = prev.model;
            render();
            select(prev.caret);
            const { markup, at } = map();
            sent.current = markup;
            onChange(markup, at[prev.caret] ?? markup.length);
          } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
            e.preventDefault();
            const next = future.current.pop();
            if (!next) return;
            history.current.push({ model: model.current, caret: selection()[1], at: 0 });
            model.current = next;
            render();
            select(next.text.length);
            const { markup } = map();
            sent.current = markup;
            onChange(markup, markup.length);
          }
        }}
      />
    </div>
  );
});
