"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useIsAdmin } from "@/lib/admin";

export function AdminLink() {
  const admin = useIsAdmin();
  if (!admin.data) return null;
  return (
    <Link
      href="/admin"
      className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-medium shadow-sm ring-1 ring-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:ring-stone-800 dark:hover:bg-stone-800"
    >
      <ShieldCheck className="size-5 text-brand" />
      Moderation
    </Link>
  );
}
