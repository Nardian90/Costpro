'use client';

import React, { memo } from 'react';
import { CalculatedRowValue } from '@/types/cost-sheet';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, DollarSign, PieChart, Activity, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      description: 'Materiales, Salario y Otros Directos',
      percentage: totalCost > 0 ? (directCost / totalCost) * 100 : 0
    },
    {
      label: 'Costo Indirecto',
      value: indirectCost,
      icon: Activity,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      description: 'Asociados a la producción',
      percentage: totalCost > 0 ? (indirectCost / totalCost) * 100 : 0
    },
    {
      label: 'Costo Total',
      value: totalCost,
      icon: PieChart,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      description: 'Gastos Tributarios y Admon.',
      percentage: 100
    },
    {
      label: 'Precio Final',
      value: finalPrice,
      icon: DollarSign,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      description: `Margen Comercial: ${margin.toFixed(2)}%`,
      highlight: true
    },
    {
      label: 'Utilidad',
      value: utility,
      icon: TrendingUp,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      description: totalCost > 0 ? `Rentabilidad: ${((utility / totalCost) * 100).toFixed(1)}%` : 'Rentabilidad: 0%',
      percentage: finalPrice > 0 ? (utility / finalPrice) * 100 : 0
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 px-2 sm:px-0">
      {kpis.map((kpi, index) => (
        <div
            key={index}
            className={cn(
                "group relative overflow-hidden rounded-3xl p-5 transition-all duration-500 hover:scale-[1.02] border border-white/5",
                kpi.highlight ? "bg-primary shadow-[0_0_30px_rgba(57,255,20,0.2)]" : "bg-zinc-900/50 backdrop-blur-xl"
            )}
        >
          {/* Subtle Glow Background */}
          {!kpi.highlight && (
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-[40px] group-hover:bg-primary/10 transition-colors" />
          )}

          <div className="flex justify-between items-start mb-6">
            <div className={cn(
                "p-2.5 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                kpi.highlight ? "bg-black/20" : "bg-primary/10"
            )}>
              <kpi.icon className={cn("w-5 h-5", kpi.highlight ? "text-black" : "text-primary")} />
            </div>
            <ArrowUpRight className={cn("w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity", kpi.highlight ? "text-black" : "text-primary")} />
          </div>

          <div className="space-y-1">
            <p className={cn(
                "text-[10px] font-black uppercase tracking-[0.15em]",
                kpi.highlight ? "text-black/60" : "text-zinc-500"
            )}>
                {kpi.label}
            </p>
            <p className={cn(
                "text-2xl font-black tabular-nums tracking-tighter",
                kpi.highlight ? "text-black" : "text-white"
            )}>
              {formatCurrency(kpi.value)}
            </p>
          </div>

          <div className="mt-6 space-y-3">
             {/* Simple visual progress indicator */}
             {kpi.percentage !== undefined && (
                 <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                        className={cn("h-full transition-all duration-1000 ease-out", kpi.highlight ? "bg-black/30" : "bg-primary")}
                        style={{ width: `${Math.min(100, kpi.percentage)}%` }}
                    />
                 </div>
             )}
             <p className={cn(
                "text-[10px] font-medium leading-relaxed",
                kpi.highlight ? "text-black/70 italic" : "text-zinc-400 italic"
             )}>
                {kpi.description}
             </p>
          </div>
        </div>
      ))}
    </div>
  );
});

export default CostSheetSummary;
