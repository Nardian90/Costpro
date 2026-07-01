"use client";

import { useEffect } from "react";

/**
 * REC-2 MM-R1: Atajos de teclado para Nueva Recepción.
 *
 * Filosofía (mismo patrón que usePOSShortcuts):
 * - F9 (registrar): SIEMPRE activo, incluso con foco en input.
 * - F2 (foco al search principal): SIEMPRE activo.
 * - Esc (cancelar): SIEMPRE activo.
 * - Enter en input de búsqueda del modal = agregar producto (lo maneja el input).
 * - +/- cantidad del último item: solo cuando NO hay foco en input.
 *
 * Nota: NO capturamos Ctrl+ combos aquí — esos los maneja useKeyboardShortcuts (app-level).
 */

export interface ReceptionShortcutHandlers {
  /** F9 → disparar submit (abre confirmación) */
  onSubmit: () => void;
  /** Esc → cancelar (volver atrás) */
  onEscape: () => void;
  /** F2 → foco al campo de búsqueda principal (modal o search de items) */
  onFocusSearch: () => void;
  /** + (sin Ctrl) → incrementar cantidad del último item */
  onIncrementLast?: () => void;
  /** - (sin Ctrl) → decrementar cantidad del último item */
  onDecrementLast?: () => void;
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

export function useReceptionShortcuts(handlers: ReceptionShortcutHandlers, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // F9 → registrar
      if (e.key === "F9") {
        e.preventDefault();
        handlers.onSubmit();
        return;
      }

      // F2 → foco al search
      if (e.key === "F2") {
        e.preventDefault();
        handlers.onFocusSearch();
        return;
      }

      // Esc → cancelar
      if (e.key === "Escape") {
        handlers.onEscape();
        return;
      }

      // +/- cantidad del último item — solo si NO hay foco en input
      if (!isTextInput(e.target)) {
        if (e.key === "+" || e.key === "=") {
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

      // Ctrl+Enter como alternativa a F9
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handlers.onSubmit();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers, enabled]);
}
