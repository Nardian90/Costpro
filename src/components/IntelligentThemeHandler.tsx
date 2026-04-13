'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useUIStore } from '@/store';

export default function IntelligentThemeHandler() {
  const { themePreference, setThemePreference, connectivity } = useUIStore();
  const { setTheme, theme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // On first mount, sync the store preference with the current actual theme
  useEffect(() => {
    if (!mounted || !theme) return;
    // Only sync if the stored preference doesn't match the actual theme
    if (themePreference !== 'auto' && theme !== themePreference) {
      // The actual theme was set externally (e.g., landing page toggle)
      // Sync the store to match
      if (theme === 'light' || theme === 'dark') {
        setThemePreference(theme);
      }
    }
  }, [mounted, theme, themePreference, setThemePreference]);

  useEffect(() => {
    if (!mounted || !theme) return;

    const calculateAutoTheme = () => {
      const hour = new Date().getHours();
      return (hour >= 19 || hour < 7) ? 'dark' : 'light';
    };

    const updateTheme = () => {
      if (themePreference === 'auto') {
        const target = calculateAutoTheme();
        if (theme !== target) {
          setTheme(target);
        }
      } else {
        if (theme !== themePreference) {
          setTheme(themePreference);
        }
      }
    };

    updateTheme();

    // Recheck every minute for auto mode time changes
    const interval = setInterval(updateTheme, 60000);
    return () => clearInterval(interval);
  }, [themePreference, theme, setTheme, mounted]);

  // Apply connectivity data attribute to html element
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute('data-connectivity', connectivity);
  }, [connectivity, mounted]);

  return null;
}
