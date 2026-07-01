import { useState, useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = "simulation_config";

function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getStorageSnapshot() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return (parsed.simulatedAmount ?? 2000) as number;
    }
  } catch { /* ignore corrupt data */ }
  return 2000;
}

function getServerSnapshot() {
  return 2000;
}

export const useSimulationConfig = () => {
  // FIX-RCT-124: Use useSyncExternalStore to prevent hydration mismatch
  const simulatedAmount = useSyncExternalStore(subscribeToStorage, getStorageSnapshot, getServerSnapshot);

  const setSimulatedAmount = useCallback((value: number | ((prev: number) => number)) => {
    const current = getStorageSnapshot();
    const next = typeof value === 'function' ? (value as (prev: number) => number)(current) : value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ simulatedAmount: next }));
    window.dispatchEvent(new StorageEvent('storage'));
  }, []);

  // Track client-side load state
  const isLoaded = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  return { simulatedAmount, setSimulatedAmount, isLoaded };
};
