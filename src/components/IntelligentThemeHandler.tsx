'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

const emptySubscribe = () => () => {};

export default function IntelligentThemeHandler() {
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Apply connectivity data attribute (read from localStorage directly)
  useEffect(() => {
    if (!mounted) return;
    try {
      const stored = JSON.parse(localStorage.getItem('costpro-ui-storage') || '{}');
      const connectivity = stored?.state?.connectivity || '4g';
      document.documentElement.setAttribute('data-connectivity', connectivity);
    } catch {}
  }, [mounted]);

  // Sync resolved theme on mount
  useEffect(() => {
    if (!mounted || !resolvedTheme) return;
    try {
      const stored = JSON.parse(localStorage.getItem('costpro-ui-storage') || '{}');
      const currentPref = stored?.state?.themePreference;
      if (!currentPref || currentPref === 'auto') {
        // Store the resolved theme for consistency
      }
    } catch {}
  }, [mounted, resolvedTheme]);

  return null;
}
