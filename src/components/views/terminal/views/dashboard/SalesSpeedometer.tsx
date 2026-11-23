'use client';

/**
 * ADNEGOCIO-UI 2026-11-23 · Velocímetro semicircular ejecutivo de ventas
 * (misión §4) — sustituye al anillo configurable en el «Resumen de
 * Indicadores» del Inicio.
 *
 * COMPARACIÓN CANÓNICA: acumulado del mes en curso (1º → hoy, La Habana)
 * contra el MISMO TRAMO del mes anterior (1–22 nov ↔ 1–22 oct,
 * previousMonthEquivalentWindow). El período anterior es la referencia del
 * 100 % — no es una meta comercial. Fuente ÚNICA: RPC
 * get_sales_dashboard_analytics (useSalesRhythm, dos llamadas — la misma
 * del Ritmo de ventas de Estados Financieros).
 *
 * ESCALA: dinámica, sin truncar ni ocultar crecimientos (múltiplos de 25 %,
 * sin techo — speedometer.ts). Marca de referencia en el 100 %.
 *
 * SIN BASE DE COMPARACIÓN: si el período anterior no tiene ventas no se
 * calcula porcentaje ni se divide entre cero — se muestran los importes
 * disponibles y el estado «Sin base de comparación».
 *
 * MONEDA: el importe principal es la valoración canónica del sistema
 * (ventas netas en CUP contable). Las operaciones cobradas en USD se
 * muestran como REFERENCIA separada (nominal USD y su equivalente canónico)
 * — nunca se suman como una cifra única (misión §4/§7.8).
 *
 * DISEÑO: SVG propio con tokens de marca (mismo estilo del anillo anterior:
 * Dark Enhanced / Light coherentes), transición suave de la aguja con
 * framer-motion y prefers-reduced-motion respetado. Sin dependencias nuevas.
 */
import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Minus, Loader2, GitCompareArrows, Info } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useUIStore, type ViewType } from '@/store';
import { useSalesRhythm } from '@/hooks/api/useSalesRhythm';
import { monthToDateWindow } from '@/hooks/api/useProductComparison';
import { speedometerScale, needleFraction, variationPct } from '@/lib/sales-dashboard/speedometer';
import { previousMonthEquivalentWindow, toDateInputValue, type PeriodWindow } from '@/lib/sales-dashboard/periods';

interface SalesSpeedometerProps {
  /** Abre la vista analítica «Comparar productos» (misión §5). */
  onCompareProducts: () => void;
}

const TAU = Math.PI;

/** Punto polar del arco: fracción 0..1 → coordenadas (180°→0°). */
function arcPoint(cx: number, cy: number, r: number, fraction: number): { x: number; y: number } {
  const angle = Math.PI * (1 - Math.max(0, Math.min(1, fraction)));
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
}

function polarLine(cx: number, cy: number, r1: number, r2: number, fraction: number) {
  const a = arcPoint(cx, cy, r1, fraction);
  const b = arcPoint(cx, cy, r2, fraction);
  return { a, b };
}

