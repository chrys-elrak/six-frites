import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";
import { encode } from "uqr";
import { useT } from "@/lib/i18n";

export function QrCode({ value, size }: { value: string; size: number }) {
  const tr = useT();
  const { modules, path } = useMemo(() => {
    const { size: modules, data } = encode(value, { ecc: "M", border: 2 });
    let d = "";
    data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
    return { modules, path: d };
  }, [value]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${modules} ${modules}`} accessibilityLabel={tr.contacts.qrCode}>
      <Rect width={modules} height={modules} fill="#fff" />
      <Path d={path} fill="#1c1917" />
    </Svg>
  );
}
