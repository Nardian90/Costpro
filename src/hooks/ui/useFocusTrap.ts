'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]:not([disabled])',
].join(', ');

/**
 * Implementa focus trap para modales y paneles.
 * WCAG 2.2 — Criterio 2.1.2 (Sin trampa de teclado).
 *
 * @param isActive - Whether the focus trap should be active
 * @returns A ref to attach to the container element
 *
 * Uso:
 *   const containerRef = useFocusTrap(isOpen);
 *   <div ref={containerRef} role="dialog" aria-modal="true" ...>
 */
export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const container = containerRef.current;
    if (!container) return;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
      const firstFocusable = focusable[0];
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      );

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      container.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isActive]);

  return containerRef;
}
