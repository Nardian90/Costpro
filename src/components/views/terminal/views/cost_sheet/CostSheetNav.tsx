'use client';

import React from 'react';
import type { CostSheetAnnex } from '@/types/cost-sheet';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Save, Bot } from 'lucide-react';
import { CostSheetOptionsDropdown } from './CostSheetOptionsDropdown';
import { toast } from 'sonner';

interface CostSheetNavProps {
  navItems?: unknown[];
  annexes?: CostSheetAnnex[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  onImport?: () => void;
  onSave?: () => void;
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  topOffset?: string;
}

const CostSheetNav: React.FC<CostSheetNavProps> = ({
  onSave,
  onExportExcel,
  onExportPdf,
  onImport,
  setActiveSection,
  topOffset,
}) => {
  const navActions: Action[] = React.useMemo(() => {
    const actions: Action[] = [
        {
            id: 'save-action',
            label: 'Guardar',
            onClick: () => {
                if (onSave) onSave();
                toast.success("Ficha guardada correctamente");
            },
            component: (
                <button
                    onClick={() => { if (onSave) onSave(); toast.success("Ficha guardada"); }}
                    type="button"
                    className="neu-raised-sm px-4 h-11 flex items-center justify-center gap-2 shrink-0 active:scale-95 transition-all text-primary font-black uppercase tracking-widest text-[10px] hover:bg-primary/10 rounded-xl"
                >
                    <Save className="w-4 h-4" aria-hidden="true" />
                    <span>Guardar</span>
                </button>
            ),
            tooltip: "Guardar Ficha"
        },
        {
            id: 'options-dropdown',
            label: '',
            onClick: () => {},
            component: (
                <CostSheetOptionsDropdown
                    onImport={onImport || (() => {})}
                    onSave={onSave || (() => {})}
                    onExportExcel={onExportExcel || (() => {})}
                    onExportPdf={onExportPdf || (() => {})}
                    onOpenDarian={() => setActiveSection('ai-chat')}
                />
            )
        },
        {
            id: 'darian-ai',
            label: 'Darian',
            onClick: () => setActiveSection('ai-chat'),
            component: (
                <button
                    onClick={() => setActiveSection('ai-chat')}
                    type="button"
                    className="neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-95 transition-all text-primary hover:bg-primary/10 rounded-xl"
                >
                    <Bot className="w-5 h-5" aria-hidden="true" />
                </button>
            ),
            tooltip: "Darian AI Expert"
        }
    ];
    return actions;
  }, [onSave, onExportExcel, onExportPdf, onImport, setActiveSection]);

  return (
    <div className="mb-0 flex items-center gap-3 w-full">
      <div className="flex-1 min-w-0">
          <ActionMenu
            actions={navActions}
            topOffset={topOffset}
            sticky={false}
            className="!z-10 shadow-none bg-transparent !p-0"
          />
      </div>
    </div>
  );
};

export default CostSheetNav;
