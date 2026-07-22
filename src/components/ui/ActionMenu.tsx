'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface Action {
  id: string;
  label: string;
  tooltip?: React.ReactNode;
  icon?: React.ElementType;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'outline';
  disabled?: boolean;
  active?: boolean;
  className?: string;
  ariaLabel?: string;
  component?: React.ReactNode;
}

interface ActionMenuProps {
  actions: Action[];
  className?: string;
  ariaLabel?: string;
  sticky?: boolean;
  position?: 'top' | 'bottom';
  topOffset?: string;
}

const ActionMenu: React.FC<ActionMenuProps> = ({
  actions,
  className,
  sticky = true,
  position = 'top',
  topOffset,
}) => {
  const [isScrolling, setIsScrolling] = useState(false);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTime = useRef<number>(0);

  const checkScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  const handleScroll = useCallback(() => {
    const now = Date.now();
    lastScrollTime.current = now;
    if (!isScrolling) setIsScrolling(true);

    checkScroll();

    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150); // Standard delay to distinguish scroll momentum from tap
  }, [isScrolling, checkScroll]);

  const scrollBy = (offset: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    checkScroll();
    // Add a small delay to ensure layout is complete
    const timer = setTimeout(checkScroll, 100);
    window.addEventListener('resize', checkScroll);
    return () => {
      window.removeEventListener('resize', checkScroll);
      clearTimeout(timer);
    };
  }, [checkScroll, actions]);

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    // If we are currently scrolling or just finished (within 150ms),
    // prevent the click from reaching children (dropdown triggers, buttons)
    // This implements international UX standards for touch-friendly horizontal menus.
    if (isScrolling || (Date.now() - lastScrollTime.current < 150)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [isScrolling]);

  useEffect(() => {
    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, []);

  const getVariantClass = (variant?: string, active?: boolean) => {
    if (active) return 'bg-primary/10 border border-primary/20 font-bold text-primary !scale-100 shadow-none';
    switch (variant) {
      case 'primary': return 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90';
      case 'success': return 'bg-success text-success-foreground shadow-lg shadow-success/20 hover:bg-success/90';
      case 'danger': return 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 hover:bg-destructive/90';
      case 'warning': return 'bg-warning/15 text-warning border border-warning/30 shadow-sm hover:bg-warning/25';
      case 'outline': return 'border border-primary/20 text-foreground hover:bg-primary/5';
      default: return 'border border-border bg-background text-foreground hover:bg-muted';
    }
  };

  return (
    <div
      className={cn(
        'w-full z-20 transition-all duration-300',
        sticky && (position === 'top'
          ? (topOffset || 'sticky top-[60px] sm:top-[92px]')
          // FIX (2026-07-22): en móvil NO usar fixed bottom-0 porque solapa con MobileTabBar.
          // En su lugar, que fluya con el contenido (sticky en desktop, normal en móvil).
          : 'sticky bottom-4 sm:sticky sm:bottom-4 p-2 sm:p-0'
        ),
        className
      )}
    >
      <div className="!p-2 sm:!p-3 !rounded-2xl sm:!rounded-3xl shadow-2xl border border-border bg-background/95 backdrop-blur-md relative overflow-hidden group">
        {/* Left Scroll Button */}
        <div className={cn(
          "absolute left-0 top-0 bottom-0 w-12 z-30 flex items-center justify-start pl-2 bg-gradient-to-r from-background to-transparent transition-opacity duration-300 pointer-events-none sm:hidden",
          showLeftArrow ? "opacity-100" : "opacity-0"
        )}>
          <button
            onClick={() => scrollBy(-200)}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-white/10 shadow-lg text-primary pointer-events-auto active:scale-90 transition-transform"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Right Scroll Button */}
        <div className={cn(
          "absolute right-0 top-0 bottom-0 w-12 z-30 flex items-center justify-end pr-2 bg-gradient-to-l from-background to-transparent transition-opacity duration-300 pointer-events-none sm:hidden",
          showRightArrow ? "opacity-100" : "opacity-0"
        )}>
          <button
            onClick={() => scrollBy(200)}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-white/10 shadow-lg text-primary pointer-events-auto active:scale-90 transition-transform"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="w-full overflow-x-auto flex flex-row flex-nowrap items-center gap-3 p-1 pr-1 pb-2 [scrollbar-width:none] sm:[scrollbar-width:thin] [&::-webkit-scrollbar]:h-0 sm:[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-400/50 hover:[&::-webkit-scrollbar-thumb]:bg-muted/500/80 [&::-webkit-scrollbar-thumb]:rounded-full"
          onScroll={handleScroll}
          onClickCapture={handleClickCapture}
        >
          <TooltipProvider>
            {actions.map((action) => (
              <React.Fragment key={action.id}>
                {action.component ? (
                    <div className="shrink-0 flex items-center justify-center">
                        {action.component}
                    </div>
                ) : (
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={action.onClick}
                        disabled={action.disabled}
                        className={cn(
                          'flex items-center gap-2 px-4 py-3 min-h-[44px] text-sm sm:text-base rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap',
                          getVariantClass(action.variant, action.active),
                          !action.active && !action.variant && 'hover:bg-muted',
                          action.className
                        )}
                        aria-label={action.ariaLabel || action.label}
                      >
                        {action.icon && <action.icon className="w-4 h-4 sm:w-5 sm:h-5" />}
                        <span className="font-semibold">{action.label}</span>
                      </button>
                    </TooltipTrigger>
                    {action.tooltip && (
                      <TooltipContent className="max-w-xs p-4 space-y-2 bg-popover text-popover-foreground border shadow-xl">
                        {action.tooltip}
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
              </React.Fragment>
            ))}
          </TooltipProvider>
        </div>


      </div>
    </div>
  );
};

export default ActionMenu;
