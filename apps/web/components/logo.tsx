export function Logo({ className = "size-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Six Frites">
      <defs>
        <linearGradient id="six-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB547" />
          <stop offset="1" stopColor="#F2711C" />
        </linearGradient>
        <linearGradient id="six-box" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E63B2E" />
          <stop offset="1" stopColor="#B91C1C" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#six-bg)" />
      <g fill="#FFE7A3">
        <rect x="18.5" y="13" width="6" height="25" rx="3" transform="rotate(-12 21.5 25.5)" />
        <rect x="25.5" y="9.5" width="6" height="28" rx="3" transform="rotate(-4 28.5 23.5)" />
        <rect x="32.5" y="10.5" width="6" height="27" rx="3" transform="rotate(5 35.5 24)" />
        <rect x="39" y="14" width="6" height="24" rx="3" transform="rotate(13 42 26)" />
      </g>
      <g fill="#FFD25E">
        <rect x="22.5" y="16" width="5" height="22" rx="2.5" transform="rotate(-7 25 27)" />
        <rect x="36" y="15" width="5" height="23" rx="2.5" transform="rotate(9 38.5 26.5)" />
      </g>
      <path d="M15 31.5Q32 38 49 31.5L45 51.5Q44.5 54 42 54H22Q19.5 54 19 51.5Z" fill="url(#six-box)" />
      <path d="M17.6 36.2Q32 41.5 46.4 36.2" stroke="#FFF" strokeOpacity=".28" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
