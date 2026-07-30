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
 * - Auto-focus al primer elemento focusable al abrir
 * - Restaura foco al elemento previo al cerrar
 * - Esc cierra el modal
 * - Clic fuera cierra el modal
 * - aria-labelledby si se pasa title
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

  // Focus trap + Esc handler
  useEffect(() => {
    if (!open) return;

    // Guardar elemento previamente focalizado para restaurar al cerrar
    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    const dialog = dialogRef.current;
    if (!dialog) return;

    // Auto-focus al primer elemento focusable
    const focusableSelector =
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = dialog.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
      dialog.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        // Focus trap
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
      // Restaurar foco al elemento previo
      if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxWidthClass =
    maxWidth === "sm" ? "max-w-sm" : maxWidth === "md" ? "max-w-md" : "max-w-lg";

  // Portal para escapar del z-index/stacking context del sidebar
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
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
                onClick={onClose}
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
