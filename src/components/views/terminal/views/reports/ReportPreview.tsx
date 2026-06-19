
'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { ReportDefinition, ReportType } from '@/types';
import { format } from 'date-fns';
import { COLUMN_LABELS } from '@/contracts/reports';
import { useAuthStore } from '@/store';
// Audit-Fix #2: removed useTheme + isDarkTheme — paper is always white.
import { CostProLoader } from '@/components/ui/CostProLoader';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import { APP_VERSION_SHORT } from '@/config/app';

/** Columns that represent monetary values for formatting */
const MONETARY_COLS = ['amount', 'price', 'cost', 'profit', 'income', 'expenses'];

/** Columns used to calculate subtotal (before discounts) */
const SUBTOTAL_KEYS = ['subtotal', 'total_amount', 'total_income', 'total_expenses', 'total_cost'];

/** Columns used to calculate total final (after discounts) */
const TOTAL_KEYS = ['total_amount', 'total_income', 'total_expenses', 'total_cost'];

/** Column that represents discount value */
const DISCOUNT_KEY = 'discount_value';

interface ReportPreviewProps {
  config: Partial<ReportDefinition>;
}

/** Report types that benefit from a chart preview (4.6) */
const CHARTABLE_TYPES = ['sales', 'profit', 'daily_income', 'daily_expenses'];

