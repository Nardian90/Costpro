'use client';
import { cn } from '@/lib/utils';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileSpreadsheet, PenTool, ClipboardList, Menu, ListFilter, Sparkles, Eye, Edit, Zap, HelpCircle, DatabaseZap } from 'lucide-react';
import { CostSheetFCDropdown } from './CostSheetFCDropdown';

interface CostSheetNavProps {
  navItems: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  onOpenActions?: () => void;
  onOpenAnnexes?: () => void;
  onOpenSections?: () => void;
  onOpenHelp?: () => void;
  isEditing?: boolean;
  onToggleEditing?: () => void;
}

const CostSheetNav: React.FC<CostSheetNavProps> = ({
  navItems,
  annexes,
  activeSection,
  setActiveSection,
  onOpenActions,
  onOpenAnnexes,
  onOpenSections,
  onOpenHelp,
  isEditing,
  onToggleEditing,
}) => {
  // Create a combined list of all navigable sections mapped to ActionMenu format
  const navActions: Action[] = React.useMemo(() => {
    // Separate massive-gen to put it at the end
    const filteredNavItems = navItems.filter(s => s.id !== 'massive-gen');
    const massiveGenItem = navItems.find(s => s.id === 'massive-gen');

    const actions: Action[] = [
        ...(onOpenActions ? [{
            id: 'actions-menu',
            label: '',
            icon: Menu,
            onClick: onOpenActions,
            variant: 'default' as const,
            className: 'hidden sm:flex bg-primary/10 text-primary border-primary/20 text-xs uppercase tracking-wider'
        }] : []),
        // FC Dropdown (Grouping Encabezado, Secciones, Anexos, Firmas, Todo) - Moved after Menú and renamed to Fichas
        {
            id: 'fc-dropdown',
            label: 'Fichas',
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
        ...filteredNavItems.map(s => {
            const isActive = activeSection === s.id;

            return {
                id: s.id,
                label: s.label,
                icon: s.icon || (s.id === 'header' ? Layout : ClipboardList),
                onClick: () => setActiveSection(s.id),
                active: isActive,
                className: cn(
                    "text-xs uppercase tracking-wider transition-colors",
                    !isActive && "text-primary/70 hover:text-primary"
                )
            };
        }),
        ...(onOpenHelp ? [{
            id: 'help-panel',
            label: 'Ayuda',
            icon: HelpCircle,
            onClick: onOpenHelp,
            className: "text-xs uppercase tracking-wider bg-primary/10 text-primary border-primary/20"
        }] : [])
    ];

    // Add massive-gen at the end with distinctive style
    if (massiveGenItem) {
        actions.push({
            id: massiveGenItem.id,
            label: massiveGenItem.label,
            icon: DatabaseZap,
            onClick: () => setActiveSection(massiveGenItem.id),
            active: activeSection === massiveGenItem.id,
            className: 'bg-primary/20 border-primary/40 text-primary font-black shadow-[0_0_15px_rgba(22,163,74,0.3)] hover:bg-primary/30 transition-all text-xs uppercase tracking-wider'
        });
    }

    return actions;
  }, [navItems, activeSection, setActiveSection, annexes, onOpenActions, onOpenAnnexes, onOpenSections, onOpenHelp]);

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
