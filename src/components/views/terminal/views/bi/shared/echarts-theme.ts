'use client';

/**
 * Tema de ECharts del Centro de Inteligencia — reemplaza los colores
 * hardcodeados light-only del dashboard anterior (defecto de auditoría:
 * ejes/tooltip invisibles en dark mode). Se centra en tokens de tema
 * (next-themes) y expone helpers listos para las opciones de ECharts.
 */

import { useTheme } from 'next-themes';
import { useMemo } from 'react';

export interface BiChartTheme {
  text: string;
  textMuted: string;
  splitLine: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipBorder: string;
  currentSeries: string;
  previousSeries: string;
  positive: string;
  negative: string;
  palette: string[];
}

export function useBiChartTheme(): BiChartTheme {
  const { resolvedTheme } = useTheme();
  return useMemo<BiChartTheme>(() => {
    const isDark = resolvedTheme === 'dark';
    return {
      text: isDark ? '#F1F5F9' : '#0F172A',
      textMuted: isDark ? '#94A3B8' : '#475569',
      splitLine: isDark ? '#27303F' : '#E9EDF3',
      tooltipBg: isDark ? 'rgba(2, 6, 23, 0.96)' : 'rgba(15, 23, 42, 0.96)',
      tooltipText: '#F1F5F9',
      tooltipBorder: isDark ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.35)',
      currentSeries: '#3B82F6',
      previousSeries: isDark ? '#64748B' : '#94A3B8',
      positive: isDark ? '#34D399' : '#059669',
      negative: isDark ? '#F87171' : '#DC2626',
      palette: isDark
        ? ['#60A5FA', '#A78BFA', '#22D3EE', '#34D399', '#FBBF24', '#F87171', '#F472B6', '#2DD4BF']
        : ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'],
    };
  }, [resolvedTheme]);
}

/** Tooltip base compartido (contraste correcto en ambos temas). */
export function biTooltipStyle(t: BiChartTheme) {
  return {
    backgroundColor: t.tooltipBg,
    borderColor: t.tooltipBorder,
    borderWidth: 1,
    textStyle: { color: t.tooltipText, fontSize: 12 },
    extraCssText: 'border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); padding: 8px 12px;',
  } as const;
}
