'use client';

/**
 * CashLedgerPanel — MISIÓN CAJA v2.24.0 (§7) · MISIÓN AUDITORÍA CAJA (2026-10-24).
 *
 * «Los movimientos que explican el saldo»: libro mayor de caja con
 *  · saldo físico CUP y USD separados (el canónico CUP es el equivalente
 *    contable identificado como tal — nunca se suman como unidades iguales);
 *  · saldo corrido por fila (reconstruido desde movimientos persistidos);
 *  · saldo histórico a fecha de corte (as_of) — no se reutiliza el saldo actual;
 *  · filtros de visualización (moneda, tipo, usuario, referencia, fechas)
 *    que NO destruyen el saldo real de cada fila.
 *
 * Fuente: /api/cash-flow/ledger (clasificación espejo de get_cash_currency_summary).
 *
 * MISIÓN AUDITORÍA CAJA (2026-10-24) §Fase 2: este bloque YA NO es un acordeón
 * — es el CONTENIDO de la pestaña «Movimientos que explican el saldo» de
 * IngresosEgresosView. El panel permanece montado (la vista padre lo oculta
 * con `hidden` cuando la pestaña está inactiva) para conservar filtros y
 * fechas al navegar. La consulta se activa con la pestaña (primera visita)
 * y permanece suscrita — sin solicitudes redundantes al alternar.
 */

import React, { useMemo, useState } from 'react';
import {
  Loader2, RefreshCcw, AlertTriangle, History, ArrowDownToLine, ArrowUpFromLine,
  Landmark,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  useCashLedger,
} from '@/hooks/api/useCashLedger';
import { movementLabel, type CashLedgerMovementType } from '@/lib/cash-ledger/build-ledger';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';

const MOVEMENT_TYPE_OPTIONS: Array<{ value: CashLedgerMovementType | 'all'; label: string }> = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'venta_efectivo', label: 'Ventas en efectivo' },
  { value: 'vuelto_venta', label: 'Vueltos de venta' },
  { value: 'anticipo_produccion', label: 'Anticipos producción/trabajo' },
  { value: 'pago_proveedor', label: 'Pagos a proveedores' },
  { value: 'comision', label: 'Comisiones' },
  { value: 'ingreso_caja', label: 'Ingresos de caja' },
  { value: 'egreso_caja', label: 'Egresos de caja' },
  { value: 'entrega_efectivo', label: 'Entregas de efectivo' },
  { value: 'reembolso_devolucion', label: 'Reembolsos de devolución' },
  { value: 'ajuste_caja', label: 'Ajustes de caja' },
  { value: 'apertura_turno', label: 'Aperturas de turno' },
  { value: 'cierre_turno', label: 'Cierres de turno' },
];

interface Props {
  storeId: string | null;
  /** Esperado canónico CUP (expected_cash del arqueo — get_cash_flow_summary).
   *  MISIÓN EFECTIVO FÍSICO (P0 2026-10-26): se exhibe clasificado como
   *  VALORACIÓN CONTABLE — nunca como efectivo disponible. */
  canonicalCup: number | null;
  /** §Fase 2: la pestaña está activa (el panel siempre montado, oculto si inactivo). */
  active?: boolean;
}

