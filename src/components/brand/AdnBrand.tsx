/**
 * ADN-BRAND-REBUILD-001 — Componentes de marca ADNegocio.
 * ============================================================================
 * Sistema de logotipo compuesto (misión ADN-BRAND-REBUILD-001 §4):
 *   - AdnLogo      — logotipo principal: ADN dominante + NEGOCIO debajo.
 *   - AdnWordmark  — versión horizontal compacta «ADNegocio» (i-dot verde).
 *   - AdnMonograma — símbolo compacto ADN para sidebar colapsado/favicon.
 *   - AdnIsotipo   — tile para favicon, PWA, cargas y accesos rápidos.
 *
 * Las letterformas son vectores reales (Space Grotesk Bold, OFL) generados en
 * `adnPaths.ts` — sin dependencia de fuentes del sistema ni capturas raster.
 * El color de tinta lo controla el contexto: `variant` fija la combinación
 * aprobada (oscuro/claro/mono) y `className` aporta tamaño/espaciado.
 *
 * Uso recomendado:
 *   - Landing / superficies oscuras: `<AdnLogo variant="oscuro" />`.
 *   - Documentos y superficies claras: `<AdnLogo variant="claro" />`.
 *   - Sidebar expandido: `<AdnLogo variant="oscuro" className="h-8" />`.
 *   - Sidebar colapsado (rail): `<AdnMonograma className="h-5" />`.
 *   - No duplicar la marca completa varias veces en la misma pantalla (misión §6).
 */
import { memo } from 'react';
import {
  ADN_PATHS,
  ADN_WORDMARK_PATHS,
  ADN_DESCRIPTOR_PATHS,
  ADN_METRICS,
} from './adnPaths';

export type BrandVariant = 'oscuro' | 'claro' | 'mono' | 'blanco-mono';

const INK_BY_VARIANT: Record<BrandVariant, { ink: string; accent: string }> = {
  oscuro: { ink: '#FFFFFF', accent: 'var(--brand-accent, #22C55E)' },
  claro: { ink: '#0A0E12', accent: 'var(--brand-accent, #16A34A)' },
  mono: { ink: '#000000', accent: '#000000' },
  'blanco-mono': { ink: '#FFFFFF', accent: '#FFFFFF' },
};

const { adnInkWidth, descriptorInkWidth, wordmarkInkWidth } = ADN_METRICS;

/**
 * ADN-LANDING-FINAL-POLISH-003 (§4) — caja de tinta REAL del wordmark.
 * El generador (adnPaths.ts) declara baseline y=100 y cap-height 100, pero la
 * letra «g» de «egocio» tiene descendente hasta y=128.57 y las redondas
 * (e/o/c) desbordan hasta y=102; el punto de la «i» asciende hasta y=-2.
 * Un viewBox de altura 100 RECORTABA la descendente de la «g» (el logotipo
 * llegaba a leerse «ADNeaocio»). La caja vertical válida es [-4 .. 131].
 */
const WORDMARK_INK_TOP = -4;
const WORDMARK_INK_BOTTOM = 131;
const WORDMARK_VIEWBOX_HEIGHT = WORDMARK_INK_BOTTOM - WORDMARK_INK_TOP;
/** Hueco ADN → NEGOCIO y línea base del descriptor (misma métrica del generador). */
const DESC_GAP = 26;
const DESC_BASELINE = 100 + DESC_GAP + 17;

type LogoProps = {
  variant?: BrandVariant;
  /** Altura total del lockup en px (ADN + hueco + NEGOCIO). */
  height?: number;
  className?: string;
  /** Oculta el descriptor NEGOCIO (p. ej., espacios muy compactos). */
  hideDescriptor?: boolean;
  title?: string;
};

