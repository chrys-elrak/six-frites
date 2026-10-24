"use client";

import { Camera, RefreshCw, X } from "lucide-react";
import { useEffect } from "react";
import { useCamera } from "@/lib/camera";

export function CameraDialog({ onClose, onCapture }: { onClose: () => void; onCapture: (file: File) => void }) {
  const cam = useCamera("environment");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function shoot() {
    const v = cam.video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (cam.facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) =>
        blob &&
        onCapture(new File([blob], `photo-${new Date().toISOString().slice(0, 19)}.jpg`, { type: "image/jpeg" })),
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal aria-label="Take a photo">
      <div className="flex items-center justify-between p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
        >
          <X className="size-6" />
        </button>
        {cam.canSwitch && (
          <button
            onClick={cam.switchCamera}
            aria-label="Switch camera"
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <RefreshCw className="size-5" />
          </button>
        )}
      </div>
      <div className="grid min-h-0 flex-1 place-items-center">
        {cam.error ? (
          <p className="max-w-xs text-center text-sm text-white/80">{cam.error}</p>
        ) : (
          <video
            ref={cam.video}
            muted
            playsInline
            className={`max-h-full max-w-full object-contain ${cam.facing === "user" ? "-scale-x-100" : ""}`}
          />
        )}
      </div>
      <div className="grid place-items-center p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          onClick={shoot}
          disabled={!cam.stream}
          aria-label="Take photo"
          className="grid size-18 place-items-center rounded-full border-4 border-white bg-white/20 text-white transition active:scale-95 disabled:opacity-40"
        >
          <Camera className="size-7" />
        </button>
      </div>
    </div>
  );
}
