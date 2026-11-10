"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders overlays into <body>. Without it, a full-screen dialog opened from inside an element with
 * a backdrop filter or transform (like the blurred composer) is positioned against that element
 * instead of the window, and its buttons can end up inside the composer's form.
 *
 * When the overlay is a modal (aria-modal), everything else on the page goes inert while it's open, so the
 * text box behind loses focus and can't be typed in; focus comes back to it when the modal closes, or turns into
 * something that isn't one, like a call shrunk to its pill.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [before] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const [modal, setModal] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setModal(!!wrap.current?.querySelector(":scope > [aria-modal]")));

  useEffect(() => {
    const el = wrap.current;
    if (!el || !modal) return;
    const others = [...document.body.children].filter((c): c is HTMLElement => c !== el && c instanceof HTMLElement && !c.inert);
    for (const c of others) c.inert = true;
    if (!el.contains(document.activeElement)) (document.activeElement as HTMLElement | null)?.blur();
    return () => {
      for (const c of others) c.inert = false;
      if (before?.isConnected && !before.closest("[inert]") && matchMedia("(pointer: fine)").matches) before.focus({ preventScroll: true });
    };
  }, [modal]);

  return mounted ? createPortal(<div ref={wrap} className="contents">{children}</div>, document.body) : null;
}
