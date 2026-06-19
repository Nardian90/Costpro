'use client';

import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * B4: ScrollToTop montado en TerminalShell.
 * FIX: escucha scroll de .terminal-content (no window) porque la app
 * scrollea dentro de ese contenedor, no en window.
 */
export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // B4-FIX: escuchar scroll del contenedor .terminal-content, no de window
    const container = document.querySelector('.terminal-content');
    if (!container) return;

    const toggleVisibility = () => {
      if (container.scrollTop > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    container.addEventListener('scroll', toggleVisibility);
    return () => container.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    // B4-FIX: scroll del contenedor .terminal-content, no de document
    const container = document.querySelector('.terminal-content');
    if (!container) return;
    const start = container.scrollTop;
    if (start === 0) return;
    const duration = 500;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      container.scrollTop = start * (1 - eased);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          onClick={scrollToTop}
          className={cn(
            // B4-FIX: oculto en mobile (sm:hidden) — en mobile el tab bar ocupa el espacio
            // inferior y el botón quedaría cortado o superpuesto. Solo visible en desktop.
            "hidden sm:flex fixed bottom-8 left-8 z-40",
            "neu-raised-sm w-12 h-12 items-center justify-center",
            "bg-primary text-foreground rounded-2xl shadow-2xl",
            "hover:scale-110 active:scale-95 transition-transform"
          )}
          aria-label="Volver arriba"
        >
          <ArrowUp className="w-6 h-6" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
