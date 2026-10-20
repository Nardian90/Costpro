'use client';

/**
 * CajaStatusStrip — indicadores de caja del Inicio (MISIÓN INGRESOS/EGRESOS
 * 2026-10-20, requisito §7).
 *
 * El saldo de caja mostrado proviene del RPC get_cash_shift_expected
 * (v2.21.0), que ya incorpora los documentos Ingresos/Egresos (fondo de
 * cambio y otros) UNA sola vez — un ingreso físico de efectivo aumenta el
 * saldo SIN inflar las ventas ni los cobros. El fondo de cambio vigente
 * llega del RPC get_cash_flow_summary (degradación limpia si la migración
 * aún no se aplicó: el chip simplemente no se muestra).
 *
 * Embebido en DashboardView → visible en Inicio (AICommandCenterView) y en
 * OPERACIÓN → Dashboard. NO es saldo persistido: es el efectivo esperado del
 * turno, reconstruible desde los movimientos válidos.
 */

import React from 'react';
import { Landmark, Coins, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
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
  const saldo = expected.data?.expected_cash ?? null;
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

        {/* Saldo de caja (efectivo esperado del turno — incluye ingresos/egresos) */}
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <RefreshCw className={cn('w-4 h-4', expected.isFetching && 'animate-spin')} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Saldo de caja (efectivo esperado)
            </span>
            <span className="block text-base font-black tabular-nums text-foreground truncate" data-testid="caja-saldo">
              {saldo != null ? formatCurrency(saldo) : cargando ? '…' : '—'}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              Fondo + ventas cash + ingresos − egresos del turno
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
              {turnoAbierto ? 'Pendiente de devolver al cierre' : 'Constitúyelo al abrir el turno'}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
