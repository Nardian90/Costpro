'use client';

import { useEffect, useSyncExternalStore, useCallback } from 'react';
import { useTheme } from 'next-themes';

const emptySubscribe = () => () => {};

export type UIMode = 'performance' | 'enhanced';

const STORAGE_KEY = 'costpro-ui-storage';
const MODE_KEY = 'costpro-mode';

/**
 * IntelligentThemeHandler
 * 
 * Manages two independent dimensions:
 * 1. Theme: light / dark (via next-themes)
 * 2. Mode: performance / enhanced (via CSS class on <html>)
 * 
 * Activation rules:
 * - prefers-reduced-motion → forces .mode-performance
 * - Manual override via .mode-performance or .mode-enhanced on <html>
 * - Stored in localStorage for persistence
 * - Connectivity data attribute maintained for backward compat
 */
export default function IntelligentThemeHandler() {
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  /** Get stored mode from localStorage */
  const getStoredMode = useCallback((): UIMode | null => {
    if (typeof window === 'undefined') return null;
    try {
      return (localStorage.getItem(MODE_KEY) as UIMode) || null;
    } catch {
      return null;
    }
  }, []);

  /** Apply mode class to <html> */
  const applyMode = useCallback((mode: UIMode) => {
    const html = document.documentElement;
    html.classList.remove('mode-performance', 'mode-enhanced');
    html.classList.add(`mode-${mode}`);
  }, []);

  /** Check if user prefers reduced motion */
  const prefersReducedMotion = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // ── Initialize mode on mount ──
  useEffect(() => {
    if (!mounted) return;

    // 1. Apply connectivity data attribute (backward compat)
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const connectivity = stored?.state?.connectivity || '4g';
      document.documentElement.setAttribute('data-connectivity', connectivity);
    } catch {}

    // 2. Initialize mode
    // Priority: prefers-reduced-motion > stored preference > default (enhanced)
    if (prefersReducedMotion()) {
      applyMode('performance');
      localStorage.setItem(MODE_KEY, 'performance');
    } else {
      const storedMode = getStoredMode();
      if (storedMode) {
        applyMode(storedMode);
      } else {
        // Default to enhanced for new users
        applyMode('enhanced');
        localStorage.setItem(MODE_KEY, 'enhanced');
      }
    }

    // 3. Listen for prefers-reduced-motion changes
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        applyMode('performance');
      } else {
        const stored = getStoredMode();
        applyMode(stored || 'enhanced');
      }
    };

    motionQuery.addEventListener('change', handleMotionChange);
    return () => motionQuery.removeEventListener('change', handleMotionChange);
  }, [mounted, applyMode, getStoredMode, prefersReducedMotion]);

  // ── Sync resolved theme on mount ──
  useEffect(() => {
    if (!mounted || !resolvedTheme) return;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const currentPref = stored?.state?.themePreference;
      // No-op: theme sync is handled by next-themes
    } catch {}
  }, [mounted, resolvedTheme]);

  return null;
}

/** Utility: Toggle mode (for use in components) */
export function toggleUIMode(): UIMode {
  const current = (localStorage.getItem(MODE_KEY) as UIMode) || 'enhanced';
  const next: UIMode = current === 'performance' ? 'enhanced' : 'performance';
  
  const html = document.documentElement;
  html.classList.remove('mode-performance', 'mode-enhanced');
  html.classList.add(`mode-${next}`);
  
  // Respect manual override over prefers-reduced-motion
  
  localStorage.setItem(MODE_KEY, next);
  return next;
}

/** Utility: Get current mode */
export function getCurrentUIMode(): UIMode {
  if (typeof window === 'undefined') return 'enhanced';
  const stored = localStorage.getItem(MODE_KEY) as UIMode | null;
  if (stored) return stored;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'performance';
  return 'enhanced';
}
