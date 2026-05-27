
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { ReportDefinition, ReportType } from '@/types';
import { format } from 'date-fns';
import { COLUMN_LABELS } from '@/contracts/reports';
import { useAuthStore } from '@/store';
import { CostProLoader } from '@/components/ui/CostProLoader';
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

export const ReportPreview = ({ config }: ReportPreviewProps) => {
  const { user } = useAuthStore();
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPreviewData = useCallback(async (cfg: Partial<ReportDefinition>, storeId: string) => {
    setIsLoading(true);
    try {
      const { reportService } = await import('@/services/report-service');
      const previewData = await reportService.fetchReportData(
        cfg.type as ReportType,
        cfg.filters,
        cfg.date_range,
        storeId,
        5
      );
      setData(previewData);
    } catch (error) {
      console.error('Error fetching preview data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!config.type || !user?.activeStoreId) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchPreviewData(config, user.activeStoreId);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
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

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60 px-2">Vista Previa (Borrador)</h3>

      <Card className={`
        bg-background text-slate-900 shadow-2xl mx-auto overflow-hidden transition-all duration-500
        ${orientation === 'portrait' ? 'aspect-[1/1.414] w-full max-w-[600px]' : 'aspect-[1.414/1] w-full'}
      `}>
        <div className="p-12 h-full flex flex-col">
          {/* Header */}
          <div className="border-b-2 border-slate-100 pb-8 flex justify-between items-start">
            <div>
              <div className="w-12 h-12 bg-slate-200 rounded-lg mb-4" />
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">{config.name || 'SIN NOMBRE'}</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                CostPro Enterprise Reporting v{APP_VERSION_SHORT}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Tipo de Documento</p>
              <p className="text-xs font-black text-slate-800 uppercase tracking-widest">{config.type?.toUpperCase()}</p>
              <div className="mt-4">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Periodo</p>
                <p className="text-xs font-bold text-slate-600">
                  {config.date_range?.from || '---'} — {config.date_range?.to || '---'}
                </p>
              </div>
            </div>
          </div>

          {/* Table Preview */}
          <div className="mt-12 flex-1 overflow-hidden relative">
             {isLoading && (
               <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl">
                 <CostProLoader size={120} text="PREVISTA" subtext="Generando borrador..." />
               </div>
             )}

             <div className="w-full">
                <div className="flex gap-4 border-b-2 border-slate-800 pb-4 mb-4">
                    {(config.columns || []).map(col => (
                        <div key={col} className="flex-1 min-w-[60px] text-xs font-black text-slate-800 uppercase tracking-widest truncate">
                            {COLUMN_LABELS[col] || col}
                        </div>
                    ))}
                </div>

                {data.length > 0 ? (
                  data.map((row, i) => (
                    <div key={i} className="flex gap-4 py-3 border-b border-slate-100 animate-in fade-in slide-in-from-top-1 duration-300" style={{ animationDelay: `${i * 50}ms` }}>
                        {(config.columns || []).map(col => {
                            const val = row[col];
                            let displayVal = val?.toString() || '-';
                            if (MONETARY_COLS.some(mc => col.includes(mc))) {
                                displayVal = typeof val === 'number' ? `$ ${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })}` : val as string;
                            }
                            if (col === 'created_at' || col === 'date') {
                                try {
                                    const dateObj = typeof val === 'string' && val.length === 10 ? new Date(val + 'T00:00:00') : new Date(val as string);
                                    displayVal = format(dateObj, 'dd/MM/yyyy');
                                } catch(e) { /* keep raw value */ }
                            }
                            return (
                                <div key={col} className="flex-1 text-xs font-bold text-slate-600 truncate min-w-[60px]">
                                    {displayVal}
                                </div>
                            );
                        })}
                    </div>
                  ))
                ) : (
                  [1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex gap-4 py-3 border-b border-slate-50 opacity-40">
                        {(config.columns || []).map(col => (
                            <div key={col} className="flex-1 h-2 bg-slate-100 rounded min-w-[60px]" />
                        ))}
                    </div>
                  ))
                )}
             </div>

             {data.length > 0 && SUBTOTAL_KEYS.some(k => data[0][k] != null) && (
             <div className="mt-8 flex justify-end">
                <div className="w-56 space-y-2">
                    {hasDiscounts && (
                      <div className="flex justify-between text-xs font-bold text-destructive uppercase">
                        <span>Descuentos</span>
                        <span>- $ {totalDiscounts.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-bold text-slate-400 uppercase">
                        <span>Subtotal</span>
                        <span>$ {subtotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-xs font-black text-slate-800 uppercase pt-2 border-t border-slate-100">
                        <span>Total Final</span>
                        <span>$ {finalTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {data.length > 0 && (
                      <p className="text-[10px] font-medium text-slate-300 italic pt-1">
                        {data.length} de {data.length} registro{data.length > 1 ? 's' : ''} mostrado{data.length > 1 ? 's' : ''}
                      </p>
                    )}
                </div>
             </div>
             )}
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-end">
             <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Generado por CostPro Terminal</p>
                <p className="text-xs font-medium text-slate-300 italic">Documento de caracter informativo y contable.</p>
             </div>
             <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Pagina 1 de 1</p>
          </div>
        </div>
      </Card>

      <p className="text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
        * Mostrando los primeros 5 registros encontrados.
      </p>
    </div>
  );
};
