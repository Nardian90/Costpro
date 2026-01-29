
'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { ReportDefinition } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { COLUMN_LABELS } from '@/contracts/reports';

interface ReportPreviewProps {
  config: Partial<ReportDefinition>;
}

export const ReportPreview = ({ config }: ReportPreviewProps) => {
  const orientation = config.layout?.orientation || 'portrait';

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60 px-2">Vista Previa (Borrador)</h3>

      <Card className={`
        bg-white text-slate-900 shadow-2xl mx-auto overflow-hidden transition-all duration-500
        ${orientation === 'portrait' ? 'aspect-[1/1.414] w-full max-w-[600px]' : 'aspect-[1.414/1] w-full'}
      `}>
        <div className="p-12 h-full flex flex-col">
          {/* Header */}
          <div className="border-b-2 border-slate-100 pb-8 flex justify-between items-start">
            <div>
              <div className="w-12 h-12 bg-slate-200 rounded-lg mb-4" />
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">{config.name || 'SIN NOMBRE'}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                CostPro Enterprise Reporting v5.7
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Documento</p>
              <p className="text-xs font-black text-slate-800 uppercase tracking-widest">{config.type?.toUpperCase()}</p>
              <div className="mt-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Periodo</p>
                <p className="text-[10px] font-bold text-slate-600">
                  {config.date_range?.from} — {config.date_range?.to}
                </p>
              </div>
            </div>
          </div>

          {/* Table Placeholder */}
          <div className="mt-12 flex-1 overflow-hidden">
             <div className="w-full">
                <div className="flex gap-4 border-b border-slate-200 pb-4 mb-4">
                    {(config.columns || []).map(col => (
                        <div key={col} className="flex-1 min-w-[60px] text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">
                            {COLUMN_LABELS[col] || col}
                        </div>
                    ))}
                </div>
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex gap-4 py-3 border-b border-slate-50 opacity-40">
                        {(config.columns || []).map(col => (
                            <div key={col} className="flex-1 h-2 bg-slate-100 rounded min-w-[60px]" />
                        ))}
                    </div>
                ))}
             </div>

             <div className="mt-8 flex justify-end">
                <div className="w-48 space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span>Subtotal</span>
                        <span>$ 0.00</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-black text-slate-800 uppercase pt-2 border-t border-slate-100">
                        <span>Total Final</span>
                        <span>$ 0.00</span>
                    </div>
                </div>
             </div>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-end">
             <div className="space-y-1">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em]">Generado por CostPro Terminal</p>
                <p className="text-[8px] font-medium text-slate-300 italic">Documento de carácter informativo y contable.</p>
             </div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Página 1 de 1</p>
          </div>
        </div>
      </Card>

      <p className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
        * Los datos mostrados en la vista previa son ficticios para propósitos de diseño.
      </p>
    </div>
  );
};
