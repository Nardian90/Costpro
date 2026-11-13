'use client';

/**
 * CP-FIN · Vista B — Pestaña «Estado de Situación» (fecha de corte).
 *
 * Jerarquía ACTIVOS → PASIVOS → PATRIMONIO con subtotales por grupo y
 * totales destacados. La ecuación contable se VERIFICA (nunca se ajusta):
 * si no cuadra, se reporta la diferencia tal cual. Cada categoría es una
 * fila clicable que expande el drilldown documental (CategoryDetailPanel).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Landmark, RefreshCw, Scale } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchBalanceSheet } from './fin-api';
import { CategoryDetailPanel } from './CategoryDetailPanel';
import type { BalanceCategoryRow, BalanceSheetData } from './types';

/** El drilldown del balance cubre TODO el histórico hasta la fecha de corte. */
const HISTORICAL_FROM = '1900-01-01';

interface BalanceSheetTabProps {
  storeId: string;
  /** Fecha de corte aplicada (YYYY-MM-DD). */
  asOf: string;
  /** Contador del botón «Actualizar» de la vista padre. */
  refreshKey: number;
  /** Notifica a la vista padre los datos cargados (exportaciones). */
  onDataLoaded?: (data: BalanceSheetData | null) => void;
}

interface GroupBlock {
  cats: BalanceCategoryRow[];
  subtotal: number;
}

function groupBlock(cats: BalanceCategoryRow[]): GroupBlock {
  return { cats, subtotal: cats.reduce((acc, c) => acc + (c.saldo ?? 0), 0) };
}

function AmountCell({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        'tabular-nums text-right whitespace-nowrap',
        value < 0 ? 'text-destructive' : 'text-foreground',
        className,
      )}
    >
      {formatCurrency(value)}
    </span>
  );
}

