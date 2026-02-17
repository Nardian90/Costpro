'use client';

import * as React from 'react';
import { Moon, Sun, Zap } from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-11 h-11 rounded-xl bg-muted/50 border border-border/50" />
    );
  }

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light');
    } else if (theme === 'light') {
      setTheme('neumo');
    } else {
      setTheme('dark');
    }
  };

  const getThemeLabel = () => {
    if (theme === 'dark') return 'Modo Oscuro';
    if (theme === 'light') return 'Modo Claro';
    if (theme === 'neumo') return 'Fast';
    return 'Modo Oscuro';
  };

  return (
    <button
      onClick={toggleTheme}
      className="group relative flex items-center gap-3 px-3 h-11 rounded-xl bg-muted/50 border border-border/50 hover:bg-muted hover:border-primary/20 transition-all"
      aria-label="Toggle theme"
    >
      <div className="relative w-5 h-5 flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {theme === 'dark' ? (
            <motion.div
              key="moon"
              initial={{ y: 20, opacity: 0, rotate: 45 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -20, opacity: 0, rotate: -45 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Moon className="w-4 h-4 text-primary" />
            </motion.div>
          ) : theme === 'light' ? (
            <motion.div
              key="sun"
              initial={{ y: 20, opacity: 0, rotate: 45 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -20, opacity: 0, rotate: -45 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Sun className="w-4 h-4 text-amber-500" />
            </motion.div>
          ) : (
            <motion.div
              key="zap"
              initial={{ y: 20, opacity: 0, rotate: 45 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -20, opacity: 0, rotate: -45 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Zap className="w-4 h-4 text-blue-500 fill-blue-500/20" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <span className="hidden sm:block text-xs font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
        {getThemeLabel()}
      </span>

      {/* Micro-interaction highlight */}
      <div className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
