'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useUIStore } from '@/store';

export default function IntelligentThemeHandler() {
  const { themePreference, accessibilityMode } = useUIStore();
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle Accessibility Mode (High Contrast)
  useEffect(() => {
    if (!mounted) return;

    if (accessibilityMode === 'high-contrast') {
      document.documentElement.setAttribute('data-accessibility', 'high-contrast');
    } else {
      document.documentElement.removeAttribute('data-accessibility');
    }
  }, [accessibilityMode, mounted]);

  useEffect(() => {
    if (!mounted) return;

    const calculateIntelligentTheme = () => {
      // 1. Connection check (Priority: Performance)
      if (typeof navigator !== 'undefined' && (navigator as any).connection) {
        const conn = (navigator as any).connection;
        if (conn.saveData || ['slow-2g', '2g', '3g'].includes(conn.effectiveType)) {
          return 'fast-dark';
        }
      }

      // 2. Time check
      const hour = new Date().getHours();
      if (hour >= 19 || hour < 7) {
        return 'fast-dark';
      }
      return 'fast-light';
    };

    const updateTheme = () => {
      if (themePreference === 'auto') {
        const target = calculateIntelligentTheme();
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

    const interval = setInterval(updateTheme, 60000);

    const conn = typeof navigator !== 'undefined' && (navigator as any).connection;
    if (conn) {
      conn.addEventListener('change', updateTheme);
    }

    return () => {
      clearInterval(interval);
      if (conn) {
        conn.removeEventListener('change', updateTheme);
      }
    };
  }, [themePreference, theme, setTheme, mounted]);

  return null;
}
