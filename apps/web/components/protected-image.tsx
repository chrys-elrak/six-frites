import type { CSSProperties } from "react";

const block = (e: { preventDefault: () => void }) => e.preventDefault();

/** Props that stop the browser's own "save" paths on a media element: context menu and drag. */
export const noSave = { onContextMenu: block, onDragStart: block, draggable: false } as const;

/**
 * Shows a picture the way Instagram does: as a CSS background under a transparent shield, so there is
 * no <img> to right-click, drag or long-press and "Save image as". It only makes saving harder; the
 * file is still reachable through the browser's developer tools.
 */
export function ProtectedImage({
  src,
  fit = "cover",
  className = "",
  style,
}: {
  src: string;
  fit?: "cover" | "contain";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      role="img"
      {...noSave}
      className={`relative select-none [-webkit-touch-callout:none] ${className}`}
      style={{
        backgroundImage: `url("${src.replace(/"/g, "%22")}")`,
        backgroundSize: fit,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        ...style,
      }}
    >
      <div className="absolute inset-0" {...noSave} />
    </div>
  );
}
