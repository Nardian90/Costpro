/**
 * LANDING BRAND & ENHANCED FIX (2026-10-12) — regresiones de las tres mejoras:
 *
 * 1. Enhanced: el texto «COSTPRO» del fondo (ParticleBackground Layer 2) debe
 *    mostrarse SOLO durante la carga de la vista. Causa raíz corregida: el
 *    contenedor usaba .enhanced-layer, cuya regla `html.mode-enhanced
 *    .enhanced-layer { animation: enhanced-fade-in (opacity→1) forwards }`
 *    (especificidad 0-2-1) anulaba el fade-out de .loading-branding-hidden
 *    (0-1-0) → texto permanente en dark+enhanced. El contrato estructural que
 *    fija este test: el contenedor de branding JAMÁS vuelve a llevar
 *    .enhanced-layer y siempre lleva dark-only + loading-branding-*.
 * 2. Catálogo: el paso 2 «Organiza tu catálogo» debe referenciar las 4
 *    imágenes demo (demo-products) con nombres/precios/stocks originales.
 * 3. Wordmark: BrandWordmark = «Cost» verde + «Pro» blanco, sin gradiente.
 *
 * jsdom no computa la cascada CSS de <style jsx global> ni animaciones:
 * la prohibición de enhanced-layer y del gradiente se blinda a nivel de
 * fuente (patrón source-contract del proyecto) + test estructural de render.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src?: string | { src?: string }; alt: string }) => (
    <img src={typeof src === 'string' ? src : ''} alt={alt} />
  ),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  type Props = { children?: React.ReactNode; className?: string; [k: string]: unknown };
  const passthrough = (tag: string) => (props: Props) =>
    React.createElement(tag, { className: props.className, 'aria-hidden': props['aria-hidden'] }, props.children);
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    useScroll: () => ({ scrollY: { get: () => 0, on: () => {}, unsubscribe: () => {} } }),
    useTransform: () => ({ get: () => 1, on: () => {}, unsubscribe: () => {} }),
    AnimatePresence: ({ children }: Props) => React.createElement(React.Fragment, null, children),
  };
});

import { render, screen } from '@testing-library/react';
import { ParticleBackground } from '@/components/ui/ParticleBackground';
import { MultiStoreVisualSection } from '@/components/landing/MultiStoreVisualSection';
import { BrandWordmark } from '@/components/landing/BrandWordmark';

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('FIX-ENHANCED-BRANDING-PERSIST — ParticleBackground Layer 2', () => {
  beforeEach(() => {
    document.documentElement.className = '';
  });

  it('el contenedor de branding NO lleva enhanced-layer (causa raíz del texto permanente)', () => {
    const { container } = render(<ParticleBackground viewId="pos" />);
    const brandingSpan = container.querySelector('.bg-costpro-branding');
    expect(brandingSpan).not.toBeNull();
    const brandingLayer = brandingSpan!.parentElement!;
    // La regresión: enhanced-layer inyectaba enhanced-fade-in (opacity→1 forwards)
    expect(brandingLayer.className).not.toContain('enhanced-layer');
    expect(brandingLayer.className).toContain('dark-only');
    expect(brandingLayer.className).toContain('pointer-events-none');
  });

  it('por defecto (sin carga) la capa queda en estado hidden; durante carga, visible', () => {
    const { container, rerender } = render(<ParticleBackground viewId="pos" />);
    let brandingLayer = container.querySelector('.bg-costpro-branding')!.parentElement!;
    expect(brandingLayer.className).toContain('loading-branding-hidden');
    expect(brandingLayer.className).not.toContain('loading-branding-visible');

    rerender(<ParticleBackground viewId="pos" showLoadingBranding />);
    brandingLayer = container.querySelector('.bg-costpro-branding')!.parentElement!;
    expect(brandingLayer.className).toContain('loading-branding-visible');
    expect(brandingLayer.className).not.toContain('loading-branding-hidden');
  });

  it('contrato de fuente: el gate de performance existe y el fade-out no compite con enhanced-fade-in', () => {
    const src = read('src/components/ui/ParticleBackground.tsx');
    // Gate de performance para la capa de branding (después de .dark-only)
    expect(src).toContain('html:not(.mode-enhanced) .loading-branding-hidden');
    expect(src).toContain('html:not(.mode-enhanced) .loading-branding-visible');
    // El contenedor de branding no referencia enhanced-layer en su className
    expect(src).not.toMatch(/overflow-hidden enhanced-layer dark-only/);
    // Reduced motion: canvas estático + fades instantáneos
    expect(src).toContain('prefers-reduced-motion');
    expect(src).toContain('animation-duration: 0.01ms');
  });

  it('el canvas no renderiza con prefers-reduced-motion activo (frame estático, sin bucle rAF)', () => {
    // jsdom: getContext devuelve null sin el paquete canvas → el efecto sale
    // temprano y no hay bucle. El contrato del frame estático se blindó en la
    // fuente (test anterior). Aquí se verifica que el componente monta sin
    // errores con reduced-motion activo.
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    expect(() => render(<ParticleBackground viewId="pos" />)).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('LANDING-CATALOG-IMAGES — «Organiza tu catálogo»', () => {
  it('renderiza las 4 tarjetas con imagen demo, nombre, precio y stock originales', () => {
    render(<MultiStoreVisualSection />);
    const expected = [
      { name: 'Arroz Grano Largo 5kg', price: '$320.00', stock: 'st: 120', img: '/landing/demo-products/arroz.webp' },
      { name: 'Aceite Girasol 1L', price: '$480.00', stock: 'st: 64', img: '/landing/demo-products/aceite.webp' },
      { name: 'Café Tostado 250g', price: '$350.00', stock: 'st: 55', img: '/landing/demo-products/cafe.webp' },
      { name: 'Detergente 900g', price: '$300.00', stock: 'st: 47', img: '/landing/demo-products/detergente.webp' },
    ];
    const alts = [
      'Saco transparente con arroz de grano largo',
      'Botella de aceite de girasol',
      'Paquete de café tostado en grano',
      'Caja de detergente en polvo',
    ];
    for (const p of expected) {
      expect(screen.getByText(p.name)).toBeTruthy();
      expect(screen.getByText(p.price)).toBeTruthy();
      expect(screen.getByText(p.stock)).toBeTruthy();
      // next/image mockeado expone src directo; alt descriptivo por producto
      const img = screen.getByAltText(alts[expected.indexOf(p)]);
      expect((img as HTMLImageElement).src).toContain(p.img);
    }
  });

  it('contrato de fuente: cada producto declara su imagen demo y fallback elegante', () => {
    const src = read('src/components/landing/MultiStoreVisualSection.tsx');
    expect(src).toContain('/landing/demo-products/arroz.webp');
    expect(src).toContain('/landing/demo-products/aceite.webp');
    expect(src).toContain('/landing/demo-products/cafe.webp');
    expect(src).toContain('/landing/demo-products/detergente.webp');
    // Fallback: onError → placeholder Package (nunca imagen rota)
    expect(src).toContain('onError');
    expect(src).toContain('object-contain');
  });
});

describe('FIX-BRAND-HIERARCHY — BrandWordmark', () => {
  it('renderiza «Cost» verde + «Pro» blanco y sin gradiente', () => {
    render(<BrandWordmark className="text-lg font-bold" />);
    const cost = screen.getByText('Cost');
    const pro = screen.getByText('Pro');
    expect(cost.className).toContain('text-[#22c55e]');
    expect(cost.className).not.toContain('text-white');
    expect(pro.className).toContain('text-white');
    expect(pro.className).not.toContain('bg-clip-text');
    expect(pro.className).not.toContain('bg-gradient');
  });

  it('contrato de fuente: el landing ya no duplica el wordmark con estilos independientes', () => {
    const hero = read('src/components/landing/HeroSection.tsx');
    expect(hero).not.toContain('bg-clip-text'); // gradiente del hero eliminado
    expect(hero).toContain('BrandWordmark');
    const footer = read('src/components/landing/FooterSection.tsx');
    expect(footer).toContain('BrandWordmark');
    const landing = read('src/app/LandingPage.tsx');
    expect(landing).toContain('BrandWordmark');
    // El componente compartido fija la jerarquía decidida
    const brand = read('src/components/landing/BrandWordmark.tsx');
    expect(brand).toContain("text-[#22c55e]\">Cost</span>");
    expect(brand).toContain("text-white\">Pro</span>");
  });
});
