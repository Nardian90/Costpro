'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Hash, Info, List, ArrowRight, ExternalLink, Search, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const ITEMS_PER_PAGE = 21;

export const AsientosModule: React.FC<AsientosModuleProps> = ({ data, selectedId, onNavigate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);

  const allAsientos = useMemo(() => {
    return Object.entries(data.asientos).map(([id, asiento]) => ({
      ...(asiento as any),
      id
    })) as Asiento[];
  }, [data.asientos]);

  const filteredAsientos = useMemo(() => {
    if (!searchTerm) return allAsientos;
    const term = searchTerm.toLowerCase();
    return allAsientos.filter((a: Asiento) =>
      a.titulo.toLowerCase().includes(term) ||
      (a.descripcion && a.descripcion.toLowerCase().includes(term)) ||
      a.lineas.some((l: AsientoLinea) => l.Descrip.toLowerCase().includes(term))
    );
  }, [allAsientos, searchTerm]);

  const visibleAsientos = useMemo(() => {
    return filteredAsientos.slice(0, displayCount);
  }, [filteredAsientos, displayCount]);

  useEffect(() => {
    requestAnimationFrame(() => {
      setDisplayCount(ITEMS_PER_PAGE);
    });
  }, [searchTerm]);

  const selectedAsiento = useMemo(() => {
    if (!selectedId) return null;
    const asiento = data.asientos[selectedId];
    if (!asiento) return null;
    return { ...(asiento as any), id: selectedId } as Asiento;
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
            <div className="rounded-3xl border bg-card/50 overflow-hidden shadow-sm">
              <div className="bg-muted/50 p-4 border-b flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Estructura del Asiento</h3>
                <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">Vista Tabular</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 uppercase tracking-widest font-black text-muted-foreground border-b">
                    <tr>
                      <th className="px-4 py-4 text-left">Código / Cuenta</th>
                      <th className="px-4 py-4 text-right">Debe</th>
                      <th className="px-4 py-4 text-right">Haber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-b last:border-0">
                    {selectedAsiento.lineas.map((linea: AsientoLinea, idx: number) => (
                      <tr key={idx} className="hover:bg-primary/[0.02] transition-colors group">
                        <td className="px-4 py-4 font-medium">
                          <div className="flex flex-col gap-1">
                             {linea.Codigo && (
                                <button type="button"
                                  onClick={() => onNavigate('cuentas', linea.Codigo)}
                                  className="text-primary hover:underline flex items-center gap-1 w-fit group-hover:translate-x-0.5 transition-transform font-mono text-[10px] font-bold"
                                >
                                  {linea.Codigo} <ExternalLink className="h-2 w-2 opacity-50" />
                                </button>
                             )}
                             <span className={cn(
                               "text-[11px] uppercase tracking-tight",
                               linea.Descrip.startsWith('-') ? "pl-4 text-muted-foreground/80 italic" : "font-bold text-foreground"
                             )}>
                               {linea.Descrip}
                             </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-sm text-primary/80 font-bold">{linea.Debe !== 'xxx.xx' ? linea.Debe : '-'}</td>
                        <td className="px-4 py-4 text-right font-mono text-sm text-primary/80 font-bold">{linea.Haber !== 'xxx.xx' ? linea.Haber : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/10">
                    <tr>
                      <td className="px-4 py-3 font-black text-[10px] uppercase tracking-widest text-muted-foreground text-right">Suman Iguales</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-black border-t-2 border-primary/20">XXX.XX</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-black border-t-2 border-primary/20">XXX.XX</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {selectedAsiento.descripcion && (
              <div className="rounded-3xl border p-6 bg-card shadow-sm border-l-4 border-l-primary">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Descripción y Uso
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground font-medium">{selectedAsiento.descripcion}</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
             <div className="rounded-3xl border p-6 bg-primary/[0.03] border-primary/20 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-primary">
                  <Info className="h-4 w-4" />
                  <h3 className="text-xs font-black uppercase tracking-widest">Ejemplo Práctico</h3>
                </div>
                <p className="text-xs italic text-muted-foreground leading-relaxed font-medium">
                  {selectedAsiento.ejemplo || "No hay ejemplo disponible para este asiento."}
                </p>
             </div>

             <div className="rounded-3xl border p-6 bg-muted/20 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <List className="h-4 w-4" />
                  <h3 className="text-xs font-black uppercase tracking-widest">Cuentas Relacionadas</h3>
                </div>
                <div className="flex flex-col gap-2">
                   {Array.from(new Set(selectedAsiento.lineas.map((l: AsientoLinea) => l.Codigo).filter(Boolean))).map((codigo: string) => (
                     <button type="button"
                       key={codigo}
                       onClick={() => onNavigate('cuentas', codigo)}
                       className="flex items-center justify-between p-3 rounded-2xl bg-background border hover:border-primary/30 hover:bg-primary/[0.02] transition-all group shadow-sm"
                     >
                       <span className="text-xs font-bold font-mono text-muted-foreground group-hover:text-primary transition-colors">{codigo}</span>
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-black uppercase tracking-tight">Asientos Contables</h2>
          <p className="text-muted-foreground max-w-2xl text-sm font-medium">
            Biblioteca de tipos de asientos contables. Selecciona un hecho económico para ver su registro tabular.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="FILTRAR POR TÍTULO O CONTENIDO..."
            className="pl-10 h-11 rounded-2xl border-muted bg-muted/20 font-black text-[10px] uppercase tracking-widest"
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleAsientos.map((asiento: Asiento) => (
          <button type="button"
            key={asiento.id}
            onClick={() => onNavigate('asientos', asiento.id)}
            className="group flex flex-col items-start gap-4 p-6 rounded-3xl border bg-card hover:bg-primary/[0.02] hover:border-primary/30 transition-all text-left shadow-sm active:scale-[0.98] border-b-4 hover:border-b-primary"
          >
            <div className="h-10 w-10 shrink-0 rounded-2xl bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors border border-transparent group-hover:border-primary/20">
              <Hash className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm uppercase tracking-tight mb-2 group-hover:text-primary transition-colors line-clamp-2 leading-tight">{asiento.titulo}</h3>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug uppercase tracking-tighter opacity-70 font-medium">
                {asiento.lineas.map((l: AsientoLinea) => l.Descrip.replace(/^-+\s*/, '')).filter(Boolean).slice(0, 4).join(' • ')}
              </p>
            </div>
            <div className="mt-auto w-full pt-4 border-t border-muted/50 flex items-center justify-between">
               <span className="text-[9px] font-black tracking-widest text-muted-foreground/50 uppercase group-hover:text-primary transition-colors">Ver Estructura Tabular</span>
               <ArrowRight className="h-4 w-4 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          </button>
        ))}
      </div>

      {displayCount < filteredAsientos.length && (
        <div className="flex justify-center pt-8">
          <Button
            variant="outline"
            className="h-11 px-8 rounded-2xl font-black uppercase tracking-widest text-xs border-muted-foreground/20 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-sm"
            onClick={() => setDisplayCount(prev => prev + ITEMS_PER_PAGE)}
          >
            Cargar más asientos ({filteredAsientos.length - displayCount} restantes)
          </Button>
        </div>
      )}

      {filteredAsientos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-4">
            <Search className="h-10 w-10 text-muted-foreground opacity-20" />
          </div>
          <h3 className="text-xl font-black uppercase tracking-tight text-muted-foreground/50">No hay resultados</h3>
          <p className="text-muted-foreground text-sm font-medium">Intenta con otros términos de búsqueda.</p>
        </div>
      )}
    </div>
  );
};
