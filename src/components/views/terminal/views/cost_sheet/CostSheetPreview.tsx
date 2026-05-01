
'use client';

import React from 'react';
import type { CostSheetData, CostSheetAnnex, CostSheetHeader as CostSheetHeaderData, CalculatedRowValue, CostSheetSection } from '@/types/cost-sheet';
import CostSheetHeader from './CostSheetHeader';
import CostSheetBody from './CostSheetBody';
import CostSheetAnnexes from './CostSheetAnnexes';
import CostSheetSignature from './CostSheetSignature';
import { SecurityScrollContainer } from '@/components/ui/SecurityScrollContainer';

interface CostSheetPreviewProps {
  data: CostSheetData;
  calculatedValues: Record<string, CalculatedRowValue>;
  calculatedAnnexes: CostSheetAnnex[];
  calculatedHeader?: Partial<CostSheetHeaderData>;
}

const CostSheetPreview = React.forwardRef<HTMLDivElement, CostSheetPreviewProps>(({ data, calculatedValues, calculatedAnnexes, calculatedHeader }, ref) => {
  return (
    <div ref={ref} className="max-w-5xl mx-auto">
      <div className="neu-card !p-0 overflow-hidden border-none shadow-2xl bg-card dark:bg-background text-foreground dark:text-foreground">
        <div className="bg-slate-800 p-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-foreground">
           <div className="font-black text-xl tracking-tighter uppercase italic">COSTPRO <span className="text-primary font-light text-sm not-italic ml-2 tracking-widest">FICHA</span></div>
           <div className="text-xs font-bold opacity-50 uppercase tracking-widest">Documento Oficial de Costos</div>
        </div>
        <div className="p-4 sm:p-10 lg:p-12 space-y-10">
            {data?.header && <CostSheetHeader header={calculatedHeader || data.header} />}
            <div className="space-y-4">
              <div className="text-xs font-black uppercase tracking-widest text-primary pb-2 border-b-2 border-primary/20 whitespace-nowrap">
                Resumen de Operación
              </div>
              <SecurityScrollContainer minWidth="600px">
                <CostSheetBody forceTable={true}
                    sections={(data?.sections || []) as unknown as Array<{ id: string; label: string; rows: Array<{ id: string; label: string; children?: Array<{ id: string; label: string }>; isPercent?: boolean; is_percent?: boolean }> }>}
                    calculatedValues={calculatedValues as unknown as Record<string, { valorHistorico: number; calculatedVH?: number; baseTotal: number; coeficiente: number; total: number }>}
                />
              </SecurityScrollContainer>
            </div>
            <div className="space-y-4">
              <div className="text-xs font-black uppercase tracking-widest text-primary pb-2 border-b-2 border-primary/20 whitespace-nowrap">
                Anexos Detallados
              </div>
              <SecurityScrollContainer minWidth="800px">
                <CostSheetAnnexes forceTable={true}
                    annexes={calculatedAnnexes}
                />
              </SecurityScrollContainer>
            </div>
            <div className="pt-10 border-t border-border/50 dark:border-border">
               {data?.signature && <CostSheetSignature {...data.signature} />}
            </div>
        </div>
        <div className="bg-muted/30 dark:bg-background/50 p-4 text-xs text-center text-muted-foreground font-bold uppercase tracking-widest">
          Fin del Documento • Generado automáticamente por COSTPRO v1.0
        </div>
      </div>
    </div>
  );
});

CostSheetPreview.displayName = 'CostSheetPreview';

export default CostSheetPreview;
