
'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileSpreadsheet, PenTool, ClipboardList, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  // Linear navigation logic
  const navigationSequence = React.useMemo(() => {
    const sequence: { section: string, subSectionId?: string }[] = [
        { section: 'kpis' },
        { section: 'header' },
        ...(subSections || []).map(s => ({ section: 'main', subSectionId: s.id })),
        ...(annexes || []).map(a => ({ section: a.id })),
        { section: 'signature' },
        { section: 'audit' }
    ];
    return sequence;
  }, [subSections, annexes]);

  const currentIndex = React.useMemo(() => {
    return navigationSequence.findIndex(item => {
        if (item.subSectionId) {
            return item.section === activeSection && item.subSectionId === activeSubSectionId;
        }
        return item.section === activeSection;
    });
  }, [navigationSequence, activeSection, activeSubSectionId]);

  const goToNext = () => {
    if (currentIndex < navigationSequence.length - 1) {
        const next = navigationSequence[currentIndex + 1];
        setActiveSection(next.section);
        if (setActiveSubSectionId) {
            setActiveSubSectionId(next.subSectionId || '');
        }
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
        const prev = navigationSequence[currentIndex - 1];
        setActiveSection(prev.section);
        if (setActiveSubSectionId) {
            setActiveSubSectionId(prev.subSectionId || '');
        }
    }
  };

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
        active: (annexes || []).some(a => a?.id === activeSection)
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
      <div className="flex items-center justify-between px-2">
        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/70 flex items-center gap-2">
            <div className="w-1 h-1 bg-primary rounded-full" />
            Navegación Principal
        </div>
        <div className="flex items-center gap-2">
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 text-primary"
                onClick={goToPrev}
                disabled={currentIndex <= 0}
                title="Anterior"
            >
                <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 text-primary"
                onClick={goToNext}
                disabled={currentIndex === -1 || currentIndex >= navigationSequence.length - 1}
                title="Siguiente"
            >
                <ChevronRight className="w-4 h-4" />
            </Button>
        </div>
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
