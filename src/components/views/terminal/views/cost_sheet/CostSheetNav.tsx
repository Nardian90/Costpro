
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
  subSections = [],
  activeSubSectionId,
  setActiveSubSectionId
}) => {
  // Create a combined list of all navigable sections mapped to ActionMenu format
  const navActions: Action[] = [
    ...navItems.map(s => {
        const isActive = activeSection === s.id;

        if (s.id === 'main' && subSections.length > 0) {
            return {
                id: s.id,
                label: s.label,
                onClick: () => setActiveSection(s.id),
                active: isActive,
                component: (
                    <DropdownMenu key={s.id} onOpenChange={(open) => { if (open) setActiveSection(s.id); }}>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={cn(
                                    'flex items-center gap-2 px-4 py-2.5 text-sm sm:text-base rounded-xl transition-all active:scale-95 shrink-0 whitespace-nowrap',
                                    isActive ? 'neu-inset-sm font-bold text-primary !scale-100 shadow-none' : 'neu-btn text-foreground hover:neu-raised-sm'
                                )}
                            >
                                {s.icon && <s.icon className="w-4 h-4 sm:w-5 sm:h-5" />}
                                <span className="font-semibold">{s.label}</span>
                                <ChevronDown className={cn("w-3 h-3 opacity-50 transition-transform", isActive && "rotate-180")} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                            {subSections.map(sub => (
                                <DropdownMenuItem
                                    key={sub.id}
                                    onClick={() => {
                                        setActiveSection('main');
                                        setActiveSubSectionId?.(sub.id);
                                    }}
                                    className={cn(
                                        "flex items-center gap-2 cursor-pointer",
                                        activeSubSectionId === sub.id && "bg-primary/10 text-primary font-bold"
                                    )}
                                >
                                    <div className={cn("w-1.5 h-1.5 rounded-full", activeSubSectionId === sub.id ? "bg-primary" : "bg-muted-foreground/30")} />
                                    {sub.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
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
