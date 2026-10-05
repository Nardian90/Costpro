'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useSidebarHoverExpand — expansión temporal de sidebars colapsados por hover.
 *
 * Patrón estándar de navegación (VS Code / Slack / Discord):
 *   Colapsado = ahorro de espacio.
 *   Hover = expansión temporal (overlay, sin desplazar contenido).
 *   Clic = acción de navegación, no requisito para descubrir el menú.
 *   Pin / estado abierto = decisión persistente del usuario (intacta).
 *
 * Garantías:
 *  - Solo actúa en dispositivos CON puntero fino y hover fiable:
 *    `useIsMobile()` (<768px) + media query `(hover: hover) and (pointer: fine)`.
 *    En touch/móvil devuelve hoverProps vacío → el patrón actual
 *    (botón → drawer/Sheet) no cambia y nada se abre "espontáneamente".
 *  - Anti-"flapping": expandir/contracción con timers cancelables; el puntero
 *    que entra dentro del delay de contracción cancela el colapso, y el ancho
 *    crece DESDE el borde donde entró el puntero (geometry estable).
 *  - El hover NUNCA escribe en el store: la preferencia persistida del usuario
 *    (sidebarState / helpLibraryCollapsed) queda intacta.
 *  - Delays: expansión 100ms (evita activaciones accidentales al rozar el borde),
 *    contracción 180ms (permite atravesar el área sin perder el menú).
 */

const HOVER_MEDIA_QUERY = '(hover: hover) and (pointer: fine)';

/** true solo en dispositivos con hover real (desktop con mouse/trackpad). */
function useCanHover() {
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(HOVER_MEDIA_QUERY);
    const onChange = () => setCanHover(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return canHover;
}

export interface UseSidebarHoverExpandOptions {
  /** true cuando el sidebar está en su estado colapsado (rail). */
  collapsed: boolean;
  /** Delay antes de expandir tras mouseenter (ms). Default 100. */
  expandDelayMs?: number;
  /** Delay antes de contraer tras mouseleave (ms). Default 180. */
  collapseDelayMs?: number;
}

export interface SidebarHoverExpandResult {
  /** true = renderizar el sidebar como expandido (temporal, por hover). */
  hoverExpanded: boolean;
  /** Props a spread-ear en el contenedor del sidebar (área sensible completa). */
  hoverProps: Pick<React.HTMLAttributes<HTMLElement>, 'onMouseEnter' | 'onMouseLeave'>;
}

type Timer = ReturnType<typeof setTimeout> | null;

export function useSidebarHoverExpand({
  collapsed,
  expandDelayMs = 100,
  collapseDelayMs = 180,
}: UseSidebarHoverExpandOptions): SidebarHoverExpandResult {
  // Detección móvil por ancho de viewport (NO usa matchMedia → resiliente en
  // entornos sin soporte como jsdom; los navegadores reales siempre lo tienen).
  // Listener de resize único por sidebar (máx. 2 instancias) — sin polling.
  const [isTouchLayout, setIsTouchLayout] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const compute = () => setIsTouchLayout(window.innerWidth < 768);
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  const canHover = useCanHover();

  // El comportamiento solo aplica en desktop con hover fiable y estado rail.
  const active = collapsed && !isTouchLayout && canHover;

  const [hoverExpanded, setHoverExpanded] = useState(false);
  const expandTimer = useRef<Timer>(null);
  const collapseTimer = useRef<Timer>(null);

  const clearTimers = useCallback(() => {
    if (expandTimer.current !== null) {
      clearTimeout(expandTimer.current);
      expandTimer.current = null;
    }
    if (collapseTimer.current !== null) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }, []);

  // Si deja de aplicar (pin del usuario, resize a móvil, dispositivo sin hover)
  // se cancela cualquier transición pendiente y se vuelve al estado colapsado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active) {
      clearTimers();
      setHoverExpanded(false);
    }
  }, [active]);

  // Cleanup al desmontar.
  useEffect(() => clearTimers, [clearTimers]);

  const handleMouseEnter = useCallback(() => {
    if (!active) return;
    // Cancela un colapso pendiente (re-entrada dentro del delay → sin flap).
    if (collapseTimer.current !== null) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    // Si ya hay expansión programada, conserva la más temprana.
    if (expandTimer.current !== null) return;
    expandTimer.current = setTimeout(() => {
      expandTimer.current = null;
      setHoverExpanded(true);
    }, expandDelayMs);
  }, [active, expandDelayMs]);

  const handleMouseLeave = useCallback(() => {
    if (!active) return;
    // Cancela una expansión pendiente (paso efímero por el área).
    if (expandTimer.current !== null) {
      clearTimeout(expandTimer.current);
      expandTimer.current = null;
    }
    if (collapseTimer.current !== null) return;
    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null;
      setHoverExpanded(false);
    }, collapseDelayMs);
  }, [active, collapseDelayMs]);

  const hoverProps = active
    ? { onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave }
    : {};

  return { hoverExpanded, hoverProps };
}
