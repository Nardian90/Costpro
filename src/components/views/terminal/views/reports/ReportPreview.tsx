
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
        bg-white text-slate-900 shadow-2xl mx-auto overflow-hidden transition-all duration-500 relative
        ${orientation === 'portrait' ? 'aspect-[1/1.414] w-full max-w-[600px]' : 'aspect-[1.414/1] w-full'}
      `}>
        {/* Draft Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-[0.03] select-none">
            <span className="text-[200px] font-black uppercase tracking-[0.2em] -rotate-45">BORRADOR</span>
        </div>

        <div className="p-12 h-full flex flex-col relative z-10">
          {/* Header */}
          <div className="flex justify-between items-start mb-12">
            <div className="w-16 h-16 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center">
               <span className="text-[10px] font-black text-slate-300">LOGO</span>
            </div>
            <div className="text-right">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">TIENDA CENTRAL COSTPRO</h3>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Sistema de Gestión POS</p>
              <p className="text-[8px] font-medium text-slate-400 mt-1 italic">Generado: {format(new Date(), "yyyy-MM-dd HH:mm")}</p>
            </div>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{config.name || 'SIN NOMBRE'}</h2>
            <div className="flex items-center justify-center gap-3 mt-2">
                <span className="h-[1px] w-8 bg-slate-200" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                    {config.type?.toUpperCase()} — {config.date_range?.from} / {config.date_range?.to}
                </p>
                <span className="h-[1px] w-8 bg-slate-200" />
            </div>
          </div>

          {/* Table Placeholder */}
          <div className="mt-4 flex-1 overflow-hidden">
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

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-20 px-10 mb-10">
              <div className="text-center">
                  <div className="border-t border-slate-200 pt-2">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Elaborado Por</p>
                  </div>
              </div>
              <div className="text-center">
                  <div className="border-t border-slate-200 pt-2">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Revisado / Autorizado</p>
                  </div>
              </div>
          </div>

          {/* Footer */}
          <div className="pt-6 border-t border-slate-100 flex justify-between items-end">
             <div className="space-y-1">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em]">Generado por CostPro Terminal</p>
                <p className="text-[8px] font-medium text-slate-300 italic">Documento oficial generado por CostPro Enterprise Reporting v5.7</p>
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
