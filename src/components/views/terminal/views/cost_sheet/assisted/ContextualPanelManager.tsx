"use client";

import React, { useState } from 'react';
import { useAssistedModeStore } from '@/store/assisted-mode-store';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import CostSheetAnnexEditor from '../CostSheetAnnexEditor';
import CostSheetInteractiveTable from '../CostSheetInteractiveTable';

interface ContextualPanelManagerProps {
  calculatedValues: any;
  calculatedHeader: any;
}

export const ContextualPanelManager: React.FC<ContextualPanelManagerProps> = ({ calculatedValues, calculatedHeader }) => {
  const { activeNodeId, isPanelOpen, togglePanel, panelSide } = useAssistedModeStore();
  const { data } = useCostSheetStore();

  const [activeSubSectionId, setActiveSubSectionId] = useState<string>('all');

  const renderContent = () => {
    if (!activeNodeId) return null;

    if (activeNodeId.match(/(insumos|recursos|origen)/)) {
      return <CostSheetAnnexEditor activeAnnexId="I" />;
    }
    if (activeNodeId.match(/(salario|personal)/)) {
      return <CostSheetAnnexEditor activeAnnexId="II" />;
    }
    if (activeNodeId.match(/(otros|equipos|transporte)/)) {
      return <CostSheetAnnexEditor activeAnnexId="III" />;
    }
    if (activeNodeId.match(/(almacen)/)) {
      return <CostSheetAnnexEditor activeAnnexId="IV" />;
    }

    if (activeNodeId.match(/(taller|ejecucion|venta|gi|comercial)/)) {
       return (
         <div className="space-y-6">
           <CostSheetInteractiveTable
             sections={data?.sections || []}
             calculatedValues={calculatedValues || {}}
             annexes={data?.annexes || []}
             activeSubSectionId={activeSubSectionId}
             setActiveSubSectionId={setActiveSubSectionId}
           />
         </div>
       );
    }

    return (
      <div className="p-12 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl">🚧</div>
        <div className="space-y-1">
          <p className="font-bold text-foreground">Módulo en Desarrollo</p>
          <p className="text-sm text-muted-foreground italic">
            El panel para "{activeNodeId}" está siendo optimizado para la vista enterprise.
          </p>
        </div>
      </div>
    );
  };

  const getTitle = () => {
    if (!activeNodeId) return "";
    const parts = activeNodeId.split('-');
    const name = parts[parts.length - 1].toUpperCase();

    const titles: Record<string, string> = {
      INSUMOS: "Almacén de Materias Primas",
      RECURSOS: "Recursos del Servicio",
      ORIGEN: "Costo de Adquisición",
      SALARIO: "Fuerza de Trabajo Directa",
      PERSONAL: "Personal del Servicio",
      OTROS: "Otros Gastos Directos",
      EQUIPOS: "Equipos y Herramientas",
      TRANSPORTE: "Logística y Transporte",
      TALLER: "Taller de Producción",
      EJECUCION: "Ejecución del Servicio",
      ALMACEN: "Almacén y Manipulación",
      VENTA: "Punto de Venta",
      GI: "Gastos Indirectos (F6-F10)",
      COMERCIAL: "Área Comercial y Precio"
    };

    return titles[name] || name;
  };

  return (
    <Sheet open={isPanelOpen} onOpenChange={togglePanel}>
      <SheetContent side={panelSide} className="sm:max-w-[800px] overflow-y-auto border-l-primary/20 shadow-2xl">
        <SheetHeader className="mb-8 relative">
          <div className="absolute -left-12 top-0 w-1 h-12 bg-primary/40 rounded-full" />
          <SheetTitle className="text-2xl font-black uppercase tracking-tighter italic text-foreground">
            {getTitle()}
          </SheetTitle>
          <SheetDescription className="text-xs font-bold uppercase tracking-widest text-primary/60">
            Módulo Operacional · Res. 148/2023
          </SheetDescription>
        </SheetHeader>

        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          {renderContent()}
        </div>
      </SheetContent>
    </Sheet>
  );
};
