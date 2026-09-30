'use client';

import { useEffect, useSyncExternalStore, useCallback } from 'react';
import { useTheme } from 'next-themes';

const emptySubscribe = () => () => {};

export type UIMode = 'performance' | 'enhanced';

const STORAGE_KEY = 'costpro-ui-storage';
const MODE_KEY = 'costpro-mode';
const MANUAL_OVERRIDE_KEY = 'costpro-mode-manual-override';

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

  /** Check if user has manually overridden mode */
  const hasManualOverride = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(MANUAL_OVERRIDE_KEY) === 'true';
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
      // FIX-BUG: Use .dataset instead of setAttribute (CodeQL recommendation)
      document.documentElement.dataset.connectivity = connectivity;
    } catch {}

    // 2. Initialize mode
    // Priority: manual override > stored preference > DEFAULT (performance)
    // CAMBIO 6 (HOME/SALES/PERFORMANCE DEFAULTS): el default del sistema es
    // Modo Performance. GATE 8 — REGLA DE PERSISTENCIA:
    //   NO EXISTE preferencia  → Dark + Performance (nuevo default)
    //   EXISTE preferencia     → respetar (stored/manual override)
    // prefers-reduced-motion solo refuerza el default para nuevos usuarios;
    // el toggle manual SIEMPRE gana.
    if (hasManualOverride()) {
      const storedMode = getStoredMode();
      if (storedMode) {
        applyMode(storedMode);
      } else {
        applyMode('performance');
        localStorage.setItem(MODE_KEY, 'performance');
      }
    } else if (prefersReducedMotion()) {
      const storedMode = getStoredMode();
      if (storedMode) {
        applyMode(storedMode);
      } else {
        applyMode('performance');
        localStorage.setItem(MODE_KEY, 'performance');
      }
    } else {
      const storedMode = getStoredMode();
      if (storedMode) {
        applyMode(storedMode);
      } else {
        // Default para nuevos usuarios: Modo Performance (CAMBIO 6)
        applyMode('performance');
        localStorage.setItem(MODE_KEY, 'performance');
      }
    }

    // 3. Listen for prefers-reduced-motion changes
    //    Only auto-switch if user hasn't manually overridden
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent) => {
      if (hasManualOverride()) return; // User chose manually, respect their choice
      if (e.matches) {
        applyMode('performance');
        localStorage.setItem(MODE_KEY, 'performance');
      } else {
        const stored = getStoredMode();
        applyMode(stored || 'performance');
      }
    };

    motionQuery.addEventListener('change', handleMotionChange);
    return () => motionQuery.removeEventListener('change', handleMotionChange);
  }, [mounted, applyMode, getStoredMode, hasManualOverride, prefersReducedMotion]);

  // ── Re-sync defensivo del MODO (GATE 10 — fuente única de verdad) ──
  // El modo se inicializa UNA vez al boot. Si algo externo muta la clase de
  // <html> mientras tanto (p. ej. una superficie que fuerza branding), este
  // re-sync al volver a la pestaña re-aplica el estado persistido y garantiza:
  // estado visual == estado persistido == lo que muestra el toggle.
  useEffect(() => {
    if (!mounted) return;
    const resync = () => {
      const storedMode = getStoredMode();
      if (!storedMode) return;
      const html = document.documentElement;
      const isApplied = html.classList.contains(`mode-${storedMode}`);
      const isOther = html.classList.contains('mode-performance') || html.classList.contains('mode-enhanced');
      if (!isApplied && isOther) applyMode(storedMode);
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
    };
  }, [mounted, applyMode, getStoredMode, hasManualOverride]);

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
  // CAMBIO 6: fallback = default del sistema (performance)
  const current = (localStorage.getItem(MODE_KEY) as UIMode) || 'performance';
  const next: UIMode = current === 'performance' ? 'enhanced' : 'performance';
  
  const html = document.documentElement;
  html.classList.remove('mode-performance', 'mode-enhanced');
  html.classList.add(`mode-${next}`);
  
  // Mark that user has manually chosen — takes priority over OS preference
  localStorage.setItem(MANUAL_OVERRIDE_KEY, 'true');
  localStorage.setItem(MODE_KEY, next);
  return next;
}

/** Utility: Get current mode */
export function getCurrentUIMode(): UIMode {
  if (typeof window === 'undefined') return 'performance';
  // If user manually toggled, always respect their choice
  if (localStorage.getItem(MANUAL_OVERRIDE_KEY) === 'true') {
    return (localStorage.getItem(MODE_KEY) as UIMode) || 'performance';
  }
  // Otherwise, respect OS preference as initial default
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return (localStorage.getItem(MODE_KEY) as UIMode) || 'performance';
  }
  // CAMBIO 6: default del sistema = performance
  return (localStorage.getItem(MODE_KEY) as UIMode) || 'performance';
}
