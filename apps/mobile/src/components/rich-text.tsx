import type { EntityType } from "@six/shared";
import type { TextStyle } from "react-native";

export function styleFor(styles: Set<EntityType>, codeBg: string): TextStyle {
  return {
    ...(styles.has("bold") && { fontWeight: "700" }),
    ...(styles.has("italic") && { fontStyle: "italic" }),
    ...(styles.has("strike") && { textDecorationLine: "line-through" }),
    ...(styles.has("code") && { fontFamily: "monospace", fontSize: 14, backgroundColor: codeBg }),
  };
}
