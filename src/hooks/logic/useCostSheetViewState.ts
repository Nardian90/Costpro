'use client';

import { useState } from 'react';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { ViewMode } from '@/components/ui/ViewSwitcher';

export interface CostSheetViewState {
  activeSubSectionId: string;
  setActiveSubSectionId: React.Dispatch<React.SetStateAction<string>>;
  isEditing: boolean;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  viewMode: 'expert';
  setViewMode: (mode: any) => void;
  layoutMode: ViewMode;
  setLayoutMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  effectiveLayoutMode: ViewMode;
  isAnnexActive: boolean;
}

export function useCostSheetViewState(
  data: any,
  activeSection: string
): CostSheetViewState {
  const isMobile = useIsMobile();

  const [activeSubSectionId, setActiveSubSectionId] = useState('all');
  const [isEditing, setIsEditing] = useState(true);
  const [layoutMode, setLayoutMode] = useState<ViewMode>('table');

  const isAnnexActive = (data?.annexes || []).some((a: any) => a.id === activeSection) ||
                        activeSection === 'all-annexes';

  const effectiveLayoutMode = isMobile ? 'grid' : layoutMode;

  return {
    activeSubSectionId,
    setActiveSubSectionId,
    isEditing,
    setIsEditing,
    viewMode: 'expert',
    setViewMode: () => {},
    layoutMode,
    setLayoutMode,
    effectiveLayoutMode,
    isAnnexActive
  };
}
