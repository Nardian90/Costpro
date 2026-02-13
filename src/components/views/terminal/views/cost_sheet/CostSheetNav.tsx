'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileSpreadsheet, PenTool, ClipboardList, Menu, ListFilter, Sparkles } from 'lucide-react';

interface CostSheetNavProps {
  navItems: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  onOpenActions?: () => void;
  onOpenAnnexes?: () => void;
  onOpenSections?: () => void;
}

const CostSheetNav: React.FC<CostSheetNavProps> = ({
  navItems,
  annexes,
  activeSection,
  setActiveSection,
  onOpenActions,
  onOpenAnnexes,
  onOpenSections,
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
            variant: 'outline' as const,
            className: 'bg-primary/10 text-primary border-primary/20'
        }] : []),
        ...filteredNavItems.map(s => {
            const isActive = activeSection === s.id;

            return {
                id: s.id,
                label: s.label,
                icon: s.icon || (s.id === 'header' ? Layout : ClipboardList),
                onClick: () => setActiveSection(s.id),
                active: isActive
            };
        }),
        // Consolidated Sections Button
        ...(onOpenSections ? [{
            id: 'open-sections',
            label: 'Secciones',
            icon: ListFilter,
            onClick: onOpenSections,
            variant: 'outline' as const
        }] : []),
        // Consolidated Annexes Button
        ...(onOpenAnnexes ? [{
            id: 'open-annexes',
            label: 'Anexos',
            icon: FileSpreadsheet,
            onClick: onOpenAnnexes,
            variant: 'outline' as const
        }] : []),
        {
            id: 'signature',
            label: 'Firmas',
            icon: PenTool,
            onClick: () => setActiveSection('signature'),
            active: activeSection === 'signature'
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
            className: 'bg-primary/20 border-primary/40 text-primary font-black shadow-[0_0_15px_rgba(57,255,20,0.3)] hover:bg-primary/30 transition-all'
        });
    }

    return actions;
  }, [navItems, activeSection, setActiveSection, annexes, onOpenActions, onOpenAnnexes, onOpenSections]);

  return (
    <div className="mb-2">
      <ActionMenu
        actions={navActions}
        sticky={false}
        className="!z-10 shadow-none bg-transparent -mx-4 px-4"
      />
    </div>
  );
};

export default CostSheetNav;
