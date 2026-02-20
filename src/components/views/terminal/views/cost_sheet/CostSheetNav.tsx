'use client';

import React from 'react';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, FileSpreadsheet, PenTool, ClipboardList, Menu, ListFilter, Sparkles, Eye, Edit, Zap, HelpCircle, DatabaseZap, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostSheetNavProps {
  navItems: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  onOpenActions?: () => void;
  onOpenAnnexes?: () => void;
  onOpenSections?: () => void;
  onOpenHelp?: () => void;
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
  onOpenHelp,
  isEditing,
  onToggleEditing,
}) => {
  // Create a combined list of all navigable sections mapped to ActionMenu format
  const navActions: Action[] = React.useMemo(() => {
    // Separate massive-gen and ai-chat to put them at the end
    const specialIds = ['massive-gen', 'ai-chat'];
    const filteredNavItems = navItems.filter(s => !specialIds.includes(s.id));
    const specialItems = navItems.filter(s => specialIds.includes(s.id));

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
        },
        {
            id: 'expert-view',
            label: 'Experto',
            icon: Zap,
            onClick: () => setActiveSection('all-content'),
            active: activeSection === 'all-content',
            className: "text-xs uppercase tracking-wider bg-primary/20 text-primary border-primary/30"
        },
        ...(onOpenHelp ? [{
            id: 'help-panel',
            label: 'Ayuda',
            icon: HelpCircle,
            onClick: onOpenHelp,
            className: "text-xs uppercase tracking-wider bg-amber-500/10 text-amber-600 border-amber-500/20"
        }] : [])
    ];

    // Add special items at the end
    specialItems.forEach(item => {
        actions.push({
            id: item.id,
            label: item.label,
            icon: item.icon || Bot,
            onClick: () => setActiveSection(item.id),
            active: activeSection === item.id,
            className: cn(
                'text-xs uppercase tracking-wider border-primary/40 font-black transition-all',
                item.id === 'massive-gen'
                    ? 'bg-primary/20 text-primary shadow-lg shadow-primary/20 hover:bg-primary/30'
                    : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
            )
        });
    });

    return actions;
  }, [navItems, activeSection, setActiveSection, annexes, onOpenActions, onOpenAnnexes, onOpenSections, onOpenHelp]);

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
