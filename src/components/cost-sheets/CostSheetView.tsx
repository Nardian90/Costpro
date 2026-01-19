'use client';

import React, { useState } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/useCostSheetCalculator';
import CostSheetNav from './CostSheetNav';
import CostSheetForm from './CostSheetForm';
import CostSheetHeader from './CostSheetHeader';
import CostSheetBody from './CostSheetBody';
import CostSheetAnnexes from './CostSheetAnnexes';
import CostSheetSignature from './CostSheetSignature';
import ActionMenu from '@/components/ui/ActionMenu';
import { Eye, Edit, FileText, Trash2, Download, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const CostSheetView = () => {
  const { data, loadExample, reset } = useCostSheetStore();
  const { calculatedValues, calculatedAnnexes } = useCostSheetCalculator(data);

  const [isEditing, setIsEditing] = useState(true);
  const [activeSection, setActiveSection] = useState('header');

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pb-32 pt-4">
      {/* Top Banner/Title */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 px-2">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 rotate-3">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-tight">
              Ficha de Costo
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">
              Sistema de Gestión COSTPRO
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="neu-badge !text-success !bg-success/10 border border-success/20 py-1 px-3">
            Sistema Activo
          </div>
        </div>
      </div>

      <ActionMenu
        actions={[
          {
            id: 'toggle-mode',
            label: isEditing ? 'Vista Previa' : 'Modo Edición',
            icon: isEditing ? Eye : Edit,
            onClick: () => setIsEditing(!isEditing),
            variant: 'primary',
          },
          {
            id: 'load-example',
            label: 'Cargar Ejemplo',
            icon: FileText,
            onClick: loadExample,
            variant: 'outline',
          },
          {
            id: 'reset',
            label: 'Limpiar',
            icon: Trash2,
            onClick: reset,
            variant: 'danger',
          },
          {
            id: 'export-pdf',
            label: 'Exportar',
            icon: Download,
            onClick: () => window.print(),
            variant: 'success',
          },
        ]}
        className="mb-8"
      />

      {isEditing ? (
        <div className="animate-in fade-in duration-700">
          <CostSheetNav
            sections={data.sections}
            annexes={data.annexes}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
          />
          <div className="mt-4">
            <CostSheetForm
              activeSection={activeSection}
              calculatedAnnexes={calculatedAnnexes}
              calculatedValues={calculatedValues}
            />
          </div>
        </div>
      ) : (
        <div className="animate-in zoom-in-95 duration-500 max-w-5xl mx-auto">
          <div className="neu-card !p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
            {/* Standard "Sheet" header */}
            <div className="bg-slate-800 p-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-white">
               <div className="font-black text-xl tracking-tighter uppercase italic">COSTPRO <span className="text-primary font-light text-sm not-italic ml-2 tracking-widest">SHEET</span></div>
               <div className="text-xs font-bold opacity-50 uppercase tracking-widest">Documento Oficial de Costos</div>
            </div>

            <div className="p-4 sm:p-10 lg:p-12 space-y-10">
                <CostSheetHeader header={data.header} />

                <div className="space-y-4">
                  <div className="text-xs font-black uppercase tracking-widest text-primary pb-2 border-b-2 border-primary/20">
                    Resumen de Operación
                  </div>
                  <CostSheetBody
                      sections={data.sections}
                      calculatedValues={calculatedValues}
                  />
                </div>

                <div className="space-y-4">
                  <div className="text-xs font-black uppercase tracking-widest text-primary pb-2 border-b-2 border-primary/20">
                    Anexos Detallados
                  </div>
                  <CostSheetAnnexes
                      annexes={data.annexes}
                  />
                </div>

                <div className="pt-10 border-t border-slate-100 dark:border-slate-800">
                   <CostSheetSignature {...data.signature} />
                </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-4 text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">
              Fin del Documento • Generado automáticamente por COSTPRO v1.0
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CostSheetView;
