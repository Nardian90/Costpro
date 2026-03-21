import { useState, useEffect } from 'react';

const STORAGE_KEY = "simulation_config";

export const useSimulationConfig = () => {
  const [simulatedAmount, setSimulatedAmount] = useState<number>(() => {
    if (typeof window === 'undefined') return 2000;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored).simulatedAmount : 2000;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ simulatedAmount })
      );
    }
  }, [simulatedAmount]);

  return { simulatedAmount, setSimulatedAmount };
};
