'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'cost_module_expert_state';

interface ExpertModeState {
  expandedSections: string[];
  activeAnnexId: string | null;
  isAnnexesRootExpanded: boolean;
  helpContext: string | null;
  isHelpOpen: boolean;
  isProblemsOpen: boolean;
}

const initialState: ExpertModeState = {
  expandedSections: [],
  activeAnnexId: null,
  isAnnexesRootExpanded: false,
  helpContext: null,
  isHelpOpen: false,
  isProblemsOpen: false,
};

function loadStoredExpertState(): ExpertModeState {
  if (typeof window === 'undefined') return initialState;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as ExpertModeState;
  } catch (e) {
    console.error('Error parsing expert mode state', e);
  }
  return initialState;
}

const emptySubscribe = () => () => {};

export const useExpertModeState = () => {
  const [state, setState] = useState<ExpertModeState>(loadStoredExpertState);
  const isLoaded = useSyncExternalStore(emptySubscribe, () => true, () => false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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

  const expandAllSections = useCallback((sectionIds: string[]) => {
    setState(prev => ({
      ...prev,
      expandedSections: sectionIds
    }));
  }, []);

  const collapseAllSections = useCallback(() => {
    setState(prev => ({
      ...prev,
      expandedSections: []
    }));
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

  const toggleProblems = useCallback((open?: boolean) => {
    setState(prev => ({
      ...prev,
      isProblemsOpen: open !== undefined ? open : !prev.isProblemsOpen
    }));
  }, []);

  return {
    ...state,
    toggleSection,
    expandAllSections,
    collapseAllSections,
    setActiveAnnex,
    toggleAnnexesRoot,
    setHelpContext,
    closeHelp,
    toggleProblems,
    isLoaded
  };
};
