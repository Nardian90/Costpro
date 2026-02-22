'use client';
import { cn } from '@/lib/utils';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, ClipboardList, Menu, HelpCircle, BarChart3, FolderOpen, Sparkles } from 'lucide-react';
import { CostSheetFCDropdown } from './CostSheetFCDropdown';
import { CostSheetModeDropdown, CostSheetViewMode } from './CostSheetModeDropdown';
import { CostSheetOptionsDropdown } from './CostSheetOptionsDropdown';
import { CostSheetGenerateDropdown } from './CostSheetGenerateDropdown';

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
  onImport?: () => void;
  onSave?: () => void;
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  onQuickGenerate?: () => void;
  onExpertGenerate?: () => void;
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
  onImport,
  onSave,
  onExportExcel,
  onExportPdf,
  onQuickGenerate,
  onExpertGenerate,
}) => {
  const navActions: Action[] = React.useMemo(() => {
    // Filter out items that are now in dropdowns
    const mainNavItems = navItems.filter(s => !['massive-gen'].includes(s.id));

    const actions: Action[] = [
        ...(onOpenActions ? [{
            id: 'actions-menu',
            label: '',
            icon: Menu,
            onClick: onOpenActions,
            variant: 'default' as const,
            className: 'flex bg-primary/10 text-primary border-primary/20'
        }] : []),

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

        // 3. Opciones Dropdown
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
                />
            )
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

        ...mainNavItems.map(s => {
            const isActive = activeSection === s.id;
            return {
                id: s.id,
                label: s.label,
                icon: s.icon || (s.id === 'header' ? Layout : ClipboardList),
                onClick: () => setActiveSection(s.id),
                active: isActive,
                className: cn(
                    "text-[10px] uppercase tracking-widest transition-colors",
                    !isActive && "text-muted-foreground hover:text-primary"
                )
            };
        }),

        ...(onOpenHelp ? [{
            id: 'help-panel',
            label: 'Ayuda',
            icon: HelpCircle,
            onClick: onOpenHelp,
            className: "text-[10px] uppercase tracking-widest bg-muted/30"
        }] : [])
    ];

    return actions;
  }, [
    navItems, activeSection, setActiveSection, viewMode, setViewMode,
    onOpenActions, onOpenAnnexes, onOpenSections, onOpenHelp,
    onImport, onSave, onExportExcel, onExportPdf, onQuickGenerate, onExpertGenerate
  ]);

  return (
    <div className="mb-0">
      <ActionMenu
        actions={navActions}
        sticky={false}
        className="!z-10 shadow-none bg-transparent -mx-4 px-4 py-0"
      />
    </div>
  );
};

export default CostSheetNav;
