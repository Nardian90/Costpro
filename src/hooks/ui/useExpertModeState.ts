'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cost_module_expert_state';

interface ExpertModeState {
  expandedSections: string[];
  activeAnnexId: string | null;
  isAnnexesRootExpanded: boolean;
  helpContext: string | null;
  isHelpOpen: boolean;
}

const initialState: ExpertModeState = {
  expandedSections: [],
  activeAnnexId: null,
  isAnnexesRootExpanded: false,
  helpContext: null,
  isHelpOpen: false,
};

export const useExpertModeState = () => {
  const [state, setState] = useState<ExpertModeState>(initialState);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(parsed);
      } catch (e) {
        console.error('Error parsing expert mode state', e);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, isLoaded]);

  const toggleSection = useCallback((sectionId: string) => {
    setState(prev => {
      const isExpanded = prev.expandedSections.includes(sectionId);
      return {
        ...prev,
        expandedSections: isExpanded
          ? prev.expandedSections.filter(id => id !== sectionId)
          : [...prev.expandedSections, sectionId]
      };
    });
  }, []);

  const setActiveAnnex = useCallback((annexId: string | null) => {
    setState(prev => ({
      ...prev,
      activeAnnexId: annexId === prev.activeAnnexId ? null : annexId
    }));
  }, []);

  const toggleAnnexesRoot = useCallback(() => {
    setState(prev => ({
      ...prev,
      isAnnexesRootExpanded: !prev.isAnnexesRootExpanded
    }));
  }, []);

  const setHelpContext = useCallback((context: string | null, open: boolean = true) => {
    setState(prev => ({
      ...prev,
      helpContext: context,
      isHelpOpen: open
    }));
  }, []);

  const closeHelp = useCallback(() => {
    setState(prev => ({
      ...prev,
      isHelpOpen: false
    }));
  }, []);

  return {
    ...state,
    toggleSection,
    setActiveAnnex,
    toggleAnnexesRoot,
    setHelpContext,
    closeHelp,
    isLoaded
  };
};
