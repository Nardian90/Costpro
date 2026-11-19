'use client';

/**
 * CinematicAct — ADN-LANDING-CINEMATIC-SCROLL-STORYTELLING-005
 * ============================================================================
 * Sistema de escenas «una experiencia, cinco actos».
 *
 * DECISIÓN DE ARQUITECTURA (ver worklog §1 y expediente):
 *   El scrub se hace con framer-motion useScroll/useTransform (transform y
 *   opacity únicamente) sobre el PROGRESO REAL del scroll — equivalente
 *   funcional de pin+scrub de ScrollTrigger sin introducir GSAP ni ninguna
 *   dependencia nueva. Nada secuestra la rueda ni continúa solo: el scroll
 *   controla las escenas.
 *
 *   Dos modos por acto:
 *
 *   mode="pin"      — SOLO el hero (contenido diseñado para caber en 100svh).
 *                     Escena fijada (position: sticky, habilitado en
 *                     landing-shield.css con overflow-x: clip) dentro de un
 *                     contenedor de longitud 100svh + --act-runway. El acto
 *                     siguiente CUBRE a la escena fijada (cover-stack, orden
 *                     natural de hermanos) mientras esta se repliega (scale +
 *                     fade + los fragmentos del caos se recogen hacia la
 *                     línea ADN).
 *
 *   mode="handoff"  — Actos con contenido de altura variable (no cabe
 *                     garantizadamente en un viewport en todas las alturas de
 *                     escritorio: 1024×768 … 1920×1080). Handoff por
 *                     profundidad: el acto sale LENTEO (y +30svh, scale 0.96,
 *                     fade) mientras el siguiente asciende — ambas capas
 *                     conviven durante el pasillo → sensación de escenario
 *                     persistente SIN recortar jamás el contenido (solo
 *                     transform/opacity, overflow visible).
 *
 *   Firma visual: la línea ADN (.act-hairline) — hairline verde que se dibuja
 *   (scaleX) desde el borde derecho en la entrada de cada acto, conectando el
 *   navegador de capítulos con la composición.
 *
 *   Móvil (<1024) o prefers-reduced-motion: flujo nativo, sin pasillos ni
 *   transforms — los reveals internos de cada sección (whileInView) siguen
 *   funcionando. Respeta §9/§10 de la misión.
 * ============================================================================
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';

export type ActEntry = 'rise' | 'drift' | 'fade';
export type ActExit = 'recede' | 'typo' | 'dissolve';
export type ActMode = 'pin' | 'handoff';

/** matchMedia reactivo mínimo (sin dependencias externas). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

interface ActStageProps {
  /** sectionId canónico — vive en el WRAPPER (bloque de flujo normal):
      el paginador, el scrollspy, los anchors (#features…) y los tests E2E
      resuelven posiciones estables aunque el hero esté fijado. */
  id: string;
  /** 1..5 — número de acto. */
  act: number;
  /** 'pin' (solo hero) | 'handoff' (resto). */
  mode?: ActMode;
  /** Variante de entrada. */
  entry?: ActEntry;
  /** Variante de repliegue del acto fijado (solo pin). */
  exit?: ActExit;
  /** Longitud del pasillo de transición (CSS length). Por modo: pin 85svh,
      handoff 35svh (ciclo 1: pasillos largos creaban vacíos — §12). */
  runway?: string;
  /** Posición vertical del hairline ADN. */
  hairlineTop?: string;
  /** Clases del wrapper (fondo opaco del acto, position, etc.). */
  className?: string;
  /** Clases de la escena fijada (solo pin). */
  sceneClassName?: string;
  children: ReactNode;
  /** Expone el progreso de salida del acto fijado (0→1) para coreografías
      internas (p. ej. los fragmentos del hero que se recogen). */
  onExitProgress?: (mv: MotionValue<number>) => void;
}

/* Parámetros de variantes de ENTRADA (unidades svh — independientes del viewport). */
const ENTRY_SHAPE: Record<ActEntry, { y: number; opacityFloor: number }> = {
  rise: { y: 9, opacityFloor: 0.3 },
  drift: { y: 5, opacityFloor: 0.45 },
  fade: { y: 2.5, opacityFloor: 0.18 },
};

/* Parámetros de repliegue del acto FIJADO (solo mode="pin"). */
const EXIT_SHAPE: Record<ActExit, { scale: [number, number]; y: number; opacityTo: number }> = {
  recede: { scale: [1, 0.93], y: -3.5, opacityTo: 0.12 },
  typo: { scale: [1, 1.045], y: 0, opacityTo: 0.1 },
  dissolve: { scale: [1, 0.985], y: 2, opacityTo: 0.08 },
};

/* Parámetros del handoff por profundidad (mode="handoff").
   Ciclo 1: el acto saliente NUNCA desaparece del todo (piso 0.4 de opacity)
   y el pasillo es corto — el siguiente acto entra mientras este persiste,
   sin vacíos negros entre escenas (§12: «sin vacíos accidentales»). */
const HANDOFF = { y: 22, scale: 0.97, fadeFrom: 0.3, opacityTo: 0.4 };

