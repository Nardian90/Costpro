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

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getSnapshot(): ExpertModeState {
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
  const prev = getSnapshot();
  const next = updater(prev);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new StorageEvent('storage'));
}

export const useExpertModeState = () => {
  // Use a ref to cache the snapshot and avoid infinite loops with useSyncExternalStore
  const lastSnapshotRef = useRef<ExpertModeState>(initialState);
  const lastRawRef = useRef<string | null>(null);

  const getCachedSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return initialState;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === lastRawRef.current) {
      return lastSnapshotRef.current;
    }

    try {
      const parsed = raw ? JSON.parse(raw) : initialState;
      lastRawRef.current = raw;
      lastSnapshotRef.current = parsed;
      return parsed;
    } catch (e) {
      return initialState;
    }
  }, []);

  // FIX-RCT-125: Use useSyncExternalStore to prevent hydration mismatch and cascading renders
  const state = useSyncExternalStore(subscribe, getCachedSnapshot, getServerSnapshot);

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
