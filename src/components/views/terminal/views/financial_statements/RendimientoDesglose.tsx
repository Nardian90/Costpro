'use client';

/**
 * MISIÓN REDISEÑO EJECUTIVO 2026-11-23 · §6 — Desgloses del Estado de
 * Rendimiento SIN gráficos.
 *
 * SUSTITUYE a IncomeCharts (los gráficos reutilizados del antiguo apartado
 * Resumen — ComposedChart «Ingresos vs Gastos por mes» y pie «Distribución de
 * gastos» — cuya presentación no alcanzaba la calidad exigida y fueron
 * RETIRADOS por la misión: no se reconstruyen con otra paleta ni otro tamaño,
 * y NO se introducen gráficos nuevos en su lugar).
 *
 * La MISMA información financiera real permanece, presentada como tablas
 * financieras profesionales (misión §6: «Tablas financieras profesionales»,
 * «Agrupaciones jerárquicas»), desde la MISMA consulta que usaban los
 * gráficos — GET /api/fin/statements?type=dashboard → RPC fin_get_dashboard
 * (series_mensuales y top_gastos). Cero consultas nuevas, cero cálculos
 * inventados:
 *  · Evolución mensual: ingresos y gastos del motor (naturaleza positiva) y
 *    resultado del mes = ingresos − gastos — la MISMA derivación que mostraba
 *    la serie del gráfico retirado, ahora con columna explícita.
 *  · Gastos por categoría: el desglose top del período, ordenado por importe,
 *    sin porcentajes de participación inventados.
 *
 * El error de consulta se tolera (no bloquea el Estado de Rendimiento, que
 * vive arriba con su propia consulta): se muestra un aviso con reintento.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchDashboard } from './fin-api';
import type { DashboardData } from './types';

interface RendimientoDesgloseProps {
  storeId: string;
  from: string;
  to: string;
  refreshKey: number;
}

export function RendimientoDesglose({ storeId, from, to, refreshKey }: RendimientoDesgloseProps) {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchDashboard(storeId, from, to, token);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al consultar los desgloses del período');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, from, to, token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-5" data-testid="rendimiento-desglose-loading">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3"
        data-testid="rendimiento-desglose-error"
      >
        <p className="flex items-start gap-2 text-xs text-foreground">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          {error}
        </p>
        <button
          type="button"
          onClick={load}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-[11px] font-black uppercase tracking-widest hover:bg-muted"
          data-testid="rendimiento-desglose-retry"
        >
          <RefreshCw className="w-3 h-3" /> Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Serie mensual del motor (naturaleza positiva). El resultado conserva la
  // derivación que ya presentaba la serie retirada: ingresos − gastos.
  const serie = [...(data.series_mensuales ?? [])].sort((a, b) => a.mes.localeCompare(b.mes));
  const gastos = [...(data.top_gastos ?? [])].sort((a, b) => b.total - a.total);

  if (serie.length === 0 && gastos.length === 0) return null;

  return (
    <div className="space-y-5" data-testid="rendimiento-desglose">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Evolución mensual — tabla financiera profesional */}
        {serie.length > 0 && (
          <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden" aria-label="Evolución mensual de ingresos y gastos">
            <div className="px-3 sm:px-4 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Evolución mensual</h3>
              <span className="text-[10px] text-muted-foreground tabular-nums">{from} — {to}</span>
            </div>
            <table className="w-full text-xs" data-testid="rendimiento-evolucion-tabla">
              <thead>
                <tr className="border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th scope="col" className="text-left px-3 py-2 font-black">Mes</th>
                  <th scope="col" className="text-right px-3 py-2 font-black">Ingresos</th>
                  <th scope="col" className="text-right px-3 py-2 font-black">Gastos</th>
                  <th scope="col" className="text-right px-3 py-2 font-black">Resultado</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {serie.map((s) => {
                  const resultado = Math.round((s.ingresos - s.gastos) * 100) / 100;
                  return (
                    <tr key={s.mes} className="border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-foreground">{s.mes}</td>
                      <td className="px-3 py-2.5 text-right text-foreground">{formatCurrency(s.ingresos)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{formatCurrency(s.gastos)}</td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right font-black',
                          resultado < 0 ? 'text-destructive' : resultado > 0 ? 'text-success' : 'text-muted-foreground',
                        )}
                      >
                        {formatCurrency(resultado)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[10px] text-muted-foreground">
              Ingresos y gastos del motor de partida doble (CUP, naturaleza positiva). Resultado = ingresos − gastos del mes.
            </p>
          </section>
        )}

        {/* Gastos por categoría — desglose jerárquico en tabla */}
        {gastos.length > 0 && (
          <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden" aria-label="Gastos por categoría del período">
            <div className="px-3 sm:px-4 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Gastos por categoría</h3>
              <span className="text-[10px] text-muted-foreground">Principales del período · CUP</span>
            </div>
            <table className="w-full text-xs" data-testid="rendimiento-gastos-tabla">
              <thead>
                <tr className="border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th scope="col" className="text-left px-3 py-2 font-black">Categoría</th>
                  <th scope="col" className="text-right px-3 py-2 font-black">Total</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {gastos.map((g) => (
                  <tr key={g.code} className="border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 text-foreground">
                      <span className="font-bold">{g.name}</span>
                      <span className="ml-2 text-[10px] font-mono text-muted-foreground/70 uppercase">{g.code}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-black text-foreground">{formatCurrency(g.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[10px] text-muted-foreground">
              Categorías con mayor gasto del período según el motor contable. Sin porcentajes de participación estimados.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
