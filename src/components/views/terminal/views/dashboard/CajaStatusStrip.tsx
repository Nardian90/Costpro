'use client';

/**
 * CajaStatusStrip — indicadores de caja del Inicio (MISIÓN INGRESOS/EGRESOS
 * 2026-10-20, requisito §7).
 *
 * MISIÓN EFECTIVO FÍSICO (P0 2026-10-26) — «eliminar el efectivo fantasma»:
 * la cifra PRINCIPAL de disponibilidad es el SALDO FÍSICO DEL LIBRO por
 * moneda (physical_cash del RPC get_cash_shift_expected — la misma lectura
 * que autorizan los RPC del cajón: get_cash_currency_summary → net). El
 * esperado canónico (fórmula de arqueo, cada movimiento a SU tasa histórica)
 * NO se presenta como billetes: su diferencia frente al libro vive en el
 * bloque secundario «Diferencia de valoración contable CUP — no representa
 * efectivo disponible», con ventana identificada y trazabilidad.
 *
 * Regla inviolable materializada aquí: si el libro físico marca CUP = 0 y
 * USD = 0, la disponibilidad mostrada es 0,00 CUP y 0,00 USD — aunque exista
 * un residuo de valoración canónico (p. ej. 2.820,00 CUP por cobros/entregas
 * de USD a tasas históricas distintas).
 *
 * El fondo de cambio vigente llega del RPC get_cash_flow_summary (degradación
 * limpia si la migración aún no se aplicó: el chip simplemente no se muestra).
 */

import React from 'react';
import { Landmark, Coins, ArrowRight, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useUIStore } from '@/store';
import { useActiveShift } from '@/hooks/api/useActiveShift';
import { useCashShiftExpected } from '@/hooks/api/useCashClosures';
import { useCashFlowSummary } from '@/hooks/api/useCashFlow';

