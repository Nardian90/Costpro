'use client';

/**
 * InformalUsdRateCard — tarjeta premium del DÓLAR INFORMAL en el Panel de
 * Control (CP-FX-PREMIUM-DASHBOARD-AND-HISTORICAL-DATA-RECOVERY-001, FASE 1).
 *
 * FUENTE ÚNICA: la MISMA API de Inteligencia Cambiaria
 * (/api/exchange-rates?currency=USD&source=informal&segment=3) — sin segunda
 * fuente de datos ni tasa independiente. El valor mostrado es
 * `informal_latest`: la OBSERVACIÓN REAL más reciente del proveedor informal
 * ACTIVO (Diviza). Las reconstrucciones estadísticas (capture_method='estimated')
 * y los arrastres virtuales JAMÁS se presentan como tasa actual (misión §C).
 *
 * ESTADOS DE ACTUALIZACIÓN (misión §C — honestos):
 *   - «Observada hoy»: existe captura real de la fecha operativa (Cuba).
 *   - «Última disponible»: no hay registro de hoy; se muestra el último real
 *     con su FECHA REAL y la antigüedad («Pendiente de actualización») —
 *     nunca una cotización antigua disfrazada de actual.
 *   - Estimada/arrastre: solo como referencia del indicador, identificadas.
 *
 * VARIACIÓN DIARIA (misión §B): contra el día CALENDARIO inmediatamente
 * anterior con observación real del proveedor activo. Sin dato del día
 * anterior → «Sin dato del día anterior» (sin variación inventada).
 * Muestra diferencia absoluta en CUP y porcentaje; subida/bajada/estabilidad.
 *
 * INTERACCIÓN: «Ver evolución» navega a Inteligencia Cambiaria
 * (setCurrentView('exchange-intelligence') — el acceso directo de la misión §D).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Clock3,
  ExternalLink,
  LineChart as LineChartIcon,
  Minus,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store';
import { useIntervalWhenVisible } from '@/hooks/ui/use-interval-when-visible';

/** Fila mínima que consume la tarjeta (respuesta de /api/exchange-rates). */
interface FxRateRow {
  rate: number;
  rate_date: string;
  captured_at?: string | null;
  source?: string | null;
  segment?: string | null;
  currency?: string | null;
  capture_method?: string | null;
  source_updated_at?: string | null;
}

interface FxApiResponse {
  rates?: FxRateRow[];
  operative_date?: string;
  informal_latest?: {
    rate: number;
    rate_date: string;
    source: string;
    capture_method: string;
    captured_at: string | null;
    source_updated_at: string | null;
  };
}

type RateStatus = 'observada-hoy' | 'ultima-disponible' | 'sin-dato';

interface CardState {
  status: RateStatus;
  rate: number | null;
  rateDate: string | null;
  source: string | null;
  /** Hora declarada por el PROVEEDOR (Diviza), distinta de la captura de CostPro. */
  sourceUpdatedAt: string | null;
  capturedAt: string | null;
  operativeDate: string;
  /** Variación contra el día calendario anterior (día con observación real). */
  variation: {
    diffCup: number;
    diffPct: number | null;
    direction: 'up' | 'down' | 'flat';
    prevDate: string | null;
    prevIsEstimated: boolean;
  } | null;
  variationMissingPrevDay: boolean;
  loading: boolean;
  error: string | null;
}

const HAVANA_TZ = 'America/Havana';

