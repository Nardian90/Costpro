
'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { CalculatedRowValue } from '@/types/cost-sheet';

interface CostSheetContextType {
  calculatedValues: Record<string, CalculatedRowValue>;
}

const CostSheetContext = createContext<CostSheetContextType | undefined>(undefined);

export const CostSheetProvider: React.FC<{ children: ReactNode; calculatedValues: Record<string, CalculatedRowValue> }> = ({ children, calculatedValues }) => {
  return (
    <CostSheetContext.Provider value={{ calculatedValues }}>
      {children}
    </CostSheetContext.Provider>
  );
};

export const useCostSheetCalculatedValues = () => {
  const context = useContext(CostSheetContext);
  if (context === undefined) {
    throw new Error('useCostSheetCalculatedValues must be used within a CostSheetProvider');
  }
  return context.calculatedValues;
};
