"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders overlays into <body>. Without it, a full-screen dialog opened from inside an element with
 * a backdrop filter or transform (like the blurred composer) is positioned against that element
 * instead of the window, and its buttons can end up inside the composer's form.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
