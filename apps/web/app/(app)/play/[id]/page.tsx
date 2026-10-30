"use client";

import { use } from "react";
import { LiveRoom } from "@/components/live-room";

export default function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <LiveRoom key={id} roomId={id} />;
}
