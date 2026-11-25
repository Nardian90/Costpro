'use client';

/**
 * SceneContent — ADN-LANDING-TRUE-FULLPAGE-EXPERIENCE-006
 * ============================================================================
 * Composiciones de ESCENA para el escenario cinematográfico persistente.
 *
 * Regla inviolable de la misión 006: NO se inventa ni se recorta contenido.
 * Cada escena reorganiza contenido REAL del landing (los mismos textos y
 * capturas de las secciones de flujo) dentro de una composición de pantalla
 * completa pensada para el escenario persistente (100svh, escritorio ≥1024px).
 *
 * Los componentes de flujo (ServicesStorySection, MultiStoreVisualSection,
 * PricingSection…) siguen siendo los responsables del render en móvil /
 * tablet / reduced-motion — aquí solo viven las variantes de escena.
 * ============================================================================
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Check, Minus, MessageCircle, Sparkles, type LucideIcon } from 'lucide-react';
import { BrandWordmark } from '../BrandWordmark';
import FeatureVisual from '../FeatureVisual';
import { pricingPlans, comparisonRows } from '../data';
import { enterFichaDeCosto } from '@/lib/fcEntry';

/* ── Lenguaje común de escena ────────────────────────────────────────────── */

/**
 * Chip de capítulo — la identidad del capítulo dentro de la escena.
 * Conecta cada escena con el navegador lateral (misma numeración).
 */
export function ChapterChip({ chapter, label }: { chapter: string; label: string }) {
  return (
    <p className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.28em] text-[#22c55e]">
      <span className="inline-block h-px w-8 bg-gradient-to-r from-[#22c55e] to-transparent" aria-hidden="true" />
      <span className="font-mono tabular-nums">{chapter}</span>
      <span className="text-white/45">{label}</span>
    </p>
  );
}

/** Marco interior estándar de una escena: respeta el header fijo (76px).
 * `data-scene-frame` marca el CONTENIDO EN FLUJO de la escena: es la
 * referencia que mide la sonda de ajuste de CinemaStage (CP-FIX responsive
 * 2026-11-20 — desbordamiento real del contenido, sin el sangrado
 * decorativo de los fragmentos absolutos del hero). */
export function SceneFrame({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-scene-frame=""
      className={`relative mx-auto flex h-full w-full max-w-[1360px] flex-col justify-center px-6 pb-6 pt-[76px] sm:px-10 lg:px-16 xl:px-20 ${className}`}
    >
      {children}
    </div>
  );
}

/* ── Capítulo 2 · apertura tipográfica ───────────────────────────────────── */

export function SceneOpener() {
  return (
    <SceneFrame>
      <div className="grid grid-cols-12 items-center gap-6">
        <div className="col-span-12 lg:col-span-9">
          <ChapterChip chapter="02" label="Plataforma" />
          <h2 className="mt-6 font-[family-name:var(--font-space-grotesk)] text-[clamp(2.4rem,5.2vw,4.6rem)] font-black leading-[1.02] tracking-tight text-white">
            Todo lo que tu negocio necesita.
            <br />
            <span className="text-white/40">Nada que no necesite.</span>
          </h2>
          <p className="mt-7 max-w-2xl text-[clamp(0.95rem,1.25vw,1.15rem)] leading-relaxed text-white/55">
            Desde la gestión multi-tienda hasta la vitrina digital. Desde el
            inventario hasta el punto de venta. Una sola plataforma para
            gestionar todo tu negocio y darle presencia online a cada tienda.
          </p>
        </div>
        {/* Número fantasma del capítulo — estructura tipográfica, no decoración */}
        <div className="hidden select-none justify-end lg:col-span-3 lg:flex" aria-hidden="true">
          <span className="font-[family-name:var(--font-space-grotesk)] text-[clamp(7rem,14vw,13rem)] font-black leading-none text-transparent [-webkit-text-stroke:1px_rgba(34,197,94,0.28)]">
            02
          </span>
        </div>
      </div>
    </SceneFrame>
  );
}

/* ── Capítulo 2 · escenas de historia (captura real + texto real) ────────── */

