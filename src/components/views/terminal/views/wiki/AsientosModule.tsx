'use client';

import React, { useMemo } from 'react';
import { Hash, Info, List, ArrowRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Asiento,
  AsientosData,
  WikiModule,
  AsientoLinea
} from './types';

interface AsientosModuleProps {
  data: AsientosData;
  selectedId: string | null;
  onNavigate: (module: WikiModule, id: string | null) => void;
}

export const AsientosModule: React.FC<AsientosModuleProps> = ({ data, selectedId, onNavigate }) => {
  const asientos = useMemo(() => Object.values(data.asientos), [data.asientos]);

  const selectedAsiento = useMemo(() => {
    if (!selectedId) return null;
    return data.asientos[selectedId] || null;
  }, [data.asientos, selectedId]);

  if (selectedAsiento) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
              <Hash className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight">{selectedAsiento.titulo}</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-lg uppercase text-[9px] font-black tracking-widest bg-primary/5 border-primary/20 text-primary px-2 py-1">
              REGISTRO CONTABLE
            </Badge>
            <Badge variant="outline" className="rounded-lg uppercase text-[9px] font-black tracking-widest bg-muted border-muted-foreground/20 px-2 py-1">
              HECHO ECONÓMICO
            </Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl border bg-card/50 overflow-hidden">
              <div className="bg-muted/50 p-4 border-b">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Estructura del Asiento</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 uppercase tracking-widest font-black text-muted-foreground border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">Código / Cuenta</th>
                      <th className="px-4 py-3 text-right">Debe</th>
                      <th className="px-4 py-3 text-right">Haber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-b last:border-0">
                    {selectedAsiento.lineas.map((linea, idx) => (
                      <tr key={idx} className="hover:bg-primary/[0.02] transition-colors group">
                        <td className="px-4 py-3 font-medium">
                          <div className="flex flex-col gap-0.5">
                             {linea.Codigo && (
                                <button
                                  onClick={() => onNavigate('cuentas', linea.Codigo)}
                                  className="text-primary hover:underline flex items-center gap-1 w-fit group-hover:translate-x-0.5 transition-transform"
                                >
                                  {linea.Codigo} <ExternalLink className="h-2 w-2 opacity-50" />
                                </button>
                             )}
                             <span className={cn(
                               "text-[11px] uppercase tracking-tight",
                               linea.Descrip.startsWith('-') ? "pl-4 text-muted-foreground/80 italic" : "font-bold"
                             )}>
                               {linea.Descrip}
                             </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-primary/80">{linea.Debe}</td>
                        <td className="px-4 py-3 text-right font-mono text-primary/80">{linea.Haber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedAsiento.descripcion && (
              <div className="rounded-3xl border p-6 bg-card">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3">Descripción</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{selectedAsiento.descripcion}</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
             <div className="rounded-3xl border p-6 bg-primary/[0.03] border-primary/20">
                <div className="flex items-center gap-2 mb-4 text-primary">
                  <Info className="h-4 w-4" />
                  <h3 className="text-xs font-black uppercase tracking-widest">Ejemplo Práctico</h3>
                </div>
                <p className="text-xs italic text-muted-foreground leading-relaxed">
                  {selectedAsiento.ejemplo || "No hay ejemplo disponible para este asiento."}
                </p>
             </div>

             <div className="rounded-3xl border p-6 bg-muted/20">
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <List className="h-4 w-4" />
                  <h3 className="text-xs font-black uppercase tracking-widest">Cuentas Relacionadas</h3>
                </div>
                <div className="flex flex-col gap-2">
                   {Array.from(new Set(selectedAsiento.lineas.map(l => l.Codigo).filter(Boolean))).map(codigo => (
                     <button
                       key={codigo}
                       onClick={() => onNavigate('cuentas', codigo)}
                       className="flex items-center justify-between p-2 rounded-xl bg-background border hover:border-primary/30 hover:bg-primary/[0.02] transition-all group"
                     >
                       <span className="text-xs font-bold font-mono">{codigo}</span>
                       <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                     </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black uppercase tracking-tight">Asientos Contables</h2>
        <p className="text-muted-foreground max-w-2xl">
          Biblioteca de tipos de asientos contables. Selecciona un hecho económico para ver cómo debe registrarse en el sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {asientos.map((asiento) => (
          <button
            key={asiento.id}
            onClick={() => onNavigate('asientos', asiento.id)}
            className="group flex flex-col items-start gap-4 p-6 rounded-3xl border bg-card hover:bg-primary/[0.02] hover:border-primary/30 transition-all text-left shadow-sm active:scale-[0.98]"
          >
            <div className="h-10 w-10 shrink-0 rounded-2xl bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors border border-transparent group-hover:border-primary/20">
              <Hash className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm uppercase tracking-tight mb-1 group-hover:text-primary transition-colors">{asiento.titulo}</h3>
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug uppercase tracking-tighter opacity-70">
                {asiento.lineas.map(l => l.Descrip).join(' • ')}
              </p>
            </div>
            <div className="mt-auto w-full pt-4 border-t border-muted/50 flex items-center justify-between">
               <span className="text-[9px] font-black tracking-widest text-muted-foreground/50 uppercase group-hover:text-primary/50 transition-colors">Ver Estructura</span>
               <ArrowRight className="h-4 w-4 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
