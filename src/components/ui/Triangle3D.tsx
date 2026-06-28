'use client';

/**
 * Triangle3D — Simple SVG triangle with 3D illusion (no CSS 3D transforms).
 *
 * Replaces the previous CSS 3D version that was invisible in dark theme due
 * to z-index/transform/opacity issues. SVG guarantees visibility because
 * it's a single inline element with explicit colors.
 *
 * Design: isometric pyramid with 3 visible faces (front, left, right).
 * Each face uses a different shade of the primary color to create depth.
 * No animation (per user request).
 *
 * The SVG uses `currentColor` and `hsl(var(--primary))` so it adapts to
 * light/dark mode automatically.
 */
export function Triangle3D({ size = 32 }: { size?: number } = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {/* Ground shadow */}
      <ellipse
        cx="20"
        cy="33"
        rx="14"
        ry="2"
        fill="hsl(var(--primary))"
        opacity="0.15"
        filter="blur(1px)"
      />

      {/* Left face — darker shade */}
      <path
        d="M20 4 L4 30 L20 30 Z"
        fill="hsl(var(--primary))"
        opacity="0.55"
      />

      {/* Right face — medium shade */}
      <path
        d="M20 4 L36 30 L20 30 Z"
        fill="hsl(var(--primary))"
        opacity="0.75"
      />

      {/* Front face — full color (visible bottom edge) */}
      <path
        d="M4 30 L36 30 L20 32 Z"
        fill="hsl(var(--primary))"
        opacity="0.9"
      />

      {/* Highlight on top vertex */}
      <circle
        cx="20"
        cy="4"
        r="1.5"
        fill="hsl(var(--primary))"
        opacity="1"
      />
    </svg>
  );
}
