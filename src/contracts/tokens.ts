/**
 * Design Tokens for CostPro Platform
 * Source of Truth: src/app/globals.css
 */

export const DESIGN_TOKENS = {
  colors: {
    primary: 'var(--cp-primary)',
    onPrimary: 'var(--cp-on-primary)',
    background: 'var(--cp-background)',
    foreground: 'var(--cp-foreground)',
    surface: 'var(--cp-surface)',
    onSurface: 'var(--cp-on-surface)',
    surfaceVariant: 'var(--cp-surface-variant)',
    onSurfaceVariant: 'var(--cp-on-surface-variant)',
    border: 'var(--cp-border)',
    outline: 'var(--cp-outline)',
    error: 'var(--cp-error)',
  },
  fonts: {
    sans: 'var(--font-inter)',
    mono: 'var(--font-geist-mono)',
    headline: 'var(--font-inter)',
    label: 'var(--font-space-grotesk)',
  }
} as const;

export type DesignTokenColor = keyof typeof DESIGN_TOKENS.colors;
export type DesignTokenFont = keyof typeof DESIGN_TOKENS.fonts;
