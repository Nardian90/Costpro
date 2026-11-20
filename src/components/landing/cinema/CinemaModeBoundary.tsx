'use client';

/**
 * CinemaModeBoundary — CP-FIX-LANDING-RESPONSIVE (2026-11-20 §4.3)
 * ============================================================================
 * Red de seguridad del modo cine: si el motor de animación (GSAP/ScrollTrigger)
 * falla en tiempo de ejecución durante el montaje o las transiciones del
 * escenario, el límite captura el error, lo informa al propietario (que cae al
 * MODO FLUJO nativo — contenido, CTAs y funciones comerciales intactos) y
 * renderiza nada por sí mismo. El flujo nativo NO usa GSAP (ActStage sin pin),
 * así que la alternativa es funcional por construcción.
 *
 * El error NO se reintenta dentro de la sesión: un motor que falló una vez no
 * vuelve a montarse hasta la próxima recarga (evita bucles de crash).
 * ============================================================================
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface CinemaModeBoundaryProps {
  children: ReactNode;
  /** Se invoca UNA vez al capturar el error del escenario. */
  onError: (error: Error, info: ErrorInfo) => void;
}

interface CinemaModeBoundaryState {
  failed: boolean;
}

export default class CinemaModeBoundary extends Component<CinemaModeBoundaryProps, CinemaModeBoundaryState> {
  state: CinemaModeBoundaryState = { failed: false };

  static getDerivedStateFromError(): CinemaModeBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Reporte visible para diagnóstico; el propietario decide la caída a flujo.
    console.error('[CinemaModeBoundary] el motor del escenario cinematográfico falló — cayendo al modo flujo:', error, info.componentStack);
    this.props.onError(error, info);
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
