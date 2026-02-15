'use client';

import React, { memo, useMemo } from 'react';
import { CalculatedRowValue } from '@/types/cost-sheet';
import { Package, Users, Zap, Settings } from 'lucide-react';
import CostSheetMasterRing from './CostSheetMasterRing';

interface CostSheetSummaryProps {
  calculatedValues: Record<string, CalculatedRowValue>;
  data: any;
}

const CostSheetSummary: React.FC<CostSheetSummaryProps> = memo(({ calculatedValues, data }) => {
  // Helper to get total for a row ID
  const getTotal = (id: string) => calculatedValues?.[id]?.total || 0;

  const totalPrice = getTotal('14');
  const utility = getTotal('13');
  const totalCost = getTotal('12');

  const telemetry = useMemo(() => {
    const rawMaterials = getTotal('1');
    const labor = getTotal('2');
    const directOther = getTotal('3');
    const indirects = getTotal('4') + getTotal('11');

    const totalForTelemetry = rawMaterials + labor + directOther + indirects || 1;

    return [
      {
        label: 'Materiales',
        value: rawMaterials,
        percent: (rawMaterials / totalForTelemetry) * 100,
        color: 'text-blue-500',
        icon: Package
      },
      {
        label: 'Mano de Obra',
        value: labor,
        percent: (labor / totalForTelemetry) * 100,
        color: 'text-orange-500',
        icon: Users
      },
      {
        label: 'Gastos Directos',
        value: directOther,
        percent: (directOther / totalForTelemetry) * 100,
        color: 'text-amber-500',
        icon: Zap
      },
      {
        label: 'Gastos Indirectos',
        value: indirects,
        percent: (indirects / totalForTelemetry) * 100,
        color: 'text-slate-500',
        icon: Settings
      }
    ];
  }, [calculatedValues]);

  return (
    <div className="space-y-12 pb-12">
      <CostSheetMasterRing
        totalPrice={totalPrice}
        utility={utility}
        totalCost={totalCost}
        telemetry={telemetry}
      />
    </div>
  );
});

export default CostSheetSummary;
