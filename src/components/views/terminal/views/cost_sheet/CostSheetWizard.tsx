"use client";

import React from 'react';
import { AssistedModeShell } from './assisted/AssistedModeShell';

interface CostSheetWizardProps {
  data: any;
  calculatedValues: any;
  calculatedHeader: any;
}

const CostSheetWizard: React.FC<CostSheetWizardProps> = ({ data, calculatedValues, calculatedHeader }) => {
  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-8 relative overflow-hidden p-8 rounded-3xl bg-primary/5 border border-primary/10 group">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-1000" />
        <h1 className="text-4xl font-black uppercase tracking-tighter italic text-foreground relative z-10">
          Modo <span className="text-primary drop-shadow-[0_0_15px_rgba(var(--primary),0.5)]">Asistido</span> Enterprise
        </h1>
        <p className="text-muted-foreground text-sm font-medium mt-2 max-w-2xl relative z-10">
          Orquestación visual de procesos de costos basada en la Resolución 148/2023. Una experiencia operativa, financiera e inteligente.
        </p>
      </div>

      <AssistedModeShell calculatedValues={calculatedValues} calculatedHeader={calculatedHeader} />
    </div>
  );
};

export default CostSheetWizard;
