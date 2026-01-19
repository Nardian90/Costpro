
'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileSpreadsheet, PenTool, ClipboardList } from 'lucide-react';

interface CostSheetNavProps {
  sections: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
}

const CostSheetNav: React.FC<CostSheetNavProps> = ({
  sections,
  annexes,
  activeSection,
  setActiveSection,
}) => {
  // Create a combined list of all navigable sections mapped to ActionMenu format
  const navActions: Action[] = [
    {
        id: 'header',
        label: 'Encabezado',
        icon: Layout,
        onClick: () => setActiveSection('header'),
        active: activeSection === 'header'
    },
    ...sections.map(s => ({
        id: s.id,
        label: s.label,
        icon: ClipboardList,
        onClick: () => setActiveSection(s.id),
        active: activeSection === s.id
    })),
    ...annexes.map(a => ({
        id: a.id,
        label: `Anexo ${a.id}`,
        icon: FileSpreadsheet,
        onClick: () => setActiveSection(a.id),
        active: activeSection === a.id
    })),
    {
        id: 'signature',
        label: 'Firmas',
        icon: PenTool,
        onClick: () => setActiveSection('signature'),
        active: activeSection === 'signature'
    },
  ];

  return (
    <div className="mb-8">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3 px-1">
        Navegación de Secciones
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
