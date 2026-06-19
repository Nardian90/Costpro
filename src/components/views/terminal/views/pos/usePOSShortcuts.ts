"use client";

import { useEffect } from "react";

/**
 * POS-2 MM-1: Atajos POS locales.
 *
 * Filosofía de diseño:
 * - F9 (cobrar): SIEMPRE activo, incluso mientras el search input tiene foco.
 *   Es el atajo universal de POS, no debe chocar con nada.
 * - Esc (cancelar): SIEMPRE activo. Cierra carrito si está abierto.
 * - F2 (foco al search): SIEMPRE activo.
 * - +/- (cantidad del último item agregado): solo cuando NO hay foco en input.
 *   No queremos romper la entrada de texto.
 * - Enter ya lo maneja SearchBar internamente (MM-2).
 *
 * Nota: NO capturamos Ctrl+ combos aquí — esos los maneja useKeyboardShortcuts
 * (nivel app, no POS).
 */

export interface POSShortcutHandlers {
  /** F9 o Ctrl+Enter → disparar checkout */
  onCheckout: () => void;
  /** Esc → cerrar carrito / limpiar selección */
  onEscape: () => void;
  /** F2 → foco al search input */
  onFocusSearch: () => void;
  /** + (sin Ctrl) → incrementar cantidad del último item */
  onIncrementLast?: () => void;
  /** - (sin Ctrl) → decrementar cantidad del último item */
  onDecrementLast?: () => void;
  /** F1 → abrir ayuda de atajos (opcional) */
  onHelp?: () => void;
}

function isTextInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT") {
    const t = (el as HTMLInputElement).type;
    return ["text", "search", "email", "tel", "url", "password", "number"].includes(t);
  }
  if (tag === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function usePOSShortcuts(handlers: POSShortcutHandlers, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // F9 → cobrar (siempre, sin importar foco)
      if (e.key === "F9") {
        e.preventDefault();
        handlers.onCheckout();
        return;
      }

      // F2 → foco al search (siempre)
      if (e.key === "F2") {
        e.preventDefault();
        handlers.onFocusSearch();
        return;
      }

      // F1 → ayuda (opcional, siempre)
      if (e.key === "F1" && handlers.onHelp) {
        e.preventDefault();
        handlers.onHelp();
        return;
      }

      // Esc → cerrar carrito
      if (e.key === "Escape") {
        // Solo si no estamos en un modal/open dropdown — el navegador/close
        // handlers de modales ya pueden haberlo capturado, pero no daña
        // llamar al handler del POS también.
        handlers.onEscape();
        return;
      }

      // +/- en cantidad del último item — solo si NO estamos en un input
      if (!isTextInput(e.target)) {
        if (e.key === "+" || e.key === "=") {
          // "+" requiere shift en la mayoría de teclados, "=" es el sin-shift
          if (handlers.onIncrementLast) {
            e.preventDefault();
            handlers.onIncrementLast();
          }
          return;
        }
        if (e.key === "-" || e.key === "_") {
          if (handlers.onDecrementLast) {
            e.preventDefault();
            handlers.onDecrementLast();
          }
          return;
        }
      }

      // Ctrl+Enter como alternativa a F9 (cuando el usuario está en un input)
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handlers.onCheckout();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers, enabled]);
}