export interface StorySceneData {
  /** Texto del badge de paso (interludio multitienda: PASO 1/2/3). */
  stepBadge?: string;
  index: string;
  total: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  /** Visual de la escena (captura real / catálogo / icono). Opcional: las
   *  composiciones que no lo usan directamente (p. ej. SceneSecurityCta
   *  renderiza su propio IconTileVisual) no lo necesitan. */
  visual?: ReactNode;
  /** El visual se coloca a la derecha (texto a la izquierda). */
  flip?: boolean;
}

export function SceneStory({
  data,
  chapter = '02',
  chapterLabel = 'Plataforma',
}: {
  data: StorySceneData;
  chapter?: string;
  chapterLabel?: string;
}) {
  const Icon = data.icon;
  return (
    <SceneFrame>
      <div className="grid grid-cols-12 items-center gap-8 lg:gap-12">
        {/* Texto */}
        <div className={`col-span-12 lg:col-span-5 ${data.flip ? 'lg:order-2' : ''}`}>
          <ChapterChip chapter={chapter} label={chapterLabel} />
          <p className="mt-6 font-mono text-[11px] font-bold tracking-[0.3em] text-white/30">
            {data.stepBadge ? (
              <span className="inline-flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22c55e] text-[10px] font-black text-[#05070A]">
                  {data.stepBadge.replace('PASO ', '').trim()}
                </span>
                {data.stepBadge}
              </span>
            ) : (
              <>
                {data.index} / {data.total}
              </>
            )}
          </p>
          <h2 className="mt-3 text-[clamp(1.5rem,2.3vw,2.35rem)] font-black leading-[1.12] tracking-tight text-white">
            {data.title}
          </h2>
          <p className="mt-2.5 text-[clamp(0.92rem,1.15vw,1.08rem)] font-semibold text-[#22c55e]/90">
            {data.subtitle}
          </p>
          <p className="mt-4 max-w-xl text-[clamp(0.85rem,1.05vw,1rem)] leading-relaxed text-white/55">
            {data.description}
          </p>
        </div>

        {/* Visual */}
        <div className={`col-span-12 lg:col-span-7 ${data.flip ? 'lg:order-1' : ''}`}>
          {data.visual}
        </div>
      </div>
    </SceneFrame>
  );
}

/** Visual por defecto de una historia: la captura real con marco de navegador. */
export function StoryVisual({
  src,
  srcMobile,
  alt,
  caption,
  frameLabel,
}: {
  src: string;
  srcMobile?: string;
  alt: string;
  caption?: string;
  frameLabel?: string;
}) {
  return (
    <FeatureVisual
      src={src}
      srcMobile={srcMobile}
      alt={alt}
      caption={caption}
      frameLabel={frameLabel}
      eager
      sizes="(min-width: 1024px) 52vw, 100vw"
      className="mx-auto w-full max-w-[780px]"
    />
  );
}

/** Visual para una historia sin captura (seguridad): icono protagonista. */
export function IconTileVisual({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="relative mx-auto flex h-full max-w-[420px] flex-col items-center justify-center py-6">
      <div
        className="relative flex aspect-square w-[min(38svh,300px)] items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl"
        role="img"
        aria-label={label}
      >
        <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_50%_40%,rgba(34,197,94,0.12),transparent_65%)]" aria-hidden="true" />
        <Icon className="h-[38%] w-[38%] text-white" strokeWidth={1.1} />
      </div>
    </div>
  );
}

/* ── Capítulo 2 · cierre del capítulo (seguridad + CTA intermedio) ───────── */

