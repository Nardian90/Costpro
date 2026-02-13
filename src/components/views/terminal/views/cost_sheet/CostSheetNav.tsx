'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileText, PenTool, ClipboardList, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  // Main Top-level actions (Encabezado, Ficha Principal)
  const mainNavActions: Action[] = React.useMemo(() => [
    ...navItems.filter(s => ['header', 'main'].includes(s.id)).map(s => ({
        id: s.id,
        label: s.label,
        icon: s.id === 'main' ? FileText : (s.icon || Layout),
        onClick: () => setActiveSection(s.id),
        active: activeSection === s.id,
        className: 'flex-1 justify-center py-4 px-6 rounded-[1.5rem] bg-[#151B28] border-none text-muted-foreground font-black uppercase tracking-widest text-[11px]'
    }))
  ], [navItems, activeSection, setActiveSection]);

  // Annexes and secondary actions
  const secondaryNavActions: Action[] = React.useMemo(() => [
    ...(annexes || []).map(a => ({
        id: a.id,
        label: `Anexo ${a.id}`,
        icon: ClipboardList,
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
  ], [activeSection, setActiveSection, annexes]);

  return (
    <div className="space-y-4 mb-6">
      {/* Top Row: Encabezado and Ficha Principal */}
      <div className="flex items-center gap-3 px-2">
        {mainNavActions.map(action => (
          <button
            key={action.id}
            onClick={action.onClick}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-[2rem] transition-all active:scale-95",
              action.active
                ? "bg-[#151B28] border-2 border-[#39FF14] text-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.2)]"
                : "bg-[#151B28] text-muted-foreground border border-white/5"
            )}
          >
            {action.icon && <action.icon className="w-4 h-4" />}
            <span className="font-black uppercase tracking-[0.15em] text-[10px]">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Secondary Row: Annexes (Scrolling) */}
      <div className="px-2">
        <ActionMenu
            actions={secondaryNavActions}
            sticky={false}
            className="!z-10 shadow-none bg-transparent -mx-4 px-4"
        />
      </div>
    </div>
  );
};

export default CostSheetNav;
