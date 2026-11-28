'use client';

/**
 * MISIÓN REDISEÑO EJECUTIVO 2026-11-23 · §3 — «Resumen de Indicadores»
 *
 * SUSTITUYE al velocímetro semicircular (retirado — la misión exige eliminarlo,
 * no retocarlo) y a las mini-stats Ventas/Costos/Utilidad (la venta se repite
 * en la tarjeta principal; costo y utilidad llegan N/D del RPC y no transmiten
 * significado — el resultado financiero vive en Estados Financieros →
 * Estado de rendimiento, pestaña reconstruida en esta misma misión).
 *
 * COMPOSICIÓN EJECUTIVA (misión §3) — cada indicador responde una pregunta:
 *  · Ventas netas (CUP contable canónico): ¿cómo va el mes frente al MISMO
 *    TRAMO del mes anterior? Valor actual, período anterior, variación
 *    absoluta y porcentual con dirección. Sin base de comparación (anterior
 *    ≤ 0) NO se calcula porcentaje ni se divide entre cero.
 *  · Transacciones (documentos completados): ¿cuánta actividad?
 *  · Ticket promedio: ¿cómo es la calidad de la venta?
 *  · Unidades vendidas: ¿cuánto volumen? (el RPC no expone unidades del
 *    período anterior → sin variación inventada).
 *
 * FUENTE ÚNICA: RPC get_sales_dashboard_analytics en DOS llamadas (mes en
 * curso acumulado + mismo tramo del mes anterior, previousMonthEquivalentWindow,
 * La Habana DST-safe) vía useProductComparison — el MISMO hook y queryKey que
 * consume el Ranking Comercial y la vista «Comparar productos»: una sola
 * consulta por superficie, sin N+1 ni descargas completas al navegador.
 *
 * MONEDA: el importe principal es la valoración canónica del sistema (ventas
 * netas en CUP contable). Lo cobrado en USD se muestra como REFERENCIA
 * separada (nominal y equivalente canónico ya incluido) — nunca se suman
 * monedas (misión §4.2/§7). Sin metas, semáforos ni porcentajes de cumplimiento
 * inventados: la única base de comparación es el período anterior.
 */
import React from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useProductComparison } from '@/hooks/api/useProductComparison';
import { percentChange, previousMonthEquivalentWindow, toDateInputValue } from '@/lib/sales-dashboard/periods';
// CP-FX-001 (FASE 1): tarjeta premium del dólar informal — MISMA fuente que
// Inteligencia Cambiaria (/api/exchange-rates source=informal), sin segunda
// fuente de datos. Se ubica tras el grid de KPIs: indicador financiero
// externo (mercado cambiario) separado de los KPIs internos de la tienda.
import { InformalUsdRateCard } from './InformalUsdRateCard';

/** Variación absoluta con signo, redondeada al centavo. */
function absDiff(current: number, previous: number): number {
  return Math.round((current - previous) * 100) / 100;
}

type Tone = 'positive' | 'negative' | 'neutral';

const TONE_BADGE: Record<Tone, string> = {
  positive: 'bg-success/10 text-success',
  negative: 'bg-destructive/10 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
};

const TONE_TEXT: Record<Tone, string> = {
  positive: 'text-success',
  negative: 'text-destructive',
  neutral: 'text-muted-foreground',
};

/** Badge compacto de variación % con dirección (null = sin base). */
function VariationBadge({ pct, diff }: { pct: number | null; diff: number }) {
  const tone: Tone = pct === null ? 'neutral' : pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral';
  const Icon = pct === null ? Minus : pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums',
          TONE_BADGE[tone],
        )}
        data-testid="kpi-variation-badge"
      >
        <Icon className="w-3 h-3" />
        {pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : 'Sin base'}
      </span>
      <span className={cn('text-[11px] font-black tabular-nums', TONE_TEXT[tone])} data-testid="kpi-variation-diff">
        {diff > 0 ? '+' : ''}{formatCurrency(diff)} CUP
      </span>
    </span>
  );
}

/** Tarjeta compacta de indicador secundario (transacciones/ticket/unidades). */
function KpiCard({
  label,
  value,
  sub,
  pct,
  diff,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  pct: number | null;
  diff: number;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm" data-testid={testId}>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl font-black tabular-nums tracking-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">{sub}</p>}
      <div className="mt-2">
        <VariationBadge pct={pct} diff={diff} />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2.5" aria-busy="true" data-testid="indicators-summary-loading">
      <div className="h-28 rounded-xl bg-muted/20 animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        <div className="h-24 rounded-xl bg-muted/20 animate-pulse" />
        <div className="h-24 rounded-xl bg-muted/20 animate-pulse" />
        <div className="h-24 rounded-xl bg-muted/20 animate-pulse col-span-2 lg:col-span-1" />
      </div>
    </div>
  );
}

