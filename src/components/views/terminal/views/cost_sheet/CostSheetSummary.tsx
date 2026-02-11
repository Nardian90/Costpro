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
  const getTotal = (id: string) => calculatedValues?.[id]?.total || 0;

  const directCost = getTotal('1') + getTotal('2') + getTotal('3');
  const indirectCost = getTotal('4');
  const totalCost = getTotal('12');
  const utility = getTotal('13');
  const finalPrice = getTotal('14');
  const profit = getTotal('13');

  const margin = finalPrice > 0 ? (profit / finalPrice) * 100 : 0;

  const kpis = [
    {
      label: 'Costo Directo',
      value: directCost,
      icon: DollarSign,
      color: 'text-green-700',
      bgColor: 'bg-green-50',
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
      icon: DollarSign,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: `Margen Comercial: ${margin.toFixed(2)}%`
    },
    {
      label: 'Utilidad',
      value: utility,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      description: totalCost > 0 ? `Rentabilidad: ${((utility / totalCost) * 100).toFixed(1)}% sobre costo` : 'Rentabilidad: 0% sobre costo'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 px-2 sm:px-0">
      {kpis.map((kpi, index) => (
        <div key={index} className="neu-card !p-6 sm:!p-5 flex flex-col justify-between hover:scale-[1.02] transition-transform duration-300 min-h-[160px] sm:min-h-0">
          <div className="flex justify-between items-start mb-4 sm:mb-4">
            <div className={`p-3 sm:p-2 rounded-2xl sm:rounded-xl ${kpi.bgColor}`}>
              <kpi.icon className={`w-6 h-6 sm:w-5 sm:h-5 ${kpi.color}`} />
            </div>
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">KPI #{index + 1}</span>
          </div>
          <div>
            <p className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight mb-1 sm:mb-1">{kpi.label}</p>
            <p className="text-2xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter sm:tracking-normal">
              {formatCurrency(kpi.value)}
            </p>
          </div>
          <p className="mt-4 sm:mt-3 text-[10px] font-medium text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3 sm:pt-2 italic leading-relaxed sm:leading-normal">
            {kpi.description}
          </p>
        </div>
      ))}
    </div>
  );
});

export default CostSheetSummary;
