'use client';

import * as React from 'react';
import { Moon, Sun, Zap, Laptop, Eye } from 'lucide-react';
import { useUIStore } from '@/store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { themePreference, setThemePreference, accessibilityMode, setAccessibilityMode } = useUIStore();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-11 h-11 rounded-xl bg-muted/50 border border-border/50" />
    );
  }

  const themes = [
    { id: 'light', label: 'Claro', icon: Sun, color: 'text-amber-500' },
    { id: 'dark', label: 'Oscuro', icon: Moon, color: 'text-primary' },
    { id: 'fast-light', label: 'Fast Light', icon: Zap, color: 'text-blue-500' },
    { id: 'fast-dark', label: 'Fast Dark', icon: Zap, color: 'text-emerald-500' },
    { id: 'auto', label: 'Inteligente', icon: Laptop, color: 'text-purple-500' },
  ] as const;

  const currentTheme = themes.find(t => t.id === themePreference) || themes[0];
  const Icon = currentTheme.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group relative flex items-center gap-3 px-3 h-11 rounded-xl bg-muted/50 border border-border/50 hover:bg-muted hover:border-primary/20 transition-all outline-none"
          aria-label="Configuración de Tema"
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
            {accessibilityMode === 'high-contrast' ? 'Alto Contraste' : currentTheme.label}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl bg-card border-border shadow-2xl">
        <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
          Tema Visual
        </div>
        {themes.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setThemePreference(t.id)}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors focus:bg-primary/10 focus:text-primary min-h-[44px]",
              themePreference === t.id && accessibilityMode === 'normal' ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <t.icon className={cn("w-4 h-4", t.color)} />
            <span className="text-xs font-black uppercase tracking-widest">{t.label}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator className="my-2 bg-border" />

        <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
          Accesibilidad
        </div>
        <DropdownMenuItem
          onClick={() => setAccessibilityMode(accessibilityMode === 'high-contrast' ? 'normal' : 'high-contrast')}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors focus:bg-primary/10 focus:text-primary min-h-[44px]",
            accessibilityMode === 'high-contrast' ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Eye className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-widest">Alto Contraste</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
