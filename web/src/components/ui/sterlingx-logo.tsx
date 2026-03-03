/**
 * SterlingX brand logo mark — the "X" symbol.
 * Uses Midnight Blue (#193762) for the left strokes and
 * Horizon Blue (#4180C2) for the right accent strokes.
 */
export function SterlingXMark({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="SterlingX"
    >
      {/* Left strokes — Midnight Blue */}
      <path
        d="M6 4L16 16L6 28"
        stroke="#193762"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right strokes — Horizon Blue */}
      <path
        d="M26 4L16 16L26 28"
        stroke="#4180C2"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full SterlingX logotype with X mark + wordmark.
 */
export function SterlingXLogo({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <SterlingXMark size={size} />
      <span
        className="font-heading font-bold tracking-tight text-text-primary"
        style={{ fontSize: size * 0.65 }}
      >
        SterlingX
      </span>
    </div>
  );
}
