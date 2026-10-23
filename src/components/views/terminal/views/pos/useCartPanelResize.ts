'use client';

/**
 * MISIÓN CARRITO-VENTAS (2026-10-23) — Tarea 1: panel del carrito
 * redimensionable en escritorio.
 *
 * Hook compartido entre POSView (padding compensatorio del catálogo) y
 * POSCart (ancho real del sidebar + separador arrastrable). Responsabilidades:
 *
 *  1. Ancho del panel con límites adaptativos al viewport: el mínimo absoluto
 *     protege la legibilidad del carrito (totales/controles) y el máximo
 *     garantiza al catálogo su espacio útil mínimo; nunca supera el límite
 *     duro de 880px.
 *  2. Persistencia de la preferencia (localStorage, mecanismo ya usado por el
 *     proyecto — p.ej. zustand persist "pos-cart-storage"). El valor guardado
 *     se RE-VALIDA al leerlo y en cada resize de ventana: una resolución
 *     menor nunca deja un ancho inválido heredado.
 *  3. Arrastre por Pointer Events con captura best-effort y listeners de
 *     ventana (robusto en tests jsdom y en navegador); durante el arrastre se
 *     bloquea la selección de texto y se fija el cursor col-resize para que
 *     el gesto no active controles del catálogo/carrito.
 *  4. Accesibilidad de teclado: el separador es un role="separator" enfocable
 *     (←/→ ±16px, con Shift ±48px; doble clic restablece el default).
 *
 * Solo aplica en escritorio (viewport lg+); en móvil el carrito es un
 * overlay full-screen y el hook no interviene.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'costpro:pos-cart-width';

/** Ancho mínimo del carrito: preserva totales, campos y CTA legibles. */
export const CART_MIN_WIDTH = 360;
/** Espacio mínimo reservado al catálogo de productos (búsqueda + grid). */
export const CART_CATALOG_MIN_SPACE = 560;
/** Límite duro superior del panel aunque el viewport sea enorme. */
export const CART_MAX_WIDTH_LIMIT = 880;
/** Gap visual catálogo↔carrito (posCartProps usaba pr = width + 20). */
export const CART_PANEL_GAP = 20;

export const LG_BREAKPOINT = 1024;

/** Default por breakpoint — reproduce los anchos históricos 440/480/520. */
function defaultPanelWidth(): number {
  if (typeof window === 'undefined') return 440;
  if (window.innerWidth >= 1536) return 520;
  if (window.innerWidth >= 1280) return 480;
  return 440;
}

/** Ancho máximo permitido para un viewport dado (siempre ≥ mínimo). */
export function cartMaxWidth(viewportWidth: number): number {
  return Math.max(
    CART_MIN_WIDTH,
    Math.min(CART_MAX_WIDTH_LIMIT, viewportWidth - CART_CATALOG_MIN_SPACE),
  );
}

/** Clampa un ancho arbitrario al rango válido del viewport actual. */
export function clampCartWidth(raw: number, viewportWidth?: number): number {
  const vw = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1440);
  const max = cartMaxWidth(vw);
  return Math.round(Math.min(Math.max(raw, CART_MIN_WIDTH), max));
}

function readStoredWidth(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    // Re-validación: valores corruptos/inválidos se descartan (no se confía
    // en el storage) y el clamp contra el viewport actual se aplica igualmente.
    return Number.isFinite(parsed) && parsed > 0 ? clampCartWidth(parsed) : null;
  } catch {
    return null;
  }
}

function persistWidth(width: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // storage bloqueado (p.ej. modo privado estricto): la preferencia simplemente
    // no persiste entre sesiones; el redimensionado sigue funcionando.
  }
}

function readMatchesLg(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`).matches;
}

export interface CartPanelResize {
  /** Ancho actual del panel (px) — válido solo en escritorio. */
  width: number;
  /** true mientras el usuario arrastra el separador. */
  isResizing: boolean;
  /** true si el viewport está en lg+ (el sidebar desktop es visible). */
  isLgViewport: boolean;
  /** Handler onPointerDown para el separador. */
  startResize: (e: React.PointerEvent) => void;
  /** Handler onKeyDown del separador (flechas ±16px / Shift ±48px). */
  handleResizeKeyDown: (e: React.KeyboardEvent) => void;
  /** Restablece el ancho por breakpoint (doble clic en el separador). */
  resetWidth: () => void;
  /** Ajuste programático clampeado (p.ej. tests / futuras acciones). */
  resizeBy: (delta: number) => void;
}

export function useCartPanelResize(): CartPanelResize {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 440;
    return readStoredWidth() ?? defaultPanelWidth();
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isLgViewport, setIsLgViewport] = useState<boolean>(readMatchesLg);
  // Ref espejo de `width` para capturar el ancho inicial del gesto sin
  // depender de closures stale durante el drag.
  const widthRef = useRef(width);
  widthRef.current = width;
  const dragOrigin = useRef<{ startX: number; startWidth: number } | null>(null);

  // Sincroniza el estado lg con el breakpoint real (el carrito desktop
  // aparece en lg+; el padding del catálogo solo debe aplicar ahí).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const onChange = () => setIsLgViewport(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Re-validación del ancho guardado en cada resize de ventana: la preferencia
  // persistida nunca puede dejar un layout inválido en una resolución menor.
  useEffect(() => {
    const onWindowResize = () => {
      setWidth((prev) => {
        const next = clampCartWidth(prev);
        return next === prev ? prev : next;
      });
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  // Persistencia de la preferencia (escritura tolerante a fallos).
  useEffect(() => {
    persistWidth(width);
  }, [width]);

  // Gestores de arrastre activos solo mientras isResizing; los listeners de
  // ventana permiten seguir el puntero fuera del separador (el pointer capture
  // del handle es best-effort: en jsdom puede no existir).
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: PointerEvent) => {
      const origin = dragOrigin.current;
      if (!origin) return;
      // Panel a la DERECHA: arrastrar hacia la izquierda (clientX menor)
      // AUMENTA el ancho; hacia la derecha lo reduce.
      const desired = origin.startWidth + (origin.startX - e.clientX);
      setWidth(clampCartWidth(desired));
    };
    const endResize = () => {
      dragOrigin.current = null;
      setIsResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);
    // Bloquea selección de texto y fija cursor durante el gesto: el arrastre
    // no activa la selección de productos ni controles del carrito.
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endResize);
      window.removeEventListener('pointercancel', endResize);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing]);

  const startResize = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragOrigin.current = { startX: e.clientX, startWidth: widthRef.current };
    setIsResizing(true);
    // Captura best-effort: en navegadores mantiene el gesto aunque el puntero
    // salga del handle; en entornos sin soporte los listeners de ventana cubren.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* no-op */
    }
  }, []);

  const resizeBy = useCallback((delta: number) => {
    setWidth((prev) => clampCartWidth(prev + delta));
  }, []);

  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 48 : 16;
      // Panel a la derecha: ← agranda, → reduce (el borde interior se mueve).
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        resizeBy(step);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        resizeBy(-step);
      }
    },
    [resizeBy],
  );

  const resetWidth = useCallback(() => {
    setWidth(defaultPanelWidth());
  }, []);

  return {
    width,
    isResizing,
    isLgViewport,
    startResize,
    handleResizeKeyDown,
    resetWidth,
    resizeBy,
  };
}
