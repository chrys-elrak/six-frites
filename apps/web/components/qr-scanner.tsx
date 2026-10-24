"use client";

import { useEffect } from "react";
import { useCamera } from "@/lib/camera";

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

export const canScanQr = () => typeof window !== "undefined" && !!window.BarcodeDetector;

export function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const cam = useCamera("environment", { square: true });

  useEffect(() => {
    if (!cam.stream || !window.BarcodeDetector) return;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    let done = false;
    const timer = setInterval(async () => {
      const video = cam.video.current;
      if (done || !video?.videoWidth) return;
      const [code] = await detector.detect(video).catch(() => []);
      if (code && !done) {
        done = true;
        onScan(code.rawValue);
      }
    }, 250);
    return () => {
      done = true;
      clearInterval(timer);
    };
  }, [cam.stream, cam.video, onScan]);

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-black">
      {cam.error ? (
        <p className="grid h-full place-items-center p-6 text-center text-sm text-white/80">{cam.error}</p>
      ) : (
        <>
          <video ref={cam.video} muted playsInline className="size-full object-cover" />
          <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/80" />
        </>
      )}
    </div>
  );
}
