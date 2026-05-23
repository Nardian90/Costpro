"use client";

import React from 'react';
import { useAssistedModeStore, AssistedViewMode } from '@/store/assisted-mode-store';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Factory,
  Settings2,
  ShoppingCart,
  BarChart3,
  CheckCircle2,
  FileText,
  Users,
  Box,
  TrendingUp,
  ShieldCheck,
  History,
  Download
} from 'lucide-react';

interface AssistedModeSidebarProps {
  calculatedValues?: any;
}

export const AssistedModeSidebar: React.FC<AssistedModeSidebarProps> = ({ calculatedValues }) => {
  const { mode, setMode, setActiveNode } = useAssistedModeStore();
  const { data } = useCostSheetStore();

  const modes: { id: AssistedViewMode; label: string; icon: any }[] = [
    { id: 'prod', label: 'Producción', icon: Factory },
    { id: 'serv', label: 'Servicios', icon: Settings2 },
    { id: 'com', label: 'Comercial', icon: ShoppingCart },
  ];

  const sections = [
    { id: 'header', label: 'Datos Generales', icon: FileText, node: 'prod-header' },
    { id: 'materials', label: 'Materias Primas', icon: Box, node: 'prod-insumos' },
    { id: 'labor', label: 'Mano de Obra', icon: Users, node: 'prod-salario' },
    { id: 'indirects', label: 'Costos Indirectos', icon: BarChart3, node: 'prod-gi' },
    { id: 'review', label: 'Resumen Financiero', icon: TrendingUp, node: 'prod-comercial' },
    { id: 'validations', label: 'Validaciones', icon: ShieldCheck, node: 'validations' },
    { id: 'audit', label: 'Auditoría', icon: History, node: 'audit' },
  ];

  const progress = data ? 65 : 0;
  const totalCost = calculatedValues?.summary?.grandTotal || 0;
  const productName = data?.header?.product_name || 'Sin nombre';

  return (
    <div className="w-72 border-r border-border bg-card flex flex-col shrink-0 overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-3 ml-1">Ecosistema Operativo</h2>
        <div className="flex gap-1 p-1 bg-background/50 rounded-xl border border-border">
          {modes.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 rounded-lg transition-all gap-1",
                  mode === m.id
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[8px] font-bold uppercase tracking-tighter">{m.label.substring(0, 4)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar py-4 space-y-6">
        <section className="px-4 space-y-1">
          <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 mb-3 px-2">Navegación Modular</h3>
          {sections.map((s) => (
            <Button
              key={s.id}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-3 h-9 px-3 font-bold uppercase tracking-widest text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg group"
              onClick={() => setActiveNode(s.node)}
            >
              <s.icon className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              {s.label}
            </Button>
          ))}
        </section>

        <section className="px-6 space-y-4">
          <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">Indicadores Clave</h3>
          <div className="space-y-2">
             <div className="p-3 rounded-2xl bg-primary/5 border border-primary/10 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingUp className="w-8 h-8" />
                </div>
                <div className="text-[8px] font-black text-primary/60 uppercase tracking-widest mb-1">Costo Total</div>
                <div className="text-lg font-black font-mono text-foreground tabular-nums">
                  ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
             </div>

             <div className="p-3 rounded-2xl bg-muted/30 border border-border">
                <div className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-widest mb-1">Producto Activo</div>
                <div className="text-[10px] font-bold text-foreground line-clamp-1">
                  {productName}
                </div>
             </div>
          </div>
        </section>

        <section className="px-6">
          <div className="flex justify-between items-end mb-2 px-1">
            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Completitud</h3>
            <span className="text-[10px] font-black font-mono text-primary">{progress}%</span>
          </div>
          <div className="p-1 bg-muted/50 rounded-full border border-border">
            <Progress value={progress} className="h-1.5" />
          </div>
        </section>
      </div>

      <div className="p-4 border-t border-border bg-muted/20 space-y-2">
        <Button variant="outline" className="w-full font-black uppercase tracking-widest text-[9px] h-9 gap-2 rounded-xl">
          <Download className="w-3.5 h-3.5" />
          Exportar PDF
        </Button>
        <Button className="w-full font-black uppercase tracking-widest text-[9px] h-9 gap-2 rounded-xl shadow-lg shadow-primary/20">
          Finalizar Operación
          <CheckCircle2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
