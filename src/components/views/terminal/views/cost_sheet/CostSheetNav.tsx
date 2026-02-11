
'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileSpreadsheet, PenTool, ClipboardList, Menu } from 'lucide-react';

interface CostSheetNavProps {
  navItems: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  onOpenActions?: () => void;
}

const CostSheetNav: React.FC<CostSheetNavProps> = ({
  navItems,
  annexes,
  activeSection,
  setActiveSection,
  onOpenActions,
}) => {
  // Create a combined list of all navigable sections mapped to ActionMenu format
  const navActions: Action[] = React.useMemo(() => [
    ...(onOpenActions ? [{
        id: 'actions-menu',
        label: 'Menú',
        icon: Menu,
        onClick: onOpenActions,
        variant: 'outline' as const,
        className: 'bg-primary/10 text-primary border-primary/20'
    }] : []),
    ...navItems.map(s => {
        const isActive = activeSection === s.id;

        return {
            id: s.id,
            label: s.label,
            icon: s.icon || (s.id === 'header' ? Layout : ClipboardList),
            onClick: () => setActiveSection(s.id),
            active: isActive
        };
    }),
    // Individual Annexes as buttons
    ...(annexes || []).map(a => ({
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
  ], [navItems, activeSection, setActiveSection, annexes]);

  return (
    <div className="mb-8">
      <ActionMenu
        actions={navActions}
        sticky={false}
        className="!z-10 shadow-none bg-transparent -mx-4 px-4"
      />
    </div>
  );
};

export default CostSheetNav;
