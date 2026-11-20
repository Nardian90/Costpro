'use client';

/**
 * CinemaStage — ADN-LANDING-TRUE-FULLPAGE-EXPERIENCE-006
 * ============================================================================
 * ESCENARIO PERSISTENTE + SUSTITUCIÓN REAL DE ESCENAS.
 *
 * Arquitectura (corrección de rumbo respecto a la 005):
 *   · UN solo escenario (#cinema-stage, 100svh) permanece fijado (ScrollTrigger
 *     pin) durante TODA la experiencia — el visitante NO ve una página que
 *     baja: ve cómo una escena completa sustituye a otra dentro del escenario.
 *   · Las escenas son paneles apilados absolute inset-0 dentro del escenario.
 *   · UN timeline maestro con scrub lineal al gesto: cada transición
 *     i→i+1 es un segmento contiguo (salida variante propia + entrada variante
 *     propia, con solape controlado) — la continuidad está GARANTIZADA por
 *     construcción (segmentos contiguos, sin huecos posibles).
 *   · Labels `s0..s{n-1}` en los puntos de reposo de cada escena + snap
 *     `labelsDirectional` (ajuste direccional interrumpible: un nuevo gesto
 *     del visitante cancela el ajuste — el control permanece en sus manos).
 *   · Sin wheel-hijack, sin timers, sin scroll-snap CSS (descartado con
 *     evidencia en la 005), sin motores combinados: GSAP+ScrollTrigger es el
 *     ÚNICO motor del escenario; framer-motion sigue en micro-interacciones
 *     internas de las secciones (hero, FAQ, acordeón).
 *
 * Transiciones (vocabulary — cada una con identidad, ninguna repetida como
 * fade genérico; ver sceneDefs): push (cinta transportadora vertical),
 * depth (profundidad: sale alejándose / entra acercándose), mask (cortina
 * con clip-path y la línea ADN en el borde), sweep (la línea ADN barre el
 * escenario y las composiciones se desplazan con ella), typo (salida
 * tipográfica hacia la cámara + entrada escalonada del capítulo siguiente).
 *
 * Movimiento controlado (§4.2): scrub:true = el progreso sigue el gesto al
 * 100% — avanzar lento progresa lento; snap completa hacia el punto de
 * reposo al terminar el gesto y CUALQUIER nueva interacción lo interrumpe.
 *
 * Móvil / tablet / reduced-motion: este componente NO se monta — el landing
 * renderiza las secciones de flujo nativo (LandingPage decide).
 * ============================================================================
 */

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import type { MotionValue } from 'framer-motion';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

export type TransitionKind = 'push' | 'depth' | 'mask' | 'sweep' | 'typo';

export interface CinemaSceneDef {
  /** id canónico (misión 004) — SOLO la primera escena de cada capítulo. */
  id?: string;
  /** capítulo 0..4 — alimenta el navegador lateral. */
  chapter: number;
  /** variante de transición AL ENTRAR a esta escena (la escena 0 no entra). */
  inKind?: TransitionKind;
  content: React.ReactNode;
}

export interface CinemaControls {
  gotoChapter: (chapterIdx: number) => void;
  /** Scroll y absoluto del reposo de una escena (utilidad E2E/support). */
  sceneScrollY: (sceneIdx: number) => number;
  refresh: () => void;
}

interface CinemaStageProps {
  scenes: CinemaSceneDef[];
  /** Registra los controles (gotoChapter…) en el propietario. */
  registerControls: (controls: CinemaControls | null) => void;
  /** Publica (capítulo activo, progreso en unidades de capítulo 0..4). */
  onChapterProgress: (activeChapter: number, chapterUnits: number) => void;
  /** MotionValue del progreso de salida del hero (0→1) — coreografía interna
   *  de los fragmentos del caos (contrato HeroSection intacto). */
  heroExitMv?: MotionValue<number> | null;
  /**
   * CP-FIX-LANDING-RESPONSIVE (2026-11-20 §4.2): sonda de ajuste de contenido.
   * Se invoca tras el montaje (y tras fonts.ready / resize debounced) con la
   * PEOR escena que desborda el escenario (scrollHeight/scrollWidth contra el
   * panel) — null cuando TODAS las escenas caben. El propietario usa el
   * veredicto para caer al MODO FLUJO: nunca se fuerza el cine por encima de
   * la legibilidad (misión: «no forzar el modo cine por encima de la
   * legibilidad o usabilidad»).
   */
  onContentOverflow?: (worst: { sceneIndex: number; overflowY: number; overflowX: number } | null) => void;
}

