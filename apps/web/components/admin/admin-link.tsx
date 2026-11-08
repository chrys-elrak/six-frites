"use client";

import { ShieldCheck } from "lucide-react";
import { useIsAdmin } from "@/lib/admin";

export function AdminLink() {
  const admin = useIsAdmin();
  if (!admin.data) return null;
  return (
    <a
      href="/admin"
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 rounded-2xl bg-surface backdrop-blur-md px-4 py-3 text-sm font-medium shadow-sm ring-1 ring-surface-line hover:bg-white/80 dark:hover:bg-stone-800/70"
    >
      <ShieldCheck className="size-5 text-brand" />
      Moderation
    </a>
  );
}
