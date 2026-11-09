"use client";

import { useT } from "@/lib/i18n";

export default function Loading() {
  const tr = useT();
  return <div className="grid h-full place-items-center text-sm text-stone-500">{tr.common.loading}</div>;
}
