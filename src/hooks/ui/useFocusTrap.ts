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
 * F3-B4: si el contenedor marca un elemento con [data-autofocus], ese elemento
 * recibe el foco inicial (respetando la intención del consumidor) en lugar del
 * primer focusable. Además, si se provee onEscape, la tecla Escape cierra
 * (los overlays manuales no tienen Radix que lo gestione).
 *
 * @param isActive - Whether the focus trap should be active
 * @param onEscape - Optional callback invoked when Escape is pressed while active
 * @returns A ref to attach to the container element
 *
 * Uso:
 *   const containerRef = useFocusTrap(isOpen);
 *   <div ref={containerRef} role="dialog" aria-modal="true" ...>
 */
export function useFocusTrap(isActive: boolean, onEscape?: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef(false);

  // F3-B4: captura del foco previo y restauración SOLO en el borde de activación.
  // Antes: cada re-render del contenido del modal (cada tecla en un input) re-ejecutaba
  // el efecto y sobrescribía previousFocusRef con un elemento INTERIOR del modal →
  // la "restauración" apuntaba a un nodo desmontado y el foco se perdía en body.
  useEffect(() => {
    if (isActive) {
      if (!activeRef.current) {
        previousFocusRef.current = document.activeElement as HTMLElement;
        activeRef.current = true;
      }
      return;
    }
    if (activeRef.current) {
      activeRef.current = false;
      // el elemento previo puede haber sido reemplazado por un re-render del view; si
      // sigue conectado, restaurar; si no, no robar el foco a quien lo tenga ahora
      const prev = previousFocusRef.current;
      if (prev && prev.isConnected) prev.focus();
    }
  }, [isActive]);

  // F3-B4: si el consumidor DESMONTA el overlay ({open && <Modal/>} en lugar de mantenerlo
  // montado con isOpen=false), el effect anterior no llega a ejecutar su rama false.
  // Este cleanup de unmount garantiza la restauración en ese patrón.
  useEffect(() => {
    return () => {
      if (activeRef.current) {
        activeRef.current = false;
        const prev = previousFocusRef.current;
        if (prev && prev.isConnected) prev.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      // F3-B4: el consumidor puede marcar el objetivo de foco inicial con data-autofocus
      const preferred = container.querySelector<HTMLElement>('[data-autofocus]');
      if (preferred && !preferred.matches(':disabled')) {
        preferred.focus();
        return;
      }
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
      const firstFocusable = focusable[0];
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      // F3-B4: Escape cierra cuando el consumidor lo soporta
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }
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
    };
  }, [isActive, onEscape]);

  return containerRef;
}
