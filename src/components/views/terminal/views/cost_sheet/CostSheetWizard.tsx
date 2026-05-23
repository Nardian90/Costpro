"use client";

import React from 'react';
import { AssistedModeShell } from './assisted/AssistedModeShell';

interface CostSheetWizardProps {
  data: any;
  calculatedValues: any;
  calculatedHeader: any;
}

const CostSheetWizard: React.FC<CostSheetWizardProps> = () => {
  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black uppercase tracking-tighter italic text-foreground">
          Modo <span className="text-primary">Asistido</span> Enterprise
        </h1>
        <p className="text-muted-foreground text-sm font-medium">
          Orquestación visual de procesos de costos basada en la Resolución 148/2023.
        </p>
      </div>

      <AssistedModeShell />
    </div>
  );
};

export default CostSheetWizard;
