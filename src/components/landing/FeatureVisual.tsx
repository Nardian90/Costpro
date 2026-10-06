'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';

/**
 * FeatureVisual — Evidencia visual del producto para el landing.
 * ============================================================================
 * LANDING VISUAL EVIDENCE (FASE 4): patrón reutilizable para mostrar capturas
 * REALES de CostPro (public/landing/capturas/*.webp, 1440x900, generadas con
 * scripts/landing-captures.mjs sobre un estado demo controlado — sin PII).
 *
 * Características:
 *  - Marco de navegador sobrio (FASE 5): barra superior con traffic lights y
 *    URL contextual — la app es la protagonista, no el adorno.
 *  - next/image: lazy por defecto (below fold), `priority` solo para el hero.
 *  - Aspect ratio 16/10 controlado — el screenshot nunca se deforma.
 *  - Responsive: en móvil ocupa el ancho completo sin dejar de ser legible
 *    (el usuario puede hacer zoom/tap para el detalle; el frame no lo encoge).
 *  - Accesibilidad: `alt` obligatorio y descriptivo (FASE 9); caption opcional
 *    como contexto visible.
 *  - Sin animaciones pesadas: un solo fade-in al entrar en viewport
 *    (framer-motion whileInView once), respetando prefers-reduced-motion.
 */

interface FeatureVisualProps {
  /** Ruta pública del WebP (p. ej. '/landing/capturas/dashboard.webp') */
  src: string;
  /** Alt descriptivo — comunica la función mostrada (FASE 9) */
  alt: string;
  /** Captura móvil (739x1600) — art direction (FASE 10): en pantallas <640px
   *  se muestra la versión móvil real de la misma pantalla en vez de la
   *  captura de desktop reducida (que resultaría ilegible). */
  srcMobile?: string;
  /** Alt de la variante móvil (por defecto usa `alt`) */
  altMobile?: string;
  /** Etiqueta del marco: URL/dominio mostrado en la barra del navegador */
  frameLabel?: string;
  /** Caption visible debajo de la captura (contexto adicional) */
  caption?: string;
  /** Prioridad de carga — SOLO para el visual crítico del hero (FASE 8) */
  priority?: boolean;
  /** Ancho máximo del frame (clases tailwind de max-w) */
  className?: string;
  /** id para deep-links */
  id?: string;
  /**
   * `sizes` de next/image — ancho CSS REAL del render (FIX CALIDAD 2026-10-06).
   * El valor anterior («…, 640px») era MENOR que el ancho real (~976px en
   * MultiStore) → el navegador elegía un derivado de 640px y lo estiraba →
   * imagen despixelada. Cada sección pasa el suyo según su layout.
   */
  sizes?: string;
}

const DEFAULT_SIZES = '(max-width: 640px) 100vw, (max-width: 1024px) 92vw, 976px';

export default function FeatureVisual({
  src,
  alt,
  srcMobile,
  altMobile,
  frameLabel = 'costpro.app',
  caption,
  priority = false,
  className = '',
  id,
  sizes = DEFAULT_SIZES,
}: FeatureVisualProps) {
  return (
    <motion.figure
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`group relative w-full ${className}`}
    >
      {/* ── Marco de navegador sobrio (FASE 5) ── */}
      <div
        className="
          relative w-full overflow-hidden rounded-2xl
          border border-white/[0.09] bg-[#0a0f1a]
          shadow-[0_24px_60px_-24px_rgba(0,0,0,0.75),0_0_0_1px_rgba(34,197,94,0.05)]
          transition-shadow duration-500
          group-hover:shadow-[0_32px_80px_-28px_rgba(0,0,0,0.85),0_0_0_1px_rgba(34,197,94,0.12)]
        "
        role="img"
        aria-label={alt}
      >
        {/* Barra superior del marco */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-3.5 py-2.5">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
          </span>
          <span className="ml-2 flex min-w-0 items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#22c55e]" />
            <span className="truncate text-[10px] font-medium tracking-wide text-white/40">
              {frameLabel}
            </span>
          </span>
        </div>

        {/* Captura real — art direction (FASE 10):
            desktop → 16:10 horizontal; móvil → captura vertical real de la
            misma pantalla (una de desktop reducida resultaría ilegible).
            FIX CALIDAD (2026-10-06): quality=90 (texto de UI nítido; el 75
            por defecto de next/image emborrona las capturas) + `sizes`
            por sección acorde al ancho real de render. Fuentes: 2560x1600
            q90 (scripts/convert-landing-captures.py). */}
        {srcMobile ? (
          <>
            <div className="relative hidden w-full aspect-[16/10] sm:block">
              <Image
                src={src}
                alt={alt}
                fill
                priority={priority}
                loading={priority ? undefined : 'lazy'}
                decoding={priority ? 'sync' : 'async'}
                sizes={sizes}
                quality={90}
                className="object-cover object-top"
              />
            </div>
            <div className="relative block w-full aspect-[9/16] max-h-[70vh] mx-auto sm:hidden">
              <Image
                src={srcMobile}
                alt={altMobile || alt}
                fill
                priority={priority}
                loading={priority ? undefined : 'lazy'}
                decoding={priority ? 'sync' : 'async'}
                sizes="100vw"
                quality={90}
                className="object-cover object-top"
              />
            </div>
          </>
        ) : (
          <div className="relative w-full aspect-[16/10]">
            <Image
              src={src}
              alt={alt}
              fill
              priority={priority}
              loading={priority ? undefined : 'lazy'}
              decoding={priority ? 'sync' : 'async'}
              sizes={sizes}
              quality={90}
              className="object-cover object-top"
            />
          </div>
        )}
        {/* Gradiente inferior sutil para asentar el frame — sin tapar la UI */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/25 to-transparent" aria-hidden="true" />
      </div>

      {/* Caption contextual (FASE 5 — label discreto, FASE 9 — visible además del alt) */}
      {caption && (
        <figcaption className="mt-3 flex items-center justify-center gap-2 text-center">
          <span className="h-1 w-1 rounded-full bg-[#22c55e]/70" aria-hidden="true" />
          <span className="text-[11px] font-medium leading-snug text-white/40">{caption}</span>
        </figcaption>
      )}
    </motion.figure>
  );
}