export default function ActStage({
  id,
  act,
  mode = 'handoff',
  entry = 'rise',
  exit = 'recede',
  runway,
  hairlineTop = '22%',
  className = '',
  sceneClassName = '',
  children,
  onExitProgress,
}: ActStageProps) {
  /* Pasillo por defecto según modo (ver HANDOFF arriba — ciclo 1). */
  const effectiveRunway = runway ?? (mode === 'pin' ? '85svh' : '35svh');
  /* Todos los hooks SIEMPRE declarados (orden estable); el modo solo decide
     el render, nunca la cantidad de hooks. */
  const wrapperRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const cinematic = isDesktop && !reduceMotion;

  /* ENTRADA — la escena asciende mientras su wrapper cruza el viewport. */
  const { scrollYProgress: entryProgress } = useScroll({
    target: wrapperRef,
    offset: ['start end', 'start start'],
  });

  /* SALIDA FIJADA — solo consumida por mode="pin" (hero). El ventana llega
     hasta 'end start': el repliegue continúa MIENTRAS el acto siguiente
     cubre la escena (progreso 1 justo al completarse la cobertura). */
  const { scrollYProgress: pinExitProgress } = useScroll({
    target: wrapperRef,
    offset: ['start start', 'end start'],
  });

  /* SALIDA HANDOFF — desde que el fondo del wrapper entra por abajo hasta que
     su tope sale por arriba (el pasillo alarga la convivencia de escenas). */
  const { scrollYProgress: handoffProgress } = useScroll({
    target: wrapperRef,
    offset: ['end end', 'end start'],
  });

  const entryShape = ENTRY_SHAPE[entry];
  const exitShape = EXIT_SHAPE[exit];

  const entryY = useTransform(entryProgress, [0, 1], [`${entryShape.y}svh`, '0svh']);
  const entryOpacity = useTransform(entryProgress, [0, 1], [entryShape.opacityFloor, 1]);

  const pinScale = useTransform(pinExitProgress, [0, 1], exitShape.scale);
  const pinY = useTransform(pinExitProgress, [0, 1], ['0svh', `${exitShape.y}svh`]);
  const pinOpacity = useTransform(pinExitProgress, [0.12, 0.98], [1, exitShape.opacityTo]);

  const handY = useTransform(handoffProgress, [0, 1], ['0svh', `${HANDOFF.y}svh`]);
  const handScale = useTransform(handoffProgress, [0, 1], [1, HANDOFF.scale]);
  const handOpacity = useTransform(handoffProgress, [HANDOFF.fadeFrom, 0.96], [1, HANDOFF.opacityTo]);

  /* Hairline ADN — la firma que conecta el navegador con la escena. */
  const hairlineScale = useTransform(entryProgress, [0.12, 0.8], [0, 1]);

  useEffect(() => {
    if (cinematic && mode === 'pin' && onExitProgress) onExitProgress(pinExitProgress);
    // Re-expuesto solo cuando cambia el modo cinematográfico.
  }, [cinematic, mode, onExitProgress, pinExitProgress]);

  /* ── Flujo nativo (móvil / reduced-motion): sin cine, sin pasillos ── */
  if (!cinematic) {
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

  if (mode === 'pin') {
    /* ── ESCENA FIJADA + COVER (solo hero) ── */
    return (
      <section
        id={id}
        ref={wrapperRef}
        data-act={act}
        className={`act-wrap--pinned ${className}`}
        style={{ ['--act-runway']: effectiveRunway } as CSSProperties}
        aria-label={`Acto ${act}`}
      >
        <motion.div
          className={`act-scene--pinned ${sceneClassName}`}
          style={{ y: entryY, opacity: entryOpacity }}
        >
          <motion.div
            className="h-full w-full"
            style={{ scale: pinScale, y: pinY, opacity: pinOpacity }}
          >
            {children}
          </motion.div>
          <motion.span
            aria-hidden="true"
            className="act-hairline"
            style={{ top: hairlineTop, scaleX: hairlineScale }}
          />
        </motion.div>
      </section>
    );
  }

  /* ── HANDOFF POR PROFUNDIDAD (actos 2-5 en escritorio) ── */
  return (
    <section
      id={id}
      ref={wrapperRef}
      data-act={act}
      className={`act-wrap--flow relative ${className}`}
      aria-label={`Acto ${act}`}
    >
      {/* Capa de entrada: la escena asciende con parallax propio. */}
      <motion.div style={{ y: entryY, opacity: entryOpacity }}>
        {/* Capa de salida: el acto sale lento (persiste en el escenario). */}
        <motion.div style={{ y: handY, scale: handScale, opacity: handOpacity }}>
          {children}
        </motion.div>
      </motion.div>
      {/* Pasillo: distancia extra de scroll donde ambas escenas conviven. */}
      <div
        aria-hidden="true"
        className="pointer-events-none"
        style={{ height: effectiveRunway }}
      />
      <motion.span
        aria-hidden="true"
        className="act-hairline"
        style={{ top: hairlineTop, scaleX: hairlineScale }}
      />
    </section>
  );
}