/* Duración del segmento de transición dentro de cada unidad de scroll.
   La unidad total = 100svh de scroll por escena: 75% transición + 25% reposo.
   Los labels caen al FINAL de la unidad (punto de reposo completo). */
const T = 0.75;

/** Construye el segmento de transición i-1 → i dentro del timeline maestro. */
function addTransition(
  tl: gsap.core.Timeline,
  stage: HTMLElement,
  panels: HTMLElement[],
  sweep: HTMLElement,
  i: number,
  kind: NonNullable<CinemaSceneDef['inKind']>,
): void {
  const seg = i - 1;
  const out = panels[i - 1];
  const inn = panels[i];
  const stageW = () => stage.offsetWidth;

  if (kind === 'push') {
    /* Cinta transportadora: las dos escenas se mueven en LOCKSTEP — los
       bordes coinciden siempre (misma duración y easing) → jamás hay hueco. */
    tl.to(out, { yPercent: -100, ease: 'power1.inOut', duration: T }, seg).fromTo(
      inn,
      { yPercent: 100, autoAlpha: 1 },
      { yPercent: 0, ease: 'power1.inOut', duration: T },
      seg,
    );
  } else if (kind === 'depth') {
    /* Profundidad: la escena actual se aleja (scale down + fade) mientras la
       siguiente llega acercándose (scale 1.09→1). Capas conviven en el plano. */
    tl.to(
      out,
      { scale: 0.86, yPercent: -8, autoAlpha: 0, ease: 'power2.in', duration: T * 0.85 },
      seg,
    ).fromTo(
      inn,
      { scale: 1.09, yPercent: 3, autoAlpha: 0 },
      { scale: 1, yPercent: 0, autoAlpha: 1, ease: 'power2.out', duration: T * 0.85 },
      seg + 0.15,
    );
  } else if (kind === 'mask') {
    /* Cortina: la escena siguiente se revela con clip-path (de derecha a
       izquierda) sobre la anterior, atenuada — la línea ADN viaja en el borde
       del recorte. */
    tl.fromTo(
      inn,
      { clipPath: 'inset(0% 0% 0% 100%)', autoAlpha: 1 },
      { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.inOut', duration: T * 0.8 },
      seg + 0.08,
    )
      /* La escena saliente se apaga COMPLETAMENTE (no 0.5): el panel entrante
         la cubre con fondo opaco — y al terminar en 0 no quedan fantasmas
         que se transparenten en transiciones posteriores (ciclo 1). */
      .to(out, { scale: 0.985, autoAlpha: 0, ease: 'power2.out', duration: T * 0.55 }, seg + 0.05)
      .fromTo(
        sweep,
        { x: stageW, autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.06, ease: 'none' },
        seg + 0.08,
      )
      .to(sweep, { x: 0, ease: 'power2.inOut', duration: T * 0.8 }, seg + 0.14)
      .to(sweep, { autoAlpha: 0, duration: 0.08 }, seg + T * 0.9);
  } else if (kind === 'sweep') {
    /* Barrido ADN: la línea verde cruza el escenario y las composiciones se
       desplazan con ella (salida hacia la izquierda, entrada desde la derecha). */
    tl.to(out, { xPercent: -8, autoAlpha: 0, ease: 'power2.in', duration: T * 0.53 }, seg)
      .fromTo(
        inn,
        { xPercent: 8, autoAlpha: 0 },
        { xPercent: 0, autoAlpha: 1, ease: 'power2.out', duration: T * 0.72 },
        seg + 0.24,
      )
      .fromTo(
        sweep,
        { x: () => stageW() * 0.42, autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.08, ease: 'none' },
        seg + 0.06,
      )
      .to(sweep, { x: () => -stageW() * 0.18, ease: 'power2.inOut', duration: T * 0.72 }, seg + 0.14)
      .to(sweep, { autoAlpha: 0, duration: 0.1 }, seg + T * 0.92);
  } else {
    /* typo — cambio de CAPÍTULO: la escena saliente surge hacia la cámara y
       se disuelve; el capítulo entra desplazándose y su contenido aparece
       escalonado (.cin-stagger si existe). */
    tl.to(out, { scale: 1.14, autoAlpha: 0, ease: 'power3.in', duration: T * 0.6 }, seg)
      .fromTo(
        inn,
        { yPercent: 12, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1, ease: 'power3.out', duration: T * 0.85 },
        seg + 0.22,
      )
      .fromTo(
        sweep,
        { x: stageW, autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.06, ease: 'none' },
        seg + 0.1,
      )
      .to(sweep, { x: 0, ease: 'power2.inOut', duration: T * 0.78 }, seg + 0.14)
      .to(sweep, { autoAlpha: 0, duration: 0.08 }, seg + T * 0.94);

    const stag = inn.querySelectorAll('.cin-stagger');
    if (stag.length > 0) {
      tl.fromTo(
        stag,
        { y: 24, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, stagger: 0.03, ease: 'power2.out', duration: 0.35 },
        seg + 0.34,
      );
    }
  }
}

export default function CinemaStage({
  scenes,
  registerControls,
  onChapterProgress,
  heroExitMv,
  onContentOverflow,
}: CinemaStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  /* Refs de estabilidad para callbacks de ScrollTrigger (sin re-crear el
     timeline cuando el propietario re-renderiza). */
  const progressCbRef = useRef(onChapterProgress);
  const heroMvRef = useRef(heroExitMv);
  const overflowCbRef = useRef(onContentOverflow);
  progressCbRef.current = onChapterProgress;
  heroMvRef.current = heroExitMv;
  overflowCbRef.current = onContentOverflow;
  const stRef = useRef<ScrollTrigger | null>(null);
  const nRef = useRef(scenes.length);
  const chapterOfRef = useRef<number[]>(scenes.map((s) => s.chapter));

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const panels = Array.from(stage.querySelectorAll<HTMLElement>('.cinema-scene'));
    const sweep = stage.querySelector<HTMLElement>('.cinema-sweepline');
    if (!sweep || panels.length === 0) return;
    const N = panels.length;
    nRef.current = N;

    const publish = (progress: number) => {
      const last = N - 1;
      const sceneFloat = progress * last;
      /* Escena dominante: la más cercana por redondeo — el navegador lateral
         cambia a mitad de transición, respondiendo al gesto. */
      const idx = Math.min(last, Math.max(0, Math.round(sceneFloat)));
      const chapter = chapterOfRef.current[idx] ?? 0;
      /* Profundidad dentro del capítulo (0..1) — llena el hilo del paginador. */
      let first = N;
      let count = 0;
      for (let k = 0; k < N; k++) {
        if (chapterOfRef.current[k] === chapter) {
          first = Math.min(first, k);
          count++;
        }
      }
      const span = Math.max(1, count - 1);
      const fraction = count > 1 ? (idx - first) / span : 0;
      const chapterUnits = chapter + Math.min(1, Math.max(0, fraction));
      progressCbRef.current(chapter, chapterUnits);
      /* Puente con la coreografía interna del hero (fragmentos del caos). */
      if (heroMvRef.current) heroMvRef.current.set(Math.min(1, Math.max(0, sceneFloat)));
    };

    const ctx = gsap.context(() => {
      /* Estados iniciales: solo la escena 0 en reposo (el CSS ya oculta el
         resto; autoAlpha sincroniza opacity+visibility para el timeline). */
      panels.forEach((p, k) => {
        if (k === 0) {
          gsap.set(p, { autoAlpha: 1, yPercent: 0, xPercent: 0, scale: 1, clipPath: 'inset(0% 0% 0% 0%)' });
        } else {
          gsap.set(p, { autoAlpha: 0, yPercent: 0, xPercent: 0, scale: 1, clipPath: 'inset(0% 0% 0% 0%)' });
        }
      });
      gsap.set(sweep, { autoAlpha: 0, x: 0 });

      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: {
          trigger: stage,
          start: 'top top',
          /* (N-1) viewports de scroll = (N-1) unidades de timeline. El pin
             añade el espaciado (pinSpacing) — tras el escenario, el footer
             entra como epílogo en flujo. */
          end: () => '+=' + window.innerHeight * (N - 1),
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          scrub: true,
          invalidateOnRefresh: true,
          /* Ajuste direccional a los puntos de reposo de las escenas: al
             terminar el gesto, completa hacia la escena correspondiente. Es
             INTERRUPTIBLE — cualquier nueva interacción lo cancela.
             inertia:false — el ajuste NO predice momentum (la experiencia no
             se propulsa sola: §4.2 «el control permanece en manos del
             visitante»); la dirección la da el último gesto (labelsDirectional). */
          snap: {
            snapTo: 'labelsDirectional',
            inertia: false,
            duration: { min: 0.18, max: 0.55 },
            delay: 0.06,
            ease: 'power2.inOut',
          },
          onUpdate: (self) => publish(self.progress),
          onRefresh: (self) => publish(self.progress),
        },
      });

      tl.addLabel('s0', 0);
      for (let i = 1; i < N; i++) {
        const kind = scenes[i]?.inKind ?? 'push';
        addTransition(tl, stage, panels, sweep, i, kind);
        tl.addLabel(`s${i}`, i);
      }
      /* CRÍTICO: la duración del timeline debe ser EXACTAMENTE (N-1) — los
         labels de reposo deben mapear 1:1 a unidades de scroll (1 viewport
         por escena). El último label NO extiende la duración de un timeline
         de GSAP (la duración la marcan los tweens: (N-1)-0.75) → sin este
         relleno, el scrub desalineaba los labels del gesto (ciclo 2: s14
         inalcanzable, snap aterrizando entre escenas). */
      const pad = N - 1 - tl.duration();
      if (pad > 0.001) tl.to({}, { duration: pad });

      stRef.current = tl.scrollTrigger ?? null;
    }, stage);

    /* Controles del propietario (paginador, teclado, paleta de comandos). */
    const sceneScrollY = (sceneIdx: number) => {
      const st = stRef.current;
      if (!st) return 0;
      return st.start + sceneIdx * window.innerHeight;
    };
    registerControls({
      gotoChapter: (chapterIdx: number) => {
        const st = stRef.current;
        if (!st) return;
        /* Primera escena del capítulo pedido. */
        const chapter = chapterOfRef.current;
        let target = 0;
        for (let k = 0; k < N; k++) {
          if (chapter[k] === chapterIdx) {
            target = k;
            break;
          }
        }
        const from = window.scrollY;
        const to = sceneScrollY(target);
        const dist = Math.abs(to - from);
        const duration = Math.min(1.5, Math.max(0.55, 0.45 + (dist / Math.max(window.innerHeight, 1)) * 0.1));
        gsap.to(window, {
          scrollTo: { y: to, autoKill: true },
          duration,
          ease: 'power2.inOut',
          overwrite: 'auto',
        });
      },
      sceneScrollY,
      refresh: () => ScrollTrigger.refresh(),
    });

    /* Fuente de verdad para pruebas/support (E2E 006): posiciones exactas de
       reposo calculadas por el propio ScrollTrigger — inmuniza los tests de
       errores de medición de geometría (header/promo/spacer). */
    (window as unknown as { __cinemaSceneScrollY?: (k: number) => number }).__cinemaSceneScrollY =
      sceneScrollY;

    /* ── SONDA DE AJUSTE (CP-FIX-LANDING-RESPONSIVE 2026-11-20 §4.2) ──
       Mide si el CONTENIDO de cada escena (data-scene-frame: el flujo real,
       sin el sangrado decorativo absoluto) cabe en el escenario. Si la peor
       escena desborda más allá de la tolerancia, el propietario recibe el
       veredicto y cae al modo flujo — nunca se fuerza el cine por encima de
       la legibilidad. Se re-mide tras cargar las fuentes (el font-swap cambia
       el layout) y en cada resize (debounced). Las transiciones no afectan la
       medición: transform/clip-path son visuales, no layout.

       ESTABILIDAD (hallazgo de la matriz): NO se mide en el instante del
       montaje — las micro-interacciones framer-motion (p. ej. el acordeón del
       FAQ colapsando de height:auto a height:0, 0.3s) dejan alturas NATURALES
       transitorias que producían falsos positivos de miles de px. La primera
       medición espera el asentamiento (SETTLE_MS) y se confirma con una
       segunda pasada: solo se reporta el desborde si dos mediciones
       consecutivas COINCIDEN (layout estable). */
    const FIT_TOLERANCE = 16; // px — absorbe sangrado decorativo (fragmentos rotados, etiquetas -top)
    const FIT_SETTLE_MS = 450; // > 0.3s de las animaciones de entrada/colapso de framer-motion
    const measureFit = (): { sceneIndex: number; overflowY: number; overflowX: number } | null => {
      let worst: { sceneIndex: number; overflowY: number; overflowX: number } | null = null;
      panels.forEach((panel, i) => {
        const frame = panel.querySelector<HTMLElement>('[data-scene-frame]') ?? panel;
        const overflowY = frame.scrollHeight - frame.clientHeight;
        const overflowX = frame.scrollWidth - frame.clientWidth;
        if ((overflowY > FIT_TOLERANCE || overflowX > FIT_TOLERANCE)
            && (!worst || overflowY + overflowX > worst.overflowY + worst.overflowX)) {
          worst = { sceneIndex: i, overflowY: Math.max(0, overflowY), overflowX: Math.max(0, overflowX) };
        }
      });
      return worst;
    };
    /* Doble pasada con confirmación: reporta solo veredictos ESTABLES (dos
       mediciones consecutivas idénticas). Mientras las alturas sigan cambiando
       (animación en curso) reintenta; al estabilizar, reporta el veredicto —
       incluido null (= todo cabe), que desbloquea el modo cine. */
    type FitVerdict = { sceneIndex: number; overflowY: number; overflowX: number } | null;
    const sameVerdict = (a: FitVerdict, b: FitVerdict): boolean =>
      (a === null && b === null)
      || (!!a && !!b && a.sceneIndex === b.sceneIndex && Math.abs(a.overflowY - b.overflowY) <= 1 && Math.abs(a.overflowX - b.overflowX) <= 1);
    let lastVerdict: FitVerdict | undefined; // undefined = sin pasada previa
    let confirmTimer = 0;
    const confirmAndReport = () => {
      const verdict = measureFit();
      const stable = lastVerdict !== undefined && sameVerdict(verdict, lastVerdict);
      lastVerdict = verdict;
      if (stable) { overflowCbRef.current?.(verdict); return; }
      confirmTimer = window.setTimeout(confirmAndReport, FIT_SETTLE_MS);
    };
    let fitResizeTimer = 0;
    const onFitResize = () => {
      window.clearTimeout(fitResizeTimer);
      fitResizeTimer = window.setTimeout(() => { lastVerdict = undefined; confirmAndReport(); }, 250);
    };
    confirmTimer = window.setTimeout(confirmAndReport, FIT_SETTLE_MS);
    window.addEventListener('resize', onFitResize);
    let fontsChecked = false;
    const onFontsReady = () => { if (!fontsChecked) { fontsChecked = true; window.setTimeout(() => { lastVerdict = undefined; confirmAndReport(); }, FIT_SETTLE_MS); } };
    if (typeof document !== 'undefined' && (document as Document & { fonts?: FontFaceSet }).fonts) {
      (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(onFontsReady).catch(() => {});
    }

    /* Deep-link (#features, #pricing…) al montar en modo cine. */
    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    if (hash) {
      const idx = panels.findIndex((p) => p.id === hash);
      if (idx > 0) {
        requestAnimationFrame(() => {
          const st = stRef.current;
          if (st) gsap.set(window, { scrollTo: st.start + idx * window.innerHeight });
        });
      }
    }

    return () => {
      registerControls(null);
      gsap.killTweensOf(window);
      ctx.revert();
      stRef.current = null;
      window.removeEventListener('resize', onFitResize);
      window.clearTimeout(fitResizeTimer);
      window.clearTimeout(confirmTimer);
    };
  }, []);

  return (
    <main id="main-content">
      <div
        ref={stageRef}
        id="cinema-stage"
        data-cinema="true"
        data-scenes={scenes.length}
        className="cinema-stage"
      >
        {/* Línea ADN — firma que barre el escenario en mask/sweep/typo */}
        <span
          aria-hidden="true"
          className="cinema-sweepline"
        />
        {scenes.map((scene, i) => (
          <div
            key={scene.id ?? `scene-${i}`}
            id={scene.id}
            data-scene-index={i}
            data-chapter={scene.chapter}
            className="cinema-scene"
          >
            {scene.content}
          </div>
        ))}
      </div>
    </main>
  );
}
