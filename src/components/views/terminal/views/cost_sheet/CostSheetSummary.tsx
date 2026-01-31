'use client';

import React, { memo } from 'react';
import { CalculatedRowValue } from '@/types/cost-sheet';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, DollarSign, PieChart, Activity } from 'lucide-react';

interface CostSheetSummaryProps {
  calculatedValues: Record<string, CalculatedRowValue>;
  data: any;
}

const CostSheetSummary: React.FC<CostSheetSummaryProps> = memo(({ calculatedValues, data }) => {
  // Helper to get total for a row ID
  const getTotal = (id: string) => calculatedValues[id]?.total || 0;

  const directCost = getTotal('1') + getTotal('2') + getTotal('3');
  const indirectCost = getTotal('4');
  const totalCost = getTotal('12');
  const finalPrice = getTotal('14');
  const profit = getTotal('13');

  const margin = finalPrice > 0 ? (profit / finalPrice) * 100 : 0;

  const kpis = [
    {
      label: 'Costo Directo',
      value: directCost,
      icon: DollarSign,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: 'Materiales, Salario y Otros Directos'
    },
    {
      label: 'Costo Indirecto',
      value: indirectCost,
      icon: Activity,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      description: 'Asociados a la producción'
    },
    {
      label: 'Costo Total',
      value: totalCost,
      icon: PieChart,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      description: 'Incluye Gastos Tributarios y Admon.'
    },
    {
      label: 'Precio Final',
      value: finalPrice,
      icon: TrendingUp,
      color: 'text-success-600',
      bgColor: 'bg-success-50',
      description: `Margen: ${margin.toFixed(2)}%`
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {kpis.map((kpi, index) => (
        <div key={index} className="neu-card !p-5 flex flex-col justify-between hover:scale-[1.02] transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className={`p-2 rounded-xl ${kpi.bgColor}`}>
              <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">KPI #{index + 1}</span>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">{kpi.label}</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {formatCurrency(kpi.value)}
            </p>
          </div>
          <p className="mt-3 text-[10px] font-medium text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2 italic">
            {kpi.description}
          </p>
        </div>
      ))}
    </div>
  );
});

export default CostSheetSummary;
