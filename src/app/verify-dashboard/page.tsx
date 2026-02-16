'use client';

import { ConcentricDashboardRing } from '@/components/views/terminal/views/dashboard/ConcentricDashboardRing';
import { ExecutiveKpiCards } from '@/components/views/terminal/views/dashboard/ExecutiveKpiCards';

export default function VerifyDashboardPage() {
  const mockData = {
    totalIncome: 42500,
    costOfSales: 12100,
    netProfit: 30400,
    margin: 72,
  };

  return (
    <div className="p-4 bg-background min-h-screen space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black tracking-tighter text-foreground uppercase">
          Panel de Control
        </h1>
        <p className="text-xs font-bold text-muted-foreground tracking-[0.2em] uppercase">
          Executive KPI Overview
        </p>
      </div>

      <ConcentricDashboardRing
        sales={mockData.totalIncome}
        costs={mockData.costOfSales}
        profit={mockData.netProfit}
      />

      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h2 className="text-sm font-bold text-muted-foreground tracking-widest uppercase">
            Resumen de Ventas
          </h2>
          <span className="text-[10px] font-bold text-emerald-500 animate-pulse tracking-tighter">
            LIVE UPDATES
          </span>
        </div>
        <ExecutiveKpiCards
          sales={mockData.totalIncome}
          costs={mockData.costOfSales}
          profit={mockData.netProfit}
        />
      </div>
    </div>
  );
}
