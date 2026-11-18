/**
 * landing-pager-contract.test.tsx — ADN-LANDING-HERO-AND-PAGER-FIX-004 + 005
 * ============================================================================
 * Contrato a nivel de fuente del navegador de capítulos y del hero.
 *
 * Historia: el fallo del punto 2 (misión 004) era `sectionRefs[1]` = una ref
 * NUNCA adjunta → scrollIntoView sobre null, fallo silencioso. Este contrato
 * impide regresar a navegación por refs huérfanas y ancla las decisiones de
 * identidad del hero (firma ADNegocio con BrandWordmark, eslogan íntegro).
 *
 * ADN-005: los ids canónicos viven en los WRAPPERS de acto (ActStage en
 * LandingPage) — el paginador, el scrollspy, los anchors y los E2E resuelven
 * posiciones estables aunque el hero esté fijado (position: sticky). El
 * sistema cinematográfico NO puede regresar a: scroll-snap CSS en la raíz
 * (empíricamente luchaba contra el usuario), wheel-hijack ni refs huérfanas.
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

  it('el scrollspy deriva el punto activo del progreso por posición (no por umbral IO)', () => {
    expect(landing).toContain('setActiveSection(Math.min(numSections - 1');
    // El cálculo se ejecuta también al montar (carga con hash de sección)
    expect(landing).toMatch(/handleScroll\(\);\s*\/\/\s*estado correcto al montar/);
  });

  it('los atajos 1-5 usan la misma navegación por ID', () => {
    expect(landing).toMatch(/scrollToSectionById\(parseInt\(e\.key\) - 1\)/);
  });

  it('los puntos del paginador exponen aria-current (ActPager, heredado de 004)', () => {
    const pager = read('src/components/landing/ActPager.tsx');
    expect(pager).toContain("aria-current={isActive ? 'true' : undefined}");
    expect(pager).toContain('type="button"');
  });

  it('ADN-005 — los 5 ids canónicos viven en los wrappers ActStage de LandingPage', () => {
    const ids = ['hero', 'como-funciona', 'features', 'pricing', 'faq'];
    for (const id of ids) {
      expect(landing).toMatch(new RegExp(`id="${id}"`));
    }
    // Cada acto pasa por ActStage (el sistema de escenas)
    expect(landing.match(/<ActStage/g)?.length).toBe(5);
  });

  it('ADN-005 — los ids ya no viven duplicados en los componentes internos', () => {
    expect(read('src/components/landing/PricingSection.tsx')).not.toMatch(/id="pricing"/);
    expect(read('src/components/landing/ServicesStorySection.tsx')).not.toMatch(/id="como-funciona"/);
    expect(read('src/components/landing/FeaturesSection.tsx')).not.toMatch(/id="features"/);
    expect(read('src/components/landing/FAQSection.tsx')).not.toMatch(/id="faq"/);
    // El id canónico de pricing sigue siendo "pricing" (nunca "precios")
    expect(read('src/app/LandingPage.tsx')).not.toContain("'pricing-section'");
  });
});

describe('ADN-LANDING-CINEMATIC-SCROLL-STORYTELLING-005 — contrato del sistema de escenas', () => {
  const cinematic = read('src/components/landing/CinematicAct.tsx');
  const shield = read('src/styles/landing-shield.css');
  const landing = read('src/app/LandingPage.tsx');

  it('las escenas fijadas usan sticky + scrub por progreso (sin dependencias nuevas)', () => {
    expect(shield).toMatch(/\.act-scene--pinned\s*{[^}]*position:\s*sticky/);
    expect(cinematic).toContain('useScroll');
    expect(cinematic).toContain('useTransform');
    // Sin GSAP/Lenis ni bibliotecas de scroll nuevas
    const pkg = read('package.json');
    expect(pkg).not.toMatch(/"gsap"|lenis|scrollsmoother|fullpage/i);
  });

  it('scroll-snap CSS quedó DESCARTADO (luchaba contra el usuario — ciclo 0)', () => {
    expect(shield).not.toContain('scroll-snap-type');
    expect(shield).not.toContain('scroll-snap-align');
  });

  it('la barra nativa se oculta solo visualmente y solo en el landing', () => {
    expect(shield).toMatch(/html:has\(#landing-root\)[^{]*{[^}]*scrollbar-width:\s*none/);
    expect(shield).toMatch(/::-webkit-scrollbar\s*{[^}]*display:\s*none/);
    // El recorte horizontal no rompe sticky (hidden → clip)
    expect(shield).toMatch(/overflow-x:\s*clip/);
  });

  it('el hero es el único acto en modo pin; los altos usan handoff', () => {
    expect(landing).toMatch(/mode="pin"/);
    expect(landing.match(/mode="pin"/g)?.length).toBe(1);
  });

  it('el teclado de capítulos existe (PageDown/PageUp/Home/End)', () => {
    expect(landing).toMatch(/e\.key === 'PageDown'/);
    expect(landing).toMatch(/e\.key === 'PageUp'/);
    expect(landing).toMatch(/e\.key === 'Home'/);
    expect(landing).toMatch(/e\.key === 'End'/);
  });

  it('reduced-motion desactiva el cine (flujo nativo sin pasillos ni scrub)', () => {
    expect(cinematic).toMatch(/useReducedMotion/);
    expect(cinematic).toMatch(/reduceMotion/);
    expect(shield).toMatch(/prefers-reduced-motion: no-preference/);
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

  it('ADN-005 — la coreografía de salida recoge los fragmentos del caos', () => {
    expect(hero).toContain('DriftFragment');
    expect(hero).toContain('exitProgress');
    expect(hero).toContain('ProblemsEditorialScene exitProgress={exitProgress}');
  });
});