export default function CashLedgerPanel({ storeId, canonicalCup, active = true }: Props) {
  const [currency, setCurrency] = useState<'all' | 'CUP' | 'USD'>('all');
  const [type, setType] = useState<CashLedgerMovementType | 'all'>('all');
  const [q, setQ] = useState('');
  const [asOf, setAsOf] = useState('');
  const [days, setDays] = useState<number>(90);

  const filters = useMemo(() => {
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      asOf: asOf ? new Date(`${asOf}T23:59:59`).toISOString() : null,
      type,
      currency,
      q: q || null,
      limit: 2000,
    };
  }, [days, asOf, type, currency, q]);

  // La carga se activa con la pestaña (primera visita) y PERMANECE suscrita
  // al volver (react-query reutiliza la caché por clave — cero refetch extra
  // por alternar pestañas mientras los datos no estén obsoletos).
  const query = useCashLedger(storeId, filters, active && !!storeId);

  const rows = query.data?.rows ?? [];
  const balanceNow = query.data?.balance_now;
  const cutoff = query.data?.balance_at_cutoff;
  const opening = query.data?.opening;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      {/* Encabezado del panel ( YA NO colapsable — pestaña dedicada §Fase 2) */}
      <div className="flex items-center gap-3 min-w-0 p-4 sm:p-6 pb-3 sm:pb-3">
        <div className="p-2 bg-primary/10 rounded-xl shrink-0">
          <History className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="font-black text-sm sm:text-base uppercase tracking-widest">
            Movimientos que explican el saldo
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Libro físico por moneda con saldo corrido e histórico · ventas en efectivo, vueltos, ingresos/egresos, entregas, reembolsos y turnos
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4">
          {/* Saldos físicos por moneda (§9) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Saldo físico CUP" value={balanceNow ? formatCurrency(balanceNow.cup) : '—'} tone="primary" />
            <Kpi label="Saldo físico USD" value={balanceNow ? formatCurrency(balanceNow.usd, 'USD') : '—'} tone="usd" />
            <Kpi
              label="Valoración contable CUP (no es efectivo disponible)"
              value={canonicalCup != null ? formatCurrency(canonicalCup) : '—'}
              tone="muted"
              hint="Esperado canónico del arqueo · vista de valor — no son billetes"
            />
            <Kpi
              label={asOf ? `Saldo histórico al ${asOf}` : 'Saldo histórico (elige fecha de corte)'}
              value={cutoff ? `${formatCurrency(cutoff.cup)} · ${formatCurrency(cutoff.usd, 'USD')}` : '—'}
              tone={asOf ? 'warning' : 'muted'}
              hint={cutoff?.as_of ? 'Reconstruido desde movimientos persistidos' : 'Selecciona una fecha de corte'}
            />
          </div>

          {/* Filtros de visualización (no destruyen el saldo corrido real) */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-bold uppercase"
              aria-label="Período"
            >
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
              <option value={365}>Últimos 12 meses</option>
            </select>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value as 'all' | 'CUP' | 'USD')}
              className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-bold uppercase"
              aria-label="Moneda"
            >
              <option value="all">Todas las monedas</option>
              <option value="CUP">CUP</option>
              <option value="USD">USD</option>
            </select>
            <select
              value={type}
              onChange={e => setType(e.target.value as CashLedgerMovementType | 'all')}
              className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-bold uppercase"
              aria-label="Tipo de movimiento"
            >
              {MOVEMENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="inline-flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
              Corte
              <input
                type="date"
                value={asOf}
                max={todayBusinessDay()}
                onChange={e => setAsOf(e.target.value)}
                aria-label="Fecha de corte del saldo histórico"
                className="px-2 py-1.5 rounded-lg border border-border bg-background"
              />
            </label>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar referencia o descripción…"
              aria-label="Buscar en el libro"
              className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-border bg-background text-sm"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => query.refetch()}
              className="h-9 w-9 p-2 rounded-xl"
              aria-label="Recargar libro de caja"
            >
              {query.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            </Button>
          </div>

          {/* Estados */}
          {query.isLoading ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="Cargando libro de caja">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : query.error ? (
            <div className="text-center py-10">
              <AlertTriangle className="w-9 h-9 text-destructive/60 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm font-bold text-destructive">No se pudo cargar el libro de caja</p>
              <p className="text-xs text-muted-foreground mt-1">{String((query.error as Error)?.message || query.error)}</p>
              <Button type="button" variant="outline" className="mt-3" onClick={() => query.refetch()}>Reintentar</Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10">
              <Landmark className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm font-bold text-muted-foreground">Sin movimientos en el período seleccionado</p>
              <p className="text-xs text-muted-foreground mt-1">Amplía el período o limpia los filtros</p>
            </div>
          ) : (
            <>
              {query.data?.truncated && (
                <p className="text-[10px] text-warning font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> El período excede el límite de filas por consulta — reduce el rango para ver el historial completo.
                </p>
              )}
              {/* REVISIÓN FINAL v2.24.1: los KPIs vigentes salen del RPC autoritativo;
                  si el payload no lo trajo, el saldo viene de la corrida local (posible
                  truncamiento) — se declara explícitamente. */}
              {balanceNow && balanceNow.reconciled === false && (
                <p className="text-[10px] text-warning font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Saldo vigente reconstruido localmente (sin conciliar con el libro autoritativo) — puede estar incompleto.
                </p>
              )}
              <div className="table-scroll-wrapper overflow-x-auto rounded-xl border border-border">
                <table className="data-table w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 text-muted-foreground font-black uppercase tracking-widest border-b border-border">
                      <th className="p-3 text-left">Fecha y hora</th>
                      <th className="p-3 text-left">Tipo</th>
                      <th className="p-3 text-left">Referencia / descripción</th>
                      <th className="p-3 text-center">Moneda</th>
                      <th className="p-3 text-right">Entrada</th>
                      <th className="p-3 text-right">Salida</th>
                      <th className="p-3 text-right">Saldo físico resultante</th>
                      <th className="p-3 text-left">Usuario</th>
                      <th className="p-3 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="p-3 whitespace-nowrap">
                          <div className="font-bold">{formatDate(r.effective_at)}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{formatTime(r.effective_at)} · op. {r.operational_date}</div>
                        </td>
                        <td className="p-3">
                          <span className={cn(
                            'inline-flex items-center gap-1 font-black uppercase text-[10px] px-2 py-0.5 rounded',
                            r.direction === 'in' ? 'text-success bg-success/10'
                              : r.direction === 'out' ? 'text-destructive bg-destructive/10'
                              : 'text-muted-foreground bg-muted',
                          )}>
                            {r.direction === 'in' && <ArrowDownToLine className="w-3 h-3" />}
                            {r.direction === 'out' && <ArrowUpFromLine className="w-3 h-3" />}
                            {r.movement_label}
                          </span>
                        </td>
                        <td className="p-3 max-w-[260px]">
                          <div className="font-bold truncate">{r.reference ?? '—'}</div>
                          <div className="text-[10px] text-muted-foreground line-clamp-2">{r.description}</div>
                        </td>
                        <td className="p-3 text-center font-black">{r.currency}</td>
                        <td className="p-3 text-right font-mono font-bold text-success tabular-nums">
                          {r.currency === 'CUP'
                            ? (r.entry_cup ? formatCurrency(r.entry_cup) : '')
                            : (r.entry_usd ? formatCurrency(r.entry_usd, 'USD') : '')}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-destructive tabular-nums">
                          {r.currency === 'CUP'
                            ? (r.exit_cup ? formatCurrency(r.exit_cup) : '')
                            : (r.exit_usd ? formatCurrency(r.exit_usd, 'USD') : '')}
                        </td>
                        <td className="p-3 text-right font-mono font-black tabular-nums whitespace-nowrap">
                          <span>{formatCurrency(r.balance_cup)}</span>
                          <span className="text-emerald-600 dark:text-emerald-400"> · {formatCurrency(r.balance_usd, 'USD')}</span>
                        </td>
                        <td className="p-3">{r.user_name ?? '—'}</td>
                        <td className="p-3">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted">{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {rows.length} movimiento(s) · apertura de la ventana: CUP {formatCurrency(opening?.cup ?? 0)} · USD {formatCurrency(opening?.usd ?? 0, 'USD')} —
                los filtros de visualización no alteran el saldo corrido real de cada fila (misión §7).
              </p>
            </>
          )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone: 'primary' | 'usd' | 'warning' | 'muted'; hint?: string }) {
  return (
    <div className={cn(
      'rounded-xl border p-3',
      tone === 'primary' ? 'border-primary/20 bg-primary/5' :
      tone === 'usd' ? 'border-emerald-500/25 bg-emerald-500/5' :
      tone === 'warning' ? 'border-warning/30 bg-warning/5' :
      'border-border bg-muted/20',
    )}>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn(
        'text-lg font-black font-mono tabular-nums mt-1',
        tone === 'usd' && 'text-emerald-600 dark:text-emerald-400',
      )}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}
