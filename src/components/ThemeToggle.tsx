'use client';

import * as React from 'react';
import { Moon, Sun, Zap, Laptop, WifiOff, Cloud } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useUIStore } from '@/store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  variant?: "all" | "dark-only";
}

export function ThemeToggle({ variant = "all" }: ThemeToggleProps) {
  const { themePreference, setThemePreference } = useUIStore();
  const { theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-11 h-11 rounded-xl bg-muted/50 border border-border/50" />
    );
  }

  const allThemes = [
    { id: 'light', label: 'Claro', icon: Sun, color: 'text-amber-500' },
    { id: 'dark', label: 'Oscuro', icon: Moon, color: 'text-primary' },
    { id: 'fast-light', label: 'Fast Light', icon: Zap, color: 'text-blue-500' },
    { id: 'fast-dark', label: 'Fast Dark', icon: Zap, color: 'text-emerald-500' },
    { id: 'auto', label: 'Inteligente', icon: Laptop, color: 'text-purple-500' },
  ] as const;

  const themes = variant === "dark-only"
    ? allThemes.filter(t => t.id === "dark" || t.id === "fast-dark")
    : allThemes;

  const currentTheme = themes.find(t => t.id === themePreference) || themes[0];
  const Icon = currentTheme.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group relative flex items-center gap-3 px-3 h-11 rounded-xl bg-muted/50 border border-border/50 hover:bg-muted hover:border-primary/20 transition-all outline-none"
          aria-label="Toggle theme"
        >
          <div className="relative w-5 h-5 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={themePreference}
                initial={{ y: 20, opacity: 0, rotate: 45 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: -20, opacity: 0, rotate: -45 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <Icon className={cn("w-4 h-4", currentTheme.color)} />
              </motion.div>
            </AnimatePresence>
          </div>

          <span className="hidden sm:block text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
            {currentTheme.label}
          </span>

          {/* Micro-interaction highlight */}
          <div className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-2 rounded-2xl bg-card border-border shadow-2xl">
        <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
          Seleccionar Tema
        </div>
        {themes.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setThemePreference(t.id)}
            className={cn(
              "flex items-center gap-3 px-3 py-4 rounded-xl cursor-pointer transition-colors focus:bg-primary/10 focus:text-primary min-h-[44px]",
              themePreference === t.id ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <t.icon className={cn("w-4 h-4", t.color)} />
            <span className="text-xs font-black uppercase tracking-widest">{t.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
