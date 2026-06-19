'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    showTrigger?: boolean;
}

export function IPVHelpDialog({ open, onOpenChange, showTrigger = true }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {showTrigger && (
        <Tooltip>
            <TooltipTrigger asChild>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 transition-colors">
                <HelpCircle className="w-5 h-5 text-primary" />
                </Button>
            </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent className="bg-popover text-popover-foreground border shadow-xl">
            <p className="text-xs font-bold">Ayuda y Guía Operativa (SOP)</p>
            </TooltipContent>
        </Tooltip>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-3xl border-none shadow-2xl">
        <DialogHeader className="bg-primary p-6 text-primary-foreground shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">Guía Operativa IPV</DialogTitle>
              <DialogDescription className="text-primary-foreground/80 font-medium">
                SOP: Protocolo Estándar de Conciliación y Matching
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-8 pb-4">
            {/* Business Rule Banner */}
            <div className="bg-red-50 border-2 border-red-100 p-4 rounded-2xl flex gap-4 items-start">
              <div className="bg-destructive p-2 rounded-lg shrink-0 shadow-lg shadow-red-200">
                <AlertTriangle className="w-5 h-5 text-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-black text-red-900 uppercase">Regla de Oro (No Negativos)</p>
                <p className="text-xs text-destructive font-medium leading-relaxed">
                  Si la regla <Badge variant="outline" className="text-xs font-bold border-red-200">STOCK_LIMIT</Badge> está activa,
                  el sistema <strong>bloqueará automáticamente</strong> cualquier matching con productos cuya existencia sea cero.
                </p>
              </div>
            </div>

            {/* Steps Section */}
            <div className="space-y-6">
              <h3 className="font-black text-primary uppercase text-sm tracking-widest flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                Panel de Control
              </h3>

              <div className="grid gap-4">
                <StepItem
                  number="1"
                  title="Ingesta (Extracto)"
                  desc="Carga de archivos bancarios para obtener la base de transferencias a conciliar."
                />
                <StepItem
                  number="2"
                  title="Catálogo"
                  desc="Validar productos, precios y existencias. El stock es crítico para el matching automático."
                />
                <StepItem
                  number="3"
                  title="Ejecutar Matching"
                  desc="Procesar transacciones. El sistema asocia productos automáticamente según las reglas."
                />
                <StepItem
                  number="4"
                  title="Análisis y Cuadre"
                  desc="Revisión manual en Desglose o Consolidado para asegurar que todo esté cuadrado."
                />
                <StepItem
                  number="5"
                  title="Reportes IPV"
                  desc="Generación de documentos fiscales diarios y mensuales una vez finalizado el cuadre."
                />
                <StepItem
                  number="6"
                  title="Auditoría y Soporte"
                  desc="Control de errores de ingesta, simulación de metas y respaldos de seguridad."
                />
              </div>
            </div>

            {/* Quick Tips */}
            <div className="bg-primary/5 p-5 rounded-3xl space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <Info className="w-4 h-4" />
                <span className="text-xs font-black uppercase">Tips de Operación</span>
              </div>
              <ul className="space-y-2">
                <li className="text-xs text-muted-foreground flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 shrink-0" />
                  <span>Use <strong>Ajuste Rápido</strong> para discrepancias pequeñas de centavos.</span>
                </li>
                <li className="text-xs text-muted-foreground flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 shrink-0" />
                  <span>Desactive transacciones <strong>Débito (DB)</strong> si solo desea cuadrar ingresos.</span>
                </li>
                <li className="text-xs text-muted-foreground flex gap-2">
                  <span>Sincronice el IPV periódicamente para refrescar las estadísticas del panel.</span>
                </li>
              </ul>
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 bg-muted/30 border-t shrink-0 flex justify-end">
          <DialogTrigger asChild>
            <Button className="rounded-xl font-bold uppercase tracking-widest text-xs px-8">Entendido</Button>
          </DialogTrigger>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepItem({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div className="flex gap-4 group">
      <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0 group-hover:bg-primary group-hover:text-foreground transition-colors">
        {number}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-black text-foreground uppercase tracking-tight">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
