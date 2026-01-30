
'use client';

import React from 'react';
import CostSheetHeader from './CostSheetHeader';
import CostSheetBody from './CostSheetBody';
import CostSheetAnnexes from './CostSheetAnnexes';
import CostSheetSignature from './CostSheetSignature';
import { SecurityScrollContainer } from '@/components/ui/SecurityScrollContainer';

interface CostSheetPreviewProps {
  data: any;
  calculatedValues: any;
  calculatedAnnexes: any;
}

const CostSheetPreview = React.forwardRef<HTMLDivElement, CostSheetPreviewProps>(({ data, calculatedValues, calculatedAnnexes }, ref) => {
  return (
    <div ref={ref} className="max-w-5xl mx-auto">
      <div className="neu-card !p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        <div className="bg-slate-800 p-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-white">
           <div className="font-black text-xl tracking-tighter uppercase italic">COSTPRO <span className="text-primary font-light text-sm not-italic ml-2 tracking-widest">FICHA</span></div>
           <div className="text-xs font-bold opacity-50 uppercase tracking-widest">Documento Oficial de Costos</div>
        </div>
        <div className="p-4 sm:p-10 lg:p-12 space-y-10">
            <CostSheetHeader header={data.header} />
            <div className="space-y-4">
              <div className="text-xs font-black uppercase tracking-widest text-primary pb-2 border-b-2 border-primary/20 whitespace-nowrap">
                Resumen de Operación
              </div>
              <SecurityScrollContainer minWidth="600px">
                <CostSheetBody
                    sections={data.sections}
                    calculatedValues={calculatedValues}
                />
              </SecurityScrollContainer>
            </div>
            <div className="space-y-4">
              <div className="text-xs font-black uppercase tracking-widest text-primary pb-2 border-b-2 border-primary/20 whitespace-nowrap">
                Anexos Detallados
              </div>
              <SecurityScrollContainer minWidth="800px">
                <CostSheetAnnexes
                    annexes={calculatedAnnexes}
                />
              </SecurityScrollContainer>
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
  );
});

CostSheetPreview.displayName = 'CostSheetPreview';

export default CostSheetPreview;
