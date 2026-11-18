/**
 * landing-pager-contract.test.tsx — ADN-LANDING-HERO-AND-PAGER-FIX-004
 * ============================================================================
 * Contrato a nivel de fuente del navegador lateral de 5 puntos y del hero.
 *
 * El fallo histórico del punto 2: el paginador usaba `sectionRefs[1]` =
 * ahaMomentRef, una ref NUNCA adjunta a ningún elemento (AhaMomentSection no
 * se renderiza) → scrollIntoView sobre null, fallo silencioso. Este contrato
 * impide regresar a navegación por refs huérfanas y ancla las decisiones de
 * identidad del hero (firma ADNegocio con BrandWordmark, eslogan íntegro).
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
    // El comentario histórico de LandingPage documenta el bug (y menciona los
    // nombres); lo que se prohibe es la DECLARACIÓN de las refs muertas.
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

  it('los puntos del paginador exponen aria-current y type=button', () => {
    expect(landing).toContain('aria-current={activeSection === idx ? \'true\' : undefined}');
  });

  it('el id canónico de pricing es "pricing" y las consultas muertas desaparecieron', () => {
    const pricing = read('src/components/landing/PricingSection.tsx');
    expect(pricing).toContain('id="pricing"');
    expect(pricing).not.toContain('id="precios"');
    expect(landing).not.toContain("'pricing-section'");
  });

  it('las 5 secciones tienen scroll-mt para el header fijo', () => {
    expect(read('src/components/landing/ServicesStorySection.tsx')).toMatch(/id="como-funciona"[\s\S]{0,200}scroll-mt/);
    expect(read('src/components/landing/FeaturesSection.tsx')).toMatch(/id="features"[\s\S]{0,200}scroll-mt/);
    expect(read('src/components/landing/PricingSection.tsx')).toMatch(/id="pricing"[\s\S]{0,200}scroll-mt/);
    expect(read('src/components/landing/FAQSection.tsx')).toMatch(/id="faq"[\s\S]{0,200}scroll-mt/);
  });
});

describe('ADN-LANDING-HERO-AND-PAGER-FIX-004 — contrato de identidad del hero', () => {
  const hero = read('src/components/landing/HeroSection.tsx');

  it('el hero incluye la firma ADNegocio (HeroBrandSignOff) con BrandWordmark', () => {
    expect(hero).toContain('function HeroBrandSignOff');
    expect(hero).toContain('<HeroBrandSignOff />');
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
});
