"use client";

import { useEffect, useRef, useState } from "react";
import { getT } from "./i18n";
import { withVoiceEffect } from "./voice-fx";

const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
const MAX_MS = 10 * 60 * 1000;

export interface Recording {
  blob: Blob;
  mime: string;
  durationMs: number;
  disguised: boolean;
}

/**
 * Records a voice note with MediaRecorder, picking a format the browser supports, through the chosen voice effect
 * unless `raw`. At `maxMs` it stops on its own and hands the recording to `onLimit`.
 */
export function useRecorder({
  maxMs = MAX_MS,
  bitsPerSecond,
  raw = false,
  onLimit,
}: { maxMs?: number; bitsPerSecond?: number; raw?: boolean; onLimit?: (r: Recording | null) => void } = {}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const finish = useRef<((r: Recording | null) => void) | null>(null);
  const release = useRef<(() => void) | null>(null);
  const limit = useRef(onLimit);
  limit.current = onLimit;

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= maxMs) void stop().then((r) => r && limit.current?.(r));
    }, 200);
    return () => clearInterval(t);
  }, [recording, maxMs]);

  useEffect(() => () => release.current?.(), []);

  /** Resolves true once recording, false if the microphone couldn't be opened. */
  async function start() {
    setError(null);
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      const fx = raw
        ? { stream: input, stop: () => input.getTracks().forEach((t) => t.stop()), disguised: false }
        : await withVoiceEffect(input);
      release.current = fx.stop;
      const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(fx.stream, { mimeType, audioBitsPerSecond: bitsPerSecond });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        fx.stop();
        const mime = (rec.mimeType || mimeType || "audio/webm").split(";")[0]!;
        const durationMs = Date.now() - startedAt.current;
        setRecording(false);
        finish.current?.(
          chunks.current.length
            ? { blob: new Blob(chunks.current, { type: mime }), mime, durationMs, disguised: fx.disguised }
            : null,
        );
        finish.current = null;
      };
      recorder.current = rec;
      startedAt.current = Date.now();
      setElapsed(0);
      rec.start(250);
      setRecording(true);
      return true;
    } catch {
      setError(getT().composer.micDenied);
      return false;
    }
  }

  function stop(): Promise<Recording | null> {
    return new Promise((resolve) => {
      if (!recorder.current || recorder.current.state === "inactive") return resolve(null);
      finish.current = resolve;
      recorder.current.stop();
    });
  }

  function cancel() {
    finish.current = () => undefined;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  return { recording, elapsed, error, start, stop, cancel };
}
