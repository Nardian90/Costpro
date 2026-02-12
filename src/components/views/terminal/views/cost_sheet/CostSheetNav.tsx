'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileSpreadsheet, PenTool, ClipboardList, Menu, Star } from 'lucide-react';
import { useIsMobile } from '@/hooks/ui/useMobile';
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
  const isMobile = useIsMobile();

  // Create a combined list of all navigable sections mapped to ActionMenu format
  const navActions: Action[] = React.useMemo(() => [
    ...(onOpenActions ? [{
        id: 'actions-menu',
        label: isMobile ? '' : 'Menú',
        icon: Menu,
        onClick: onOpenActions,
        variant: 'outline' as const,
        className: 'bg-primary/10 text-primary border-primary/20 !px-3'
    }] : []),
    ...navItems.map(s => {
        const isActive = activeSection === s.id;

        return {
            id: s.id,
            label: s.label,
            icon: s.icon || (s.id === 'header' ? Layout : ClipboardList),
            onClick: () => setActiveSection(s.id),
            active: isActive,
            className: isActive ? 'border-b-2 border-primary rounded-none !bg-transparent text-primary' : ''
        };
    }),
    // Individual Annexes as buttons
    ...(annexes || []).map(a => ({
        id: a.id,
        label: isMobile ? `Anexo ${a.id}` : `Anexo ${a.id}`,
        icon: FileSpreadsheet,
        onClick: () => setActiveSection(a.id),
        active: activeSection === a.id,
        className: activeSection === a.id ? 'border-b-2 border-primary rounded-none !bg-transparent text-primary' : ''
    })),
    {
        id: 'signature',
        label: 'Firmas',
        icon: PenTool,
        onClick: () => setActiveSection('signature'),
        active: activeSection === 'signature',
        className: activeSection === 'signature' ? 'border-b-2 border-primary rounded-none !bg-transparent text-primary' : ''
    },
  ], [navItems, activeSection, setActiveSection, annexes, isMobile, onOpenActions]);

  if (isMobile) {
    return (
      <div className="w-full overflow-x-auto pb-4 pt-2 -mx-4 px-4 hide-scrollbar">
        <div className="flex items-center gap-2 min-w-max">
          {navActions.map((action) => (
            <button
              key={action.id}
              onClick={action.onClick}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-2xl transition-all active:scale-95 whitespace-nowrap",
                action.active
                  ? "bg-primary text-black font-black shadow-[0_0_15px_rgba(57,255,20,0.4)]"
                  : "bg-muted/40 text-muted-foreground font-bold hover:bg-muted/60"
              )}
            >
              {action.icon && <action.icon className={cn("w-4 h-4", action.active ? "text-black" : "text-primary")} />}
              {action.label && <span className="text-xs uppercase tracking-wider">{action.label}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

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
