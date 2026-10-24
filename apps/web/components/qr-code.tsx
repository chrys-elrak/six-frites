import { useMemo } from "react";
import { encode } from "uqr";

export function QrCode({ value, className = "" }: { value: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const { size, data } = encode(value, { ecc: "M", border: 2 });
    let d = "";
    data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
    return { size, path: d };
  }, [value]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label="QR code" className={className}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#1c1917" />
    </svg>
  );
}
