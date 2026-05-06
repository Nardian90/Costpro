import { useState, useEffect, useCallback, useRef } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
export const useAutoSave = (enabled = true) => {
  const { data, setSheet } = useCostSheetStore();
  const [versions, setVersions] = useState<any[]>([]);
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
    setVersions(prev => [v, ...prev].slice(0, 15));
    setLastSavedAt(Date.now());
    lastHash.current = JSON.stringify(currentData);
    // FIX-RCT-122: Track timeout so it can be cleared on unmount
    savingTimerRef.current = setTimeout(() => setIsSaving(false), 1000);
  }, []);
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
