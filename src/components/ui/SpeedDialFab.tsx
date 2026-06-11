'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, MessageSquare, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SpeedDialAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

interface SpeedDialFabProps {
  chatAction: () => void;
}

export function SpeedDialFab({ chatAction }: SpeedDialFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  // Track scroll position for "scroll to top" hint
  useEffect(() => {
    const handleScroll = () => {
      // The app scrolls inside a .terminal-content div, not the window
      const scrollContainer = document.querySelector('.terminal-content') as HTMLElement | null;
      const scrollTop = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
      setShowScrollHint(scrollTop > 300);
    };

    const scrollContainer = document.querySelector('.terminal-content');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
    // Fallback for pages without the terminal-content container
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      // Small delay to avoid closing immediately on the same click that opened it
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const scrollToTop = useCallback(() => {
    // Scroll the app's internal container (not window)
    const scrollContainer = document.querySelector('.terminal-content') as HTMLElement | null;
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setIsOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const handleChatClick = useCallback(() => {
    setIsOpen(false);
    // Small delay so the dial closes before chat opens
    setTimeout(chatAction, 150);
  }, [chatAction]);

  const actions: SpeedDialAction[] = [
    {
      icon: <MessageSquare className="w-4 h-4" />,
      label: 'Chat IA',
      onClick: handleChatClick,
      className: 'text-primary border-primary/20 hover:bg-primary/10',
    },
  ];

  // Only show "scroll to top" when user has scrolled down
  if (showScrollHint) {
    actions.push({
      icon: <ArrowUp className="w-4 h-4" />,
      label: 'Inicio',
      onClick: scrollToTop,
      className: 'text-foreground border-border hover:bg-muted',
    });
  }

  return (
    <div ref={fabRef} className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-3">
      {/* Mini-FAB actions */}
      <AnimatePresence>
        {isOpen && actions.map((action, index) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            transition={{
              type: 'spring',
              damping: 20,
              stiffness: 300,
              delay: index * 0.05,
            }}
            className="flex items-center gap-2"
          >
            {/* Label */}
            <span className="px-2.5 py-1 rounded-lg bg-card border border-border shadow-lg text-[10px] font-bold uppercase tracking-widest text-foreground whitespace-nowrap backdrop-blur-sm">
              {action.label}
            </span>
            {/* Mini-FAB button */}
            <button
              type="button"
              onClick={action.onClick}
              className={cn(
                'w-11 h-11 rounded-full border shadow-lg flex items-center justify-center transition-all active:scale-90',
                action.className
              )}
              aria-label={action.label}
            >
              {action.icon}
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Main FAB — + / × */}
      <motion.button
        type="button"
        onClick={handleToggle}
        whileTap={{ scale: 0.9 }}
        aria-label={isOpen ? 'Cerrar menú de acciones' : 'Abrir menú de acciones'}
        aria-expanded={isOpen}
        className={cn(
          'w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 relative',
          isOpen
            ? 'bg-foreground text-background shadow-2xl'
            : 'bg-primary/15 backdrop-blur-xl border-2 border-primary/30 text-primary shadow-lg shadow-primary/15 hover:scale-110 hover:bg-primary/25'
        )}
      >
        {/* Gradient overlay on closed state */}
        {!isOpen && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-full" />
        )}

        {/* Scroll hint badge */}
        {!isOpen && showScrollHint && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
            <ArrowUp className="w-2.5 h-2.5" />
          </div>
        )}

        <motion.div
          animate={{ rotate: isOpen ? 135 : 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="relative z-10"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </motion.div>
      </motion.button>
    </div>
  );
}
