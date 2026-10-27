"use client";

import { useEffect, useRef, useState } from "react";
import { getT } from "./i18n";

const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
const MAX_MS = 10 * 60 * 1000;

export interface Recording {
  blob: Blob;
  mime: string;
  durationMs: number;
}

/** Records a voice note with MediaRecorder, picking a format the browser supports. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const finish = useRef<((r: Recording | null) => void) | null>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= MAX_MS) recorder.current?.stop();
    }, 200);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  /** Resolves true once recording, false if the microphone couldn't be opened. */
  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = (rec.mimeType || mimeType || "audio/webm").split(";")[0]!;
        const durationMs = Date.now() - startedAt.current;
        setRecording(false);
        finish.current?.(
          chunks.current.length ? { blob: new Blob(chunks.current, { type: mime }), mime, durationMs } : null,
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
