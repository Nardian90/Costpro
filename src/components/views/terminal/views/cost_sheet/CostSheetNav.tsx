'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Save, Bot } from 'lucide-react';
import { CostSheetOptionsDropdown } from './CostSheetOptionsDropdown';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';

interface CostSheetNavProps {
  navItems: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  viewMode: any;
  setViewMode: (mode: any) => void;
  layoutMode?: ViewMode;
  setLayoutMode?: (mode: ViewMode) => void;
  onOpenActions?: () => void;
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
  layoutMode,
  setLayoutMode,
}) => {
  const navActions: Action[] = React.useMemo(() => {
    const actions: Action[] = [
        // 1. Guardar (Acción crítica inmediata)
        {
            id: 'save-action',
            label: 'Guardar',
            onClick: onSave || (() => {}),
            component: (
                <button
                    onClick={onSave || (() => {})}
                    className="neu-raised-sm px-4 h-11 flex items-center justify-center gap-2 shrink-0 active:scale-95 transition-all text-primary font-black uppercase tracking-widest text-[10px] hover:bg-primary/10 rounded-xl"
                    title="Guardar Ficha"
                >
                    <Save className="w-4 h-4" />
                    <span className="hidden sm:inline">Guardar</span>
                </button>
            ),
            tooltip: "Guardar Ficha"
        },

        // 2. Exportar / Opciones (Dropdown simplificado)
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

        // 3. Darian AI (Acción crítica)
        {
            id: 'darian-ai',
            label: 'Darian',
            onClick: () => setActiveSection('ai-chat'),
            component: (
                <button
                    onClick={() => setActiveSection('ai-chat')}
                    className="neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-95 transition-all text-primary hover:bg-primary/10 rounded-xl"
                    title="Darian AI Expert"
                    aria-label="Asistente Darian AI"
                >
                    <Bot className="w-5 h-5" />
                </button>
            ),
            tooltip: "Darian AI Expert"
        },

    ];

    return actions;
  }, [onSave, onExportExcel, onExportPdf, onImport, setActiveSection]);

  return (
    <div className="mb-0 flex items-center gap-3">
      <ActionMenu
        actions={navActions}
        topOffset={topOffset}
        sticky={false}
        className="!z-10 shadow-none bg-transparent !p-0 flex-1 min-w-0"
      />
      {/* Inline ViewSwitcher: toggle tarjeta ↔ tabla directly in the nav */}
      {layoutMode !== undefined && setLayoutMode && (
        <ViewSwitcher
          currentView={layoutMode}
          onViewChange={setLayoutMode}
        />
      )}
    </div>
  );
};

export default CostSheetNav;
