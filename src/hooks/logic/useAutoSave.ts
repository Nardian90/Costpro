import { useState, useEffect, useCallback, useRef } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';

const STORAGE_KEY = 'costpro-autosave-versions';
const MAX_PERSISTED_VERSIONS = 5;

function loadPersistedVersions(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistVersions(versions: any[]) {
  if (typeof window === 'undefined') return;
  try {
    // Only persist lightweight metadata + data (skip deep nesting if too large)
    const toPersist = versions.slice(0, MAX_PERSISTED_VERSIONS).map(v => ({
      timestamp: v.timestamp,
      label: v.label,
      data: v.data,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
  } catch {
    // localStorage full — clear old versions and retry once
    try {
      localStorage.removeItem(STORAGE_KEY);
      const lightweight = [versions[0]].filter(Boolean);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
    } catch {
      // Give up silently
    }
  }
}

export const useAutoSave = (enabled = true) => {
  const { data, setSheet } = useCostSheetStore();
  // BUG-014 FIX: Initialize versions from localStorage (survives reload)
  const [versions, setVersions] = useState<any[]>(() => loadPersistedVersions());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // FIX-RCT-122: Ref to track the saving-done timeout for cleanup
  const savingTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastHash = useRef('');
  // FIX: Use refs for data and save so the interval doesn't reset on every data change
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; });

  const saveRef = useRef<(label?: string) => void>(() => {});
  const save = useCallback((label = 'Autosave') => {
    const currentData = dataRef.current;
    if (!currentData) return;
    setIsSaving(true);
    const v = { timestamp: Date.now(), data: JSON.parse(JSON.stringify(currentData)), label };
    const updated = [v, ...versions].slice(0, 15);
    setVersions(updated);
    persistVersions(updated);
    setLastSavedAt(Date.now());
    lastHash.current = JSON.stringify(currentData);
    // FIX-RCT-122: Track timeout so it can be cleared on unmount
    savingTimerRef.current = setTimeout(() => setIsSaving(false), 1000);
  }, [versions]);
  useEffect(() => { saveRef.current = save; });
  // FIX-RCT-122: Clear any pending saving-done timeout on unmount
  useEffect(() => () => { if (savingTimerRef.current) clearTimeout(savingTimerRef.current); }, []);
  useEffect(() => {
    if (!enabled || !dataRef.current) return;
    const it = setInterval(() => {
      const currentData = dataRef.current;
      if (currentData && JSON.stringify(currentData) !== lastHash.current) {
        saveRef.current?.();
      }
    }, 90000);
    return () => clearInterval(it);
  }, [enabled]);
  return { versions, restoreVersion: (v: any) => setSheet(v.data), lastSavedAt, isSaving, saveManualSnapshot: () => save('Manual') };
};
