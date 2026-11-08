/**
 * COSTPRO-SALES-DASHBOARD-REFINEMENT-002 · Tema de gráficos (light/dark).
 *
 * CAUSA RAÍZ corregida: los atributos SVG (fill/stroke de recharts) NO
 * resuelven var() — `fill="hsl(var(--primary))"` con tokens hex
 * (tokens.css define --primary: #22c55e) produce un valor inválido y el SVG
 * cae a negro: barras/series/etiquetas ilegibles en dark (y swatches de
 * leyenda negros). Este módulo resuelve los valores REALES de los tokens
 * --chart-* leyendo getComputedStyle (fuente única de verdad: tokens.css)
 * y expone helpers tipados para recharts.
 *
 * - Reactivo: se re-resuelve al cambiar el tema (next-themes) o cualquier
 *   clase de <html> (p. ej. mode-performance) — sin recargar la página.
 * - SSR/tests seguro: antes del montaje o sin CSS cargado devuelve el mapa
 *   estático espejo del tema activo (light/dark).
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';

export interface ChartTheme {
  /** Paleta categórica chart-1..chart-6 (orden estable, huesos distinguibles). */
  series: readonly [string, string, string, string, string, string];
  /** Color de gridlines (sutil pero visible). */
  grid: string;
  /** Color de ticks/etiquetas de ejes. */
  axis: string;
  /** Color de la línea del eje. */
  axisLine: string;
  /** Fondo opaco del tooltip. */
  tooltipBg: string;
  /** Borde del tooltip. */
  tooltipBorder: string;
  /** Texto del tooltip. */
  tooltipText: string;
  /** Color para valores negativos/ajustes. */
  negative: string;
}

/** Espejo estático de tokens.css (light) — fallback SSR/tests sin CSS. */
export const CHART_THEME_LIGHT: ChartTheme = {
  series: ['#15803d', '#0369a1', '#b45309', '#7c3aed', '#be185d', '#0f766e'],
  grid: '#cbd5e1',
  axis: '#475569',
  axisLine: '#94a3b8',
  tooltipBg: '#ffffff',
  tooltipBorder: '#cbd5e1',
  tooltipText: '#0f172a',
  negative: '#dc2626',
};

/** Espejo estático de tokens.css (dark) — fallback SSR/tests sin CSS.
 * NOTA: la serie primaria es teal claro (no #4ade80): modes.css T-MONO-SVG
 * desatura los verdes de data-viz en mode-performance por diseño del
 * propietario; el teal mantiene la familia verde de la marca sin ser barrido. */
export const CHART_THEME_DARK: ChartTheme = {
  series: ['#2dd4bf', '#38bdf8', '#fbbf24', '#a78bfa', '#f472b6', '#86efac'],
  grid: '#3f3f46',
  axis: '#b4b4bc',
  axisLine: '#52525b',
  tooltipBg: '#1e1e1e',
  tooltipBorder: '#3f3f46',
  tooltipText: '#e4e4e7',
  negative: '#f87171',
};

export function chartThemeFor(theme: 'light' | 'dark'): ChartTheme {
  return theme === 'dark' ? CHART_THEME_DARK : CHART_THEME_LIGHT;
}

function readCssVar(name: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return '';
  try {
    // Sonda fuera de <html>: lee los tokens del TEMA (.dark/.theme-light de
    // tokens.css) sin heredar las sobrescrituras de <html> — en concreto
    // mode-performance redefine --chart-* a una rampa de grises (decisión del
    // propietario para data-viz general) y landing-shield fuerza los valores
    // de la landing. El dashboard usa la paleta estándar de la identidad
    // CostPro (misión REFINEMENT-002 §2.3: tonos distinguibles, no apagados).
    let probe = document.getElementById('costpro-chart-theme-probe');
    if (!probe) {
      probe = document.createElement('div');
      probe.id = 'costpro-chart-theme-probe';
      probe.setAttribute('aria-hidden', 'true');
      probe.style.display = 'none';
      document.body.appendChild(probe);
    }
    const dark = document.documentElement.classList.contains('dark')
      || document.documentElement.classList.contains('theme-dark');
    probe.className = dark ? 'theme-dark' : 'theme-light';
    const v = getComputedStyle(probe).getPropertyValue(name);
    return v.trim();
  } catch {
    return '';
  }
}

function isDarkActive(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.classList.contains('dark') || root.classList.contains('theme-dark');
}

/** Resuelve el tema real leyendo los tokens CSS; devuelve null si no hay CSS. */
export function resolveChartTheme(): ChartTheme | null {
  const first = readCssVar('--chart-1');
  if (!first) return null;
  const fallback = isDarkActive() ? CHART_THEME_DARK : CHART_THEME_LIGHT;
  const series: string[] = [];
  for (let i = 1; i <= 6; i++) series.push(readCssVar(`--chart-${i}`) || fallback.series[i - 1]);
  return {
    series: series as unknown as ChartTheme['series'],
    grid: readCssVar('--chart-grid') || fallback.grid,
    axis: readCssVar('--chart-axis') || fallback.axis,
    axisLine: readCssVar('--chart-axis-line') || fallback.axisLine,
    tooltipBg: readCssVar('--chart-tooltip-bg') || fallback.tooltipBg,
    tooltipBorder: readCssVar('--chart-tooltip-border') || fallback.tooltipBorder,
    tooltipText: readCssVar('--foreground') || fallback.tooltipText,
    negative: readCssVar('--destructive') || fallback.negative,
  };
}

/**
 * Hook reactivo: tema de gráficos que se actualiza al cambiar light/dark
 * (o cualquier clase de <html>) sin recargar la página.
 */
export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme() as { resolvedTheme?: string };
  const isDark = resolvedTheme === 'dark';
  // Estado inicial = espejo estático del tema resuelto (SSR/primera pintura).
  const [theme, setTheme] = useState<ChartTheme>(() => chartThemeFor(isDark ? 'dark' : 'light'));

  const sync = useCallback(() => {
    const resolved = resolveChartTheme();
    if (resolved) setTheme(resolved);
    else setTheme(chartThemeFor(isDarkActive() ? 'dark' : 'light'));
  }, []);

  // Re-resolver cuando next-themes cambia el tema resolved…
  useEffect(() => {
    sync();
  }, [sync, resolvedTheme]);

  // …y cuando cambie cualquier clase de <html> (robustez ante modos que
  // next-themes no conoce, p. ej. mode-performance de modes.css).
  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [sync]);

  return useMemo(() => theme, [theme]);
}

/** Estilos de tooltip recharts: caja opaca, borde, texto y sombra legibles. */
export function chartTooltipProps(t: ChartTheme) {
  return {
    contentStyle: {
      background: t.tooltipBg,
      border: `1px solid ${t.tooltipBorder}`,
      borderRadius: 12,
      fontSize: 12,
      lineHeight: 1.5,
      color: t.tooltipText,
      padding: '10px 12px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
    } as React.CSSProperties,
    labelStyle: {
      color: t.tooltipText,
      fontWeight: 700,
      marginBottom: 4,
    } as React.CSSProperties,
    itemStyle: {
      color: t.tooltipText,
    } as React.CSSProperties,
    cursor: { fill: t.grid, opacity: 0.3 },
  };
}

/** Props comunes de ejes recharts: ticks y líneas legibles en ambos temas. */
export function chartAxisProps(t: ChartTheme) {
  return {
    tick: { fontSize: 11, fill: t.axis },
    tickLine: { stroke: t.axisLine },
    axisLine: { stroke: t.axisLine },
  };
}
