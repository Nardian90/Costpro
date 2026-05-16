'use client';

import React, { useState, useMemo } from 'react';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { CostSheetViewMode } from '@/components/views/terminal/views/cost_sheet/CostSheetModeDropdown';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import { BarChart3, FolderOpen, Sparkles, FileText, Layout } from 'lucide-react';

interface GroupedSection {
  id: string;
  label: string;
  sectionIds: string[];
}

export interface CostSheetViewState {
  // Sub-section navigation
  activeSubSectionId: string;
  setActiveSubSectionId: React.Dispatch<React.SetStateAction<string>>;

  // Editing state
  isEditing: boolean;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;

  // View mode
  viewMode: CostSheetViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<CostSheetViewMode>>;

  // Layout mode
  layoutMode: ViewMode;
  setLayoutMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  effectiveLayoutMode: ViewMode;

  // Derived: grouped sections
  groupedSections: GroupedSection[];

  // Derived: annex active check
  isAnnexActive: boolean;

  // Derived: nav items
  navItems: { id: string; label: string; icon: any }[];

  // Derived: sub-section actions
  subSectionActions: {
    id: string;
    label: string;
    tooltip: string;
    icon: any;
    onClick: () => void;
    active: boolean;
    variant: 'outline';
  }[];
}

export function useCostSheetViewState(
  data: any,
  activeSection: string
): CostSheetViewState {
  const isMobile = useIsMobile();

  const [activeSubSectionId, setActiveSubSectionId] = useState('group-1-3');
  const [isEditing, setIsEditing] = useState(true);
  const [viewMode, setViewMode] = useState<CostSheetViewMode>('expert');
  const [layoutMode, setLayoutMode] = useState<ViewMode>('table');

  // Grouping logic for "Smart Grouping" of small sections
  const groupedSections = useMemo<GroupedSection[]>(() => {
    if (!data?.sections) return [];

    // Specific logical blocks requested by the user: [1-3], [4-5], [6-7], [8-10], [11-16]
    const predefinedBlocks = [
      { start: 1, end: 3 },
      { start: 4, end: 5 },
      { start: 6, end: 7 },
      { start: 8, end: 10 },
      { start: 11, end: 16 }
    ];

    const getSectionNumber = (id: string) => {
      const num = id.replace('s', '');
      return parseInt(num, 10);
    };

    const getSectionName = (label: string) => {
      const match = label.match(/Sección\s+\d+:\s*(.*)/i);
      return match ? match[1].trim() : label.trim();
    };

    const groups: GroupedSection[] = [];

    predefinedBlocks.forEach((block) => {
      const blockSections = data.sections.filter((s: any) => {
        const n = getSectionNumber(s.id);
        return n >= block.start && n <= block.end;
      });

      if (blockSections.length > 0) {
        const first = blockSections[0];
        const last = blockSections[blockSections.length - 1];

        let label = '';
        if (blockSections.length === 1) {
          label = first.label || '';
        } else {
          const startNum = getSectionNumber(first.id);
          const endNum = getSectionNumber(last.id);
          const firstName = getSectionName(first.label || '');
          const lastName = getSectionName(last.label || '');
          label = `SECCIONES ${startNum} - ${endNum}: ${firstName} ... ${lastName}`;
        }

        groups.push({
          id: `group-${block.start}-${block.end}`,
          label,
          sectionIds: blockSections.map((s: any) => s.id)
        });
      }
    });

    // Handle any sections not in predefined blocks
    data.sections.forEach((s: any) => {
      const n = getSectionNumber(s.id);
      const isInBlock = predefinedBlocks.some((b) => n >= b.start && n <= b.end);
      if (!isInBlock) {
        groups.push({
          id: s.id,
          label: s.label || '',
          sectionIds: [s.id]
        });
      }
    });

    return groups;
  }, [data]);

  const isAnnexActive = useMemo(
    () =>
      (data?.annexes || []).some((a: any) => a.id === activeSection) ||
      activeSection === 'all-annexes' ||
      activeSection === 'all-content' ||
      activeSection === 'expert-content',
    [data?.annexes, activeSection]
  );

  const navItems = useMemo(
    () => [
      { id: 'kpis', label: 'Tablero', icon: BarChart3 },
      { id: 'templates', label: 'Plantillas', icon: FolderOpen },
      { id: 'ai-chat', label: 'Darian', icon: Sparkles },
      { id: 'massive-gen', label: 'Gen. Masiva', icon: FileText }
    ],
    []
  );

  const subSectionActions = useMemo(() => {
    return groupedSections.map((group) => ({
      id: group.id,
      label: group.label.split(':')[0], // Short label like "SECCIONES 1-3"
      tooltip: group.label,
      icon: Layout,
      onClick: () => {
        setActiveSubSectionId(group.id);
      },
      active: activeSubSectionId === group.id,
      variant: 'outline' as const
    }));
  }, [groupedSections, activeSubSectionId]);

  // Responsive layout adjustment — derive from isMobile instead of syncing via effect
  const effectiveLayoutMode = layoutMode;

  return {
    activeSubSectionId,
    setActiveSubSectionId,
    isEditing,
    setIsEditing,
    viewMode,
    setViewMode,
    layoutMode,
    setLayoutMode,
    effectiveLayoutMode,
    groupedSections,
    isAnnexActive,
    navItems,
    subSectionActions
  };
}
