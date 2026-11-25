'use client';

/**
 * NovedadesCard — CP-LANDING-NEWS-ACCESS-001
 * ============================================================================
 * Tarjeta destacada que conecta el Landing Page con la vista existente
 * «El Diario Contable» (/gaceta, PR #1699 · ADN-011).
 *
 * MISIÓN: el acceso NO es nuevo — la vista ya existe en producción; este
 * componente es SOLO el punto de descubrimiento dentro del contenido del
 * landing (§1: «una tarjeta o sección destacada dentro del contenido»).
 *
 * DISEÑO (FASE 4 — coherencia con el sistema del landing, NO herencia de los
 * temas Performance/Enhanced internos):
 *   · Misma paleta del landing: fondo #05070A, hairlines white/[0.08],
 *     acento verde #22c55e, eyebrows en font-mono uppercase (lenguaje
 *     editorial del hero y del selector de caminos).
 *   · Las dos categorías reales de la vista (tipo='gaceta' / tipo='costpro')
 *     se presentan diferenciadas, sin inventar publicaciones: solo rotula
 *     lo que /gaceta ya muestra con datos reales.
 *   · Acceso 100% público de solo lectura (la vista publica solo filas
 *     estado='publicada'; los borradores jamás salen de la tabla base con
 *     RLS y cero policies — CP-SEC-027).
 *
 * ACCESIBILIDAD Y RENDIMIENTO:
 *   · Un solo tab stop (el CTA) con aria-describedby hacia la descripción;
 *     las categorías son texto, no enlaces (cero redundancia de foco).
 *   · whileInView + useReducedMotion (patrón del landing); target ≥44px.
 *   · Sin datos dinámicos: cero queries → carga instantánea (§6).
 */

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Newspaper, ArrowRight, ScrollText, Rocket } from 'lucide-react';

interface NovedadesCardProps {
  /** En el capítulo 5 del modo cine la tarjeta comprime su aire (la escena
   *  cabe en 100svh) — mismo contenido, menos respiro vertical. */
  compact?: boolean;
}

export default function NovedadesCard({ compact = false }: NovedadesCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section
      aria-labelledby="novedades-card-title"
      className={`${compact ? 'px-4 py-6' : 'px-4 py-10 sm:py-12'}`}
      data-testid="novedades-card"
    >
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-7 transition-colors duration-300 hover:border-[#22c55e]/35"
        >
          {/* Hairline superior verde — eco de la línea ADN del landing */}
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#22c55e]/50 to-transparent"
          />

          <div className={compact ? 'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between' : 'flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between'}>
            {/* Izquierda: rotulación + CTA */}
            <div className="max-w-xl">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-white/40">
                <Newspaper className="h-3.5 w-3.5 text-[#22c55e]" aria-hidden="true" />
                Publicación diaria · sin registro
              </p>
              <h2
                id="novedades-card-title"
                className="mt-2 text-2xl font-black tracking-tight text-white font-[family-name:var(--font-space-grotesk)] sm:text-[1.7rem]"
              >
                Novedades
              </h2>
              <p
                id="novedades-card-desc"
                className="mt-2 text-sm leading-relaxed text-white/55"
              >
                Conoce las últimas novedades de la Gaceta Oficial de Cuba y las
                actualizaciones de ADNegocio.
              </p>

              {/* CTA — acceso a la vista completa (Link = navegación
                  client-side; el href real queda en el DOM para crawlers y
                  para compartir aunque JS tarde) */}
              <Link
                href="/gaceta"
                data-testid="novedades-card-cta"
                aria-labelledby="novedades-card-title"
                aria-describedby="novedades-card-desc"
                className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-6 py-2.5 text-sm font-bold text-[#05070A] transition-all duration-200 hover:bg-[#4ade80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070A]"
              >
                Ver las novedades
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
              </Link>
            </div>

            {/* Derecha: las dos categorías reales de la vista (diferenciadas) */}
            <div
              className={`${compact ? 'flex flex-row gap-3 sm:flex-col' : 'flex w-full flex-col gap-3 sm:w-[15.5rem]'} shrink-0`}
              aria-label="Categorías de novedades"
            >
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <p className="flex items-center gap-2 text-xs font-bold text-white/80">
                  <ScrollText className="h-4 w-4 shrink-0 text-[#22c55e]" aria-hidden="true" />
                  Gaceta Oficial de Cuba
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
                  Publicaciones, disposiciones y resoluciones oficiales.
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <p className="flex items-center gap-2 text-xs font-bold text-white/80">
                  <Rocket className="h-4 w-4 shrink-0 text-[#22c55e]" aria-hidden="true" />
                  Actualizaciones de ADNegocio
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
                  Nuevas funcionalidades, mejoras y avisos de la plataforma.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
