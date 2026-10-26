"use client";

import { SixApiError, unwrap } from "@six/sdk";
import type { UpdateMeInput } from "@six/shared";
import { useMutation } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { toAvatarDataUrl } from "@/lib/image";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { Card } from "./ui";

export function ProfileCard() {
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [name, setName] = useState(user.displayName);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: async (body: UpdateMeInput) => unwrap(await six.api.PATCH("/v1/me", { body })),
    onSuccess: setUser,
    onError: (err) => setError(err instanceof SixApiError ? err.message : "Couldn't save. Try again."),
  });

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      save.mutate({ photo: await toAvatarDataUrl(f) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that image.");
    }
  }

  const dirty = name.trim() !== user.displayName && name.trim().length > 0;

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={save.isPending}
          className="group relative shrink-0 rounded-full"
          aria-label="Change your photo"
        >
          <Avatar user={user} size="md" />
          <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-brand text-brand-ink ring-2 ring-white transition group-hover:scale-110 dark:ring-stone-900">
            <Camera className="size-4" />
          </span>
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <form
          className="min-w-0 flex-1 space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) save.mutate({ displayName: name.trim() });
          }}
        >
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              aria-label="Display name"
              className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-lg font-medium outline-none ring-stone-300 focus:ring-2 dark:ring-stone-700"
            />
            {dirty && (
              <button
                disabled={save.isPending}
                className="rounded-lg bg-stone-900 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
              >
                Save
              </button>
            )}
          </div>
          <p className="truncate px-2 text-sm text-stone-500 dark:text-stone-400">{user.email}</p>
        </form>
      </div>
      {user.avatarUrl && (
        <button
          type="button"
          onClick={() => save.mutate({ photo: null })}
          disabled={save.isPending}
          className="text-sm font-medium text-red-600 disabled:opacity-50 dark:text-red-400"
        >
          Remove photo
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </Card>
  );
}
