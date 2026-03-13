'use client';
import { cn } from '@/lib/utils';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, ClipboardList, Menu, HelpCircle, BarChart3, FolderOpen, Sparkles } from 'lucide-react';
import { CostSheetFCDropdown } from './CostSheetFCDropdown';
import { CostSheetModeDropdown, CostSheetViewMode } from './CostSheetModeDropdown';
import { CostSheetOptionsDropdown } from './CostSheetOptionsDropdown';
import { CostSheetGenerateDropdown } from './CostSheetGenerateDropdown';
import { CostSheetHelpDropdown } from './CostSheetHelpDropdown';

interface CostSheetNavProps {
  navItems: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  viewMode: CostSheetViewMode;
  setViewMode: (mode: CostSheetViewMode) => void;
  onOpenActions?: () => void;
  onOpenAnnexes?: () => void;
  onOpenSections?: () => void;
  onOpenHelp?: () => void;
  onOpenSystemHelp?: () => void;
  onOpenAcademy?: () => void;
  onImport?: () => void;
  onSave?: () => void;
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  onQuickGenerate?: () => void;
  onExpertGenerate?: () => void;
  topOffset?: string;
}

const CostSheetNav: React.FC<CostSheetNavProps> = ({
  navItems,
  annexes,
  activeSection,
  setActiveSection,
  viewMode,
  setViewMode,
  onOpenActions,
  onOpenAnnexes,
  onOpenSections,
  onOpenHelp,
  onOpenSystemHelp,
  onOpenAcademy,
  onImport,
  onSave,
  onExportExcel,
  onExportPdf,
  onQuickGenerate,
  onExpertGenerate,
  topOffset,
}) => {
  const navActions: Action[] = React.useMemo(() => {
    // Filter out all items from main nav as requested: "visible solo Ficha, Modo, Generar, Opciones Darian y Ayuda"
    const mainNavItems = navItems.filter(s => !['massive-gen', 'kpis', 'templates', 'ai-chat'].includes(s.id));

        const actions: Action[] = [
        {
            id: "open-actions",
            label: "",
            onClick: () => {},
            component: (
                <button
                    onClick={onOpenActions || (() => {})}
                    className="neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition-transform text-primary dark:text-foreground hover:bg-primary/10"
                    title="Panel de Control"
                >
                    <Menu className="w-5 h-5" />
                </button>
            ),
            tooltip: "Panel de Control"
        },
        // Fichas Dropdown (Vistas de la ficha)
        {
            id: 'fc-dropdown',
            label: 'Vistas',
            onClick: () => {},
            component: (
                <CostSheetFCDropdown
                    activeSection={activeSection}
                    setActiveSection={setActiveSection}
                    onOpenSections={onOpenSections}
                    onOpenAnnexes={onOpenAnnexes}
                />
            )
        },

        // 1. Modo Dropdown
        {
            id: 'mode-dropdown',
            label: '',
            onClick: () => {},
            component: <CostSheetModeDropdown viewMode={viewMode} setViewMode={setViewMode} />
        },

        // 2. Generar Dropdown
        {
            id: 'generate-dropdown',
            label: '',
            onClick: () => {},
            component: (
                <CostSheetGenerateDropdown
                    onQuickGenerate={onQuickGenerate || (() => {})}
                    onExpertGenerate={onExpertGenerate || (() => {})}
                />
            )
        },

        // 3. Opciones Dropdown (Renamed internally to Opciones Darian)
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

        // 4. Ayuda Dropdown
        {
            id: 'help-dropdown',
            label: '',
            onClick: () => {},
            component: (
                <CostSheetHelpDropdown
                    onOpenViewHelp={onOpenHelp || (() => {})}
                    onOpenSystemHelp={onOpenSystemHelp || (() => {})}
                    onOpenAcademy={onOpenAcademy || (() => {})}
                />
            )
        },

    ];

    return actions;
  }, [
    navItems, activeSection, setActiveSection, viewMode, setViewMode,
    onOpenActions, onOpenAnnexes, onOpenSections, onOpenHelp, onOpenSystemHelp, onOpenAcademy,
    onImport, onSave, onExportExcel, onExportPdf, onQuickGenerate, onExpertGenerate
  ]);

  return (
    <div className="mb-0">
      <ActionMenu
        actions={navActions}
        topOffset={topOffset}
        sticky={true}
        className="!z-10 shadow-none bg-transparent -mx-4 pl-4 pr-0 py-0"
      />
    </div>
  );
};

export default CostSheetNav;
