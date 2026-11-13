'use client';

/**
 * CP-FIN · Vista B — Pestaña «Estado de Rendimiento» (período desde/hasta).
 *
 * Estructura seccional clásica: ingresos → ajustes → netos → costo de ventas →
 * utilidad bruta → gastos operacionales → resultado operativo → no
 * operacionales → RESULTADO NETO. La convención de signos (costos/gastos y
 * ajustes llegan negativos del motor) y el cálculo de los totales derivados
 * están centralizados en computeIncomePresentation (types.ts) — pantalla,
 * PDF y Excel usan la MISMA fuente.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchIncomeStatement } from './fin-api';
import { CategoryDetailPanel } from './CategoryDetailPanel';
import { computeIncomePresentation, type IncomeCategoryRow, type IncomeStatementData } from './types';

interface IncomeStatementTabProps {
  storeId: string;
  from: string;
  to: string;
  refreshKey: number;
  onDataLoaded?: (data: IncomeStatementData | null) => void;
}

function AmountCell({ value, strong, className }: { value: number; strong?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'tabular-nums text-right whitespace-nowrap',
        value < 0 ? 'text-destructive' : 'text-foreground',
        strong && 'font-bold',
        className,
      )}
    >
      {formatCurrency(value)}
    </span>
  );
}

export function IncomeStatementTab({ storeId, from, to, refreshKey, onDataLoaded }: IncomeStatementTabProps) {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<IncomeStatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const onDataLoadedRef = useRef(onDataLoaded);
  useEffect(() => {
    onDataLoadedRef.current = onDataLoaded;
  }, [onDataLoaded]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchIncomeStatement(storeId, from, to, token);
      setData(d);
      onDataLoadedRef.current?.(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el Estado de Rendimiento');
      setData(null);
      onDataLoadedRef.current?.(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, from, to, token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center bg-destructive/5 border border-destructive/20 rounded-2xl">
        <AlertTriangle className="w-10 h-10 text-destructive" />
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-destructive">
            No se pudo cargar el Estado de Rendimiento
          </p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest min-h-[44px]"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const cats = data.categorias ?? [];
  if (cats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center bg-card border border-border rounded-2xl">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="max-w-md space-y-1">
          <p className="text-sm font-black uppercase tracking-widest text-foreground">
            Sin movimientos en el período
          </p>
          <p className="text-xs text-muted-foreground">
            El motor de partida doble no registra ingresos ni gastos entre {from} y {to} para esta
            tienda. El estado se genera automáticamente al contabilizar documentos.
          </p>
        </div>
      </div>
    );
  }

  const p = computeIncomePresentation(data);
  const byGroup = (grupo: string): IncomeCategoryRow[] => cats.filter((c) => c.grupo === grupo);

  const toggle = (code: string) => setExpanded((prev) => (prev === code ? null : code));

  const renderCategoryRow = (cat: IncomeCategoryRow) => {
    const isOpen = expanded === cat.code;
    return (
      <div key={cat.code} className="border-b border-border/50 last:border-b-0">
        <button
          type="button"
          onClick={() => toggle(cat.code)}
          aria-expanded={isOpen}
          className="w-full flex items-center gap-2 py-2.5 px-2 sm:px-3 text-left hover:bg-primary/5 transition-colors min-h-[44px]"
        >
          <ChevronDown
            className={cn(
              'w-4 h-4 shrink-0 text-muted-foreground transition-transform',
              isOpen && 'rotate-180',
            )}
          />
          <span className="flex-1 text-xs sm:text-sm font-medium text-foreground truncate">
            {cat.name}
          </span>
          <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            {cat.documentos} documento{cat.documentos !== 1 ? 's' : ''}
          </span>
          <AmountCell value={cat.saldo} strong className="w-[110px] sm:w-[140px]" />
        </button>
        {isOpen && (
          <div className="px-2 sm:px-3 pb-3">
            <CategoryDetailPanel
              storeId={storeId}
              categoryCode={cat.code}
              categoryName={cat.name}
              from={from}
              to={to}
            />
          </div>
        )}
      </div>
    );
  };

  const renderGroup = (label: string, grupo: string) => {
    const rows = byGroup(grupo);
    if (rows.length === 0) return null;
    const subtotal = rows.reduce((acc, c) => acc + (c.saldo ?? 0), 0);
    return (
      <div>
        <div className="flex items-center justify-between px-2 sm:px-3 py-2 bg-muted/40">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
          <AmountCell value={subtotal} strong className="text-xs" />
        </div>
        {rows.map(renderCategoryRow)}
      </div>
    );
  };

  const ingresosOp = byGroup('ingreso_operacional');
  const ajustes = byGroup('ajuste_ingreso');
  const costos = byGroup('costo_venta');
  const gastosOp = byGroup('gasto_operacional');
  const ingNoOp = byGroup('ingreso_no_operacional');
  const gasNoOp = byGroup('gasto_no_operacional');
  const hasNoOp = ingNoOp.length > 0 || gasNoOp.length > 0;

  return (
    <div className="space-y-4" data-testid="income-statement-tab">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-3 sm:px-4 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black uppercase tracking-widest">Estado de Rendimiento</h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Período <span className="font-bold">{from}</span> — <span className="font-bold">{to}</span> · toca
            una categoría para ver sus documentos
          </span>
        </div>

        {/* INGRESOS OPERACIONALES */}
        <section aria-label="Ingresos operacionales">
          <div className="px-3 py-2.5 bg-success/[0.06] border-y border-border">
            <h4 className="text-xs font-black uppercase tracking-widest text-success">
              Ingresos operacionales
            </h4>
          </div>
          {ingresosOp.length > 0 ? (
            ingresosOp.map(renderCategoryRow)
          ) : (
            <p className="px-3 py-3 text-xs text-muted-foreground">Sin ingresos operacionales en el período.</p>
          )}
        </section>

        {/* AJUSTES A LOS INGRESOS */}
        <section aria-label="Ajustes a los ingresos" className="border-t border-border">
          <div className="px-3 py-2.5 bg-warning/[0.05]">
            <h4 className="text-xs font-black uppercase tracking-widest text-warning">
              (−) Devoluciones y ajustes
            </h4>
          </div>
          {ajustes.length > 0 ? (
            ajustes.map(renderCategoryRow)
          ) : (
            <p className="px-3 py-3 text-xs text-muted-foreground">Sin devoluciones ni ajustes en el período.</p>
          )}
          <div className="flex items-center justify-between px-3 py-3 bg-muted/40 border-t-2 border-border">
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-foreground">
              Total ingresos netos
            </span>
            <span className="text-sm sm:text-base font-black tabular-nums text-foreground" data-testid="ingresos-netos">
              {formatCurrency(p.ingresosNetos)}
            </span>
          </div>
        </section>

        {/* COSTO DE VENTAS */}
        <section aria-label="Costo de ventas" className="border-t-2 border-border">
          <div className="px-3 py-2.5 bg-muted/60">
            <h4 className="text-xs font-black uppercase tracking-widest text-foreground">
              (−) Costo de ventas
            </h4>
          </div>
          {costos.length > 0 ? (
            costos.map(renderCategoryRow)
          ) : (
            <p className="px-3 py-3 text-xs text-muted-foreground">Sin costo de ventas en el período.</p>
          )}
          <div className="flex items-center justify-between px-3 py-3 bg-primary/[0.04] border-t-2 border-primary/30">
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-foreground">
              Utilidad bruta
            </span>
            <span
              className={cn(
                'text-sm sm:text-base font-black tabular-nums',
                p.utilidadBruta < 0 ? 'text-destructive' : 'text-foreground',
              )}
              data-testid="utilidad-bruta"
            >
              {formatCurrency(p.utilidadBruta)}
            </span>
          </div>
        </section>

        {/* GASTOS OPERACIONALES */}
        <section aria-label="Gastos operacionales" className="border-t-2 border-border">
          <div className="px-3 py-2.5 bg-destructive/[0.05]">
            <h4 className="text-xs font-black uppercase tracking-widest text-destructive">
              Gastos operacionales
            </h4>
          </div>
          {gastosOp.length > 0 ? (
            gastosOp.map(renderCategoryRow)
          ) : (
            <p className="px-3 py-3 text-xs text-muted-foreground">Sin gastos operacionales en el período.</p>
          )}
          <div className="flex items-center justify-between px-3 py-2.5 bg-muted/40 border-t border-border">
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-muted-foreground">
              Total gastos
            </span>
            <AmountCell value={p.gastosOperacionales} strong className="text-xs sm:text-sm" />
          </div>
          <div className="flex items-center justify-between px-3 py-3 bg-primary/[0.04] border-t-2 border-primary/30">
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-foreground">
              Resultado operativo
            </span>
            <span
              className={cn(
                'text-sm sm:text-base font-black tabular-nums',
                p.resultadoOperativo < 0 ? 'text-destructive' : 'text-foreground',
              )}
              data-testid="resultado-operativo"
            >
              {formatCurrency(p.resultadoOperativo)}
            </span>
          </div>
        </section>

        {/* NO OPERACIONALES */}
        {hasNoOp && (
          <section aria-label="No operacionales" className="border-t-2 border-border">
            <div className="px-3 py-2.5 bg-muted/60">
              <h4 className="text-xs font-black uppercase tracking-widest text-foreground">
                No operacionales
              </h4>
            </div>
            {ingNoOp.map(renderCategoryRow)}
            {gasNoOp.map(renderCategoryRow)}
          </section>
        )}

        {/* RESULTADO NETO */}
        <section
          aria-label="Resultado neto del período"
          className={cn(
            'border-t-2 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2',
            p.resultadoNeto < 0 ? 'bg-destructive/[0.06] border-destructive/40' : 'bg-success/[0.06] border-success/40',
          )}
        >
          <div className="flex items-center gap-2">
            {p.resultadoNeto < 0 ? (
              <TrendingDown className="w-5 h-5 text-destructive" />
            ) : (
              <TrendingUp className="w-5 h-5 text-success" />
            )}
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-foreground">
              Resultado neto del período
            </span>
          </div>
          <span
            className={cn(
              'text-xl sm:text-2xl font-black tabular-nums',
              p.resultadoNeto < 0 ? 'text-destructive' : 'text-success',
            )}
            data-testid="resultado-neto"
          >
            {formatCurrency(p.resultadoNeto)}
          </span>
        </section>
      </div>

      {p.resultadoNeto < 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3">
          <TrendingDown className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            <span className="font-black uppercase tracking-wide">El período cerró con pérdida.</span>{' '}
            Los gastos (incluido el costo de ventas) superan a los ingresos netos del período
            seleccionado.
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Importes en CUP (moneda contable del motor). Los rubros de costo, gastos y ajustes se
        muestran con signo negativo: reducen el resultado.
      </p>
    </div>
  );
}
