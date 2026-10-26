"use client";

import { useEffect, useRef, useState } from "react";
import { getT } from "./i18n";

export type Facing = "user" | "environment";

/** Streams the camera into a <video>, restarting when the facing mode changes and stopping on unmount. */
export function useCamera(initial: Facing, opts: { audio?: boolean; square?: boolean } = {}) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState(initial);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canSwitch, setCanSwitch] = useState(false);

  useEffect(() => {
    let active: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    navigator.mediaDevices
      .getUserMedia({
        audio: opts.audio ?? false,
        video: {
          facingMode: facing,
          width: { ideal: opts.square ? 720 : 1920 },
          height: { ideal: opts.square ? 720 : 1080 },
        },
      })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        active = s;
        setStream(s);
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        setCanSwitch(cams.length > 1);
      })
      .catch(() => setError(getT().composer.noCamera));
    return () => {
      cancelled = true;
      active?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [facing, opts.audio, opts.square]);

  return {
    video,
    stream,
    error,
    facing,
    canSwitch,
    switchCamera: () => setFacing((f) => (f === "user" ? "environment" : "user")),
  };
}

export const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