export function BalanceSheetTab({ storeId, asOf, refreshKey, onDataLoaded }: BalanceSheetTabProps) {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Ref del callback del padre: evita re-fetchs si el padre re-renderiza.
  const onDataLoadedRef = useRef(onDataLoaded);
  useEffect(() => {
    onDataLoadedRef.current = onDataLoaded;
  }, [onDataLoaded]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchBalanceSheet(storeId, asOf, token);
      setData(d);
      onDataLoadedRef.current?.(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el Estado de Situación');
      setData(null);
      onDataLoadedRef.current?.(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, asOf, token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center bg-destructive/5 border border-destructive/20 rounded-2xl">
        <AlertTriangle className="w-10 h-10 text-destructive" />
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-destructive">
            No se pudo cargar el Estado de Situación
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

  const balanceCats = (data.categorias ?? []).filter((c) =>
    ['activo', 'pasivo', 'patrimonio'].includes(c.clase),
  );

  if (balanceCats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center bg-card border border-border rounded-2xl">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <Landmark className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="max-w-md space-y-1">
          <p className="text-sm font-black uppercase tracking-widest text-foreground">
            Sin movimientos a la fecha de corte
          </p>
          <p className="text-xs text-muted-foreground">
            El motor de partida doble no registra asientos para esta tienda hasta el {asOf}.
            Los estados se generan automáticamente al contabilizar documentos (ventas,
            recepciones, servicios, nóminas) o al registrar saldos iniciales de apertura.
          </p>
        </div>
      </div>
    );
  }

  const actCorr = groupBlock(balanceCats.filter((c) => c.clase === 'activo' && c.grupo === 'activo_corriente'));
  const actNoCorr = groupBlock(balanceCats.filter((c) => c.clase === 'activo' && c.grupo === 'activo_no_corriente'));
  const pasCorr = groupBlock(balanceCats.filter((c) => c.clase === 'pasivo' && c.grupo === 'pasivo_corriente'));
  const pasNoCorr = groupBlock(balanceCats.filter((c) => c.clase === 'pasivo' && c.grupo === 'pasivo_no_corriente'));
  const patrimonio = balanceCats.filter((c) => c.clase === 'patrimonio');

  const toggle = (code: string) => setExpanded((prev) => (prev === code ? null : code));

  const renderCategoryRow = (cat: BalanceCategoryRow) => {
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
            {cat.movimientos} asiento{cat.movimientos !== 1 ? 's' : ''}
          </span>
          <AmountCell value={cat.saldo} className="text-xs sm:text-sm font-bold w-[110px] sm:w-[140px]" />
        </button>
        {isOpen && (
          <div className="px-2 sm:px-3 pb-3">
            <CategoryDetailPanel
              storeId={storeId}
              categoryCode={cat.code}
              categoryName={cat.name}
              from={HISTORICAL_FROM}
              to={asOf}
            />
          </div>
        )}
      </div>
    );
  };

  const renderSubsection = (label: string, block: GroupBlock) => {
    if (block.cats.length === 0) return null;
    return (
      <div>
        <div className="flex items-center justify-between px-2 sm:px-3 py-2 bg-muted/40">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
          <AmountCell value={block.subtotal} className="text-xs font-bold" />
        </div>
        {block.cats.map(renderCategoryRow)}
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="balance-sheet-tab">
      {/* Completitud: información del motor, tal cual (sin ajustes automáticos) */}
      {data.completitud.sin_apertura && data.completitud.primer_documento && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-foreground">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            <span className="font-black uppercase tracking-wide">Estado incompleto:</span> no existen
            saldos iniciales (apertura). Configure los saldos iniciales en Configuración de
            Documentos antes del <span className="font-bold tabular-nums">{data.completitud.primer_documento}</span>.
          </p>
        </div>
      )}
      {data.completitud.apertura_tardia && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-foreground">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            <span className="font-black uppercase tracking-wide">Apertura tardía:</span> el primer
            movimiento es del{' '}
            <span className="font-bold tabular-nums">{data.completitud.primer_documento}</span> y la
            apertura del{' '}
            <span className="font-bold tabular-nums">{data.completitud.primera_apertura}</span>. Las
            cifras anteriores a la apertura no están representadas.
          </p>
        </div>
      )}

      {/* Ecuación contable verificada */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm" data-testid="balance-equation-card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <Scale className="w-4 h-4 text-primary" /> Ecuación contable
          </h3>
          {data.ecuacion.equilibrado ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-success/10 text-success text-[11px] font-black uppercase tracking-widest" data-testid="equation-ok-badge">
              Ecuación cuadrada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive text-[11px] font-black uppercase tracking-widest" data-testid="equation-diff-badge">
              Diferencia: {formatCurrency(data.ecuacion.diferencia)} CUP
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-primary/[0.04] border border-primary/15 p-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Activos</p>
            <p className="text-base sm:text-lg font-black tabular-nums text-foreground mt-0.5">
              {formatCurrency(data.ecuacion.activos)}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 border border-border p-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              = Pasivos + Patrimonio
            </p>
            <p className="text-base sm:text-lg font-black tabular-nums text-foreground mt-0.5">
              {formatCurrency(data.ecuacion.pasivos_mas_patrimonio)}
            </p>
          </div>
          <div
            className={cn(
              'rounded-lg border p-2.5',
              data.ecuacion.equilibrado
                ? 'bg-success/[0.04] border-success/20'
                : 'bg-destructive/[0.04] border-destructive/20',
            )}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Diferencia</p>
            <p
              className={cn(
                'text-base sm:text-lg font-black tabular-nums mt-0.5',
                data.ecuacion.equilibrado ? 'text-success' : 'text-destructive',
              )}
            >
              {formatCurrency(data.ecuacion.diferencia)}
            </p>
          </div>
        </div>
        {!data.ecuacion.equilibrado && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            El sistema reporta la diferencia tal cual: no genera asientos de ajuste automáticos.
            Revise los saldos iniciales y la configuración documental.
          </p>
        )}
      </div>

      {/* Estado propiamente */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-3 sm:px-4 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black uppercase tracking-widest">Estado de Situación Financiera</h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Al <span className="font-bold">{data.as_of}</span> · toca una categoría para ver sus movimientos
          </span>
        </div>

        {/* ACTIVOS */}
        <section aria-label="Activos">
          <div className="px-3 py-2.5 bg-primary/[0.06] border-y border-border">
            <h4 className="text-xs font-black uppercase tracking-widest text-primary">Activos</h4>
          </div>
          {renderSubsection('Activo corriente', actCorr)}
          {renderSubsection('Activo no corriente', actNoCorr)}
          <div className="flex items-center justify-between px-3 py-3 bg-primary/[0.04] border-t-2 border-primary/30">
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-foreground">
              Total activos
            </span>
            <span className="text-sm sm:text-base font-black tabular-nums text-foreground" data-testid="total-activos">
              {formatCurrency(data.total_activos)}
            </span>
          </div>
        </section>

        {/* PASIVOS */}
        <section aria-label="Pasivos" className="border-t-2 border-border">
          <div className="px-3 py-2.5 bg-muted/60">
            <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Pasivos</h4>
          </div>
          {renderSubsection('Pasivo corriente', pasCorr)}
          {renderSubsection('Pasivo no corriente', pasNoCorr)}
          <div className="flex items-center justify-between px-3 py-3 bg-muted/40 border-t-2 border-border">
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-foreground">
              Total pasivos
            </span>
            <span className="text-sm sm:text-base font-black tabular-nums text-foreground" data-testid="total-pasivos">
              {formatCurrency(data.total_pasivos)}
            </span>
          </div>
        </section>

        {/* PATRIMONIO */}
        <section aria-label="Patrimonio" className="border-t-2 border-border">
          <div className="px-3 py-2.5 bg-success/[0.06]">
            <h4 className="text-xs font-black uppercase tracking-widest text-success">Patrimonio</h4>
          </div>
          {patrimonio.map(renderCategoryRow)}
          {/* Resultado del período: ingresos − gastos acumulados a la corte (no es una categoría: sin drilldown) */}
          <div className="flex items-center gap-2 py-2.5 px-2 sm:px-3 border-t border-border/50">
            <span className="flex-1 pl-6 text-xs sm:text-sm font-medium text-foreground">
              Resultado del período (ingresos − gastos)
            </span>
            <AmountCell
              value={data.resultado_acumulado}
              className="text-xs sm:text-sm font-bold w-[110px] sm:w-[140px]"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-3 bg-success/[0.04] border-t-2 border-success/30">
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-foreground">
              Patrimonio total
            </span>
            <span className="text-sm sm:text-base font-black tabular-nums text-foreground" data-testid="patrimonio-total">
              {formatCurrency(data.patrimonio_total)}
            </span>
          </div>
        </section>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Importes en CUP (moneda contable del motor). Cifras generadas automáticamente por el motor
        de partida doble — el sistema no registra ajustes manuales.
      </p>
    </div>
  );
}
