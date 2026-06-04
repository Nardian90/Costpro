'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface HelpScrollFabProps {
  /** 0–100 scroll percentage from the parent */
  scrollProgress: number;
}

/**
 * Floating Action Button for Help Center.
 * Shows a circular progress ring with % read + click to scroll-to-top.
 * Rendered OUTSIDE the scroll container so it stays fixed on screen.
 */
export default function HelpScrollFab({ scrollProgress }: HelpScrollFabProps) {
  const [visible, setVisible] = useState(false);
  const [smoothProgress, setSmoothProgress] = useState(0);

  // Show after 8 % scrolled, hide near top
  useEffect(() => {
    setVisible(scrollProgress > 8);
  }, [scrollProgress]);

  // Smooth animate the ring
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setSmoothProgress(scrollProgress);
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollProgress]);

  const handleScrollTop = useCallback(() => {
    // Find the currently visible help scroll container
    const mains = document.querySelectorAll<HTMLElement>('main[data-help-scroll]');
    for (const main of mains) {
      if (main.offsetHeight > 0) {
        main.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    // Fallback
    const fallback = document.querySelector<HTMLElement>('main.overflow-y-auto');
    if (fallback) {
      fallback.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // SVG ring calculations
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (smoothProgress / 100) * circumference;
  const pct = Math.round(smoothProgress);

  return (
    <button
      onClick={handleScrollTop}
      aria-label={`Volver arriba · ${pct}% leído`}
      className={cn(
        'fixed z-[100] group',
        // Position: bottom-right, offset from sidebar on desktop
        'right-5 bottom-5 lg:right-[calc(320px+20px)] lg:bottom-5',
        // Animate in/out
        'transition-all duration-300',
        visible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-4 scale-90 pointer-events-none'
      )}
    >
      <div
        className={cn(
          'relative w-[52px] h-[52px] rounded-full',
          'bg-card/90 dark:bg-card/95 backdrop-blur-xl',
          'border border-border/40 shadow-xl shadow-black/10',
          'flex items-center justify-center',
          'group-hover:shadow-2xl group-hover:shadow-primary/15 group-hover:border-primary/30',
          'transition-all duration-300 group-hover:scale-110 active:scale-95',
          'cursor-pointer'
        )}
      >
        {/* SVG Progress Ring */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 44 44"
          fill="none"
        >
          {/* Background track */}
          <circle
            cx="22"
            cy="22"
            r={radius}
            strokeWidth="2.5"
            className="stroke-border/30"
            fill="none"
          />
          {/* Progress arc */}
          <circle
            cx="22"
            cy="22"
            r={radius}
            strokeWidth="2.5"
            className="stroke-primary transition-all duration-200 ease-out"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>

        {/* Content: percentage text + arrow */}
        <div className="relative flex flex-col items-center justify-center">
          <span className="text-[11px] font-black tabular-nums text-foreground leading-none">
            {pct}
          </span>
          <span className="text-[7px] font-bold text-muted-foreground/60 leading-none mt-0.5">
              %
          </span>
        </div>
      </div>

      {/* Tooltip on hover */}
      <div className={cn(
        'absolute right-full mr-3 top-1/2 -translate-y-1/2',
        'px-3 py-1.5 rounded-lg',
        'bg-foreground text-background',
        'text-[10px] font-bold whitespace-nowrap',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none',
        'shadow-lg'
      )}>
        Volver arriba
      </div>
    </button>
  );
}