export function CajaStatusStrip() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const setCurrentView = useUIStore(s => s.setCurrentView);

  const activeShift = useActiveShift(storeId);
  const expected = useCashShiftExpected(storeId);
  const summary = useCashFlowSummary(storeId, null, null);

  const turnoAbierto = activeShift.data != null;
  const cargando = activeShift.isLoading || expected.isLoading;

  // ═══ MISIÓN EFECTIVO FÍSICO (P0 2026-10-26) ═══
  // Disponibilidad = libro físico por moneda (NUNCA el esperado canónico).
  const fisico = expected.data?.physical_cash ?? null;
  const fisicoCup = fisico?.CUP ?? null;
  const fisicoUsd = fisico?.USD ?? null;
  // Residuo de valoración (canónico − libro físico CUP): solo informativo.
  const residuoValoracion = expected.data?.valuation_residual_cup ?? null;
  const hayResiduo = residuoValoracion != null && Math.abs(residuoValoracion) >= 0.005;
  const fondo = summary.data?.fondo_vigente ?? null;

  if (!storeId) return null;

  return (
    <section className="space-y-3" aria-label="Estado de caja y fondo de cambio">
      <div className="flex justify-between items-end px-1">
        <h2 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Caja</h2>
        <button
          type="button"
          onClick={() => setCurrentView('ingresos_egresos')}
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:opacity-80 transition-opacity"
        >
          Ingresos/Egresos <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className={cn(
        'grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl border-2 p-3 sm:p-4 transition-colors',
        cargando ? 'border-border/50 bg-muted/20'
          : turnoAbierto ? 'border-success/25 bg-success/5'
          : 'border-warning/30 bg-warning/5',
      )} data-testid="caja-status-strip">
        {/* Estado del turno */}
        <button
          type="button"
          onClick={() => setCurrentView('cash')}
          className="flex items-start gap-2.5 text-left min-w-0"
          aria-label={turnoAbierto ? 'Turno de caja abierto. Ir a Caja.' : 'Sin turno abierto. Abrir turno en Caja.'}
        >
          <span className={cn(
            'mt-0.5 p-1.5 rounded-lg shrink-0',
            cargando ? 'bg-muted text-muted-foreground'
              : turnoAbierto ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
          )}>
            <Landmark className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className={cn(
              'flex items-center gap-1.5 text-xs font-black uppercase tracking-widest',
              cargando ? 'text-muted-foreground' : turnoAbierto ? 'text-success' : 'text-warning',
            )}>
              <span className={cn('w-2 h-2 rounded-full', cargando ? 'bg-muted-foreground/50' : turnoAbierto ? 'bg-success' : 'bg-warning animate-pulse')} aria-hidden="true" />
              {cargando ? 'Consultando…' : turnoAbierto ? 'Turno abierto' : 'Sin turno abierto'}
            </span>
            <span className="block text-[11px] text-muted-foreground mt-0.5 truncate">
              {activeShift.data
                ? `Desde ${formatDate(activeShift.data.created_at)} · ${formatTime(activeShift.data.created_at)}`
                : turnoAbierto ? '—' : 'Abre el turno para operar la caja'}
            </span>
          </span>
        </button>

        {/* ═══ MISIÓN EFECTIVO FÍSICO: disponibilidad PRINCIPAL = billetes por moneda ═══ */}
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <RefreshCw className={cn('w-4 h-4', expected.isFetching && 'animate-spin')} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Efectivo físico disponible
            </span>
            <span className="block text-base font-black tabular-nums text-foreground truncate" data-testid="caja-fisico-cup">
              {fisicoCup != null ? formatCurrency(fisicoCup) : cargando ? '…' : '—'}
            </span>
            <span className="block text-[10px] text-muted-foreground" data-testid="caja-fisico-usd">
              {fisicoUsd != null ? `${fisicoUsd.toFixed(2)} USD en billetes` : cargando ? '…' : '—'}
            </span>
            <span className="block text-[10px] text-muted-foreground" data-testid="caja-fisico-base">
              Libro físico por moneda · respalda toda salida de efectivo
            </span>
          </span>
        </div>

        {/* Fondo de cambio vigente (solo si el RPC nuevo está disponible) */}
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 p-1.5 rounded-lg bg-warning/10 text-warning shrink-0">
            {summary.isLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Coins className="w-4 h-4" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Fondo de cambio vigente
            </span>
            <span className="block text-base font-black tabular-nums text-foreground truncate" data-testid="caja-fondo">
              {fondo != null ? formatCurrency(fondo) : summary.isError ? 'N/D' : '…'}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {/* MISIÓN CP-CASH-OPENING-001: composición explícita del KPI —
                  con turno abierto, fondo_vigente = fondo inicial declarado
                  (físico, por moneda) + constituciones − devoluciones del
                  mecanismo documental (get_cash_flow_summary). Nunca incluye
                  la valoración canónica ni residuos de valoración. */}
              {turnoAbierto
                ? 'Fondo inicial del turno (físico) + constituciones − devoluciones · pendiente de devolver al cierre'
                : 'Sin turno: decláralo al abrir el turno o vía Ingresos/Egresos'}
            </span>
          </span>
        </div>
      </div>

      {/* ═══ MISIÓN EFECTIVO FÍSICO: bloque SECUNDARIO de valoración contable ═══
          El esperado canónico (fórmula de arqueo — cada movimiento a su tasa
          histórica) NUNCA es la cifra principal de disponibilidad. Su
          diferencia frente al libro físico se presenta clasificada como
          valoración contable, con ventana identificada y trazabilidad. */}
      {hayResiduo && (
        <div
          className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 flex items-start gap-2.5"
          data-testid="caja-valoracion-residual"
          role="status"
        >
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 text-[11px] leading-relaxed">
            <p className="font-black uppercase tracking-widest text-[10px] text-warning">
              Diferencia de valoración contable CUP — no representa efectivo disponible
            </p>
            <p className="tabular-nums mt-0.5">
              <span className="font-black" data-testid="caja-valoracion-cifra">{formatCurrency(residuoValoracion ?? 0)}</span>
              <span className="text-muted-foreground"> · esperado canónico {formatCurrency((expected.data?.expected_cash) ?? 0)} − libro físico {formatCurrency(fisicoCup ?? 0)}</span>
            </p>
            <p className="text-muted-foreground mt-0.5">
              Valoración de cobros y entregas en otra moneda a sus tasas históricas (p. ej. USD cobrados a la tasa de la venta y entregados a la vigente).
              {!turnoAbierto ? ' Sin turno abierto: ventana acumulada desde el último cierre u origen.' : ''}
              {' Trazabilidad: '}
              <button
                type="button"
                onClick={() => setCurrentView('ingresos_egresos')}
                className="underline underline-offset-4 hover:opacity-80 font-bold"
              >
                movimientos que explican el saldo →
              </button>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