export function SalesSpeedometer({ onCompareProducts }: SalesSpeedometerProps) {
  const { user } = useAuthStore();
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const ventana = useMemo<PeriodWindow>(() => monthToDateWindow(), []);
  const ventanaAnterior = useMemo<PeriodWindow>(() => previousMonthEquivalentWindow(ventana), [ventana]);
  const q = useSalesRhythm(ventana, user?.activeStoreId ?? null);
  const shouldReduceMotion = useReducedMotion();

  const kpiActual = q.data?.current.kpi ?? null;
  const kpiAnterior = q.data?.previous.kpi ?? null;

  const netoActual = kpiActual?.net_cup ?? 0;
  const netoAnterior = kpiAnterior?.net_cup ?? 0;
  const idx = variationPct(netoActual, netoAnterior);
  const sinBase = kpiAnterior == null || netoAnterior <= 0;
  const scale = speedometerScale(sinBase ? null : idx);
  const needle = needleFraction(sinBase ? null : idx, scale.cap);

  const tone = idx === null ? 'neutral' : idx > 0 ? 'positive' : idx < 0 ? 'negative' : 'neutral';
  const TrendIcon = tone === 'positive' ? ArrowUpRight : tone === 'negative' ? ArrowDownRight : Minus;

  // Diferencia absoluta con signo explícito.
  const dif = Math.round((netoActual - netoAnterior) * 100) / 100;

  // Referencia separada de operaciones en USD (nominal + equivalente canónico)
  // — no se suma a la cifra principal (misión §4: no mezclar monedas).
  const usdNominal = kpiActual?.collected_usd ?? null;
  const usdEquiv = kpiActual?.collected_cup_equiv ?? null;

  const gaugeFraction = (v: number) => v / scale.cap;

  return (
    <div className="flex flex-col items-center min-w-0 w-full" data-testid="sales-speedometer">
      {/* Título + períodos comparados (misión §4: fechas visibles) */}
      <div className="flex flex-col items-center gap-0.5 mb-1 px-1">
        <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
          Velocímetro de ventas
        </h3>
        <p className="text-[11px] text-muted-foreground/80 text-center leading-snug" data-testid="speedometer-periods">
          {toDateInputValue(ventana.from)} — {toDateInputValue(ventana.to)}
          {' · vs '}
          {toDateInputValue(ventanaAnterior.from)} — {toDateInputValue(ventanaAnterior.to)}
        </p>
        {q.dataUpdatedAt > 0 && (
          <p className="text-[10px] text-muted-foreground/60 tabular-nums" data-testid="speedometer-updated">
            Actualizado: {toDateInputValue(new Date(q.dataUpdatedAt))} · {new Date(q.dataUpdatedAt).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Arco + aguja */}
      <div
        className="relative w-full max-w-[340px] px-2 pt-2"
        role="img"
        aria-label={
          sinBase
            ? `Ventas netas ${formatCurrency(netoActual)} CUP. Sin base de comparación.`
            : `Ventas netas ${formatCurrency(netoActual)} CUP, ${idx === null ? 'sin base' : `${idx > 0 ? '+' : ''}${idx.toFixed(1)}%`} vs período anterior (${formatCurrency(netoAnterior)} CUP).`
        }
        data-testid="speedometer-gauge"
      >
        <svg viewBox="0 0 200 118" className="w-full h-auto" aria-hidden="true">
          {/* Resplandor discreto de marca */}
          <ellipse cx="100" cy="96" rx="70" ry="26" className="fill-primary/5" />
          {/* Pista */}
          <path
            d={`M ${arcPoint(100, 100, 78, 0).x} 100 A 78 78 0 0 1 ${arcPoint(100, 100, 78, 1).x} 100`}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            className="stroke-muted/40"
          />
          {/* Marcas de escala */}
          {scale.ticks.map((v) => {
            const f = gaugeFraction(v);
            const { a, b } = polarLine(100, 100, 66, 72, f);
            const lbl = arcPoint(100, 100, 55, f);
            return (
              <g key={v}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={v === 100 ? 2.5 : 1.5} strokeLinecap="round"
                  className={v === 100 ? 'stroke-foreground/60' : 'stroke-muted-foreground/50'} />
                <text x={lbl.x} y={lbl.y} textAnchor="middle" dominantBaseline="middle"
                  className="fill-muted-foreground/70" fontSize="8" fontWeight="600">
                  {v}%
                </text>
              </g>
            );
          })}
          {/* Aguja — transición suave, nunca truncada (el tope crece) */}
          {needle !== null && (
            <motion.g
              style={{ transformOrigin: '100px 100px' }}
              initial={{ rotate: shouldReduceMotion ? needle * 180 : 0 }}
              animate={{ rotate: needle * 180 }}
              transition={{ duration: shouldReduceMotion ? 0 : 1.2, ease: [0.16, 1, 0.3, 1] }}
              data-testid="speedometer-needle"
            >
              <line x1="100" y1="100" x2={arcPoint(100, 100, 58, 0).x} y2={arcPoint(100, 100, 58, 0).y}
                strokeWidth="4" strokeLinecap="round" className="stroke-primary" />
              <circle cx={arcPoint(100, 100, 58, 0).x} cy={arcPoint(100, 100, 58, 0).y} r="3.5" className="fill-primary" />
            </motion.g>
          )}
          <circle cx="100" cy="100" r="6" className="fill-primary/90" />
        </svg>

        {/* Lectura central */}
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center text-center px-6">
          {q.isLoading ? (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground animate-pulse" data-testid="speedometer-loading">
              <Loader2 className="w-4 h-4 animate-spin" /> Consultando ventas…
            </span>
          ) : q.isError ? (
            <span className="text-xs font-black uppercase tracking-widest text-destructive" data-testid="speedometer-error">
              No se pudo consultar las ventas
            </span>
          ) : (
            <>
              <span className="text-2xl sm:text-3xl font-bold tracking-tight font-display tabular-nums text-foreground" data-testid="speedometer-current">
                {formatCurrency(netoActual)}
                <span className="ml-1 text-[11px] font-bold text-muted-foreground">CUP</span>
              </span>
              {sinBase ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground mt-0.5" data-testid="speedometer-no-base">
                  <Info className="w-3.5 h-3.5" /> Sin base de comparación
                </span>
              ) : (
                <span className="flex items-center gap-2 mt-0.5" data-testid="speedometer-variation">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Anterior: <span className="font-semibold text-foreground">{formatCurrency(netoAnterior)}</span> CUP
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums',
                      tone === 'positive' && 'bg-success/10 text-success',
                      tone === 'negative' && 'bg-destructive/10 text-destructive',
                      tone === 'neutral' && 'bg-muted text-muted-foreground',
                    )}
                  >
                    <TrendIcon className="w-3 h-3" />
                    {idx !== null ? `${idx > 0 ? '+' : ''}${idx.toFixed(1)}%` : '0%'}
                  </span>
                </span>
              )}
              {!sinBase && (
                <span className="text-[10px] text-muted-foreground/80 tabular-nums mt-0.5" data-testid="speedometer-diff">
                  Diferencia: {dif > 0 ? '+' : ''}{formatCurrency(dif)} CUP
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Referencia separada de USD (misión §4/§7.8: no mezclar monedas) */}
      {!q.isLoading && !q.isError && (usdNominal ?? 0) !== 0 && (
        <p className="text-[10px] text-muted-foreground text-center max-w-sm px-2 mt-1" data-testid="speedometer-usd-note">
          Cobrado en USD del período: <span className="font-bold tabular-nums">{(usdNominal ?? 0).toFixed(2)} USD</span> en
          billetes/transferencia · equivalente canónico <span className="font-bold tabular-nums">{formatCurrency(usdEquiv ?? 0)}</span> CUP
          (ya incluido en las ventas netas; no se suma aparte).
        </p>
      )}

      {/* Acceso a la vista analítica de productos (misión §5) */}
      <button
        type="button"
        onClick={() => onCompareProducts()}
        className="mt-3 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border border-primary/40 bg-primary/[0.06] text-primary text-xs font-black uppercase tracking-widest hover:bg-primary/10 active:scale-[0.98] transition-all"
        data-testid="sales-compare-button"
      >
        <GitCompareArrows className="w-4 h-4" /> Comparar productos
      </button>
    </div>
  );
}
