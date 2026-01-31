
'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileSpreadsheet, PenTool, ClipboardList, CheckCircle2 } from 'lucide-react';

interface CostSheetNavProps {
  sections: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  onOpenAnnexes?: () => void;
}

const CostSheetNav: React.FC<CostSheetNavProps> = ({
  sections,
  annexes,
  activeSection,
  setActiveSection,
  onOpenAnnexes
}) => {
  // Create a combined list of all navigable sections mapped to ActionMenu format
  const navActions: Action[] = [
    ...sections.map(s => ({
        id: s.id,
        label: s.label,
        icon: s.icon || (s.id === 'header' ? Layout : ClipboardList),
        onClick: () => setActiveSection(s.id),
        active: activeSection === s.id
    })),
    {
        id: 'annexes-trigger',
        label: 'Anexos',
        icon: FileSpreadsheet,
        onClick: () => onOpenAnnexes?.(),
        variant: 'outline'
    },
    {
        id: 'signature',
        label: 'Firmas',
        icon: PenTool,
        onClick: () => setActiveSection('signature'),
        active: activeSection === 'signature'
    },
  ];

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