/** dd/mm/yyyy desde fecha ISO pura (sin manipular zonas horarias). */
function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Hora en Cuba desde un timestamp ISO con offset/UTC. */
function formatHavanaTime(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('es-CU', {
    timeZone: HAVANA_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function computeCardState(json: FxApiResponse): Omit<CardState, 'loading' | 'error'> {
  const operativeDate = typeof json.operative_date === 'string' && json.operative_date
    ? json.operative_date
    : '';
  const rates = json.rates ?? [];
  const latest = json.informal_latest ?? null;

  if (!latest) {
    return {
      status: 'sin-dato',
      rate: null,
      rateDate: null,
      source: null,
      sourceUpdatedAt: null,
      capturedAt: null,
      operativeDate,
      variation: null,
      variationMissingPrevDay: false,
    };
  }

  // Variación: día calendario inmediatamente anterior al del dato mostrado.
  // Solo observaciones reales del proveedor activo (misma regla de la vigente).
  const prevCalendarDate = (() => {
    const d = new Date(`${latest.rate_date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const prevRow = rates
    .filter(
      r =>
        r.capture_method === 'real' &&
        r.currency === 'USD' &&
        (r.source ?? '') !== 'BCC' &&
        r.rate_date === prevCalendarDate,
    )
    .sort((a, b) => (b.captured_at || '').localeCompare(a.captured_at || ''))[0];

  let variation: CardState['variation'] = null;
  let variationMissingPrevDay = false;
  if (prevRow && typeof prevRow.rate === 'number' && prevRow.rate > 0) {
    // Normalización de cero negativo: Math.round(-0.1)/100 → -0, que
    // toLocaleString renderiza como «-0.00». La estabilidad se muestra 0.00.
    const normalizeZero = (v: number) => (Object.is(v, -0) ? 0 : v);
    const diffCup = normalizeZero(Math.round((latest.rate - prevRow.rate) * 100) / 100);
    const diffPct = normalizeZero(Math.round((diffCup / prevRow.rate) * 10000) / 100);
    variation = {
      diffCup,
      diffPct,
      direction: diffCup > 0 ? 'up' : diffCup < 0 ? 'down' : 'flat',
      prevDate: prevRow.rate_date,
      prevIsEstimated: false, // solo reales entran al cálculo
    };
  } else {
    variationMissingPrevDay = true;
  }

  const isToday = latest.rate_date === operativeDate;
  return {
    status: isToday ? 'observada-hoy' : 'ultima-disponible',
    rate: latest.rate,
    rateDate: latest.rate_date,
    source: latest.source,
    sourceUpdatedAt: latest.source_updated_at ?? null,
    capturedAt: latest.captured_at ?? null,
    operativeDate,
    variation,
    variationMissingPrevDay,
  };
}

export function InformalUsdRateCard() {
  const { setCurrentView } = useUIStore();
  const [state, setState] = useState<CardState>({
    status: 'sin-dato',
    rate: null,
    rateDate: null,
    source: null,
    sourceUpdatedAt: null,
    capturedAt: null,
    operativeDate: '',
    variation: null,
    variationMissingPrevDay: false,
    loading: true,
    error: null,
  });

  const fetchCard = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const { useAuthStore } = await import('@/store');
      const token = useAuthStore.getState().token;
      const res = await fetch('/api/exchange-rates?currency=USD&source=informal&segment=3&days=30', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as FxApiResponse;
      setState({ ...computeCardState(json), loading: false, error: null });
    } catch (e: unknown) {
      setState(s => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'Error al consultar la tasa',
      }));
    }
  }, []);

  useEffect(() => {
    fetchCard();
  }, [fetchCard]);

  // Auto-refresh cada 5 minutos, pausado cuando el tab está oculto (3G/batería).
  useIntervalWhenVisible(fetchCard, 5 * 60 * 1000);

  const openEvolution = useCallback(() => setCurrentView('exchange-intelligence'), [setCurrentView]);

  // ── Estados de carga / error / sin dato (compactos, no rompen la composición) ──
  if (state.loading && !state.rateDate) {
    return (
      <section
        className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        aria-busy="true"
        aria-label="Dólar informal"
        data-testid="fx-card-loading"
      >
        <div className="h-1 w-full bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
        <div className="flex items-center gap-3 p-4">
          <div className="h-10 w-10 rounded-xl bg-muted/40 animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-28 rounded bg-muted/40 animate-pulse" />
            <div className="h-7 w-44 rounded bg-muted/40 animate-pulse" />
          </div>
          <div className="h-6 w-24 rounded-full bg-muted/40 animate-pulse" />
        </div>
      </section>
    );
  }

  if (state.error) {
    return (
      <section
        className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        aria-label="Dólar informal"
        data-testid="fx-card-error"
      >
        <div className="h-1 w-full bg-gradient-to-r from-destructive/50 via-destructive/20 to-transparent" />
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <TriangleAlert className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-xs text-muted-foreground truncate">
              Dólar informal no disponible ({state.error})
            </p>
          </div>
          <button
            type="button"
            onClick={fetchCard}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted transition-colors"
            data-testid="fx-card-retry"
          >
            <RefreshCw className="w-3 h-3" /> Reintentar
          </button>
        </div>
      </section>
    );
  }

  // ── Chip de estado de actualización (misión §C) ──
  const staleDays =
    state.status === 'ultima-disponible' && state.rateDate && state.operativeDate
      ? Math.max(
          0,
          Math.round(
            (Date.parse(`${state.operativeDate}T12:00:00Z`) - Date.parse(`${state.rateDate}T12:00:00Z`)) /
              86_400_000,
          ),
        )
      : 0;

  const statusChip =
    state.status === 'observada-hoy' ? (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-success"
        data-testid="fx-status-chip"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden="true" />
        Observada hoy
      </span>
    ) : (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400"
        data-testid="fx-status-chip"
        title="No existe registro de la fecha operativa: se muestra la última cotización real disponible con su fecha"
      >
        <Clock3 className="h-3 w-3" aria-hidden="true" />
        Última disponible
        {staleDays > 0 && <span className="font-bold">· hace {staleDays} {staleDays === 1 ? 'día' : 'días'}</span>}
      </span>
    );

  // ── Indicador de variación diaria (misión §B) ──
  const variationBadge = (() => {
    if (state.variation) {
      const { diffCup, diffPct, direction } = state.variation;
      const tone =
        direction === 'up' ? 'text-success' : direction === 'down' ? 'text-destructive' : 'text-muted-foreground';
      const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
      const sign = diffCup > 0 ? '+' : '';
      return (
        <span
          className={cn('inline-flex items-center gap-1 text-xs font-black tabular-nums', tone)}
          data-testid="fx-variation-badge"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {sign}
          {diffCup.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CUP
          {diffPct !== null && (
            <span className="font-bold">
              ({sign}
              {diffPct.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)
            </span>
          )}
        </span>
      );
    }
    // Sin base honesta: el día calendario anterior no tiene observación real.
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground"
        data-testid="fx-variation-missing"
      >
        <Minus className="h-3 w-3" aria-hidden="true" />
        Sin dato del día anterior
      </span>
    );
  })();

  const providerTime = formatHavanaTime(state.sourceUpdatedAt);
  const captureTime = formatHavanaTime(state.capturedAt);

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
      aria-label="Tasa informal del dólar (USD/CUP) con variación diaria"
      data-testid="fx-card"
    >
      {/* Acento premium superior */}
      <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-amber-500/40 to-transparent" aria-hidden="true" />

      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Cotización principal */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Dólar informal · USD
            </p>
            <p
              className="mt-0.5 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-foreground leading-none"
              data-testid="fx-rate-value"
            >
              <span className="text-sm font-bold text-muted-foreground">1 USD = </span>
              {state.rate != null
                ? state.rate.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '—'}
              <span className="ml-1.5 text-xs font-bold text-muted-foreground">CUP</span>
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground tabular-nums">
              <span data-testid="fx-data-date">Dato: {state.rateDate ? formatIsoDate(state.rateDate) : '—'}</span>
              {(providerTime || captureTime) && (
                <span data-testid="fx-updated">
                  Actualizado: {providerTime ?? captureTime} (Cuba)
                </span>
              )}
              {state.source && <span data-testid="fx-source">Fuente: {state.source}</span>}
            </p>
          </div>
        </div>

        {/* Variación + estado + acceso */}
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {variationBadge}
          {statusChip}
          {state.status === 'ultima-disponible' && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold" data-testid="fx-stale-note">
              Pendiente de actualización — no se presenta como tasa de hoy
            </p>
          )}
          <button
            type="button"
            onClick={openEvolution}
            className="group inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary hover:border-primary/30 min-h-[32px]"
            data-testid="fx-ver-evolucion"
          >
            <LineChartIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Ver evolución
            <ExternalLink className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
