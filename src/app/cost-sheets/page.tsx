
'use client';

import React from 'react';
import CostSheetBody from '@/components/cost-sheets/CostSheetBody';
import CostSheetHeader from '@/components/cost-sheets/CostSheetHeader';
import CostSheetSignature from '@/components/cost-sheets/CostSheetSignature';
import CostSheetAnnexes from '@/components/cost-sheets/CostSheetAnnexes';
import { useCostSheetCalculator } from '@/hooks/useCostSheetCalculator';
import template from '@/lib/data/costpro-full.json';

const CostSheetPage = () => {
  // The hook is now correctly called with the template data.
  const { calculatedValues } = useCostSheetCalculator(template);

  // The main data structure comes directly from the imported template.
  const data = template;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-2xl font-semibold">Cargando Ficha de Costo...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 bg-white text-gray-900">
      <div className="max-w-4xl mx-auto">
        <CostSheetHeader header={data.header} />
        <main className="my-6">
          {/*
            The CostSheetBody now receives the main sections from the template
            and the calculatedValues from our powerful hook.
          */}
          <CostSheetBody
            sections={data.sections}
            calculatedValues={calculatedValues}
          />
          {/*
            The annexes are passed directly from the template data, as their
            internal calculations are handled by the component itself.
          */}
          <CostSheetAnnexes
            annexes={data.annexes}
          />
        </main>
        {/* The signature data is spread into the component props. */}
        <CostSheetSignature {...data.signature} />
      </div>
    </div>
  );
};

export default CostSheetPage;
