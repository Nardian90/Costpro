'use client';

import * as React from 'react';
import { Moon, Sun, Zap, Shield } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useUIStore } from '@/store';
import { cn } from '@/lib/utils';
import { toggleUIMode, getCurrentUIMode, type UIMode } from './IntelligentThemeHandler';
import { toast } from 'sonner';

export function ThemeToggle() {
  const { themePreference, setThemePreference } = useUIStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [uiMode, setUiMode] = React.useState<UIMode>('enhanced');
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setUiMode(getCurrentUIMode());
  }, []);

  // Listen for mode changes from other sources
  React.useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      setUiMode(getCurrentUIMode());
    }, 500);
    return () => clearInterval(interval);
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-9 h-9 rounded-xl bg-muted/50 border border-border/50" />
        <div className="w-9 h-9 rounded-xl bg-muted/50 border border-border/50 hidden sm:flex" />
        <div className="w-9 h-9 rounded-xl bg-muted/50 border border-border/50 hidden sm:flex" />
      </div>
    );
  }

  const isDark = theme === 'dark';
  const isPerformance = uiMode === 'performance';

  const handleToggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
    setThemePreference(newTheme);
  };

  const handleToggleMode = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    const newMode = toggleUIMode();
    setUiMode(newMode);

    // Visual feedback: brief scale animation
    setTimeout(() => setIsTransitioning(false), 300);

    // Toast notification
    toast.success(
      newMode === 'performance' ? 'Modo Performance activado' : 'Modo Enhanced activado',
      {
        description: newMode === 'performance'
          ? 'Animaciones y efectos desactivados para mejor rendimiento'
          : 'Efectos visuales completos habilitados',
        duration: 2000,
        icon: newMode === 'performance' ? <Shield className="w-4 h-4 text-amber-500" /> : <Zap className="w-4 h-4 text-green-500" />,
      }
    );
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
          {isDark ? (
            <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
          ) : (
            <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          )}
        </div>
      </button>

      {/* Performance / Enhanced Toggle — visible en móvil y desktop */}
      <button
        onClick={handleToggleMode}
        className={cn(
          "relative w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl border active:scale-90 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isTransitioning && "scale-95",
          isPerformance
            ? "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15"
            : "border-border/50 bg-muted/50 hover:bg-muted"
        )}
        aria-label={
          isPerformance
            ? 'Cambiar a modo Enhanced (efectos visuales completos)'
            : 'Cambiar a modo Performance (optimizado)'
        }
      >
        <div className="relative w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center overflow-hidden">
          {isPerformance ? (
            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
          ) : (
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
          )}
        </div>
        <span className={cn(
          "absolute -bottom-0.5 text-[6px] font-black uppercase tracking-widest",
          isPerformance ? "text-amber-500" : "text-muted-foreground/60"
        )}>
          {isPerformance ? '⚡' : '✨'}
        </span>
      </button>
    </div>
  );
}
