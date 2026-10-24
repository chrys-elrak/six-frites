import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

export function Logo({ size = 64 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 64 64" width={size} height={size} accessibilityLabel="Six Frites">
      <Defs>
        <LinearGradient id="six-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFB547" />
          <Stop offset="1" stopColor="#F2711C" />
        </LinearGradient>
        <LinearGradient id="six-box" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E63B2E" />
          <Stop offset="1" stopColor="#B91C1C" />
        </LinearGradient>
      </Defs>
      <Rect width="64" height="64" rx="16" fill="url(#six-bg)" />
      <G fill="#FFE7A3">
        <Rect x="18.5" y="13" width="6" height="25" rx="3" rotation={-12} origin="21.5, 25.5" />
        <Rect x="25.5" y="9.5" width="6" height="28" rx="3" rotation={-4} origin="28.5, 23.5" />
        <Rect x="32.5" y="10.5" width="6" height="27" rx="3" rotation={5} origin="35.5, 24" />
        <Rect x="39" y="14" width="6" height="24" rx="3" rotation={13} origin="42, 26" />
      </G>
      <G fill="#FFD25E">
        <Rect x="22.5" y="16" width="5" height="22" rx="2.5" rotation={-7} origin="25, 27" />
        <Rect x="36" y="15" width="5" height="23" rx="2.5" rotation={9} origin="38.5, 26.5" />
      </G>
      <Path d="M15 31.5Q32 38 49 31.5L45 51.5Q44.5 54 42 54H22Q19.5 54 19 51.5Z" fill="url(#six-box)" />
      <Path
        d="M17.6 36.2Q32 41.5 46.4 36.2"
        stroke="#FFF"
        strokeOpacity={0.28}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}