export const ReportPreview = ({ config }: ReportPreviewProps) => {
  const { user } = useAuthStore();
  // Audit-Fix #2: removed useTheme — paper is always white regardless of app theme.

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{ label: string; value: number }[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPreviewData = useCallback(async (cfg: Partial<ReportDefinition>, storeId: string, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const { reportService } = await import('@/services/report-service');
      const previewData = await reportService.fetchReportData(
        cfg.type as ReportType,
        cfg.filters,
        cfg.date_range,
        storeId,
        5
      );
      if (!signal?.aborted) {
        setData(previewData);
        // 4.6: Fetch chart data for chartable types
        if (CHARTABLE_TYPES.includes(cfg.type as string)) {
          try {
            const { reportService } = await import('@/services/report-service');
            const chart = await reportService.fetchChartData(
              cfg.type as ReportType,
              storeId,
              cfg.date_range,
            );
            if (!signal?.aborted) setChartData(chart);
          } catch { /* chart data is best-effort */ }
        } else {
          if (!signal?.aborted) setChartData([]);
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!signal?.aborted) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        setError(msg);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  /** Maximum value for chart scaling */
  const chartMax = chartData.length > 0 ? Math.max(...chartData.map(d => d.value), 1) : 1;

  /** Chart color based on report type — all semantic tokens */
  const chartColor = useMemo(() => {
    switch (config.type) {
      case 'sales': case 'daily_income': return 'bg-primary';
      case 'profit': return 'bg-success';
      case 'daily_expenses': return 'bg-destructive';
      default: return 'bg-primary';
    }
  }, [config.type]);

  useEffect(() => {
    if (!config.type || !user?.activeStoreId) return;

    // Cancel any in-flight request
    if (abortRef.current && !abortRef.current.signal.aborted) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchPreviewData(config, user.activeStoreId, controller.signal);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      controller.abort();
    };
  }, [config.type, config.filters, config.date_range, user?.activeStoreId, fetchPreviewData]);

  const orientation = config.layout?.orientation || 'portrait';

  /** Calculate subtotal: sum of subtotals before discounts */
  const subtotal = data.reduce((acc, row) => {
    const val = SUBTOTAL_KEYS.find(k => row[k] != null);
    return acc + Number(row[val!] || 0);
  }, 0);

  /** Calculate total discounts */
  const totalDiscounts = data.reduce((acc, row) => {
    return acc + Number(row[DISCOUNT_KEY] || 0);
  }, 0);

  /** Calculate final total: sum of totals (post-discount amounts) */
  const finalTotal = data.reduce((acc, row) => {
    const val = TOTAL_KEYS.find(k => row[k] != null);
    return acc + Number(row[val!] || 0);
  }, 0);

  /** Determine if this report type has discount data */
  const hasDiscounts = data.some(row => Number(row[DISCOUNT_KEY]) > 0);

  // FIX UX-R06 + Audit-Fix #2: Paper mockup SIEMPRE blanco con texto negro.
  // Antes era theme-aware (dark en dark mode) — pero un reporte es un documento
  // físico que se imprime en papel blanco. Mostrarlo dark confunde al usuario
  // sobre cómo se verá al imprimir. Ahora siempre blanco/negro sin importar
  // el tema de la app. Patrón consistente con Google Docs, Notion, etc.
  const paperBg = 'bg-white text-black';
  const headerBorder = 'border-gray-300';
  const logoBg = 'bg-gray-100';
  const tableHeaderBorder = 'border-gray-400';
  const tableRowBorder = 'border-gray-200';
  const skeletonBar = 'bg-gray-200';
  const footerText = 'text-gray-600';
  const titleText = 'text-black';
  const mutedText = 'text-gray-500';

  return (
    <div className="space-y-4" role="region" aria-label="Vista previa del reporte">
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60 px-2">Vista Previa (Borrador)</h3>

      {/* Mobile: min-h fluid, sm+: fixed aspect ratio paper mockup */}
      <Card className={`
        ${paperBg} shadow-2xl mx-auto overflow-hidden transition-all duration-500
        min-h-[500px]
        ${orientation === 'portrait'
          ? 'sm:aspect-[1/1.414] w-full max-w-[600px]'
          : 'sm:aspect-[1.414/1] w-full'}
      `}>
        <div className="p-4 sm:p-8 lg:p-12 h-full flex flex-col">
          {/* Header */}
          <div className={`border-b-2 ${headerBorder} pb-4 sm:pb-8 flex flex-col sm:flex-row justify-between items-start gap-3`}>
            <div className="min-w-0">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 ${logoBg} rounded-lg mb-3 sm:mb-4`} />
              <h2 className={`text-lg sm:text-2xl font-black ${titleText} uppercase tracking-tighter truncate`}>{config.name || 'SIN NOMBRE'}</h2>
              <p className={`text-[10px] sm:text-xs font-bold ${mutedText} uppercase tracking-widest mt-1`}>
                CostPro Enterprise Reporting v{APP_VERSION_SHORT}
              </p>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <p className={`text-[10px] sm:text-xs font-black ${mutedText} uppercase tracking-widest`}>Tipo de Documento</p>
              <p className={`text-[10px] sm:text-xs font-black ${titleText} uppercase tracking-widest`}>{config.type?.toUpperCase()}</p>
              <div className="mt-2 sm:mt-4">
                <p className={`text-[10px] sm:text-xs font-black ${mutedText} uppercase tracking-widest`}>Periodo</p>
                <p className={`text-[10px] sm:text-xs font-bold ${mutedText} tabular-nums`}>
                  {config.date_range?.from || '---'} — {config.date_range?.to || '---'}
                </p>
              </div>
            </div>
          </div>

          {/* Table Preview */}
          <div className="mt-6 sm:mt-12 flex-1 overflow-hidden relative">
             {isLoading && (
               <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl">
                 <CostProLoader size={120} text="PREVISTA" subtext="Generando borrador..." />
               </div>
             )}

             {error && !isLoading && (
               <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 flex gap-3 items-start animate-in fade-in slide-in-from-top-2 duration-300">
                 <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                 <div className="space-y-1">
                   <p className="text-xs font-black uppercase text-destructive tracking-widest">Error en vista previa</p>
                   <p className="text-xs font-medium text-destructive/80 leading-relaxed">{error}</p>
                   <p className="text-[10px] font-medium text-destructive/60">Verifique los filtros o intente nuevamente.</p>
                 </div>
               </div>
             )}

             <div className="w-full">
                <div className={`flex gap-4 border-b-2 ${tableHeaderBorder} pb-4 mb-4 overflow-x-auto`}>
                    {(config.columns || []).map(col => (
                        <div key={col} className={`flex-1 min-w-[60px] text-xs font-black ${titleText} uppercase tracking-widest truncate`}>
                            {COLUMN_LABELS[col] || col}
                        </div>
                    ))}
                </div>

                {data.length > 0 ? (
                  data.map((row, i) => (
                    <div key={i} className={`flex gap-4 py-3 border-b ${tableRowBorder} animate-in fade-in slide-in-from-top-1 duration-300`} style={{ animationDelay: `${i * 50}ms` }}>
                        {(config.columns || []).map(col => {
                            const val = row[col];
                            let displayVal = val?.toString() || '-';
                            if (MONETARY_COLS.some(mc => col.includes(mc))) {
                              displayVal = typeof val === 'number' ? `$ ${val.toLocaleString('es-CU', { minimumFractionDigits: 2 })}` : val as string;
                            }
                            if (col === 'created_at' || col === 'date') {
                                try {
                                    const dateObj = typeof val === 'string' && val.length === 10 ? new Date(val + 'T00:00:00') : new Date(val as string);
                                    displayVal = format(dateObj, 'dd/MM/yyyy');
                                } catch { /* keep raw value */ }
                            }
                            return (
                                <div key={col} className={`flex-1 text-xs font-bold ${mutedText} truncate min-w-[60px] tabular-nums`}>
                                    {displayVal}
                                </div>
                            );
                        })}
                    </div>
                  ))
                ) : (
                  [1, 2, 3, 4, 5].map(i => (
                    <div key={i} className={`flex gap-4 py-3 border-b ${tableRowBorder} opacity-40`}>
                        {(config.columns || []).map(col => (
                            <div key={col} className={`flex-1 h-2 ${skeletonBar} rounded min-w-[60px]`} />
                        ))}
                    </div>
                  ))
                )}
             </div>

             {data.length > 0 && SUBTOTAL_KEYS.some(k => data[0][k] != null) && (
             <div className="mt-8 flex justify-end">
                <div className="w-56 space-y-2">
                    {hasDiscounts && (
                      <div className="flex justify-between text-xs font-bold text-destructive uppercase tabular-nums">
                        <span>Descuentos</span>
                        <span>- $ {totalDiscounts.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className={`flex justify-between text-xs font-bold ${mutedText} uppercase tabular-nums`}>
                        <span>Subtotal</span>
                        <span>$ {subtotal.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className={`flex justify-between text-xs font-black ${titleText} uppercase pt-2 border-t ${tableRowBorder} tabular-nums`}>
                        <span>Total Final</span>
                        <span>$ {finalTotal.toLocaleString('es-CU', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {data.length > 0 && (
                      <p className={`text-[10px] font-medium ${mutedText} italic pt-1 opacity-70`}>
                        {data.length} de {data.length} registro{data.length > 1 ? 's' : ''} mostrado{data.length > 1 ? 's' : ''}
                      </p>
                    )}
                </div>
             </div>
             )}
             {/* 4.6: Mini chart for chartable types */}
             {chartData.length > 0 && (
               <div className={`mt-8 pt-6 border-t ${tableRowBorder}`}>
                 <div className="flex items-center gap-2 mb-4">
                   <BarChart3 className={`w-4 h-4 ${mutedText}`} aria-hidden="true" />
                   <p className={`text-[10px] font-black ${mutedText} uppercase tracking-[0.2em]`}>
                     Tendencia por Fecha
                   </p>
                 </div>
                 <div
                   className="flex items-end gap-1 h-24"
                   role="img"
                   aria-label={`Gráfico de barras con ${chartData.length} datos`}
                 >
                   {chartData.slice(-14).map((d, i) => (
                     <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                       <div
                         className={`w-full rounded-t-sm ${chartColor} transition-all duration-500`}
                         style={{
                           height: `${Math.max((d.value / chartMax) * 80, 3)}px`,
                           opacity: 0.5 + (i / chartData.length) * 0.5,
                         }}
                         title={`${d.label}: $ ${d.value.toLocaleString('es-CU', { minimumFractionDigits: 2 })}`}
                       />
                       <span className={`text-[7px] font-bold ${mutedText} truncate w-full text-center opacity-70`}
                         title={d.label}
                       >
                         {d.label.slice(5)}
                       </span>
                     </div>
                   ))}
                 </div>
               </div>
             )}
          </div>

          {/* Footer */}
          <div className={`mt-6 sm:mt-12 pt-4 sm:pt-8 border-t ${tableRowBorder} flex flex-col sm:flex-row justify-between items-end gap-2`}>
             <div className="space-y-1">
                <p className={`text-xs font-bold ${footerText} uppercase tracking-[0.2em]`}>Generado por CostPro Terminal</p>
                <p className={`text-xs font-medium ${mutedText} italic opacity-80`}>Documento de caracter informativo y contable.</p>
             </div>
             <p className={`text-xs font-black ${footerText} uppercase tracking-widest`}>Pagina 1 de 1</p>
          </div>
        </div>
      </Card>

      <p className="text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
        * Mostrando los primeros 5 registros encontrados.
      </p>
    </div>
  );
};
