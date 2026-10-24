import { type ChatTheme, chatTheme, DOODLES, type DoodleNode, WALLPAPER_LAYOUT, WALLPAPER_TILE } from "@six/shared";
import { memo } from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, Rect, Stop } from "react-native-svg";
import { useChatTheme } from "@/lib/chat-themes";
import { useTheme } from "@/lib/theme";

function Doodle({ nodes }: { nodes: DoodleNode[] }) {
  return (
    <>
      {nodes.map((n, i) =>
        n[0] === "path" ? (
          <Path key={i} d={n[1].d} />
        ) : n[0] === "circle" ? (
          <Circle key={i} cx={n[1].cx} cy={n[1].cy} r={n[1].r} />
        ) : (
          <Rect key={i} x={n[1].x} y={n[1].y} width={n[1].width} height={n[1].height} rx={n[1].rx} />
        ),
      )}
    </>
  );
}

/** The chat wallpaper: a soft gradient with a tiled pattern of snack-bar doodles. */
export const Wallpaper = memo(function Wallpaper({ theme, dark, id }: { theme: ChatTheme; dark: boolean; id: string }) {
  const w = dark ? theme.dark : theme.light;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={w.colors[0]} />
          <Stop offset="0.5" stopColor={w.colors[1]} />
          <Stop offset="1" stopColor={w.colors[2]} />
        </LinearGradient>
        {w.inkOpacity > 0 && (
          <Pattern id={`${id}-doodles`} width={WALLPAPER_TILE} height={WALLPAPER_TILE} patternUnits="userSpaceOnUse">
            <G fill="none" stroke={w.ink} strokeOpacity={w.inkOpacity} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              {WALLPAPER_LAYOUT.map(([name, x, y, scale, rotate], i) =>
                DOODLES[name] ? (
                  <G key={i} transform={`translate(${x} ${y}) rotate(${rotate} 12 12) scale(${scale})`}>
                    <Doodle nodes={DOODLES[name]} />
                  </G>
                ) : null,
              )}
            </G>
          </Pattern>
        )}
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id}-bg)`} />
      {w.inkOpacity > 0 && <Rect width="100%" height="100%" fill={`url(#${id}-doodles)`} />}
    </Svg>
  );
});

/** The wallpaper behind a chat: its shared background if one is set, otherwise your default. */
export function ChatBackground({ themeId }: { themeId: string | null }) {
  const fallback = useChatTheme();
  const theme = themeId ? chatTheme(themeId) : fallback;
  const t = useTheme();
  return <Wallpaper theme={theme} dark={t.dark} id="chat" />;
}