export function IndicatorsSummary() {
  const { user } = useAuthStore();
  const q = useProductComparison(user?.activeStoreId ?? null);

  if (q.isLoading) return <LoadingState />;

  if (q.isError || !q.data) {
    return (
      <div
        className="flex items-start justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4"
        data-testid="indicators-summary-error"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-foreground">
            No se pudo consultar las ventas del período.
            {q.error instanceof Error ? ` ${q.error.message}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted transition-colors min-h-[36px]"
          data-testid="indicators-summary-retry"
        >
          <RefreshCw className="w-3 h-3" /> Reintentar
        </button>
      </div>
    );
  }

  const { actual, ventana, updatedAt } = q.data;
  const kpi = actual.kpi;
  const prev = kpi.prev;
  const ventanaAnterior = previousMonthEquivalentWindow(ventana);

  const netoActual = kpi.net_cup;
  const netoAnterior = prev.net_cup;
  // Sin base válida (anterior ≤ 0) NO se calcula porcentaje (misión §3/§4.2).
  const sinBase = netoAnterior <= 0;
  const varVentas = sinBase ? null : percentChange(netoActual, netoAnterior);
  const difVentas = absDiff(netoActual, netoAnterior);

  const varOps = prev.ops > 0 ? percentChange(kpi.ops, prev.ops) : null;
  const difOps = absDiff(kpi.ops, prev.ops);

  const varTicket = prev.avg_ticket_cup > 0 ? percentChange(kpi.avg_ticket_cup, prev.avg_ticket_cup) : null;
  const difTicket = absDiff(kpi.avg_ticket_cup, prev.avg_ticket_cup);

  // Referencia separada de operaciones en USD (nominal + equivalente canónico
  // ya incluido en las ventas netas) — nunca se suma a la cifra principal.
  const usdNominal = kpi.collected_usd;
  const usdEquiv = kpi.collected_cup_equiv;

  return (
    <div className="min-w-0 space-y-2.5" data-testid="indicators-summary">
      {/* Tarjeta principal: ventas netas del mes en curso vs mismo tramo del mes anterior */}
      <section
        className="rounded-xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm"
        aria-label="Ventas netas del mes en curso comparadas con el mismo tramo del mes anterior"
        data-testid="kpi-sales-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Ventas netas · mes en curso
            </p>
            <p className="mt-1 text-3xl sm:text-4xl font-black tabular-nums tracking-tight text-foreground leading-none" data-testid="kpi-sales-value">
              {formatCurrency(netoActual)}
              <span className="ml-1.5 text-xs font-bold text-muted-foreground">CUP</span>
            </p>
            {!sinBase && (
              <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums" data-testid="kpi-sales-prev">
                Período anterior: <span className="font-bold text-foreground">{formatCurrency(netoAnterior)}</span> CUP
              </p>
            )}
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1.5">
            {sinBase ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground"
                data-testid="kpi-sales-no-base"
              >
                Sin base de comparación
              </span>
            ) : (
              <VariationBadge pct={varVentas} diff={difVentas} />
            )}
            {sinBase && (
              <span className="text-[11px] font-black tabular-nums text-muted-foreground" data-testid="kpi-sales-diff">
                {difVentas > 0 ? '+' : ''}{formatCurrency(difVentas)} CUP
              </span>
            )}
          </div>
        </div>

        {/* Contexto: fechas exactas de ambos períodos + momento de actualización */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span data-testid="kpi-periods" className="tabular-nums">
            {toDateInputValue(ventana.from)} — {toDateInputValue(ventana.to)}
            {' · vs '}
            {toDateInputValue(ventanaAnterior.from)} — {toDateInputValue(ventanaAnterior.to)}
          </span>
          {updatedAt && (
            <span className="tabular-nums" data-testid="kpi-updated">
              Actualizado: {toDateInputValue(new Date(updatedAt))} · {new Date(updatedAt).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </section>

      {/* Indicadores secundarios: actividad y calidad de la venta */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        <KpiCard
          label="Transacciones"
          value={kpi.ops.toLocaleString('es-CU')}
          sub={`antes: ${prev.ops.toLocaleString('es-CU')}`}
          pct={varOps}
          diff={difOps}
          testId="kpi-ops"
        />
        <KpiCard
          label="Ticket promedio"
          value={formatCurrency(kpi.avg_ticket_cup)}
          sub={`antes: ${formatCurrency(prev.avg_ticket_cup)}`}
          pct={varTicket}
          diff={difTicket}
          testId="kpi-avg-ticket"
        />
        <div
          className="rounded-xl border border-border bg-card p-3.5 shadow-sm col-span-2 lg:col-span-1"
          data-testid="kpi-units"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidades vendidas</p>
          <p className="mt-1.5 text-xl font-black tabular-nums tracking-tight text-foreground">
            {kpi.units_sold.toLocaleString('es-CU')}
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            El histórico del período anterior no expone unidades: sin variación inventada.
          </p>
        </div>
      </div>

      {/* CP-FX-001 — Tarjeta premium: dólar informal del mercado cubano.
          La misma serie de Inteligencia Cambiaria (informal_latest), con
          fecha real del dato, hora de actualización y variación diaria. */}
      <InformalUsdRateCard />

      {/* Referencia separada de USD (misión §4.2: no mezclar monedas) */}
      {usdNominal !== 0 && (
        <p className="text-[10px] leading-relaxed text-muted-foreground px-1" data-testid="kpi-usd-note">
          Cobrado en USD del período: <span className="font-bold tabular-nums">{usdNominal.toFixed(2)} USD</span> en
          billetes/transferencia · equivalente canónico{' '}
          <span className="font-bold tabular-nums">{formatCurrency(usdEquiv)}</span> CUP
          (ya incluido en las ventas netas; no se suma aparte).
        </p>
      )}
    </div>
  );
}
