/**
 * landing-pager-contract.test.tsx — ADN-LANDING-HERO-AND-PAGER-FIX-004 + 005 + 006
 * ============================================================================
 * Contrato a nivel de fuente del navegador de capítulos, del escenario
 * cinematográfico y del hero.
 *
 * Historia: el fallo del punto 2 (misión 004) era `sectionRefs[1]` = una ref
 * NUNCA adjunta → scrollIntoView sobre null, fallo silencioso. Este contrato
 * impide regresar a navegación por refs huérfanas y ancla las decisiones de
 * identidad del hero (firma ADNegocio con BrandWordmark, eslogan íntegro).
 *
 * ADN-005: los ids canónicos viven en los wrappers de acto.
 * ADN-006 (corrección de rumbo): el sistema de la 005 (hero pineado + handoffs
 * que el propietario rechazó — «solo un efecto al inicio, era mejor el scroll
 * de antes») queda SUSTITUIDO por el escenario persistente CinemaStage con
 * GSAP ScrollTrigger: un escenario fijado donde las 15 escenas se SUSTITUYEN
 * realmente unas a otras (scrub lineal al gesto + snap direccional
 * interrumpible + inertia:false). El contrato prohíbe regresar a: wheel-hijack,
 * timers de escena, scroll-snap CSS en la raíz y refs huérfanas.
 * ============================================================================
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('ADN-LANDING-HERO-AND-PAGER-FIX-004 — contrato del paginador lateral', () => {
  const landing = read('src/app/LandingPage.tsx');

  it('el paginador navega por IDs reales (getElementById de sectionIds), no por refs', () => {
    expect(landing).toContain('document.getElementById(sectionIds[idx])');
    // La vía muerta (ref huérfana) no puede regresar:
    expect(landing).not.toMatch(/sectionRefs\s*\[\s*idx\s*\]\s*\?\.\s*current\s*\?\.\s*scrollIntoView/);
  });

  it('no existen refs huérfanas del paginador (la declaración de ahaMomentRef/sectionRefs está prohibida)', () => {
    expect(landing).not.toMatch(/const\s+ahaMomentRef\s*=\s*useRef/);
    expect(landing).not.toMatch(/const\s+sectionRefs\s*=\s*\[/);
  });

  it('el scrollspy de flujo deriva el punto activo del progreso por posición (no por umbral IO)', () => {
    expect(landing).toContain('setActiveSection(Math.min(numSections - 1');
    // El cálculo se ejecuta también al montar (carga con hash de sección)
    expect(landing).toMatch(/handleScroll\(\);\s*\/\/\s*estado correcto al montar/);
  });

  it('ADN-006: en modo cine el scrollspy por posición NO aplica (lo publica el escenario)', () => {
    // El spy de posición queda acotado al modo flujo (bloque if !cinemaModeRef)
    expect(landing).toMatch(/if \(!cinemaModeRef\.current\) \{[\s\S]*?setActiveSection\(Math\.min\(numSections - 1/);
  });

  it('los atajos 1-5 usan la misma navegación por ID', () => {
    expect(landing).toMatch(/scrollToSectionById\(parseInt\(e\.key\) - 1\)/);
  });

  it('los puntos del paginador exponen aria-current (ActPager, heredado de 004)', () => {
    const pager = read('src/components/landing/ActPager.tsx');
    expect(pager).toContain("aria-current={isActive ? 'true' : undefined}");
    expect(pager).toContain('type="button"');
  });

  it('ADN-006 — los 5 ids canónicos existen en las ramas cine y flujo', () => {
    const ids = ['hero', 'como-funciona', 'features', 'pricing', 'faq'];
    for (const id of ids) {
      expect(landing).toMatch(new RegExp(`id="${id}"`));
    }
    // El cine usa el registro de escenas; el flujo pasa por ActStage
    expect(landing).toContain('buildCinemaScenes');
    expect(landing).toContain('<CinemaStage');
    expect(landing.match(/<ActStage/g)?.length).toBe(5);
  });

  it('ADN-005/006 — los ids ya no viven duplicados en los componentes internos', () => {
    expect(read('src/components/landing/PricingSection.tsx')).not.toMatch(/id="pricing"/);
    expect(read('src/components/landing/ServicesStorySection.tsx')).not.toMatch(/id="como-funciona"/);
    expect(read('src/components/landing/FeaturesSection.tsx')).not.toMatch(/id="features"/);
    expect(read('src/components/landing/FAQSection.tsx')).not.toMatch(/id="faq"/);
    // El id canónico de pricing sigue siendo "pricing" (nunca "precios")
    expect(read('src/app/LandingPage.tsx')).not.toContain("'pricing-section'");
  });
});

describe('ADN-LANDING-TRUE-FULLPAGE-EXPERIENCE-006 — contrato del escenario persistente', () => {
  const cinema = read('src/components/landing/cinema/CinemaStage.tsx');
  const shield = read('src/styles/landing-shield.css');
  const landing = read('src/app/LandingPage.tsx');

  it('GSAP ScrollTrigger es el motor del escenario (pin + scrub + snap direccional)', () => {
    expect(cinema).toContain("gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)");
    expect(cinema).toMatch(/pin:\s*true/);
    expect(cinema).toMatch(/scrub:\s*true/);
    expect(cinema).toMatch(/snapTo:\s*'labelsDirectional'/);
  });

  it('el snap NO se propulsa solo (inertia:false — §4.2: el control es del visitante)', () => {
    expect(cinema).toMatch(/inertia:\s*false/);
  });

  it('sin wheel-hijack ni secuencias de timers (el scroll nativo es el único controlador)', () => {
    expect(cinema).not.toMatch(/addEventListener\('wheel'/);
    expect(cinema).not.toMatch(/wheelDelta/);
    expect(cinema).not.toMatch(/setInterval/);
    expect(cinema).not.toMatch(/preventDefault\(\)\s*;\s*\/\/\s*wheel/);
  });

  it('los paneles de escena son opacos (las escenas se SUSTITUYEN, no se mezclan)', () => {
    expect(shield).toMatch(/\.cinema-scene\s*{[^}]*background:\s*#05070a/);
    expect(shield).toMatch(/\.cinema-scene\s*{[^}]*visibility:\s*hidden/);
    // La primera escena es visible ANTES del efecto GSAP (sin flash vacío).
    // POR data-scene-index y NUNCA :first-child: la sweepline es el primer
    // hijo del escenario, así que :first-child no matchea ninguna escena
    // (hallazgo Codex, PR #1658).
    expect(shield).toMatch(
      /\.cinema-scene\[data-scene-index=['"]0['"]\]\s*{[^}]*visibility:\s*visible/,
    );
    expect(shield).not.toMatch(/\.cinema-scene:first-child/);
  });

  it('solo transform/opacity/clip-path en las transiciones (§11 rendimiento)', () => {
    // El vocabulario de transiciones no anima propiedades de layout
    expect(cinema).toMatch(/yPercent|xPercent|scale|autoAlpha|clipPath/);
    expect(cinema).not.toMatch(/width:\s*\d|height:\s*\d|top:\s*\d|left:\s*\d/);
  });

  it('el teclado de capítulos existe (PageDown/PageUp/Home/End)', () => {
    expect(landing).toMatch(/e\.key === 'PageDown'/);
    expect(landing).toMatch(/e\.key === 'PageUp'/);
    expect(landing).toMatch(/e\.key === 'Home'/);
    expect(landing).toMatch(/e\.key === 'End'/);
  });

  it('reduced-motion / móvil / tablet desactivan el cine (flujo nativo íntegro)', () => {
    // La decisión de modo exige ancho, alto y movimiento
    expect(landing).toMatch(/'\(min-width: 1024px\)'/);
    expect(landing).toMatch(/'\(min-height: 700px\)'/);
    expect(landing).toMatch(/'\(prefers-reduced-motion: reduce\)'/);
    // ActStage queda como capa de flujo (sin pin)
    const act = read('src/components/landing/CinematicAct.tsx');
    expect(act).not.toMatch(/position:\s*sticky|useScroll/);
  });

  it('la barra nativa se oculta solo visualmente y solo en el landing', () => {
    expect(shield).toMatch(/html:has\(#landing-root\)[^{]*{[^}]*scrollbar-width:\s*none/);
    expect(shield).toMatch(/::-webkit-scrollbar\s*{[^}]*display:\s*none/);
    expect(shield).toMatch(/overflow-x:\s*clip/);
  });

  it('scroll-snap CSS sigue DESCARTADO (luchaba contra el usuario — evidencia 005)', () => {
    expect(shield).not.toContain('scroll-snap-type');
    expect(shield).not.toContain('scroll-snap-align');
  });

  it('gotoChapter navega por posición de scroll del escenario (no scrollIntoView sobre el stage pineado)', () => {
    expect(cinema).toMatch(/scrollTo:\s*\{\s*y:\s*to,\s*autoKill:\s*true\s*\}/);
  });

  it('las 15 escenas / 5 capítulos del registro conservan el contenido real', () => {
    const registry = read('src/components/landing/cinema/sceneRegistry.tsx');
    // El registro consume las 7 historias REALES (SECTIONS de ServicesStorySection)
    expect(registry).toContain("SECTIONS as STORY");
    expect(registry).toMatch(/const s = STORY;/);
    // …y las composiciones de escena usan EXACTAMENTE esos textos
    const scenes = read('src/components/landing/cinema/SceneContent.tsx');
    expect(scenes).toContain('{data.title}');
    expect(scenes).toContain('{data.description}');
    expect(scenes).toContain('{data.subtitle}');
    // Contenido real, no placeholders (marcadores convencionales en mayúscula)
    expect(registry).not.toMatch(/\bTODO\b|FIXME|placeholder/);
  });
});

describe('ADN-LANDING-HERO-AND-PAGER-FIX-004 — contrato de identidad del hero', () => {
  const hero = read('src/components/landing/HeroSection.tsx');

  it('el hero incluye la firma ADNegocio (HeroBrandSignOff) con BrandWordmark', () => {
    expect(hero).toContain('function HeroBrandSignOff');
    expect(hero).toContain('<HeroBrandSignOff');
    // Identidad única: el mismo wordmark del sidebar autenticado
    const sign = hero.slice(hero.indexOf('function HeroBrandSignOff'), hero.indexOf('function HeroHeadline'));
    expect(sign).toContain('<BrandWordmark');
    expect(sign).toContain('font-[family-name:var(--font-space-grotesk)]');
    expect(sign).toContain('clamp('); // tamaño fluido de la pieza protagónica
  });

  it('la máscara de la firma cubre la descendente de la «g» (lección misión 003)', () => {
    const sign = hero.slice(hero.indexOf('function HeroBrandSignOff'), hero.indexOf('function HeroHeadline'));
    expect(sign).toContain('overflow-hidden');
    expect(sign).toMatch(/pb-\[0\.3em\]/);
    expect(sign).toMatch(/y: '148%'/); // arranque oculto recalculado con el padding
  });

  it('el eslogan aprobado permanece íntegro (MENOS MALABARES. MÁS negocio.)', () => {
    expect(hero).toContain('MENOS MALABARES. MÁS NEGOCIO.'); // sr-only del h1
    expect(hero).toContain('negocio.'); // acento serif verde de la misión 002
    expect(hero).toContain('MALABARES_LETTERS');
  });

  it('reduced-motion: la firma es visible sin animación', () => {
    const sign = hero.slice(hero.indexOf('function HeroBrandSignOff'), hero.indexOf('function HeroHeadline'));
    expect(sign).toContain('useReducedMotion');
    expect(sign).toContain('reduceMotion ? false');
  });

  it('ADN-006 — la coreografía de salida del hero sigue conectada al escenario', () => {
    expect(hero).toContain('DriftFragment');
    expect(hero).toContain('exitProgress');
    expect(hero).toContain('ProblemsEditorialScene exitProgress={exitProgress}');
    // El puente lo alimenta CinemaStage (MotionValue estable en LandingPage)
    expect(read('src/app/LandingPage.tsx')).toContain('heroExitMv={heroExitMv}');
  });
});
