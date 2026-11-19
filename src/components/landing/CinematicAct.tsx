'use client';

/**
 * ActStage — ADN-LANDING-CINEMATIC-SCROLL-STORYTELLING-005 → SIMPLIFICADO 006
 * ============================================================================
 * ADN-LANDING-TRUE-FULLPAGE-EXPERIENCE-006: el sistema «hero pineado +
 * handoffs» de la 005 fue SUSTITUIDO por el escenario persistente
 * (CinemaStage + GSAP ScrollTrigger) — la sustitución real de escenas que la
 * 005 no llegaba a entregar (diagnóstico: solo el hero se fijaba y el resto
 * seguía pareciéndose a una página larga con pasillos).
 *
 * Este componente queda como CAPA DE FLUJO: envuelve las secciones en móvil,
 * tablet y reduced-motion (donde NO hay escenario cinematográfico) y conserva
 * los ids canónicos de la misión 004 en sus wrappers — el paginador, el
 * scrollspy, los anchors y los E2E del modo flujo resuelven posiciones
 * estables. Sin pin, sin pasillos, sin scrub: flujo nativo puro.
 * ============================================================================
 */

import { useRef, type ReactNode } from 'react';

interface ActStageProps {
  /** sectionId canónico — vive en el WRAPPER (bloque de flujo normal). */
  id: string;
  /** 1..5 — número de acto (accesibilidad: aria-label). */
  act: number;
  /** Clases del wrapper (fondo opaco del acto, position, etc.). */
  className?: string;
  /** Longitud del pasillo — OBSOLETA en 006 (flujo puro, sin pasillos);
   *  se conserva como prop no-op para compatibilidad de llamadas. */
  runway?: string;
  /** Posición vertical del hairline — OBSOLETA en 006 (no-op). */
  hairlineTop?: string;
  /** Modo — OBSOLETO en 006 (solo flujo); no-op para compatibilidad. */
  mode?: 'pin' | 'handoff';
  /** ADN-006: forzar flujo aunque la geometría sea de escritorio. */
  flow?: boolean;
  children: ReactNode;
}

export default function ActStage({
  id,
  act,
  className = '',
  children,
}: ActStageProps) {
  const wrapperRef = useRef<HTMLElement>(null);
  void wrapperRef; // reservado para mediciones futuras sin romper el contrato

  return (
    <section
      id={id}
      ref={wrapperRef}
      data-act={act}
      className={`act-wrap--flow relative ${className}`}
      aria-label={`Acto ${act}`}
    >
      {children}
    </section>
  );
}
