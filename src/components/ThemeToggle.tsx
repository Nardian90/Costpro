'use client';

import * as React from 'react';
import { Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useUIStore } from '@/store';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function ThemeToggle() {
  const { themePreference, setThemePreference, connectivity, setConnectivity } = useUIStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-9 h-9 rounded-xl bg-muted/50 border border-border/50" />
        <div className="w-9 h-9 rounded-xl bg-muted/50 border border-border/50 hidden sm:flex" />
      </div>
    );
  }

  const isDark = theme === 'dark';
  const is3g = connectivity === '3g';

  const handleToggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
    setThemePreference(newTheme);
  };

  const handleToggleConnectivity = () => {
    const newMode = is3g ? '4g' : '3g';
    setConnectivity(newMode);
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* Light/Dark Toggle */}
      <button
        onClick={handleToggleTheme}
        className="relative w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl border border-border/50 bg-muted/50 hover:bg-muted active:scale-90 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      >
        <div className="relative w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isDark ? 'dark' : 'light'}
              initial={{ y: 12, opacity: 0, rotate: -90 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -12, opacity: 0, rotate: 90 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {isDark ? (
                <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
              ) : (
                <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </button>

      {/* 3G/4G Connectivity Toggle (hidden on very small screens) */}
      <button
        onClick={handleToggleConnectivity}
        className={cn(
          "hidden sm:flex relative w-9 h-9 sm:w-11 sm:h-11 items-center justify-center rounded-xl border active:scale-90 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
          is3g
            ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
            : "border-border/50 bg-muted/50 hover:bg-muted"
        )}
        aria-label={is3g ? 'Cambiar a 4G (animaciones completas)' : 'Cambiar a 3G (animaciones reducidas)'}
      >
        <div className="relative w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={is3g ? '3g' : '4g'}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {is3g ? (
                <WifiOff className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
              ) : (
                <Wifi className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        {/* Connectivity label */}
        <span className={cn(
          "absolute -bottom-0.5 text-[7px] font-black uppercase tracking-widest",
          is3g ? "text-amber-500" : "text-muted-foreground/60"
        )}>
          {is3g ? '3G' : '4G'}
        </span>
      </button>
    </div>
  );
}
