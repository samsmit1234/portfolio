/** Nadi mark: a speech bubble with signal arcs — the order that calls you. */
export function BrandMark({
  size = 32,
  color = "currentColor",
  accent = "#0e0d0b",
}: {
  size?: number;
  color?: string;
  accent?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M32 8c-11.6 0-21 8.3-21 18.6 0 6.3 3.5 11.8 8.9 15.2L17 54l11.4-7.8c1.2.2 2.4.3 3.6.3 11.6 0 21-8.3 21-18.6S43.6 8 32 8Z"
        fill={color}
      />
      <circle cx="32" cy="27" r="5" fill={accent} />
      <path d="M22.5 19.5a13 13 0 0 0 0 15" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M41.5 19.5a13 13 0 0 1 0 15" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