export function SceneSecurityCta({
  data,
  onSeeFeatures,
}: {
  data: StorySceneData;
  onSeeFeatures: () => void;
}) {
  return (
    <SceneFrame>
      <div className="grid grid-cols-12 items-center gap-8 lg:gap-12">
        <div className="col-span-12 lg:col-span-7">
          <IconTileVisual icon={data.icon} label={data.description} />
        </div>
        <div className="col-span-12 lg:col-span-5">
          <ChapterChip chapter="02" label="Plataforma" />
          <p className="mt-6 font-mono text-[11px] font-bold tracking-[0.3em] text-white/30">
            {data.index} / {data.total}
          </p>
          <h2 className="mt-3 text-[clamp(1.5rem,2.3vw,2.35rem)] font-black leading-[1.12] tracking-tight text-white">
            {data.title}
          </h2>
          <p className="mt-2.5 text-[clamp(0.92rem,1.15vw,1.08rem)] font-semibold text-[#22c55e]/90">
            {data.subtitle}
          </p>
          <p className="mt-4 max-w-xl text-[clamp(0.85rem,1.05vw,1rem)] leading-relaxed text-white/55">
            {data.description}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href="/fc/"
              onClick={(e) => {
                e.preventDefault();
                enterFichaDeCosto(() => window.dispatchEvent(new CustomEvent('open-login')));
              }}
              className="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-[#004d40] px-7 text-sm font-bold text-white shadow-lg shadow-[#004d40]/25 transition-all hover:bg-[#00695c]"
            >
              Crear ficha de costo gratis
            </a>
            <button
              type="button"
              onClick={onSeeFeatures}
              className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-7 text-sm font-bold text-white transition-all hover:bg-white/[0.06]"
            >
              Ver funcionalidades
            </button>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}

/* ── Capítulo 3 · funcionalidades (índice editorial completo) ────────────── */

export interface FeatureArea {
  n: string;
  title: string;
  desc: string;
}

export function SceneFeatures({
  areas,
  chapter = '03',
  chapterLabel = 'Funcionalidades',
}: {
  areas: FeatureArea[];
  chapter?: string;
  chapterLabel?: string;
}) {
  return (
    <SceneFrame>
      <div className="mb-6 grid grid-cols-1 items-end gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ChapterChip chapter={chapter} label={chapterLabel} />
          <h2 className="mt-4 font-[family-name:var(--font-space-grotesk)] text-[clamp(1.5rem,2.6vw,2.5rem)] font-bold leading-tight tracking-tight text-white">
            Un universo completo de operaciones empresariales
          </h2>
        </div>
        <div className="lg:col-span-5">
          <p className="max-w-md text-[clamp(0.82rem,1vw,0.95rem)] leading-relaxed text-white/50 lg:border-l lg:border-white/[0.09] lg:pl-8">
            Lo que empezó como una herramienta de fichas de costo evolucionó en
            una plataforma integral: finanzas, ventas, inventario, compras,
            costo y control — operando sobre la misma base, sin duplicar
            sistemas.
          </p>
        </div>
      </div>

      {/* Índice editorial completo — 9 áreas reales, 2 columnas (3 en alturas cortas) */}
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-2 [@media(max-height:840px)]:lg:grid-cols-3 xl:gap-x-14">
        {areas.map((area) => (
          <div
            key={area.n}
            className="cin-stagger group grid grid-cols-[auto_1fr] items-baseline gap-4 border-b border-white/[0.06] px-2 py-3.5 transition-colors duration-300 last:border-b-0 hover:bg-white/[0.02] sm:gap-6 [@media(max-height:840px)]:py-3"
          >
            <span
              className="w-8 font-mono text-sm font-bold tabular-nums text-white/20 transition-colors duration-300 group-hover:text-[#22c55e]"
              aria-hidden="true"
            >
              {area.n}
            </span>
            <div>
              <h3 className="text-[clamp(0.9rem,1.05vw,1.02rem)] font-semibold tracking-tight text-white/90 transition-colors duration-300 group-hover:text-white">
                {area.title}
              </h3>
              <p className="mt-1 text-[clamp(0.72rem,0.85vw,0.82rem)] leading-relaxed text-white/45">
                {area.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SceneFrame>
  );
}

/* ── Capítulo 4 · planes ─────────────────────────────────────────────────── */

export function ScenePricing({
  chapter = '04',
  chapterLabel = 'Precios',
  onSignup,
}: {
  chapter?: string;
  chapterLabel?: string;
  onSignup: () => void;
}) {
  return (
    <SceneFrame>
      <div className="mb-7 text-center">
        <div className="flex justify-center">
          <ChapterChip chapter={chapter} label={chapterLabel} />
        </div>
        <h2 className="mt-4 font-[family-name:var(--font-space-grotesk)] text-[clamp(1.5rem,2.6vw,2.4rem)] font-bold tracking-tight text-white">
          Planes para cada negocio
        </h2>
        <p className="mt-2 text-[clamp(0.85rem,1vw,1rem)] text-white/50">
          Comienza gratis y escala cuando estés listo
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
        {pricingPlans.map((plan) => {
          const isGratis = plan.name === 'Gratis';
          const isMultitienda = plan.name === 'Multitienda';
          const isPopular = plan.popular;
          return (
            <div
              key={plan.name}
              className={`cin-stagger relative rounded-xl p-5 backdrop-blur-md transition-all duration-300 ${
                isPopular
                  ? 'border-2 border-[#22c55e]/40 bg-white/[0.08] shadow-[0_0_40px_rgba(34,197,94,0.15)]'
                  : isMultitienda
                    ? 'enterprise-gold-border border-2 border-amber-400/30 bg-white/[0.06]'
                    : 'border border-white/[0.08] bg-white/[0.04]'
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#15803d] to-[#166534] px-3.5 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-white shadow-lg shadow-[#15803d]/40">
                  <Sparkles className="h-2.5 w-2.5" />
                  <span>Recomendado</span>
                  <Sparkles className="h-2.5 w-2.5" />
                </div>
              )}
              <h3 className="text-sm font-bold text-white">{plan.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-[family-name:var(--font-space-grotesk)] text-xl font-extrabold text-white">
                  {isGratis ? 'Siempre gratis' : 'A convenir'}
                </span>
              </div>
              {isGratis ? (
                <p className="mt-1 text-[10px] text-white/30">Sin tarjeta · Sin fecha de expiración</p>
              ) : (
                <p className="mt-1 text-[10px] text-white/40">{plan.desc}</p>
              )}
              <ul className="mt-3.5 space-y-1.5">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-1.5 text-[11px] text-white/60">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#22c55e]" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              {plan.ctaType === 'signup' ? (
                <button
                  type="button"
                  onClick={onSignup}
                  className="mt-4 w-full rounded-lg bg-gradient-to-r from-[#15803d] to-[#166534] py-2 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg shadow-[#15803d]/20 transition-all hover:from-[#166534] hover:to-[#14532d]"
                >
                  {plan.cta}
                </button>
              ) : (
                <a
                  href="https://wa.me/5353183215"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
                    isMultitienda
                      ? 'border-2 border-amber-400/40 text-amber-300 hover:bg-amber-400/10'
                      : 'border border-white/10 text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <MessageCircle className="h-3 w-3" />
                  {plan.cta}
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[13px] text-white/50">
        ¿No sabes qué plan necesitas?{' '}
        <a
          href="https://wa.me/5353183215"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#22c55e] underline underline-offset-2 transition-colors hover:text-[#22c55e]/80"
        >
          Cuéntanos cómo es tu negocio
        </a>
      </p>
    </SceneFrame>
  );
}

/* ── Capítulo 4 · comparativa ────────────────────────────────────────────── */

export function SceneComparison({
  chapter = '04',
  chapterLabel = 'Precios',
}: {
  chapter?: string;
  chapterLabel?: string;
}) {
  return (
    <SceneFrame>
      <div className="mb-5 flex items-end justify-between gap-6">
        <div>
          <ChapterChip chapter={chapter} label={chapterLabel} />
          <h2 className="mt-4 font-[family-name:var(--font-space-grotesk)] text-[clamp(1.3rem,2.2vw,2rem)] font-bold tracking-tight text-white">
            Todo, función por función
          </h2>
        </div>
        <p className="hidden max-w-xs text-right text-xs leading-relaxed text-white/40 sm:block">
          La misma base para todos los planes: sin módulos bloqueados ni
          sorpresas — el plan decide el alcance de tus tiendas.
        </p>
      </div>

      <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
        <table className="w-full text-[clamp(0.68rem,0.82vw,0.78rem)]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-2.5 text-left font-medium text-white/50">Función</th>
              <th className="px-2 py-2.5 text-center font-medium text-white/40">Gratis</th>
              <th className="bg-[#22c55e]/[0.06] px-2 py-2.5 text-center font-bold text-[#22c55e]">
                Multi-Tienda ✓
              </th>
              <th className="px-2 py-2.5 text-center font-medium text-white/40">Empresarial</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row, idx) => (
              <tr
                key={row.feature}
                className={`border-b border-white/[0.03] transition-colors duration-200 last:border-b-0 hover:bg-[#22c55e]/[0.06] ${
                  idx % 2 === 0 ? '' : 'bg-white/[0.015]'
                }`}
              >
                <td className="px-3 py-2 font-medium text-white/60">{row.feature}</td>
                <td className="px-2 py-2 text-center">
                  {typeof row.starter === 'boolean' ? (
                    row.starter ? (
                      <Check className="mx-auto h-3 w-3 text-[#22c55e]" />
                    ) : (
                      <Minus className="mx-auto h-3 w-3 text-white/15" />
                    )
                  ) : (
                    <span className="text-white/50">{row.starter}</span>
                  )}
                </td>
                <td className="bg-[#22c55e]/[0.06] px-2 py-2 text-center">
                  {typeof row.pro === 'boolean' ? (
                    row.pro ? (
                      <Check className="mx-auto h-3 w-3 text-[#22c55e]" />
                    ) : (
                      <Minus className="mx-auto h-3 w-3 text-white/15" />
                    )
                  ) : (
                    <span className="font-semibold text-white/70">{row.pro}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  {typeof row.enterprise === 'boolean' ? (
                    row.enterprise ? (
                      <Check className="mx-auto h-3 w-3 text-[#22c55e]" />
                    ) : (
                      <Minus className="mx-auto h-3 w-3 text-white/15" />
                    )
                  ) : (
                    <span className="text-white/50">{row.enterprise}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SceneFrame>
  );
}

/* ── Capítulo 5 · cierre ─────────────────────────────────────────────────── */

export function SceneCierre({
  chapter = '05',
  chapterLabel = 'Ayuda',
  onSignup,
  onOpenDemo,
}: {
  chapter?: string;
  chapterLabel?: string;
  onSignup: () => void;
  onOpenDemo: () => void;
}) {
  return (
    <SceneFrame>
      <div className="mx-auto max-w-2xl text-center">
        <div className="flex justify-center">
          <ChapterChip chapter={chapter} label={chapterLabel} />
        </div>
        <h2 className="mt-7 font-[family-name:var(--font-space-grotesk)] text-[clamp(2rem,4vw,3.4rem)] font-black leading-[1.08] tracking-tight text-white">
          Tu negocio merece
          <br />
          <span className="text-[#22c55e]">una visión completa.</span>
        </h2>
        <div className="mt-5">
          <BrandWordmark className="font-[family-name:var(--font-space-grotesk)] text-xl font-bold tracking-tight sm:text-2xl" />
        </div>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onSignup}
            className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-8 text-sm font-bold text-[#05070A] shadow-[0_10px_36px_rgba(34,197,94,0.22)] transition-all hover:bg-[#4ade80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/70"
          >
            Entrar a la plataforma
          </button>
          <button
            type="button"
            onClick={onOpenDemo}
            className="inline-flex min-h-[50px] items-center justify-center rounded-xl border border-white/[0.14] px-8 text-sm font-semibold text-white/85 transition-all hover:border-white/25 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Ver demostración
          </button>
        </div>
        <p className="mt-6 text-xs text-white/35">
          WhatsApp +53 53183215 · adrianpompasantana@gmail.com
        </p>

        {/* CP-LANDING-NEWS-ACCESS-001 — acceso «Novedades» en la escena de
            cierre del modo cine: tira compacta a la vista pública /gaceta
            (El Diario Contable · ADN-011). Sin desplazamiento extra: un solo
            renglón bajo el contacto. */}
        <div className="mt-5 flex justify-center">
          <Link
            href="/gaceta"
            data-testid="cierre-novedades"
            className="group inline-flex min-h-[44px] items-center gap-2.5 rounded-xl border border-white/[0.12] px-5 py-2 text-xs font-semibold text-white/70 transition-all hover:border-[#22c55e]/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/70"
          >
            <span
              aria-hidden="true"
              className="relative flex h-1.5 w-1.5 rounded-full bg-[#22c55e]"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-60 motion-reduce:hidden" />
            </span>
            Novedades — Gaceta Oficial de Cuba y actualizaciones de ADNegocio
            <span aria-hidden="true" className="text-[#22c55e] transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none">→</span>
          </Link>
        </div>
      </div>
    </SceneFrame>
  );
}
