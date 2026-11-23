'use client';

/**
 * ADNEGOCIO-UI 2026-11-23 · Conciliación — Bloque 1 «Diferencia de valoración
 * contable CUP» (misión ADNEGOCIO §2.A).
 *
 * Centraliza en esta pestaña la información que antes vivía en el strip de
 * caja del Inicio (CajaStatusStrip, retirado). Las cifras SIEMPRE provienen
 * del cálculo oficial (RPC get_cash_shift_expected vía useCashShiftExpected):
 *  · Diferencia de valoración = esperado canónico − libro físico CUP
 *    (valuation_residual_cup del RPC).
 *  · Esperado canónico: fórmula de arqueo — cada movimiento a SU tasa
 *    histórica.
 *  · Libro físico: saldo autoritativo de billetes por moneda.
 *
 * REGLA INVOLABLE conservada: esta diferencia NO representa efectivo
 * disponible ni demuestra dinero faltante — es la valoración de cobros y
 * entregas en otras monedas a tasas históricas distintas. Cuando no hay
 * turno, la ventana es la acumulada desde el último cierre u origen
 * (window_start del RPC). Trazabilidad: enlace a los movimientos de
 * Ingresos/Egresos que explican el saldo.
 */
import React from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useUIStore } from '@/store';
import { useActiveShift } from '@/hooks/api/useActiveShift';
import { useCashShiftExpected } from '@/hooks/api/useCashClosures';

export function FinValoracionBlock() {
  const user = useAuthStore((s) => s.user);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const storeId = user?.activeStoreId;

  const activeShift = useActiveShift(storeId);
  const expected = useCashShiftExpected(storeId);
  const turnoAbierto = activeShift.data != null;

  if (!storeId) return null;

  const fisicoCup = expected.data?.physical_cash?.CUP ?? null;
  const esperado = expected.data?.expected_cash ?? null;
  // Residuo del RPC; ausente ⇒ 0 (sin diferencia de valoración).
  const residuo = expected.data ? (expected.data.valuation_residual_cup ?? 0) : null;
  const hayDiferencia = residuo != null && Math.abs(residuo) >= 0.005;

  return (
    <section
      className={cn(
        'rounded-2xl border p-4 space-y-3',
        hayDiferencia ? 'border-warning/40 bg-warning/5' : 'border-border bg-card',
      )}
      aria-label="Diferencia de valoración contable CUP"
      data-testid="fin-valoracion-block"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-widest text-foreground">
          1 · Diferencia de valoración contable CUP
        </h3>
        <button
          type="button"
          onClick={() => setCurrentView('ingresos_egresos')}
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:opacity-80 transition-opacity"
          aria-label="Ver los movimientos que explican el saldo en Ingresos/Egresos"
        >
          Trazabilidad: movimientos que explican el saldo <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Tres cifras del estado actual — siempre del cálculo oficial */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" data-testid="fin-valoracion-figures">
        <div className="rounded-xl border border-border bg-background p-3" title="Esperado canónico − libro físico CUP (valoración de cobros y entregas en otras monedas a tasas históricas).">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Diferencia de valoración</p>
          <p
            className={cn('text-lg font-black tabular-nums', hayDiferencia ? 'text-warning' : 'text-foreground')}
            data-testid="fin-valoracion-cifra"
          >
            {residuo != null ? formatCurrency(residuo) : expected.isError ? 'N/D' : '…'}
            <span className="ml-1 text-[10px] font-bold text-muted-foreground">CUP</span>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3" title="Fórmula de arqueo: cada movimiento valorado a su tasa histórica (canónico).">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor esperado canónico</p>
          <p className="text-lg font-black tabular-nums text-foreground">
            {esperado != null ? formatCurrency(esperado) : expected.isError ? 'N/D' : '…'}
            <span className="ml-1 text-[10px] font-bold text-muted-foreground">CUP</span>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3" title="Libro físico autoritativo de billetes CUP (misma lectura que autorizan los RPC del cajón).">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Libro físico</p>
          <p className="text-lg font-black tabular-nums text-foreground">
            {fisicoCup != null ? formatCurrency(fisicoCup) : expected.isError ? 'N/D' : '…'}
            <span className="ml-1 text-[10px] font-bold text-muted-foreground">CUP</span>
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
        <p>
          Esta diferencia de valoración <span className="font-bold text-foreground">no representa efectivo disponible ni
          demuestra dinero faltante</span>: es la valoración de cobros y entregas en otras monedas a sus tasas históricas
          (p. ej. USD cobrados a la tasa de la venta y entregados a la vigente).{' '}
          {turnoAbierto
            ? <>Ventana del turno abierto desde {expected.data ? `${formatDate(expected.data.window_start)} · ${formatTime(expected.data.window_start)}` : '—'}.</>
            : <>Sin turno abierto: ventana acumulada desde el último cierre u origen{expected.data ? ` (${formatDate(expected.data.window_start)})` : ''}.</>}
        </p>
      </div>
    </section>
  );
}
