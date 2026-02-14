'use client';

import React, { memo } from 'react';
import { CalculatedRowValue } from '@/types/cost-sheet';
import { cn, formatCurrency } from '@/lib/utils';
import { TrendingUp, DollarSign, PieChart, Activity, Info } from 'lucide-react';
import CircularProgress from './CircularProgress';

interface CostSheetSummaryProps {
  calculatedValues: Record<string, CalculatedRowValue>;
  data: any;
}

const CostSheetSummary: React.FC<CostSheetSummaryProps> = memo(({ calculatedValues, data }) => {
  // Helper to get total for a row ID
  const getTotal = (id: string) => calculatedValues?.[id]?.total || 0;

  const totalCost = getTotal('12');
  const utility = getTotal('13');
  const finalPrice = getTotal('14');

  // Percentages relative to Final Price
  const costPercent = finalPrice > 0 ? (totalCost / finalPrice) * 100 : 0;
  const utilityPercent = finalPrice > 0 ? (utility / finalPrice) * 100 : 0;
  const pricePercent = finalPrice > 0 ? 100 : 0;

  const mainKpis = [
    {
      label: 'Costo Total',
      value: totalCost,
      percent: costPercent,
      color: 'text-primary',
      description: 'Suma de costos directos e indirectos'
    },
    {
      label: 'Utilidad',
      value: utility,
      percent: utilityPercent,
      color: 'text-emerald-500',
      description: 'Margen de beneficio sobre la venta'
    },
    {
      label: 'Precio Venta',
      value: finalPrice,
      percent: pricePercent,
      color: 'text-blue-500',
      description: 'Precio final al consumidor'
    }
  ];

  const secondaryKpis = [
      {
          label: 'Costo Directo',
          value: getTotal('1') + getTotal('2') + getTotal('3'),
          icon: DollarSign,
          color: 'text-green-700',
          bgColor: 'bg-green-50'
      },
      {
          label: 'Costo Indirecto',
          value: getTotal('4'),
          icon: Activity,
          color: 'text-amber-600',
          bgColor: 'bg-amber-50'
      }
  ];

  return (
    <div className="space-y-8">
      {/* Main Circular KPIs */}
      <div className="bg-sidebar/30 backdrop-blur-md rounded-[2.5rem] p-8 border border-border/50 shadow-sm mx-2">
        <div className="flex flex-col md:flex-row items-center justify-around gap-8 md:gap-4">
          {mainKpis.map((kpi, idx) => (
            <div key={idx} className="flex flex-col items-center gap-4">
                <CircularProgress
                    value={kpi.percent}
                    label={kpi.label}
                    subLabel={formatCurrency(kpi.value)}
                    color={kpi.color}
                    size="lg"
                />
                <p className="text-[10px] font-medium text-slate-400 italic max-w-[150px] text-center">
                    {kpi.description}
                </p>
            </div>
          ))}
        </div>
      </div>

      {/* Secondary Detailed KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-2">
        {secondaryKpis.map((kpi, index) => (
          <div key={index} className="neu-card !p-5 flex items-center justify-between hover:scale-[1.01] transition-transform duration-300">
            <div className="flex items-center gap-4">
                <div className={cn("p-3 rounded-2xl", kpi.bgColor)}>
                    <kpi.icon className={cn("w-5 h-5", kpi.color)} />
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{kpi.label}</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(kpi.value)}
                    </p>
                </div>
            </div>
            <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Desglose</p>
                <div className="h-1 w-8 bg-slate-100 dark:bg-slate-800 rounded-full mt-1 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default CostSheetSummary;
