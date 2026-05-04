import { useState, useEffect, useCallback, useRef } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { announce } from '@/components/ui/AriaLiveRegion';
export const useAutoSave = (enabled = true) => {
  const { data, setSheet } = useCostSheetStore();
  const [versions, setVersions] = useState<any[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const lastHash = useRef('');
  const save = useCallback((label = 'Autosave') => {
    if (!data) return;
    setIsSaving(true);
    const v = { timestamp: Date.now(), data: JSON.parse(JSON.stringify(data)), label };
    setVersions(prev => [v, ...prev].slice(0, 15));
    setLastSavedAt(Date.now());
    lastHash.current = JSON.stringify(data);
    setTimeout(() => setIsSaving(false), 1000);
    announce(`${label}: versión guardada`, 'polite');
  }, [data]);
  useEffect(() => {
    if (!enabled || !data) return;
    const it = setInterval(() => { if (JSON.stringify(data) !== lastHash.current) save(); }, 90000);
    return () => clearInterval(it);
  }, [enabled, data, save]);
  return { versions, restoreVersion: (v: any) => setSheet(v.data), lastSavedAt, isSaving, saveManualSnapshot: () => save('Manual') };
};
