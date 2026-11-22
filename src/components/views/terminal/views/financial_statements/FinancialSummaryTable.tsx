'use client';

/**
 * ADNEGOCIO 2026-11-22 — «Resumen financiero» del Dashboard (misión §6).
 *
 * Tabla ejecutiva de cierre, en dos bloques claramente separados:
 *  A. Resultados del período (ingresos → utilidad bruta → resultado neto).
 *  B. Situación financiera a la fecha de corte (efectivo, bancos, CxC, CxP,
 *     inventario).
 *
 * FUENTE ÚNICA (misión §7, sin duplicar consultas): el mismo
 * GET /api/fin/statements?type=dashboard que carga la franja del Ritmo de
 * ventas (RPC fin_get_dashboard del motor de partida doble):
 *  · Resultados: ingresos = crédito−débito de categorías de ingreso;
 *    costo_ventas y gastos = débito−crédito (naturaleza positiva) del
 *    período from..to; utilidad_bruta = ingresos − costo; resultado_neto =
 *    ingresos − costo − gastos (verificado en la migración del motor).
 *  · Saldos: movimientos con economic_date ≤ p_to por cuenta
 *    (ACT_EFECTIVO_CUP, ACT_EFECTIVO_USD, ACT_BANCOS, ACT_CXC,
 *    PAS_CXP_PROV + PAS_SERV_PEND) e inventario por valoración WAC en vivo
 *    (products.stock_current × cost_average).
 *
 * USD (misión §6C): efectivo_usd es el saldo de la cuenta ACT_EFECTIVO_USD
 * expresado en su equivalente CUP (amount_cup) — es una cuenta DISTINTA de la
 * caja CUP y por tanto NO está incluida en efectivo_cup. El renglón Efectivo
 * suma ambas (como ya hacía el KPI del antiguo Resumen) y el equivalente USD
 * se presenta como DESGLOSE SECUNDARIO marcado «incluido», sin duplicar el
 * importe ni convertir nada por cuenta propia.
 */
import React from 'react';
import { AlertTriangle, RefreshCw, Wallet } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { DashboardData } from './types';

interface FinancialSummaryTableProps {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/** Rengón de la tabla: concepto a la izquierda, importe a la derecha. */
function SummaryRow({
  label,
  value,
  strong,
  deduct,
  result,
  tooltip,
  testId,
}: {
  label: string;
  value: number;
  strong?: boolean;
  /** Deducción del período (costo/gastos): se muestra con signo − de presentación. */
  deduct?: boolean;
  result?: boolean;
  tooltip: string;
  testId: string;
}) {
  const tone = value < 0 ? 'text-destructive' : result === true ? 'text-foreground' : 'text-foreground';
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 py-1.5 border-b border-border/50 last:border-0',
        strong && 'border-t border-border mt-1 pt-2',
      )}
      title={tooltip}
      data-testid={testId}
    >
      <span className={cn('text-[11px] leading-snug', strong ? 'font-black uppercase tracking-wide text-foreground' : 'font-bold text-muted-foreground')}>
        {deduct ? '− ' : ''}{label}
      </span>
      <span className={cn('text-sm tabular-nums text-right whitespace-nowrap', strong ? 'font-black text-base' : 'font-bold', tone)}>
        {deduct ? `−${formatCurrency(Math.abs(value))}` : formatCurrency(value)}
        <span className="ml-1 text-[10px] font-bold text-muted-foreground">CUP</span>
      </span>
    </div>
  );
}

