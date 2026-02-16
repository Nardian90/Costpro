'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileSpreadsheet, PenTool, ClipboardList, Menu, ListFilter, Sparkles, Eye, Edit } from 'lucide-react';

interface CostSheetNavProps {
  navItems: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  onOpenActions?: () => void;
  onOpenAnnexes?: () => void;
  onOpenSections?: () => void;
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
            label: 'Menú',
            icon: Menu,
            onClick: onOpenActions,
            variant: 'default' as const,
            className: 'bg-primary/10 text-primary border-primary/20 text-xs uppercase tracking-wider'
        }] : []),
        ...filteredNavItems.map(s => {
            const isActive = activeSection === s.id;

            return {
                id: s.id,
                label: s.label,
                icon: s.icon || (s.id === 'header' ? Layout : ClipboardList),
                onClick: () => setActiveSection(s.id),
                active: isActive,
                className: "text-xs uppercase tracking-wider"
            };
        }),
        // Consolidated Sections Button
        ...(onOpenSections ? [{
            id: 'open-sections',
            label: 'Secciones',
            icon: ListFilter,
            onClick: onOpenSections,
            variant: 'default' as const,
            className: 'bg-primary/5 text-primary border-none shadow-none text-xs uppercase tracking-wider hover:bg-primary/10'
        }] : []),
        // Consolidated Annexes Button
        ...(onOpenAnnexes ? [{
            id: 'open-annexes',
            label: 'Anexos',
            icon: FileSpreadsheet,
            onClick: onOpenAnnexes,
            variant: 'default' as const,
            className: 'bg-primary/5 text-primary border-none shadow-none text-xs uppercase tracking-wider hover:bg-primary/10'
        }] : []),
        {
            id: 'signature',
            label: 'Firmas',
            icon: PenTool,
            onClick: () => setActiveSection('signature'),
            active: activeSection === 'signature',
            className: "text-xs uppercase tracking-wider"
        }
    ];

    // Add massive-gen at the end with distinctive style
    if (massiveGenItem) {
        actions.push({
            id: massiveGenItem.id,
            label: massiveGenItem.label,
            icon: Sparkles,
            onClick: () => setActiveSection(massiveGenItem.id),
            active: activeSection === massiveGenItem.id,
            className: 'bg-primary/20 border-primary/40 text-primary font-black shadow-[0_0_15px_rgba(57,255,20,0.3)] hover:bg-primary/30 transition-all text-xs uppercase tracking-wider'
        });
    }

    return actions;
  }, [navItems, activeSection, setActiveSection, annexes, onOpenActions, onOpenAnnexes, onOpenSections]);

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
