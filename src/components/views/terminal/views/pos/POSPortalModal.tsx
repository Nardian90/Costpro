"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface POSPortalModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Tamaño máximo del modal. */
  maxWidth?: "sm" | "md" | "lg";
  /** Si true, no muestra el botón X de cerrar. */
  hideCloseButton?: boolean;
  /** Clase adicional para el contenedor del modal. */
  className?: string;
}

/**
 * POS-3b audit P0.3: Modal accesible con focus trap.
 *
 * Reemplaza los overlays raw <div> que no tenían role="dialog" ni aria-modal
 * ni focus trap. Sigue el patrón de Radix Dialog pero más liviano (sin dependencia).
 *
 * Características:
 * - role="dialog" + aria-modal="true"
 * - Focus trap: Tab/Shift+Tab cicla dentro del modal
 * - Auto-focus al PROPIO diálogo al abrir (no a un control destructivo)
 * - Restaura foco al elemento previo al cerrar
 * - Esc cierra el modal
 * - Clic fuera cierra el modal
 * - aria-labelledby si se pasa title
 *
 * MISIÓN COSTPRO-SALES-MODAL-INPUT-AND-TRANSFER-VALIDATION-001 (FASE 1) —
 * CAUSA RAÍZ del bug «solo se escribe una letra y el foco salta al botón
 * Cerrar» corregida aquí, en el componente compartido:
 *
 * El useEffect de apertura dependía de [open, onClose]. TODOS los consumidores
 * (modal «Confirmar Venta» de Cajero Express y Modo Carrito, «Configurar
 * pago», desglose de efectivo…) pasan un onClose INLINE (arrow function nueva
 * en cada render del padre). Cada tecla escrita en un campo controlado
 * (p. ej. «Notas de la venta») re-renderiza al padre → nueva referencia de
 * onClose → el efecto se RE-EJECUTABa con el modal ya abierto: su cleanup
 * restauraba el foco al elemento previo y su cuerpo volvía a enfocar el
 * PRIMER focusable del diálogo — la X «Cerrar» (primer elemento del DOM del
 * modal). Resultado: una sola letra escrita y el foco secuestrado.
 *
 * FIX (patrón «latest ref», sin debilitar el focus trap):
 *  · el onClose vivo vive en un ref (`onCloseRef`) actualizado en cada render;
 *  · el efecto depende ÚNICAMENTE de [open] → se ejecuta una sola vez por
 *    apertura, con sus handlers leyendo `onCloseRef.current` (siempre fresco);
 *  · el auto-focus inicial va al PROPIO diálogo (tabIndex={-1}) y NO al
 *    primer focusable: enfocar la X «Cerrar» como estado inicial permitía
 *    cerrar el modal con un Enter/espacio accidental (el foco solo cambia
 *    cuando el usuario lo pide o una acción válida lo justifica).
 */
export function POSPortalModal({
  open,
  onClose,
  title,
  children,
  maxWidth = "sm",
  hideCloseButton = false,
  className,
}: POSPortalModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // onClose SIEMPRE fresco sin re-disparar el efecto de apertura (latest ref).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus trap + Esc handler — depende SOLO de `open`.
  useEffect(() => {
    if (!open) return;

    // Guardar elemento previamente focalizado para restaurar al cerrar
    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    const dialog = dialogRef.current;
    if (!dialog) return;

    // Auto-focus al PROPIO diálogo (no al primer focusable): el lector de
    // pantalla anuncia role/aria-labelledby y Tab lleva al primer control.
    // Jamás se pre-enfoca el botón Cerrar (acción destructiva).
    dialog.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === "Tab") {
        // Focus trap
        const focusableSelector =
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const currentFocusable = dialog.querySelectorAll<HTMLElement>(focusableSelector);
        if (currentFocusable.length === 0) return;

        const firstEl = currentFocusable[0];
        const lastEl = currentFocusable[currentFocusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    // Prevenir scroll del body mientras el modal está abierto
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      // Restaurar foco al elemento previo (solo al cerrar/desmontar)
      if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const maxWidthClass =
    maxWidth === "sm" ? "max-w-sm" : maxWidth === "md" ? "max-w-md" : "max-w-lg";

  // Portal para escapar del z-index/stacking context del sidebar
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => onCloseRef.current()}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "pos-modal-title" : undefined}
        tabIndex={-1}
        className={cn(
          "bg-card rounded-2xl border-2 border-primary/30 shadow-2xl p-6 w-full outline-none",
          maxWidthClass,
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 id="pos-modal-title" className="text-sm font-black uppercase tracking-widest text-foreground">
              {title}
            </h2>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={() => onCloseRef.current()}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