export function FinancialSummaryTable({ data, loading, error, onRetry }: FinancialSummaryTableProps) {
  return (
    <section
      className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm"
      aria-label="Resumen financiero"
      data-testid="financial-summary-table"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" /> Resumen financiero
        </h3>
        <span className="text-[11px] text-muted-foreground">Motor de partida doble · CUP contable</span>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="h-[170px] rounded-lg bg-muted/50 animate-pulse" />
          <div className="h-[170px] rounded-lg bg-muted/50 animate-pulse" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="text-xs text-foreground">No se pudo consultar la información contable: {error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-[11px] font-black uppercase tracking-widest hover:bg-muted"
          >
            <RefreshCw className="w-3 h-3" /> Reintentar
          </button>
        </div>
      ) : !data ? null : (
        <>
          <div className="grid md:grid-cols-2 gap-3 sm:gap-5">
            {/* A. Resultados del período */}
            <div className="rounded-lg border border-border bg-background p-3" data-testid="summary-results-block">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                Resultados del período
              </p>
              <p className="text-[10px] font-bold text-foreground/70 tabular-nums mb-1" data-testid="summary-results-period">
                {data.desde} — {data.hasta}
              </p>
              <SummaryRow
                label="Ingresos"
                value={data.kpis.ingresos}
                tooltip="Ingresos reconocidos por el motor en el período (crédito − débito de las categorías de ingreso; las devoluciones restan como contra-ingreso)."
                testId="summary-row-ingresos"
              />
              <SummaryRow
                label="Costo de ventas"
                value={data.kpis.costo_ventas}
                deduct
                tooltip="Costo de los productos vendidos reconocido por el motor en el período (débito − crédito)."
                testId="summary-row-costo"
              />
              <SummaryRow
                label="Utilidad bruta"
                value={data.kpis.utilidad_bruta}
                strong
                tooltip="Ingresos − costo de ventas del período."
                testId="summary-row-utilidad-bruta"
              />
              <SummaryRow
                label="Gastos operacionales"
                value={data.kpis.gastos}
                deduct
                tooltip="Gastos del período distintos del costo de venta: consumo interno (vales), servicios recibidos, nómina y demás gastos operacionales (débito − crédito)."
                testId="summary-row-gastos"
              />
              <SummaryRow
                label="Resultado neto"
                value={data.kpis.resultado_neto}
                strong
                tooltip="Ingresos − costo de ventas − gastos operacionales del período (resultado contable del motor de partida doble)."
                testId="summary-row-resultado-neto"
              />
            </div>

            {/* B. Situación financiera a la fecha de corte */}
            <div className="rounded-lg border border-border bg-background p-3" data-testid="summary-balance-block">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                Situación financiera a la fecha de corte
              </p>
              <p className="text-[10px] font-bold text-foreground/70 tabular-nums mb-1" data-testid="summary-balance-asof">
                Corte: {data.hasta}
              </p>
              <SummaryRow
                label="Efectivo"
                value={data.kpis.efectivo_cup + data.kpis.efectivo_usd}
                tooltip="Saldo de las cajas (CUP + equivalente CUP de la caja USD) con movimientos hasta la fecha de corte."
                testId="summary-row-efectivo"
              />
              {/* Desglose secundario del efectivo en USD: NO es un renglón adicional
                  que se suma — está incluido en el renglón Efectivo (misión §6C). */}
              <div
                className="flex items-baseline justify-between gap-3 py-1 pl-4 border-b border-border/50"
                title="Saldo de la cuenta ACT_EFECTIVO_USD expresado en su equivalente CUP; ya está incluido en el renglón Efectivo."
                data-testid="summary-row-efectivo-usd"
              >
                <span className="text-[10px] font-bold text-muted-foreground">
                  de ello: caja USD · equivalente en CUP
                  <span className="ml-1.5 rounded bg-muted px-1 py-px text-[9px] font-black uppercase tracking-wide text-muted-foreground">
                    incluido
                  </span>
                </span>
                <span className="text-xs tabular-nums text-right font-bold text-muted-foreground whitespace-nowrap">
                  {formatCurrency(data.kpis.efectivo_usd)}
                  <span className="ml-1 text-[10px] font-bold text-muted-foreground">CUP</span>
                </span>
              </div>
              <SummaryRow
                label="Bancos"
                value={data.kpis.bancos}
                tooltip="Dinero en bancos y transferencias, incluido Zelle, a la fecha de corte (importe contable en CUP del motor)."
                testId="summary-row-bancos"
              />
              <SummaryRow
                label="Cuentas por cobrar"
                value={data.kpis.cuentas_por_cobrar}
                tooltip="Saldo contable de la cuenta ACT_CXC (ventas a crédito pendientes de cobro) a la fecha de corte."
                testId="summary-row-cxc"
              />
              <SummaryRow
                label="Cuentas por pagar"
                value={data.kpis.cuentas_por_pagar}
                tooltip="Saldo contable de PAS_CXP_PROV + PAS_SERV_PEND (proveedores y servicios pendientes de pago); no incluye nómina ni retenciones pendientes."
                testId="summary-row-cxp"
              />
              <SummaryRow
                label="Inventario"
                value={data.kpis.inventario_valor}
                tooltip="Valor del inventario a costo promedio (WAC) en vivo: Σ stock_current × cost_average del motor de valoración."
                testId="summary-row-inventario"
              />
            </div>
          </div>

          <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground">
            Los resultados corresponden al período filtrado; los saldos, a la fecha de corte
            (fecha final del período). No incluyen nómina pendiente ni retenciones pendientes como
            renglones propios: la tabla resume los rubros ejecutivos principales. Los importes en
            USD se presentan en su equivalente CUP registrado por el motor, sin conversiones propias.
          </p>
          {data.alertas.desequilibrio_balance && (
            <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed text-foreground">
                <span className="font-black uppercase tracking-wide text-destructive">
                  Desequilibrio del Estado de Situación: {formatCurrency(data.alertas.desequilibrio_monto)} CUP.
                </span>{' '}
                <span className="text-muted-foreground">
                  Los saldos del bloque B pueden no cuadrar con el total de activos hasta corregirlo.
                </span>
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
