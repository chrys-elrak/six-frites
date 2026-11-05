"use client";

import { createPortal } from "react-dom";
import { create } from "zustand";

const useBrandSlot = create<{ el: HTMLElement | null }>(() => ({ el: null }));

export const setBrandSlot = (el: HTMLElement | null) => useBrandSlot.setState({ el });

/** Shows the open tab's buttons in the top bar, next to the app name. */
export function BrandActions({ children }: { children: React.ReactNode }) {
  const el = useBrandSlot((s) => s.el);
  return el && createPortal(children, el);
}
