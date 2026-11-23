'use client';

/**
 * BehaviorPanel — «Cuándo y cómo se vende» (misión §3B: comportamiento de
 * ventas y distribución de ingresos). Compacto y sin repetición: días de la
 * semana y distribución de métodos de pago del período, ambos del mismo RPC
 * (weekday_distribution / payment_distribution).
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { formatCurrencyShort } from '@/hooks/api/useStoreAnalytics';
import { useBiChartTheme, biTooltipStyle } from '../../shared/echarts-theme';
import type { StoreAnalytics } from '@/hooks/api/useStoreAnalytics';

const ECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => <div className="h-[220px] w-full rounded-xl bg-muted/20 animate-pulse" />,
}) as unknown as React.ComponentType<Record<string, unknown>>;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta',
  mixed: 'Mixto', wallet: 'Billetera', other: 'Otro',
};

interface Props {
  analytics: StoreAnalytics;
}

export function BehaviorPanel({ analytics }: Props) {
  const t = useBiChartTheme();

  // Días de la semana: el RPC entrega EXTRACT(DOW) (0=Domingo…6=Sábado) y
  // weekday_name en inglés (TO_CHAR 'Day'). Mapeamos por NÚMERO (fuente
  // estable) y mostramos lunes-primero con etiquetas propias.
  const weekdayOption = React.useMemo(() => {
    const dist = analytics.weekday_distribution ?? [];
    if (dist.length === 0) return null;
    const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const byDow = new Map(dist.map((d) => [d.weekday, d]));
    // Orden de presentación: Lunes (1) → Domingo (0).
    const displayOrder = [1, 2, 3, 4, 5, 6, 0];
    const labels: string[] = [];
    const data: number[] = [];
    const shown: typeof dist = [];
    for (const dow of displayOrder) {
      const d = byDow.get(dow);
      if (d) {
        labels.push(DOW_LABELS[dow]);
        data.push(Math.round(d.sales * 100) / 100);
        shown.push(d);
      }
    }
    const maxIdx = data.indexOf(Math.max(...data));
    return {
      animationDuration: 400,
      grid: { left: 8, right: 8, top: 16, bottom: 0, containLabel: true },
      tooltip: {
        trigger: 'axis',
        ...biTooltipStyle(t),
        formatter: (params: unknown) => {
          const p = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number; value?: number };
          const d = shown[p.dataIndex ?? 0];
          return `<b>${labels[p.dataIndex ?? 0]}</b><br/>Ventas: <b>${formatCurrencyShort(p.value ?? 0)}</b><br/>Transacciones: ${d?.transactions ?? 0}`;
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { color: t.textMuted, fontSize: 11 },
        axisLine: { lineStyle: { color: t.splitLine } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: t.textMuted, fontSize: 10, formatter: (v: number) => formatCurrencyShort(v) },
        splitLine: { lineStyle: { color: t.splitLine, type: 'dashed' } },
        axisLine: { show: false },
      },
      series: [{
        type: 'bar',
        data: data.map((v, i) => ({
          value: v,
          itemStyle: { color: i === maxIdx ? t.currentSeries : undefined, opacity: i === maxIdx ? 1 : 0.45, borderRadius: [4, 4, 0, 0] },
        })),
        barMaxWidth: 22,
      }],
    };
  }, [analytics, t]);

  // Distribución de métodos de pago (donut compacto).
  const paymentOption = React.useMemo(() => {
    const dist = analytics.payment_distribution ?? [];
    if (dist.length === 0) return null;
    return {
      animationDuration: 400,
      tooltip: {
        trigger: 'item',
        ...biTooltipStyle(t),
        formatter: (p: { name?: string; value?: number; percent?: number }) =>
          `<b>${p.name}</b><br/>${formatCurrencyShort(p.value ?? 0)} · ${p.percent ?? 0}%`,
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: t.textMuted, fontSize: 10 },
      },
      series: [{
        type: 'pie',
        radius: ['52%', '78%'],
        center: ['50%', '44%'],
        label: { show: false },
        data: dist.map((d, i) => ({
          name: PAYMENT_LABELS[d.method] ?? d.method,
          value: Math.round(d.total * 100) / 100,
          itemStyle: { color: t.palette[i % t.palette.length] },
        })),
      }],
    };
  }, [analytics, t]);

  const hasWeekday = (analytics.weekday_distribution ?? []).length > 0;
  const hasPayments = (analytics.payment_distribution ?? []).length > 0;
  if (!hasWeekday && !hasPayments) return null;

  return (
    <section aria-label="Cuándo y cómo se vende" data-testid="executive-behavior">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">
        Cuándo y cómo se vende
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {weekdayOption && (
          <div className="rounded-xl border border-border/50 bg-card p-3.5">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1 px-1">
              Ventas por día de la semana
            </p>
            <p className="text-[10px] text-muted-foreground mb-2 px-1">El día más fuerte se resalta.</p>
            <ECharts option={weekdayOption} notMerge lazyUpdate style={{ height: 200, width: '100%' }} />
          </div>
        )}
        {paymentOption && (
          <div className="rounded-xl border border-border/50 bg-card p-3.5">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1 px-1">
              Distribución de métodos de pago
            </p>
            <p className="text-[10px] text-muted-foreground mb-2 px-1">Por método registrado en la transacción.</p>
            <ECharts option={paymentOption} notMerge lazyUpdate style={{ height: 200, width: '100%' }} />
          </div>
        )}
      </div>
    </section>
  );
}
