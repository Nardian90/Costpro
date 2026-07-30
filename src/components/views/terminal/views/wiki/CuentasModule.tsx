'use client';

import React, { useMemo } from 'react';
import { List, Info, ArrowRight, ExternalLink, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Cuenta,
  CuentasData,
  WikiModule,
  CuentaSubcuenta
} from './types';

interface CuentasModuleProps {
  data: CuentasData;
  selectedId: string | null;
  onNavigate: (module: WikiModule, id: string | null) => void;
}

export const CuentasModule: React.FC<CuentasModuleProps> = ({ data, selectedId, onNavigate }) => {
  const selectedCuenta = useMemo(() => {
    if (!selectedId) return null;
    return data.cuentas.find(c => c.codigo === selectedId) || null;
  }, [data.cuentas, selectedId]);

  if (selectedCuenta) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
              <List className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight">{selectedCuenta.codigo} - {selectedCuenta.nombre}</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={cn(
              "rounded-lg uppercase text-[9px] font-black tracking-widest px-2 py-1",
              selectedCuenta.naturaleza === 'Deudora' ? "bg-primary/5 border-primary/20 text-primary" : "bg-danger/5 border-danger/20 text-danger"
            )}>
              Naturaleza: {selectedCuenta.naturaleza}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-lg uppercase text-[9px] font-black tracking-widest bg-muted border-muted-foreground/20 px-2 py-1 cursor-pointer hover:bg-muted-foreground/10 transition-colors"
              onClick={() => onNavigate('clasificador', null)}
            >
              <Filter className="h-2.5 w-2.5 mr-1" /> Clasificación Contable
            </Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl border p-6 bg-card shadow-sm">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4">Descripción y Uso</h3>
              <p className="text-sm leading-relaxed text-muted-foreground font-medium">
                {selectedCuenta.descripcion}
              </p>
            </div>

            {selectedCuenta.subcuentas && selectedCuenta.subcuentas.length > 0 && (
              <div className="rounded-3xl border bg-card/50 overflow-hidden shadow-sm">
                <div className="bg-muted/50 p-4 border-b">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Subcuentas Disponibles</h3>
                </div>
                <div className="divide-y">
                  {selectedCuenta.subcuentas.map((sub, idx) => (
                    <div key={idx} className="p-4 hover:bg-primary/[0.02] transition-colors flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black font-mono tracking-widest text-primary">{sub.codigo}</span>
                        <span className="text-xs font-bold uppercase tracking-tight">{sub.nombre}</span>
                      </div>
                      {sub.descripcion && (
                        <p className="text-[11px] text-muted-foreground italic leading-snug">{sub.descripcion}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
             <div className="rounded-3xl border p-6 bg-primary/[0.03] border-primary/20">
                <div className="flex items-center gap-2 mb-4 text-primary">
                  <Info className="h-4 w-4" />
                  <h3 className="text-xs font-black uppercase tracking-widest">Resumen de Uso</h3>
                </div>
                <ul className="space-y-3 text-[11px] text-muted-foreground leading-snug uppercase tracking-tight font-bold">
                   <li className="flex gap-2">
                     <span className="text-primary mt-0.5">●</span>
                     Se debita al crear los fondos o al aumentarlos.
                   </li>
                   <li className="flex gap-2">
                     <span className="text-primary mt-0.5">●</span>
                     Se acredita por las rebajas o utilización.
                   </li>
                </ul>
             </div>

             <div className="rounded-3xl border p-6 bg-muted/20">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Acciones</h3>
                <Button
                  className="w-full rounded-2xl h-12 uppercase font-black tracking-widest gap-2 mb-3"
                  onClick={() => onNavigate('asientos', null)}
                >
                   Ver Asientos Relacionados
                </Button>
                <p className="text-[10px] text-center text-muted-foreground opacity-60 uppercase font-bold tracking-tighter">
                  Consulte los hechos económicos donde esta cuenta es utilizada.
                </p>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black uppercase tracking-tight">Catálogo de Cuentas</h2>
        <p className="text-muted-foreground max-w-2xl">
          Diccionario contable oficial. Encuentra definiciones, naturaleza y uso correcto de cada cuenta del sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.cuentas.map((cuenta) => (
          <button type="button"
            key={cuenta.codigo}
            onClick={() => onNavigate('cuentas', cuenta.codigo)}
            className="group flex flex-col items-start gap-4 p-6 rounded-3xl border bg-card hover:bg-primary/[0.02] hover:border-primary/30 transition-all text-left shadow-sm active:scale-[0.98]"
          >
            <div className="w-full flex items-center justify-between mb-2">
              <span className="text-xs font-black font-mono tracking-widest text-primary/70 group-hover:text-primary transition-colors">
                {cuenta.codigo}
              </span>
              <Badge variant="outline" className={cn(
                "rounded-lg uppercase text-[8px] font-black tracking-widest px-1.5 py-0.5",
                cuenta.naturaleza === 'Deudora' ? "bg-primary/5 border-primary/20 text-primary" : "bg-danger/5 border-danger/20 text-danger"
              )}>
                {cuenta.naturaleza}
              </Badge>
            </div>
            <div>
              <h3 className="font-bold text-sm uppercase tracking-tight mb-1 group-hover:text-primary transition-colors">{cuenta.nombre}</h3>
              <p className="text-[11px] text-muted-foreground line-clamp-3 leading-snug uppercase tracking-tighter opacity-70">
                {cuenta.descripcion}
              </p>
            </div>
            <div className="mt-auto w-full pt-4 border-t border-muted/50 flex items-center justify-between">
               <span className="text-[9px] font-black tracking-widest text-muted-foreground/50 uppercase group-hover:text-primary/50 transition-colors">Diccionario</span>
               <ArrowRight className="h-4 w-4 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
