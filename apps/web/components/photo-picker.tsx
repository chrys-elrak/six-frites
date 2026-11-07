"use client";

import type { Gender } from "@six/shared";
import { Camera, Shuffle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { suggestAvatars, suggestFoods } from "@/lib/avatar-suggestions";
import { useT } from "@/lib/i18n";
import { toAvatarDataUrl, urlToAvatarDataUrl } from "@/lib/image";
import { Avatar } from "./avatar";

/** A round photo to tap for a file, with a row of generated pictures to pick from instead; hands back a data URL. With a `kind` (foods, or heads of a girl or a boy), the first picture is picked straight away when there's no photo yet, and again when the kind changes unless a file was chosen. */
export function PhotoPicker({
  name,
  photo,
  onChange,
  kind,
  ring,
}: {
  name: string;
  photo: string | null;
  onChange: (dataUrl: string) => void;
  kind?: "food" | Gender;
  ring?: string;
}) {
  const tr = useT();
  const file = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (pick: boolean) =>
    void (kind === "food" ? Promise.resolve(suggestFoods(5)) : suggestAvatars(5, kind))
      .then((list) => {
        setSuggestions(list);
        if (pick && list[0]) void use(() => urlToAvatarDataUrl(list[0]!), list[0]);
      })
      .catch(() => setSuggestions([]));
  useEffect(() => load(!!kind && (!photo || picked !== null)), [kind]);

  async function use(make: () => Promise<string>, src: string | null) {
    setError(null);
    try {
      onChange(await make());
      setPicked(src);
    } catch {
      setError(src ? tr.contacts.couldNotUsePicture : tr.common.couldNotReadImage);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => file.current?.click()}
        className="group relative rounded-full"
        style={ring ? { boxShadow: `0 0 0 3px ${ring}` } : undefined}
        aria-label={tr.contacts.choosePhoto}
      >
        <Avatar user={{ displayName: name || "?", avatarUrl: photo }} size="lg" />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100">
          <Camera className="size-6" />
        </span>
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void use(() => toAvatarDataUrl(f), null);
        }}
      />
      {suggestions.length > 0 && (
        <div className="flex items-center gap-2">
          {suggestions.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => void use(() => urlToAvatarDataUrl(src), src)}
              aria-label={tr.contacts.usePicture}
              aria-pressed={picked === src}
              className={`size-10 overflow-hidden rounded-full ring-offset-2 transition hover:scale-105 dark:ring-offset-stone-900 ${
                picked === src ? "ring-2 ring-brand" : ""
              }`}
            >
              <img src={src} alt="" className="size-full" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => load(false)}
            aria-label={tr.contacts.shuffle}
            className="grid size-10 place-items-center rounded-full text-brand hover:bg-brand/10"
          >
            <Shuffle className="size-5" />
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
