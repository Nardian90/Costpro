'use client';

import { MotionConfig } from 'framer-motion';

/**
 * FIX-UX-003 through UX-012: Global motion configuration.
 *
 * Wrapping the app with this provider tells framer-motion to respect
 * the user's OS-level prefers-reduced-motion setting. This is a GLOBAL
 * fix that replaces the need to call useReducedMotion() individually
 * in 30+ components.
 *
 * framer-motion v12+ supports:
 *   reducedMotion: "always" | "never" | "user"
 * "user" = respect prefers-reduced-motion media query (the correct default).
 */
export function MotionPreferencesProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
