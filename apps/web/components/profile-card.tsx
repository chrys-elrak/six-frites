"use client";

import { unwrap } from "@six/sdk";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { Card } from "./ui";

export function ProfileCard() {
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [name, setName] = useState(user.displayName);

  const save = useMutation({
    mutationFn: async () => unwrap(await six.api.PATCH("/v1/me", { body: { displayName: name.trim() } })),
    onSuccess: setUser,
  });

  const dirty = name.trim() !== user.displayName && name.trim().length > 0;

  return (
    <Card className="flex items-center gap-4 p-4">
      <Avatar user={user} size="md" />
      <form
        className="min-w-0 flex-1 space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save.mutate();
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
    </Card>
  );
}
