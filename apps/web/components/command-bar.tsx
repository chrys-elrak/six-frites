"use client";

import { SixApiError } from "@six/sdk";
import {
  AUTO_DELETE_PRESETS,
  type EmojiEntry,
  type EphemeralInput,
  type GifDTO,
  MessageEffect,
  type MenuCommand,
  durationLabel,
  isMenuCommand,
  parseCommand,
  silentMessage,
  suggestEmoji,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { type Ref, useEffect, useImperativeHandle, useState } from "react";
import { emojiList } from "@/lib/emoji";
import { updateChatSettings } from "@/lib/actions";
import { useChat } from "@/lib/chats";
import { EPHEMERAL_OPTIONS } from "@/lib/ephemeral";
import { useT } from "@/lib/i18n";
import { VOICE_EFFECTS, useVoiceEffect } from "@/lib/voice-fx";
import { useGifs } from "./gif-picker";

interface Choice {
  key: string;
  label: string;
  title?: string;
  emoji?: boolean;
  current?: boolean;
  pick: () => void;
}

export interface CommandBarHandle {
  /** Handles a key typed in the composer; true when it was meant for the bar. */
  key: (e: React.KeyboardEvent) => boolean;
  /** Runs the command being typed instead of sending it as text; true when there is one. */
  submit: () => boolean;
}

/**
 * Slash commands over the composer: `/` lists them, `/giphy love` shows GIFs and `/sticker wave` stickers
 * to send, `/effect`, `/emoji`, `/voice`, `/destruct`, `/location`, `/autodelete`, `/blur` and `/search`
 * offer their choices inline, narrowed by what follows, and `/game` or `/schedule` opens that dialog.
 * After `/silent` it steps aside for the message to send without a notification.
 */
export function CommandBar({
  ref,
  chatId,
  text,
  onComplete,
  onGif,
  onSticker,
  onMenu,
  onDestruct,
  onLocation,
  onEffect,
  onSearch,
}: {
  ref: Ref<CommandBarHandle>;
  chatId: string;
  text: string;
  onComplete: (text: string) => void;
  onGif: (gif: GifDTO) => void;
  onSticker: (sticker: GifDTO) => void;
  onMenu: (name: MenuCommand) => void;
  onDestruct: (value: EphemeralInput) => void;
  onLocation: () => void;
  onEffect: (effect: MessageEffect) => void;
  onSearch: (q: string) => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const chat = useChat(qc, chatId).data;
  const voice = useVoiceEffect((s) => s.effect);
  const setVoice = useVoiceEffect((s) => s.set);
  const command = silentMessage(text) === null ? parseCommand(text) : null;
  const run = command?.kind === "run" ? command : null;
  const search = run?.name === "giphy" || run?.name === "sticker" ? run.args : null;
  const kind = run?.name === "sticker" ? "sticker" : "gif";
  const [emojis, setEmojis] = useState<EmojiEntry[] | null>(null);
  const [q, setQ] = useState(search);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (run?.name === "emoji") void emojiList().then(setEmojis);
  }, [run?.name]);

  function chatSetting(input: Parameters<typeof updateChatSettings>[2]) {
    onComplete("");
    void updateChatSettings(qc, chatId, input).catch(() => null);
  }

  function choicesFor(name: string, args: string): Choice[] | null {
    const q = args.toLowerCase();
    const match = (c: Choice) => c.label.toLowerCase().includes(q);
    switch (name) {
      case "emoji":
        return (q ? suggestEmoji(emojis ?? [], q, 16) : (emojis ?? []).slice(0, 16)).map((x) => ({
          key: x.e,
          label: x.e,
          title: x.n,
          emoji: true,
          pick: () => onComplete(x.e),
        }));
      case "voice":
        return VOICE_EFFECTS.map((e) => ({
          key: e,
          label: tr.composer.voiceEffects[e],
          current: e === voice,
          pick: () => {
            setVoice(e);
            onComplete("");
          },
        })).filter(match);
      case "effect":
        return MessageEffect.options.map((e) => ({
          key: e,
          label: tr.messages.effectNames[e],
          pick: () => onEffect(e),
        })).filter(match);
      case "destruct":
        return EPHEMERAL_OPTIONS.map((o) => ({ key: o.label, label: o.label, pick: () => onDestruct(o.value) })).filter(
          match,
        );
      case "location":
        return [{ key: "here", label: tr.composer.sendLocation, pick: onLocation }].filter(match);
      case "autodelete":
        return [
          ...AUTO_DELETE_PRESETS.map((secs) => ({
            key: String(secs),
            label: durationLabel(secs, tr),
            current: chat?.autoDeleteSecs === secs,
            pick: () => chatSetting({ autoDeleteSecs: secs }),
          })),
          ...(chat?.autoDeleteSecs
            ? [{ key: "off", label: tr.chat.turnOff, pick: () => chatSetting({ autoDeleteSecs: null }) }]
            : []),
        ].filter(match);
      case "blur":
        return [
          {
            key: "blur",
            label: chat?.safeView ? tr.chat.safeViewOff : tr.chat.safeViewOn,
            pick: () => chatSetting({ safeView: !chat?.safeView }),
          },
        ].filter(match);
      case "search":
        return [{ key: "search", label: args ? tr.composer.searchFor(args) : tr.chat.search, pick: () => onSearch(args) }];
      default:
        return null;
    }
  }

  const gifs = useGifs(q ?? "", search !== null && q !== null, kind);
  const names = command?.kind === "names" ? command.names : [];
  const items = search !== null ? (gifs.data?.pages[0]?.items ?? []) : [];
  const choices = run ? choicesFor(run.name, run.args) : null;
  const waiting = run?.name === "emoji" && !emojis;
  const count = names.length || items.length || (choices?.length ?? 0);
  const shown = command !== null && dismissed !== text && (!choices || waiting || choices.length > 0);

  useEffect(() => setActive(0), [q, command?.kind]);

  function pick(i: number) {
    const name = names[i];
    if (name && isMenuCommand(name)) onMenu(name);
    else if (name) onComplete(`/${name} `);
    else if (choices) choices[i]?.pick();
    else if (items[i]) (kind === "sticker" ? onSticker : onGif)(items[i]);
  }

  useImperativeHandle(ref, () => ({
    key(e) {
      if (!shown || e.nativeEvent.isComposing) return false;
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && count) {
        setActive((i) => (i + (e.key === "ArrowRight" ? 1 : count - 1)) % count);
      } else if ((e.key === "Enter" && !e.shiftKey) || (e.key === "Tab" && count)) {
        pick(Math.min(active, count - 1));
      } else if (e.key === "Escape") {
        setDismissed(text);
      } else return false;
      e.preventDefault();
      return true;
    },
    submit() {
      if (!shown) return false;
      pick(Math.min(active, count - 1));
      return true;
    },
  }));

  if (!shown) return null;
  const unavailable = gifs.error instanceof SixApiError && gifs.error.code === "GIFS_UNAVAILABLE";
  const notice = names.length
    ? null
    : choices
      ? waiting
        ? tr.common.loading
        : null
      : unavailable
      ? tr.composer.gifsUnavailable
      : gifs.isError
        ? kind === "sticker"
          ? tr.composer.couldNotLoadStickers
          : tr.composer.couldNotLoadGifs
        : !gifs.data
          ? tr.common.loading
          : items.length
            ? null
            : kind === "sticker"
              ? tr.composer.noStickersFound
              : tr.composer.noGifs;
  const option = (i: number) => ({
    role: "option",
    "aria-selected": i === active,
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onMouseEnter: () => setActive(i),
    onClick: () => pick(i),
  });

  return (
    <div
      className={`absolute bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800 ${
        search === null ? "w-fit max-w-full" : "w-full"
      }`}
    >
      {names.length ? (
        <div role="listbox" aria-label={tr.composer.commands} className="max-h-52 overflow-y-auto overscroll-contain p-1">
          {names.map((name, i) => (
            <button
              key={name}
              type="button"
              {...option(i)}
              ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
              className={`flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                i === active ? "bg-stone-100 dark:bg-stone-800" : ""
              }`}
            >
              <span className="font-medium">/{name}</span>
              <span className="truncate text-stone-500">{tr.composer.commandHints[name]}</span>
            </button>
          ))}
        </div>
      ) : notice ? (
        <p className="px-3 py-4 text-center text-sm text-stone-400">{notice}</p>
      ) : choices && run ? (
        <div role="listbox" aria-label={tr.composer.commandHints[run.name]} className="flex gap-1 overflow-x-auto p-1">
          {choices.map((c, i) => (
            <button
              key={c.key}
              type="button"
              {...option(i)}
              title={c.title}
              aria-current={c.current || undefined}
              className={`shrink-0 rounded-lg ${c.emoji ? "grid size-10 place-items-center text-2xl" : "px-3 py-2 text-sm"} ${
                i === active ? "bg-stone-100 dark:bg-stone-800" : ""
              } ${c.current ? "font-semibold text-brand" : ""}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div role="listbox" aria-label={tr.composer.pickerTabs[kind]} className="flex gap-1 overflow-x-auto p-1">
            {items.map((g, i) => (
              <button
                key={g.id}
                type="button"
                {...option(i)}
                ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
                title={g.title}
                className={`h-24 shrink-0 overflow-hidden rounded-lg ${kind === "sticker" ? "" : "bg-stone-100 dark:bg-stone-800"} ${
                  i === active ? "ring-2 ring-brand ring-inset" : ""
                }`}
                style={{ aspectRatio: `${g.width} / ${g.height}` }}
              >
                <img
                  src={g.previewUrl}
                  alt={g.title}
                  draggable={false}
                  className={`size-full ${kind === "sticker" ? "object-contain" : "object-cover"}`}
                />
              </button>
            ))}
          </div>
          <p className="px-3 pb-1 text-[11px] text-stone-400">{tr.composer.poweredByGiphy}</p>
        </>
      )}
    </div>
  );
}
