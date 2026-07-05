import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Pick3Storage } from '@/services/pick3/storage';
import { AnalysisEngine } from '@/services/pick3/analysis.engine';
import { runFullStatisticalTests } from '@/services/pick3/stat.tests';
import Pick3CombinationPageClient from './CombinationPageClient';

/**
 * SPRINT 5 — Programmatic SEO
 *
 * Páginas dinámicas para cada combinación histórica de Pick 3.
 * URL: /pick3/combinacion/123
 *
 * Cada página genera contenido SEO único:
 *   - Stats históricas de esa combinación
 *   - Última vez que salió
 *   - Frecuencia vs esperada
 *   - Predicción de próxima aparición (con disclaimers honestos)
 *   - CTA para usar el módulo completo
 *
 * Esto genera ~1000 páginas indexables (todas las combinaciones 000-999)
 * para capturar tráfico long-tail de búsquedas como:
 *   - "pick 3 florida 123 historial"
 *   - "cuando salio 456 en florida pick 3"
 *   - "frecuencia 789 pick 3"
 */

interface PageProps {
  params: { digits: string };
}

// Validar que digits sea una combinación válida (3 dígitos 0-9)
function validateCombination(digits: string): boolean {
  return /^\d{3}$/.test(digits);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const digits = params.digits;

  if (!validateCombination(digits)) {
    return {
      title: 'Combinación no válida — Pick 3 Intelligence',
    };
  }

  const title = `Pick 3 Florida ${digits} — Historial, Frecuencia y Análisis Estadístico`;
  const description = `Análisis completo de la combinación ${digits} en Florida Pick 3: cuántas veces ha salido, última aparición, frecuencia vs esperada, y análisis estadístico honesto. Gestiona tu bankroll con métricas cuantitativas reales.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/pick3/combinacion/${digits}`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'es_ES',
      siteName: 'CostPro Pick 3 Intelligence',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    other: {
      'og:image': `/api/pick3/og/${digits}`,
    },
  };
}

/**
 * Genera JSON-LD structured data para SEO.
 */
function generateJsonLd(digits: string, stats: any) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `Florida Pick 3 — Combinación ${digits}`,
    description: `Datos históricos y análisis estadístico de la combinación ${digits} en Florida Lottery Pick 3.`,
    keywords: ['pick 3', 'florida lottery', digits, 'lottery analysis', 'estadística lotería'],
    creator: {
      '@type': 'Organization',
      name: 'CostPro Pick 3 Intelligence',
    },
    temporalCoverage: stats.firstAppearance ? `${stats.firstAppearance}/${stats.lastAppearance}` : undefined,
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'totalAppearances', value: stats.totalAppearances },
      { '@type': 'PropertyValue', name: 'expectedAppearances', value: stats.expectedAppearances },
      { '@type': 'PropertyValue', name: 'biasPercentage', value: stats.biasPercentage },
      { '@type': 'PropertyValue', name: 'lastAppearance', value: stats.lastAppearance },
    ],
  };
}

export default async function CombinationPage({ params }: PageProps) {
  const digits = params.digits;

  if (!validateCombination(digits)) {
    notFound();
  }

  // Cargar histórico
  const history = await Pick3Storage.getHistory();

  // Calcular stats para esta combinación
  const combination = digits.split('').map(Number) as [number, number, number];
  const appearances = history.filter(draw =>
    draw.result[0] === combination[0] &&
    draw.result[1] === combination[1] &&
    draw.result[2] === combination[2]
  );

  const boxAppearances = history.filter(draw => {
    const sortedDraw = [...draw.result].sort().join('');
    const sortedCombo = [...combination].sort().join('');
    return sortedDraw === sortedCombo;
  });

  const totalDraws = history.length;
  const expectedAppearances = totalDraws / 1000; // 1 in 1000 for straight
  const expectedBox = totalDraws / 167; // 1 in 167 for 6-way box (approx)
  const biasPercentage = expectedAppearances > 0
    ? ((appearances.length - expectedAppearances) / expectedAppearances) * 100
    : 0;
  const lastAppearance = appearances.length > 0
    ? appearances[0].date
    : null;
  const firstAppearance = appearances.length > 0
    ? appearances[appearances.length - 1].date
    : null;
  const gapDays = lastAppearance
    ? Math.floor((Date.now() - new Date(lastAppearance).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Tests estadísticos globales (no específicos a la combinación, pero relevantes)
  const statsReport = runFullStatisticalTests(history);

  const stats = {
    combination: digits,
    totalAppearances: appearances.length,
    totalBoxAppearances: boxAppearances.length,
    expectedAppearances,
    expectedBox,
    biasPercentage,
    lastAppearance,
    firstAppearance,
    gapDays,
    isRandom: statsReport.isRandom,
    confidence: statsReport.confidence,
  };

  const jsonLd = generateJsonLd(digits, stats);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Pick3CombinationPageClient stats={stats} recentAppearances={appearances.slice(0, 20)} />
    </>
  );
}

/**
 * Genera rutas estáticas para las 1000 combinaciones (000-999).
 * Esto permite que Next.js las pre-renderize en build time.
 */
export async function generateStaticParams() {
  // Solo generar las más populares para no saturar el build
  // En producción, usar ISR (Incremental Static Regeneration)
  const popularCombinations = [
    '000', '111', '222', '333', '444', '555', '666', '777', '888', '999',
    '123', '321', '456', '654', '789', '987',
    '137', '731', '246', '642', '357', '753', '468', '864', '579', '975',
  ];
  return popularCombinations.map(digits => ({ digits }));
}

export const dynamicParams = true; // Permitir rutas dinámicas no pre-generadas
export const revalidate = 3600; // Revalidar cada hora