/** Logotipo principal: ADN dominante + NEGOCIO debajo, centrado. */
export const AdnLogo = memo(function AdnLogo({
  variant = 'oscuro',
  height = 56,
  className = '',
  hideDescriptor = false,
  title = 'ADNegocio',
}: LogoProps) {
  const { ink, accent } = INK_BY_VARIANT[variant];
  const vbH = hideDescriptor ? 100 : DESC_BASELINE;
  const descX = (adnInkWidth - descriptorInkWidth) / 2;
  return (
    <svg
      viewBox={`0 0 ${adnInkWidth} ${vbH}`}
      height={height}
      className={className}
      role="img"
      aria-label={title}
      focusable="false"
    >
      {ADN_PATHS.map((p) => (
        <path key={p.ch} d={p.d} fill={ink} />
      ))}
      {!hideDescriptor && (
        <g transform={`translate(${descX} ${DESC_BASELINE - 17})`}>
          {ADN_DESCRIPTOR_PATHS.map((p) => (
            <path key={p.ch} d={p.d} fill={accent} />
          ))}
        </g>
      )}
    </svg>
  );
});

type WordmarkProps = {
  variant?: BrandVariant;
  height?: number;
  className?: string;
  title?: string;
};

/**
 * Wordmark horizontal «ADNegocio» — punto de la «i» en verde neón.
 * ADN-LANDING-FINAL-POLISH-003 (§4): el viewBox incluye ascendentes y
 * descendentes (caja de tinta completa) — la «g» de «egocio» se muestra
 * íntegra en cualquier altura de renderizado.
 */
export const AdnWordmark = memo(function AdnWordmark({
  variant = 'oscuro',
  height = 20,
  className = '',
  title = 'ADNegocio',
}: WordmarkProps) {
  const { ink, accent } = INK_BY_VARIANT[variant];
  return (
    <svg
      viewBox={`0 ${WORDMARK_INK_TOP} ${wordmarkInkWidth} ${WORDMARK_VIEWBOX_HEIGHT}`}
      height={height}
      className={className}
      role="img"
      aria-label={title}
      focusable="false"
    >
      {ADN_WORDMARK_PATHS.map((p, idx) =>
        'stem' in p && 'dot' in p ? (
          <g key={`i-${idx}`}>
            <path d={p.stem} fill={ink} />
            <path d={p.dot} fill={accent} />
          </g>
        ) : (
          <path key={`${p.ch}-${idx}`} d={p.d} fill={ink} />
        ),
      )}
    </svg>
  );
});

type MonogramaProps = {
  height?: number;
  className?: string;
  title?: string;
};

/** Símbolo compacto ADN — hereda color por `currentColor` (sidebar rail, chips). */
export const AdnMonograma = memo(function AdnMonograma({
  height = 18,
  className = '',
  title = 'ADNegocio — símbolo ADN',
}: MonogramaProps) {
  return (
    <svg
      viewBox={`0 0 ${adnInkWidth} 100`}
      height={height}
      className={className}
      role="img"
      aria-label={title}
      focusable="false"
    >
      {ADN_PATHS.map((p) => (
        <path key={p.ch} d={p.d} fill="currentColor" />
      ))}
    </svg>
  );
});

type IsotipoProps = {
  size?: number;
  className?: string;
  /** Letras en verde neón sobre tile oscuro. */
  accent?: boolean;
  title?: string;
};

/** Isotipo tile — favicon/PWA/cargas; reconocible a tamaños pequeños. */
export const AdnIsotipo = memo(function AdnIsotipo({
  size = 32,
  className = '',
  accent = false,
  title = 'ADNegocio — isotipo',
}: IsotipoProps) {
  const k = (512 - 48) / adnInkWidth;
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
      focusable="false"
    >
      <rect width="512" height="512" rx="100" fill="#05070A" />
      <g transform={`translate(24 ${(512 - 100 * k) / 2}) scale(${k})`}>
        {ADN_PATHS.map((p) => (
          <path key={p.ch} d={p.d} fill={accent ? 'var(--brand-accent, #22C55E)' : '#FFFFFF'} />
        ))}
      </g>
    </svg>
  );
});
