'use client';

/**
 * COSTPRO-SALES-DASHBOARD-001 · Tarjetas KPI del resumen ejecutivo.
 * Variación % vs período anterior equivalente; «—» cuando no hay base
 * de comparación (misión §4: nunca inventar porcentajes).
 */
import React from 'react';
import { TrendingUp, TrendingDown, Minus, HelpCircle } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { percentChange } from '@/lib/sales-dashboard/periods';
import type { SalesDashboardResponse } from '@/lib/sales-dashboard/schema';

interface KpiCardProps {
  label: string;
  value: string;
  currency: 'CUP' | 'USD';
  current: number;
  previous: number;
  /** Formatea el valor previo distinto (p. ej. unidades sin moneda) */
  previousFormatter?: (n: number) => string;
  tooltip: string;
  tone?: 'primary' | 'success' | 'warning' | 'destructive';
}

function KpiCard({ label, value, currency, current, previous, previousFormatter, tooltip, tone = 'primary' }: KpiCardProps) {
  const change = percentChange(current, previous);
  const prevText = previousFormatter
    ? previousFormatter(previous)
    : formatCurrency(previous);

  return (
    <div
      className={cn(
        'relative p-3 sm:p-4 rounded-xl border bg-card shadow-sm',
        tone === 'primary' && 'border-primary/15 bg-primary/[0.03]',
        tone === 'success' && 'border-success/20 bg-success/[0.03]',
        tone === 'warning' && 'border-warning/20 bg-warning/[0.03]',
        tone === 'destructive' && 'border-destructive/20 bg-destructive/[0.03]',
      )}
      data-testid={`kpi-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span title={tooltip} className="text-muted-foreground/60 shrink-0 cursor-help" aria-label={tooltip}>
          <HelpCircle className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className="mt-1.5 text-lg sm:text-2xl font-black tabular-nums text-foreground leading-tight">
        {value}
        <span className="ml-1 text-[10px] sm:text-xs font-bold text-muted-foreground">{currency}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {change === null ? (
          <span className="text-[11px] font-bold text-muted-foreground">— sin comparación</span>
        ) : (
          <>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[11px] font-black px-1.5 py-0.5 rounded',
                change > 0 && 'text-success bg-success/10',
                change < 0 && 'text-destructive bg-destructive/10',
                change === 0 && 'text-muted-foreground bg-muted',
              )}
            >
              {change > 0 ? <TrendingUp className="w-3 h-3" /> : change < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {change > 0 ? '+' : ''}{change}%
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums" title="Período anterior equivalente">
              antes: {prevText} {currency}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function KpiCards({ kpi, currencyView }: { kpi: SalesDashboardResponse['kpi']; currencyView: 'CUP' | 'USD' }) {
  if (currencyView === 'USD') {
    // Vista USD: importes REALES cobrados/devueltos en USD — sin conversiones.
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-3" data-testid="kpi-grid-usd">
        <KpiCard
          label="Cobrado USD"
          value={formatCurrency(kpi.collected_usd)}
          currency="USD"
          current={kpi.collected_usd}
          previous={kpi.prev.collected_usd}
          tooltip="Suma de cobros registrados en USD (riel Zelle) sobre ventas válidas del período. Importes originales, sin conversión."
          tone="primary"
        />
        <KpiCard
          label="Devoluciones USD"
          value={formatCurrency(kpi.devolutions_usd)}
          currency="USD"
          current={kpi.devolutions_usd}
          previous={kpi.prev.devolutions_usd}
          tooltip="Notas de crédito emitidas en USD del período (devoluciones completadas)."
          tone="destructive"
        />
        <KpiCard
          label="Neto USD"
          value={formatCurrency(kpi.collected_usd - kpi.devolutions_usd)}
          currency="USD"
          current={kpi.collected_usd - kpi.devolutions_usd}
          previous={kpi.prev.collected_usd - kpi.prev.devolutions_usd}
          tooltip="Cobrado en USD menos devoluciones emitidas en USD del período."
          tone="success"
        />
        <KpiCard
          label="Ventas (docs)"
          value={String(kpi.ops)}
          currency="USD"
          current={kpi.ops}
          previous={kpi.prev.ops}
          previousFormatter={n => String(Math.round(n))}
          tooltip="Documentos de venta válidos (completados) del período con los filtros aplicados."
          tone="primary"
        />
        <KpiCard
          label="Ticket promedio USD"
          value={kpi.ops > 0 ? formatCurrency((kpi.collected_usd - kpi.devolutions_usd) / kpi.ops) : '—'}
          currency="USD"
          current={kpi.ops > 0 ? (kpi.collected_usd - kpi.devolutions_usd) / kpi.ops : 0}
          previous={kpi.prev.ops > 0 ? (kpi.prev.collected_usd - kpi.prev.devolutions_usd) / kpi.prev.ops : 0}
          tooltip="Neto USD ÷ documentos válidos del período."
          tone="primary"
        />
      </div>
    );
  }

  const netAfterDevolutions = kpi.net_cup - kpi.devolutions_cup;
  const prevNetAfterDevolutions = kpi.prev.net_cup - kpi.prev.devolutions_cup;
  const units = kpi.units_sold - kpi.units_returned;
  const prevUnits = kpi.units_sold - kpi.units_returned; // el RPC prev no trae unidades: comparación «—»
  void prevUnits;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-3" data-testid="kpi-grid-cup">
      <KpiCard
        label="Ventas netas"
        value={formatCurrency(netAfterDevolutions)}
        currency="CUP"
        current={netAfterDevolutions}
        previous={prevNetAfterDevolutions}
        tooltip="Suma de totales de documentos válidos menos devoluciones (NC) en CUP del período. El total del documento = subtotal − descuento + impuestos."
        tone="primary"
      />
      <KpiCard
        label="Ventas brutas"
        value={formatCurrency(kpi.gross_cup)}
        currency="CUP"
        current={kpi.gross_cup}
        previous={kpi.prev.gross_cup}
        tooltip="Suma de subtotales de documentos válidos: importes antes de descuentos e impuestos."
        tone="primary"
      />
      <KpiCard
        label="Descuentos"
        value={formatCurrency(kpi.discounts_cup)}
        currency="CUP"
        current={kpi.discounts_cup}
        previous={kpi.prev.discounts_cup}
        tooltip="Descuentos de cabecera aplicados por el servidor en ventas válidas del período."
        tone="warning"
      />
      <KpiCard
        label="Ventas (docs)"
        value={String(kpi.ops)}
        currency="CUP"
        current={kpi.ops}
        previous={kpi.prev.ops}
        previousFormatter={n => String(Math.round(n))}
        tooltip="Documentos de venta válidos (estado completado) del período. Anulados y revertidos no cuentan como ventas efectivas."
        tone="primary"
      />
      <KpiCard
        label="Ticket promedio"
        value={kpi.ops > 0 ? formatCurrency(kpi.net_cup / kpi.ops) : '—'}
        currency="CUP"
        current={kpi.ops > 0 ? kpi.net_cup / kpi.ops : 0}
        previous={kpi.prev.ops > 0 ? kpi.prev.net_cup / kpi.prev.ops : 0}
        tooltip="Ventas netas de documentos ÷ número de documentos válidos."
        tone="primary"
      />
      <KpiCard
        label="Unidades netas"
        value={String(Math.round((units + Number.EPSILON) * 10) / 10)}
        currency="CUP"
        current={units}
        previous={kpi.units_sold - kpi.units_returned}
        previousFormatter={n => String(Math.round((n + Number.EPSILON) * 10) / 10)}
        tooltip="Unidades vendidas menos unidades devueltas del período."
        tone="primary"
      />
      <KpiCard
        label="Devoluciones (NC)"
        value={formatCurrency(kpi.devolutions_cup)}
        currency="CUP"
        current={kpi.devolutions_cup}
        previous={kpi.prev.devolutions_cup}
        tooltip="Notas de crédito en CUP del período (devoluciones completadas). Las anuladas/revertidas no restan."
        tone="destructive"
      />
      <KpiCard
        label="Cobrado USD"
        value={formatCurrency(kpi.collected_usd)}
        currency="USD"
        current={kpi.collected_usd}
        previous={kpi.prev.collected_usd}
        tooltip="Cobros reales en USD (riel Zelle) del período. No se suma con CUP."
        tone="primary"
      />
      <KpiCard
        label="Cobrado (equiv. CUP)"
        value={formatCurrency(kpi.collected_cup_equiv)}
        currency="CUP"
        current={kpi.collected_cup_equiv}
        previous={kpi.collected_cup_equiv}
        previousFormatter={() => '—'}
        tooltip="Equivalente CUP de todos los cobros usando la tasa HISTÓRICA de cada cobro (columna amount_cup, verificable fila a fila). Referencia contable, no consolidación."
        tone="primary"
      />
    </div>
  );
}
