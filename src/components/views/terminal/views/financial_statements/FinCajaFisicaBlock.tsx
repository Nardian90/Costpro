'use client';

/**
 * ADNEGOCIO-UI 2026-11-23 · Conciliación — Bloque 2 «Caja — Respaldo físico y
 * disponibilidad» (misión ADNEGOCIO §2.B).
 *
 * Centraliza en esta pestaña el respaldo físico de caja POR MONEDA que antes
 * vivía en el strip de caja del Inicio (CajaStatusStrip, retirado — su
 * presentación y sus fuentes se conservan sin cambios de cálculo):
 *  · Efectivo físico disponible: libro físico por moneda (physical_cash del
 *    RPC get_cash_shift_expected — la misma lectura que autorizan los RPC
 *    del cajón). CUP y USD se muestran SEPARADOS: nunca se suman como
 *    equivalentes.
 *  · Fondo de cambio vigente: RPC get_cash_flow_summary (degradación limpia
 *    si el RPC no está disponible).
 *  · Sin turno: el fondo de cambio debe declararse al abrir el turno o
 *    mediante Ingresos/Egresos (mensaje conservado).
 */
import React from 'react';
import { Coins, Landmark, Loader2, RefreshCw } from 'lucide-react';
import { cn, formatCurrency, formatTime, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useUIStore } from '@/store';
import { useActiveShift } from '@/hooks/api/useActiveShift';
import { useCashShiftExpected } from '@/hooks/api/useCashClosures';
import { useCashFlowSummary } from '@/hooks/api/useCashFlow';

export function FinCajaFisicaBlock() {
  const user = useAuthStore((s) => s.user);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const storeId = user?.activeStoreId;

  const activeShift = useActiveShift(storeId);
  const expected = useCashShiftExpected(storeId);
  const summary = useCashFlowSummary(storeId, null, null);

  const turnoAbierto = activeShift.data != null;
  const cargando = activeShift.isLoading || expected.isLoading;

  if (!storeId) return null;

  // Libro físico POR MONEDA (disponibilidad principal — nunca el canónico).
  const fisicoCup = expected.data?.physical_cash?.CUP ?? null;
  const fisicoUsd = expected.data?.physical_cash?.USD ?? null;
  const fondo = summary.data?.fondo_vigente ?? null;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
      aria-label="Caja — Respaldo físico y disponibilidad"
      data-testid="fin-caja-fisica-block"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-widest text-foreground">
          2 · Caja — Respaldo físico y disponibilidad
        </h3>
        <button
          type="button"
          onClick={() => setCurrentView('ingresos_egresos')}
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:opacity-80 transition-opacity"
          aria-label="Ir a Ingresos/Egresos"
        >
          Ingresos/Egresos
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" data-testid="fin-caja-figures">
        {/* Estado del turno */}
        <button
          type="button"
          onClick={() => setCurrentView('cash')}
          className="flex items-start gap-2.5 rounded-xl border border-border bg-background p-3 text-left min-w-0"
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
              <span className={cn('w-2 h-2 rounded-full shrink-0', cargando ? 'bg-muted-foreground/50' : turnoAbierto ? 'bg-success' : 'bg-warning animate-pulse')} aria-hidden="true" />
              {cargando ? 'Consultando…' : turnoAbierto ? 'Turno abierto' : 'Sin turno abierto'}
            </span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              {activeShift.data
                ? `Desde ${formatDate(activeShift.data.created_at)} · ${formatTime(activeShift.data.created_at)}`
                : 'Abre el turno para operar la caja'}
            </span>
          </span>
        </button>

        {/* Efectivo físico disponible POR MONEDA (sin sumar monedas) */}
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-background p-3 min-w-0">
          <span className="mt-0.5 p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <RefreshCw className={cn('w-4 h-4', expected.isFetching && 'animate-spin')} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Efectivo físico disponible
            </span>
            <span className="block text-base font-black tabular-nums text-foreground truncate" data-testid="fin-caja-fisico-cup">
              {fisicoCup != null ? formatCurrency(fisicoCup) : cargando ? '…' : '—'}
              <span className="ml-1 text-[10px] font-bold text-muted-foreground">CUP</span>
            </span>
            <span className="block text-[10px] text-muted-foreground" data-testid="fin-caja-fisico-usd">
              {fisicoUsd != null ? `${fisicoUsd.toFixed(2)} USD en billetes` : cargando ? '…' : '—'}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              Libro físico por moneda · respalda toda salida de efectivo
            </span>
          </span>
        </div>

        {/* Fondo de cambio vigente */}
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-background p-3 min-w-0">
          <span className="mt-0.5 p-1.5 rounded-lg bg-warning/10 text-warning shrink-0">
            {summary.isLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Coins className="w-4 h-4" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Fondo de cambio vigente
            </span>
            <span className="block text-base font-black tabular-nums text-foreground truncate" data-testid="fin-caja-fondo">
              {fondo != null ? formatCurrency(fondo) : summary.isError ? 'N/D' : '…'}
              <span className="ml-1 text-[10px] font-bold text-muted-foreground">CUP</span>
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {/* Composición explícita (MISIÓN CP-CASH-OPENING-001): con turno
                  abierto, fondo_vigente = fondo inicial declarado (físico, por
                  moneda) + constituciones − devoluciones del mecanismo
                  documental. Nunca incluye valoración canónica ni residuos. */}
              {turnoAbierto
                ? 'Fondo inicial del turno (físico) + constituciones − devoluciones · pendiente de devolver al cierre'
                : 'Sin turno: decláralo al abrir el turno o vía Ingresos/Egresos'}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
