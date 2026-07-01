'use client';

import { useCallback, useSyncExternalStore, useRef } from 'react';

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

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  // Cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) callback();
  });
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function getRawSnapshot(): ExpertModeState {
  if (typeof window === 'undefined') return initialState;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as ExpertModeState;
  } catch (e) {
    console.error('Error parsing expert mode state', e);
  }
  return initialState;
}

function getServerSnapshot(): ExpertModeState {
  return initialState;
}

function setStoredState(updater: (prev: ExpertModeState) => ExpertModeState) {
  const prev = getRawSnapshot();
  const next = updater(prev);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach(l => l());
}

export const useExpertModeState = () => {
  const lastStateRef = useRef<ExpertModeState>(initialState);

  // FIX-RCT-125: Use useSyncExternalStore with reference stability to prevent infinite re-renders
  const getSnapshot = useCallback(() => {
    const next = getRawSnapshot();
    // deep equal check to preserve reference
    const isSame = JSON.stringify(next) === JSON.stringify(lastStateRef.current);
    if (!isSame) {
      lastStateRef.current = next;
    }
    return lastStateRef.current;
  }, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isLoaded = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const toggleSection = useCallback((sectionId: string) => {
    setStoredState(prev => ({
      ...prev,
      expandedSections: prev.expandedSections.includes(sectionId)
        ? prev.expandedSections.filter(id => id !== sectionId)
        : [...prev.expandedSections, sectionId]
    }));
  }, []);

  const expandAllSections = useCallback((sectionIds: string[]) => {
    setStoredState(prev => ({
      ...prev,
      expandedSections: sectionIds
    }));
  }, []);

  const collapseAllSections = useCallback(() => {
    setStoredState(() => ({
      ...initialState,
    }));
  }, []);

  const setActiveAnnex = useCallback((annexId: string | null) => {
    setStoredState(prev => ({
      ...prev,
      activeAnnexId: annexId === prev.activeAnnexId ? null : annexId
    }));
  }, []);

  const toggleAnnexesRoot = useCallback(() => {
    setStoredState(prev => ({
      ...prev,
      isAnnexesRootExpanded: !prev.isAnnexesRootExpanded
    }));
  }, []);

  const setHelpContext = useCallback((context: string | null, open: boolean = true) => {
    setStoredState(prev => ({
      ...prev,
      helpContext: context,
      isHelpOpen: open
    }));
  }, []);

  const closeHelp = useCallback(() => {
    setStoredState(prev => ({
      ...prev,
      isHelpOpen: false
    }));
  }, []);

  const toggleProblems = useCallback((open?: boolean) => {
    setStoredState(prev => ({
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
