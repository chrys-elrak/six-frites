import type { ComponentProps } from "react";
import { Text as RNText, TextInput as RNTextInput } from "react-native";
import { usePlainFont } from "@/lib/font";

const plain = { fontFamily: "Inter" };

/** React Native's Text, in Inter when the plain font is on. A fontFamily in the style still wins. */
export function Text({ style, ...props }: ComponentProps<typeof RNText>) {
  const on = usePlainFont((s) => s.on);
  return <RNText {...props} style={on ? [plain, style] : style} />;
}

export function TextInput({ style, ...props }: ComponentProps<typeof RNTextInput>) {
  const on = usePlainFont((s) => s.on);
  return <RNTextInput {...props} style={on ? [plain, style] : style} />;
}
