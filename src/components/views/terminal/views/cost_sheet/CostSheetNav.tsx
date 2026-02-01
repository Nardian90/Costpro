
'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileSpreadsheet, PenTool, ClipboardList, CheckCircle2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface CostSheetNavProps {
  navItems: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  onOpenAnnexes?: () => void;
  onOpenSections?: () => void;
  // Sub-sections for "Tabla Principal"
  subSections?: any[];
  activeSubSectionId?: string;
  setActiveSubSectionId?: (id: string) => void;
}

const CostSheetNav: React.FC<CostSheetNavProps> = ({
  navItems,
  annexes,
  activeSection,
  setActiveSection,
  onOpenAnnexes,
  onOpenSections,
  subSections = [],
  activeSubSectionId,
  setActiveSubSectionId
}) => {
  // Create a combined list of all navigable sections mapped to ActionMenu format
  const navActions: Action[] = React.useMemo(() => [
    ...navItems.map(s => {
        const isActive = activeSection === s.id;

        if (s.id === 'main') {
            return {
                id: s.id,
                label: s.label,
                icon: s.icon || Layout,
                onClick: () => {
                    setActiveSection(s.id);
                    onOpenSections?.();
                },
                active: isActive,
                variant: 'outline' as const
            };
        }

        return {
            id: s.id,
            label: s.label,
            icon: s.icon || (s.id === 'header' ? Layout : ClipboardList),
            onClick: () => setActiveSection(s.id),
            active: isActive
        };
    }),
    {
        id: 'annexes-trigger',
        label: 'Anexos',
        icon: FileSpreadsheet,
        onClick: () => onOpenAnnexes?.(),
        variant: 'outline' as const,
        active: annexes.some(a => a.id === activeSection)
    },
    {
        id: 'signature',
        label: 'Firmas',
        icon: PenTool,
        onClick: () => setActiveSection('signature'),
        active: activeSection === 'signature'
    },
  ], [navItems, activeSection, onOpenSections, onOpenAnnexes, setActiveSection, annexes]);

  return (
    <div className="mb-8 space-y-3">
      <div className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/70 px-2 flex items-center gap-2">
        <div className="w-1 h-1 bg-primary rounded-full" />
        Navegación Principal
      </div>
      <ActionMenu
        actions={navActions}
        sticky={false}
        className="!z-10 shadow-none bg-transparent"
      />
    </div>
  );
};

export default CostSheetNav;
